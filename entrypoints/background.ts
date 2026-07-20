import {
  normalizeBackendUrl,
  randomOpaqueId,
  roomSocketUrl,
} from '@/lib/backend';
import {
  isRuntimeMessage,
  message,
  type ExtensionState,
  type RuntimeResponse,
} from '@/lib/messages';
import {
  isOpaqueId,
  isRoomCode,
  normalizeRoomCode,
  parseServerMessage,
  PROTOCOL_VERSION,
  type PlaybackState,
} from '@/lib/protocol';
import { estimateServerOffset } from '@/lib/sync';

interface Session {
  public: ExtensionState;
  tabId?: number;
  participantId?: string;
  hostToken?: string;
  creationKey?: string;
  lastPlayback?: PlaybackState;
  sequence: number;
  serverOffset: number;
}

const storageKey = 'active-session';
const idleState: ExtensionState = {
  status: 'idle',
  participantCount: 0,
};

export default defineBackground(() => {
  let session: Session = {
    public: { ...idleState },
    sequence: 0,
    serverOffset: 0,
  };
  let socket: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let loaded = false;
  let reconnect = true;
  let reconnectAttempts = 0;

  const load = async () => {
    if (loaded) return;
    const stored = await browser.storage.session.get(storageKey);
    const candidate = stored[storageKey] as Session | undefined;
    if (candidate?.public) session = candidate;
    loaded = true;
  };

  const save = async () => {
    await browser.storage.session.set({ [storageKey]: session });
  };

  const setPublic = async (update: Partial<ExtensionState>) => {
    session.public = { ...session.public, ...update };
    await save();
  };

  const stopSocket = () => {
    reconnect = false;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    socket?.close(1000, 'Session ended');
    socket = null;
  };

  const sendToTab = async (state: PlaybackState) => {
    if (session.tabId === undefined) return;
    await browser.tabs
      .sendMessage(session.tabId, message({ type: 'apply-playback', state }))
      .catch(() => undefined);
  };

  const clearRoom = async (error?: string) => {
    stopSocket();
    const backendUrl = session.public.backendUrl;
    const creationKey = session.creationKey;
    session = {
      public: {
        ...idleState,
        ...(backendUrl ? { backendUrl } : {}),
        ...(error ? { status: 'error' as const, error } : {}),
      },
      sequence: 0,
      serverOffset: 0,
      ...(creationKey ? { creationKey } : {}),
    };
    await save();
  };

  const handleServerMessage = async (value: unknown) => {
    const incoming = parseServerMessage(value);
    if (!incoming) {
      await setPublic({ status: 'error', error: 'Invalid server response' });
      return;
    }

    if (incoming.type === 'joined') {
      reconnectAttempts = 0;
      session.serverOffset = incoming.serverTime - Date.now();
      session.public = {
        ...session.public,
        status: 'connected',
        role: incoming.role,
        participantCount: incoming.participantCount,
        error: undefined,
      };
      if (incoming.state) {
        session.lastPlayback = {
          ...incoming.state,
          capturedAt: incoming.state.capturedAt - session.serverOffset,
        };
      }
      await save();
      if (incoming.role === 'guest' && session.lastPlayback) {
        await sendToTab(session.lastPlayback);
      }
      return;
    }
    if (incoming.type === 'playback') {
      session.lastPlayback = {
        ...incoming.state,
        capturedAt: incoming.state.capturedAt - session.serverOffset,
      };
      await save();
      if (session.public.role === 'guest')
        await sendToTab(session.lastPlayback);
      return;
    }
    if (incoming.type === 'presence') {
      await setPublic({ participantCount: incoming.participantCount });
      return;
    }
    if (incoming.type === 'error') {
      await setPublic({ error: incoming.message });
      return;
    }
    if (incoming.type === 'pong') {
      session.serverOffset = estimateServerOffset(
        incoming.sentAt,
        Date.now(),
        incoming.serverTime,
      );
      await save();
      return;
    }
    if (incoming.type === 'room-closed') {
      await clearRoom(`Room closed: ${incoming.reason}`);
    }
  };

  const connect = async () => {
    await load();
    const { backendUrl, roomCode } = session.public;
    if (
      !backendUrl ||
      !roomCode ||
      !session.participantId ||
      socket?.readyState === WebSocket.OPEN ||
      socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    reconnect = true;
    await setPublic({ status: 'connecting', error: undefined });
    socket = new WebSocket(roomSocketUrl(backendUrl, roomCode));
    socket.addEventListener('open', () => {
      socket?.send(
        JSON.stringify({
          type: 'join',
          version: PROTOCOL_VERSION,
          roomCode,
          participantId: session.participantId,
          ...(session.hostToken ? { hostToken: session.hostToken } : {}),
        }),
      );
      socket?.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
        }
      }, 20_000);
    });
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      try {
        void handleServerMessage(JSON.parse(event.data));
      } catch {
        void setPublic({ status: 'error', error: 'Invalid server response' });
      }
    });
    socket.addEventListener('close', () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      socket = null;
      if (reconnect && session.public.roomCode) {
        reconnectAttempts += 1;
        if (reconnectAttempts > 5) {
          void clearRoom('Room is unavailable');
          return;
        }
        void setPublic({ status: 'connecting' });
        setTimeout(() => void connect(), 2_000);
      }
    });
    socket.addEventListener('error', () => {
      void setPublic({ status: 'error', error: 'Backend connection failed' });
    });
  };

  const startRoom = async (
    tabId: number,
    roomCode: string,
    hostToken?: string,
  ) => {
    const backendUrl = session.public.backendUrl;
    if (!backendUrl) throw new Error('Configure a backend first');
    const tab = await browser.tabs.get(tabId);
    if (!tab.url || !/^https:\/\/([^.]+\.)?soundcloud\.com\//.test(tab.url)) {
      throw new Error('Open SoundCloud in the active tab first');
    }
    if (!hostToken) {
      const response = await fetch(`${backendUrl}/rooms/${roomCode}`);
      if (!response.ok) throw new Error('Room not found');
    }
    stopSocket();
    reconnectAttempts = 0;
    session = {
      public: {
        ...session.public,
        status: 'connecting',
        roomCode,
        participantCount: 0,
        error: undefined,
        autoplayBlocked: false,
      },
      tabId,
      participantId: randomOpaqueId(),
      ...(hostToken ? { hostToken } : {}),
      sequence: 0,
      serverOffset: 0,
    };
    await save();
    await connect();
  };

  const handleMessage = async (
    request: unknown,
    sender: Browser.runtime.MessageSender,
  ): Promise<RuntimeResponse | undefined> => {
    if (!isRuntimeMessage(request)) return undefined;
    await load();

    try {
      if (request.type === 'get-state') {
        return { ok: true, state: session.public };
      }
      if (request.type === 'configure-backend') {
        const backendUrl = normalizeBackendUrl(request.backendUrl);
        if (!backendUrl) throw new Error('Enter a secure backend origin');
        await clearRoom();
        session.creationKey = request.creationKey || undefined;
        await save();
        await setPublic({ backendUrl });
      } else if (request.type === 'create-room') {
        const backendUrl = session.public.backendUrl;
        if (!backendUrl) throw new Error('Configure a backend first');
        const response = await fetch(`${backendUrl}/rooms`, {
          method: 'POST',
          headers: session.creationKey
            ? { Authorization: `Bearer ${session.creationKey}` }
            : undefined,
        });
        const result = (await response.json()) as Record<string, unknown>;
        if (
          !response.ok ||
          !isRoomCode(result.roomCode) ||
          !isOpaqueId(result.hostToken)
        ) {
          throw new Error('Room creation failed');
        }
        await startRoom(request.tabId, result.roomCode, result.hostToken);
      } else if (request.type === 'join-room') {
        const roomCode = normalizeRoomCode(request.roomCode);
        if (!isRoomCode(roomCode)) throw new Error('Enter a valid room code');
        await startRoom(request.tabId, roomCode);
      } else if (request.type === 'leave-room') {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'leave' }));
        }
        await clearRoom();
      } else if (request.type === 'content-ready') {
        if (sender.tab?.id === session.tabId) {
          await connect();
          if (session.public.role === 'guest' && session.lastPlayback) {
            await sendToTab(session.lastPlayback);
          }
        }
      } else if (request.type === 'local-playback') {
        if (
          sender.tab?.id === session.tabId &&
          session.public.role === 'host'
        ) {
          await connect();
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: 'playback',
                state: {
                  ...request.state,
                  sequence: ++session.sequence,
                  capturedAt: Date.now(),
                },
              }),
            );
          }
        }
      } else if (request.type === 'player-error') {
        await setPublic({
          autoplayBlocked: request.code === 'autoplay_blocked',
          error:
            request.code === 'autoplay_blocked'
              ? 'Start playback once in the SoundCloud tab'
              : 'SoundCloud player is not ready',
        });
      }
      return { ok: true, state: session.public };
    } catch (error) {
      await setPublic({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unexpected error',
      });
      return { ok: false, state: session.public };
    }
  };

  browser.runtime.onMessage.addListener(handleMessage);
  void load().then(connect);
});
