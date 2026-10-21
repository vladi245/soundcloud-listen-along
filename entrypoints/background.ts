import {
  normalizeBackendUrl,
  parseBackendMetadata,
  randomOpaqueId,
  roomSocketUrl,
} from '@/lib/backend';
import { HOSTED_BACKEND_URL } from '@/lib/hosted';
import {
  isRuntimeMessage,
  message,
  type ExtensionState,
  type PlayerIssue,
  type RuntimeResponse,
} from '@/lib/messages';
import {
  isOpaqueId,
  isRoomCode,
  normalizeNickname,
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
  pendingJoinTabId?: number;
  endedTabId?: number;
  lastPlayback?: PlaybackState;
  sequence: number;
  serverOffset: number;
}

interface BackendPreferences {
  backendUrl: string;
  maxParticipants: number;
  openRoomCreation?: boolean;
  creationKey?: string;
}

const storageKey = 'active-session';
const preferenceKey = 'backend-preferences';
const nicknameKey = 'nickname';
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
    const [storedSession, storedPreferences, storedNickname] =
      await Promise.all([
        browser.storage.session.get(storageKey),
        browser.storage.local.get(preferenceKey),
        browser.storage.local.get(nicknameKey),
      ]);
    const candidate = storedSession[storageKey] as Session | undefined;
    const preferences = storedPreferences[preferenceKey] as
      BackendPreferences | undefined;
    if (candidate?.public) session = candidate;
    if (
      preferences &&
      normalizeBackendUrl(preferences.backendUrl) === preferences.backendUrl &&
      Number.isInteger(preferences.maxParticipants)
    ) {
      if (!session.public.backendUrl) {
        session.public.backendUrl = preferences.backendUrl;
      }
      if (session.public.backendUrl === preferences.backendUrl) {
        session.public.maxParticipants = preferences.maxParticipants;
        session.public.openRoomCreation ??= preferences.openRoomCreation;
        session.creationKey ??= preferences.creationKey;
      }
    }
    if (!session.public.backendUrl && HOSTED_BACKEND_URL) {
      session.public.backendUrl = HOSTED_BACKEND_URL;
      session.public.openRoomCreation = true;
    }
    session.public.hasCreationKey = Boolean(session.creationKey);
    session.public.nickname =
      normalizeNickname(storedNickname[nicknameKey]) ?? undefined;
    loaded = true;
  };

  const save = async () => {
    await browser.storage.session.set({ [storageKey]: session });
  };

  const setPublic = async (update: Partial<ExtensionState>) => {
    session.public = { ...session.public, ...update };
    await save();
  };

  const fetchBackendMetadata = async (backendUrl: string) => {
    const response = await fetch(`${backendUrl}/meta`, { cache: 'no-store' });
    const value: unknown = await response.json().catch(() => null);
    const metadata = parseBackendMetadata(value);
    if (!response.ok || !metadata) {
      throw new Error('Backend is unavailable or incompatible');
    }
    return metadata;
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

  // With notifyTab, the room's SoundCloud tab keeps showing why it ended.
  const clearRoom = async (error?: string, notifyTab = false) => {
    stopSocket();
    const endedTabId = notifyTab ? session.tabId : undefined;
    const backendUrl = session.public.backendUrl;
    const maxParticipants = session.public.maxParticipants;
    const openRoomCreation = session.public.openRoomCreation;
    const nickname = session.public.nickname;
    const creationKey = session.creationKey;
    session = {
      public: {
        ...idleState,
        ...(backendUrl ? { backendUrl } : {}),
        ...(maxParticipants ? { maxParticipants } : {}),
        ...(openRoomCreation ? { openRoomCreation } : {}),
        ...(nickname ? { nickname } : {}),
        hasCreationKey: Boolean(creationKey),
        ...(error ? { status: 'error' as const, error } : {}),
        ...(error && endedTabId !== undefined ? { ended: error } : {}),
      },
      sequence: 0,
      serverOffset: 0,
      ...(creationKey ? { creationKey } : {}),
      ...(endedTabId !== undefined ? { endedTabId } : {}),
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
        hostConnected: true,
        memberId: incoming.memberId,
        participants: incoming.participants,
        participantCount: incoming.participantCount,
        error: undefined,
      };
      if (incoming.state) {
        session.lastPlayback = {
          ...incoming.state,
          capturedAt: incoming.state.capturedAt - session.serverOffset,
        };
        session.public.trackUrl = incoming.state.trackUrl;
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
      session.public.trackUrl = incoming.state.trackUrl;
      await save();
      if (session.public.role === 'guest')
        await sendToTab(session.lastPlayback);
      return;
    }
    if (incoming.type === 'presence') {
      await setPublic({
        participantCount: incoming.participantCount,
        ...(incoming.hostConnected === undefined
          ? {}
          : { hostConnected: incoming.hostConnected }),
        ...(incoming.participants
          ? { participants: incoming.participants }
          : {}),
      });
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
      await clearRoom(roomClosedMessage(incoming.reason), true);
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
          ...(session.public.nickname ? { name: session.public.nickname } : {}),
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
        // Back off for about two minutes, longer than the host's grace period.
        const delays = [1, 2, 4, 8, 15, 30, 30, 30];
        const delay = delays[reconnectAttempts];
        reconnectAttempts += 1;
        if (delay === undefined) {
          void clearRoom('Lost the connection to the room', true);
          return;
        }
        void setPublic({ status: 'connecting' });
        setTimeout(() => void connect(), delay * 1_000);
      }
    });
    // Errors are followed by a close event, which handles reconnecting.
  };

  const startRoom = async (
    tabId: number,
    roomCode: string,
    hostToken?: string,
    knownTabUrl?: string,
  ) => {
    const backendUrl = session.public.backendUrl;
    if (!backendUrl) throw new Error('Configure a backend first');
    const tabUrl = knownTabUrl ?? (await browser.tabs.get(tabId)).url;
    if (!tabUrl || !/^https:\/\/([^.]+\.)?soundcloud\.com\//.test(tabUrl)) {
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
        pendingRoomCode: undefined,
        pendingConsent: undefined,
      },
      tabId,
      participantId: randomOpaqueId(),
      ...(hostToken ? { hostToken } : {}),
      ...(session.creationKey ? { creationKey: session.creationKey } : {}),
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
        const inThisTab =
          sender.tab?.id !== undefined &&
          (sender.tab.id === session.tabId ||
            (Boolean(session.public.ended) &&
              sender.tab.id === session.endedTabId));
        return { ok: true, state: { ...session.public, inThisTab } };
      }
      if (request.type === 'configure-backend') {
        const backendUrl = normalizeBackendUrl(request.backendUrl);
        if (!backendUrl) throw new Error('Enter a secure backend origin');
        const metadata = await fetchBackendMetadata(backendUrl);
        if (request.creationKey && !metadata.roomCreationEnabled) {
          throw new Error('Backend has not enabled room creation');
        }
        const openRoomCreation = isOpenCreation(metadata);
        await clearRoom();
        session.creationKey = request.creationKey || undefined;
        await save();
        await browser.storage.local.set({
          [preferenceKey]: {
            backendUrl,
            maxParticipants: metadata.maxParticipants,
            openRoomCreation,
            ...(request.rememberCreationKey && request.creationKey
              ? { creationKey: request.creationKey }
              : {}),
          } satisfies BackendPreferences,
        });
        await setPublic({
          backendUrl,
          hasCreationKey: Boolean(session.creationKey),
          maxParticipants: metadata.maxParticipants,
          openRoomCreation,
          error: undefined,
          status: 'idle',
        });
      } else if (request.type === 'configure-invite') {
        const backendUrl = normalizeBackendUrl(request.backendUrl);
        if (!backendUrl) throw new Error('Invitation backend is invalid');
        const metadata = await fetchBackendMetadata(backendUrl);
        const sameBackend = session.public.backendUrl === backendUrl;
        const creationKey = sameBackend ? session.creationKey : undefined;
        const stored = await browser.storage.local.get(preferenceKey);
        const preferences = stored[preferenceKey] as
          BackendPreferences | undefined;
        const openRoomCreation = isOpenCreation(metadata);
        await clearRoom();
        session.creationKey = creationKey;
        if (!preferences || preferences.backendUrl === backendUrl) {
          await browser.storage.local.set({
            [preferenceKey]: {
              backendUrl,
              maxParticipants: metadata.maxParticipants,
              openRoomCreation,
              ...(preferences?.creationKey
                ? { creationKey: preferences.creationKey }
                : {}),
            } satisfies BackendPreferences,
          });
        }
        await setPublic({
          backendUrl,
          hasCreationKey: Boolean(creationKey),
          maxParticipants: metadata.maxParticipants,
          openRoomCreation,
          pendingRoomCode: request.roomCode,
          pendingConsent: true,
          error: undefined,
          status: 'idle',
        });
        // Opening SoundCloud closes the popup, so the background joins the
        // room once the new tab's content script reports in.
        const tab = await browser.tabs.create({
          url: 'https://soundcloud.com/',
        });
        session.pendingJoinTabId = tab.id;
        await save();
      } else if (request.type === 'create-room') {
        const backendUrl = session.public.backendUrl;
        if (!backendUrl) throw new Error('Configure a backend first');
        const response = await fetch(`${backendUrl}/rooms`, {
          method: 'POST',
          headers: session.creationKey
            ? { Authorization: `Bearer ${session.creationKey}` }
            : undefined,
        });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            backendError(result) ?? `Room creation failed (${response.status})`,
          );
        }
        if (
          !isRecord(result) ||
          !isRoomCode(result.roomCode) ||
          !isOpaqueId(result.hostToken)
        ) {
          throw new Error('Backend returned an invalid room');
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
        const pendingRoomCode = session.public.pendingRoomCode;
        if (
          sender.tab?.id !== undefined &&
          sender.tab.id === session.pendingJoinTabId &&
          pendingRoomCode &&
          !session.public.roomCode
        ) {
          session.pendingJoinTabId = undefined;
          await startRoom(
            sender.tab.id,
            pendingRoomCode,
            undefined,
            sender.tab.url ?? sender.url,
          );
        } else if (sender.tab?.id === session.tabId) {
          await connect();
          if (session.public.role === 'guest' && session.lastPlayback) {
            await sendToTab(session.lastPlayback);
          }
        }
      } else if (request.type === 'set-nickname') {
        const nickname = normalizeNickname(request.name) ?? undefined;
        if (nickname) {
          await browser.storage.local.set({ [nicknameKey]: nickname });
        } else {
          await browser.storage.local.remove(nicknameKey);
        }
        await setPublic({ nickname });
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({ type: 'rename', name: nickname ?? null }),
          );
        }
      } else if (request.type === 'dismiss-notice') {
        session.endedTabId = undefined;
        await setPublic({ ended: undefined, error: undefined, status: 'idle' });
      } else if (request.type === 'resync') {
        if (
          sender.tab?.id === session.tabId &&
          session.public.role === 'guest' &&
          session.lastPlayback
        ) {
          await sendToTab(session.lastPlayback);
        }
      } else if (request.type === 'local-playback') {
        if (
          sender.tab?.id === session.tabId &&
          session.public.role === 'guest' &&
          request.state.playing &&
          (session.public.playerIssue || session.public.error)
        ) {
          await setPublic({
            autoplayBlocked: false,
            playerIssue: undefined,
            error: undefined,
          });
        }
        if (
          sender.tab?.id === session.tabId &&
          session.public.role === 'host'
        ) {
          if (session.public.trackUrl !== request.state.trackUrl) {
            await setPublic({ trackUrl: request.state.trackUrl });
          }
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
          playerIssue: request.code,
          error: playerIssueMessage[request.code],
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
  // Closing the room's tab leaves the room. A host leaving ends it for all.
  browser.tabs.onRemoved.addListener((tabId) => {
    void load().then(async () => {
      if (tabId === session.endedTabId) {
        session.endedTabId = undefined;
        await setPublic({ ended: undefined });
      }
      if (tabId !== session.tabId || !session.public.roomCode) return;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'leave' }));
      }
      await clearRoom();
    });
  });
  // Content scripts only reach pages loaded after installation, so reload any
  // open invitation pages to show their Join button right away.
  browser.runtime.onInstalled.addListener(async () => {
    if (!HOSTED_BACKEND_URL) return;
    const tabs = await browser.tabs
      .query({ url: `${HOSTED_BACKEND_URL}/*` })
      .catch(() => []);
    await Promise.all(
      tabs.map((tab) =>
        tab.id === undefined
          ? undefined
          : browser.tabs.reload(tab.id).catch(() => undefined),
      ),
    );
  });
  void load().then(connect);
});

function backendError(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const error = value.error;
  if (!isRecord(error)) return null;
  const message = error.message;
  return typeof message === 'string' ? message : null;
}

const playerIssueMessage: Record<PlayerIssue, string> = {
  autoplay_blocked: 'Start playback once in the SoundCloud tab',
  player_unavailable:
    "Couldn't start this track. It may need Go+ or be unavailable in your region.",
  ad_playing: 'Waiting for a SoundCloud ad to finish',
};

function roomClosedMessage(reason: string): string {
  switch (reason) {
    case 'host_left':
      return 'The host ended the room';
    case 'host_disconnected':
      return 'The host left the room';
    case 'host_never_joined':
      return 'The host never joined the room';
    case 'inactive':
      return 'The room closed after a long break';
    default:
      return 'The room has closed';
  }
}

function isOpenCreation(metadata: {
  creationKeyRequired: boolean;
  roomCreationEnabled: boolean;
}): boolean {
  return metadata.roomCreationEnabled && !metadata.creationKeyRequired;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
