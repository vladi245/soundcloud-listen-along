import {
  PROTOCOL_VERSION,
  ROOM_CODE_LENGTH,
  isRoomCode,
  parseClientMessage,
  type ClientMessage,
  type PlaybackState,
  type Role,
  type ServerMessage,
} from '../../lib/protocol';
import { BACKEND_SERVICE } from '../../lib/backend';

const ROOM_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TOKEN_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const MAX_SOCKETS = 25;
const MAX_MESSAGE_BYTES = 16 * 1024;
const INACTIVITY_MS = 6 * 60 * 60 * 1000;
const HOST_GRACE_MS = 60 * 1000;
const HOST_JOIN_MS = 5 * 60 * 1000;
const SOCKET_JOIN_MS = 10 * 1000;
const CREATION_WINDOW_MS = 60 * 1000;
const MAX_CREATIONS_PER_WINDOW = 30;
const MAX_CLIENT_CREATIONS_PER_WINDOW = 6;
const CLIENT_BUCKET_MS = 60 * 60 * 1000;
const ROOM_KEY = 'room';
const RATE_KEY = 'rate';

interface Env {
  ROOMS: DurableObjectNamespace;
  CREATION_LIMITER: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
  ROOM_CREATION_KEY?: string;
  PUBLIC_ROOM_CREATION?: string;
  MAX_ROOM_CREATIONS_PER_MINUTE?: string;
  INSTALL_URL?: string;
  ASSETS?: Fetcher;
}

interface RoomRecord {
  roomCode: string;
  hostToken: string;
  createdAt?: number;
  lastActivity: number;
  hostHasJoined: boolean;
  hostLastSeenAt?: number;
  hostMissingSince?: number;
  snapshot?: PlaybackState;
}

interface SocketAttachment {
  joined: boolean;
  connectedAt?: number;
  participantId?: string;
  role?: Role;
}

interface RateRecord {
  timestamps: number[];
}

const securityHeaders: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

const landingPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Listen Along invitation</title>
  <link rel="stylesheet" href="/landing.css">
</head>
<body>
  <main>
    <p class="brand"><span class="mark" aria-hidden="true"></span>Listen Along</p>
    <h1>You're invited to listen together</h1>
    <div id="join" hidden>
      <button id="join-button" type="button">Join room</button>
      <p id="join-status" class="status" role="status"></p>
      <p class="fine">Joining shares the current track link and playback position with the room server while you are connected.</p>
    </div>
    <div id="steps">
      <h2>1. Install the extension</h2>
      {{INSTALL}}
      <h2>2. Come back to this page</h2>
      <p>A <b>Join room</b> button appears here once the extension is installed. SoundCloud then opens and follows the host.</p>
    </div>
    <p class="fine">Audio plays from SoundCloud. The room code stays in this link and is not sent to the server by this page. Unofficial extension, not affiliated with SoundCloud.</p>
  </main>
</body>
</html>`;

const landingCss = `:root{--orange:#f50;--bg:#fff;--text:#333;--muted:#999;--line:#e5e5e5;color:var(--text);background:var(--bg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}@media (prefers-color-scheme:dark){:root{--bg:#121212;--text:#f2f2f2;--muted:#8c8c8c;--line:#2b2b2b}}body{margin:0;min-height:100vh;display:grid;place-items:center}main{box-sizing:border-box;width:min(480px,calc(100% - 32px));padding:32px 0}.brand{display:flex;align-items:center;gap:8px;margin:0 0 24px;font-weight:600}.mark{width:16px;height:16px;border-radius:3px;background:var(--orange)}h1{margin:0 0 20px;font-size:24px;font-weight:600;line-height:1.3}h2{margin:20px 0 8px;font-size:15px;font-weight:600}p{margin:0}.button{display:inline-block;height:40px;padding:0 24px;border-radius:3px;color:#fff;background:var(--orange);font-weight:600;line-height:40px;text-decoration:none}.button:hover{background:#e64d00}details{margin-top:12px;color:var(--muted);font-size:14px}summary{cursor:pointer}details ol{margin-top:8px;color:var(--text)}code{font:13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}ol{margin:0;padding-left:20px}li{margin:6px 0}a{color:var(--orange)}.fine{margin:24px 0 0;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}`;

export function createRoomCode(random: Uint8Array): string {
  if (random.length !== ROOM_CODE_LENGTH) {
    throw new Error('Room code entropy must be 16 bytes');
  }
  return Array.from(random, (value) => ROOM_ALPHABET[value & 31]).join('');
}

export function createHostToken(random: Uint8Array): string {
  if (random.length !== 32)
    throw new Error('Host token entropy must be 32 bytes');

  let result = '';
  let bits = 0;
  let buffer = 0;
  for (const byte of random) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += TOKEN_ALPHABET[(buffer >>> bits) & 63];
    }
  }
  if (bits > 0) result += TOKEN_ALPHABET[(buffer << (6 - bits)) & 63];
  return result;
}

export function isStrictClientMessage(value: unknown): value is ClientMessage {
  const message = parseClientMessage(value);
  if (!message || !isRecord(value)) return false;

  if (message.type === 'join') {
    return hasExactKeys(
      value,
      value.hostToken === undefined
        ? ['type', 'version', 'roomCode', 'participantId']
        : ['type', 'version', 'roomCode', 'participantId', 'hostToken'],
    );
  }
  if (message.type === 'playback') {
    return (
      hasExactKeys(value, ['type', 'state']) &&
      isRecord(value.state) &&
      hasExactKeys(value.state, [
        'trackUrl',
        'playing',
        'positionMs',
        'capturedAt',
        'sequence',
      ])
    );
  }
  if (message.type === 'ping') return hasExactKeys(value, ['type', 'sentAt']);
  return hasExactKeys(value, ['type']);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env.ALLOWED_ORIGINS);
    if (origin === false)
      return jsonError(403, 'origin_not_allowed', 'Origin not allowed');
    if (url.search)
      return jsonError(
        400,
        'invalid_url',
        'Query parameters are not allowed',
        origin,
      );

    if (request.method === 'OPTIONS') {
      return emptyResponse(204, origin, {
        'Access-Control-Allow-Headers': 'Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
    }

    if (url.pathname === '/') {
      if (request.method !== 'GET') return methodNotAllowed('GET', origin);
      return documentResponse(
        await renderLandingPage(env),
        'text/html; charset=utf-8',
      );
    }

    if (url.pathname === '/landing.css') {
      if (request.method !== 'GET') return methodNotAllowed('GET', origin);
      return documentResponse(landingCss, 'text/css; charset=utf-8');
    }

    if (url.pathname === '/meta') {
      if (request.method !== 'GET') return methodNotAllowed('GET', origin);
      return jsonResponse(
        {
          service: BACKEND_SERVICE,
          protocolVersion: PROTOCOL_VERSION,
          maxParticipants: MAX_SOCKETS,
          creationKeyRequired: !publicCreation(env),
          roomCreationEnabled:
            publicCreation(env) || Boolean(env.ROOM_CREATION_KEY),
        },
        200,
        origin,
      );
    }

    if (url.pathname === '/rooms') {
      if (request.method !== 'POST') {
        return methodNotAllowed('POST', origin);
      }
      const open = publicCreation(env);
      if (!open && !env.ROOM_CREATION_KEY) {
        return jsonError(
          503,
          'server_not_configured',
          'Room creation is not configured',
          origin,
        );
      }
      if (!open) {
        const suppliedKey = request.headers
          .get('Authorization')
          ?.replace(/^Bearer /, '');
        if (
          !suppliedKey ||
          !safeEqual(suppliedKey, env.ROOM_CREATION_KEY ?? '')
        ) {
          return jsonError(401, 'unauthorized', 'Room creation denied', origin);
        }
      }
      if (
        request.body !== null &&
        (await readBodyAtMost(request, 0)) === null
      ) {
        return jsonError(
          400,
          'invalid_body',
          'Request body must be empty',
          origin,
        );
      }
      // Check the client quota first so one client cannot drain the global one.
      const limiters = [
        ...(open
          ? [
              {
                name: await clientLimiterName(request),
                limit: MAX_CLIENT_CREATIONS_PER_WINDOW,
              },
            ]
          : []),
        { name: 'global', limit: globalCreationLimit(env) },
      ];
      for (const { name, limit } of limiters) {
        const limiter = env.CREATION_LIMITER.get(
          env.CREATION_LIMITER.idFromName(name),
        );
        const rate = await limiter.fetch('https://limiter.internal/consume', {
          method: 'POST',
          headers: { 'X-Rate-Limit': String(limit) },
        });
        if (rate.status === 429) {
          return jsonError(
            429,
            'creation_rate_limited',
            'Too many rooms created; try again shortly',
            origin,
            { 'Retry-After': rate.headers.get('Retry-After') ?? '60' },
          );
        }
        if (!rate.ok) {
          return jsonError(
            503,
            'creation_unavailable',
            'Room creation is temporarily unavailable',
            origin,
          );
        }
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const roomBytes = crypto.getRandomValues(
          new Uint8Array(ROOM_CODE_LENGTH),
        );
        const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
        const roomCode = createRoomCode(roomBytes);
        const hostToken = createHostToken(tokenBytes);
        const stub = env.ROOMS.get(env.ROOMS.idFromName(roomCode));
        const initialized = await stub.fetch(
          'https://room.internal/initialize',
          {
            method: 'POST',
            headers: { 'X-Room-Code': roomCode, 'X-Host-Token': hostToken },
          },
        );
        if (initialized.status === 201) {
          return jsonResponse({ roomCode, hostToken }, 201, origin);
        }
        if (initialized.status !== 409) {
          return jsonError(
            500,
            'room_creation_failed',
            'Could not create room',
            origin,
          );
        }
      }
      return jsonError(
        503,
        'room_creation_failed',
        'Could not allocate room code',
        origin,
      );
    }

    const roomMatch = /^\/rooms\/([0-9A-HJKMNP-TV-Z]{16})$/.exec(url.pathname);
    if (roomMatch) {
      if (request.method !== 'GET') return methodNotAllowed('GET', origin);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomMatch[1]));
      const result = await stub.fetch('https://room.internal/exists');
      return result.ok
        ? emptyResponse(204, origin)
        : jsonError(404, 'room_not_found', 'Room not found', origin);
    }

    const socketMatch = /^\/rooms\/([0-9A-HJKMNP-TV-Z]{16})\/socket$/.exec(
      url.pathname,
    );
    if (socketMatch) {
      if (request.method !== 'GET') return methodNotAllowed('GET', origin);
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return jsonError(
          426,
          'upgrade_required',
          'WebSocket upgrade required',
          origin,
          {
            Upgrade: 'websocket',
          },
        );
      }
      const roomCode = socketMatch[1];
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomCode));
      return stub.fetch('https://room.internal/socket', {
        headers: { Upgrade: 'websocket', 'X-Room-Code': roomCode },
      });
    }

    if (/^\/rooms\/[^/]+\/socket$/.test(url.pathname)) {
      return jsonError(400, 'invalid_room_code', 'Invalid room code', origin);
    }
    return jsonError(404, 'not_found', 'Route not found', origin);
  },
} satisfies ExportedHandler<Env>;

export class Room implements DurableObject {
  constructor(private readonly state: DurableObjectState) {
    state.blockConcurrencyWhile(async () => {
      const room = await state.storage.get<RoomRecord>(ROOM_KEY);
      if (!room) return;
      if (room.createdAt === undefined) {
        room.createdAt = room.lastActivity;
      }
      if (room.hostHasJoined) {
        if (this.hasJoinedHost()) {
          room.hostLastSeenAt = Date.now();
          delete room.hostMissingSince;
        } else {
          room.hostMissingSince ??= room.hostLastSeenAt ?? Date.now();
        }
      }
      await this.saveRoom(room);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/initialize' && request.method === 'POST') {
      if (await this.state.storage.get<RoomRecord>(ROOM_KEY)) {
        return new Response(null, { status: 409 });
      }
      const roomCode = request.headers.get('X-Room-Code');
      const hostToken = request.headers.get('X-Host-Token');
      if (!isRoomCode(roomCode) || !isHostToken(hostToken)) {
        return new Response(null, { status: 400 });
      }
      const now = Date.now();
      await this.state.storage.put<RoomRecord>(ROOM_KEY, {
        roomCode,
        hostToken,
        createdAt: now,
        lastActivity: now,
        hostHasJoined: false,
      });
      await this.scheduleAlarm({
        roomCode,
        hostToken,
        createdAt: now,
        lastActivity: now,
        hostHasJoined: false,
      });
      return new Response(null, { status: 201 });
    }

    if (url.pathname !== '/socket' || request.method !== 'GET') {
      if (url.pathname === '/exists' && request.method === 'GET') {
        const room = await this.state.storage.get<RoomRecord>(ROOM_KEY);
        return new Response(null, { status: room ? 204 : 404 });
      }
      return jsonError(404, 'not_found', 'Route not found');
    }
    const room = await this.state.storage.get<RoomRecord>(ROOM_KEY);
    const roomCode = request.headers.get('X-Room-Code');
    if (!room || !isRoomCode(roomCode)) {
      return jsonError(404, 'room_not_found', 'Room not found');
    }
    if (this.state.getWebSockets().length >= MAX_SOCKETS) {
      return jsonError(429, 'room_full', 'Room is full');
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({
      joined: false,
      connectedAt: Date.now(),
    } satisfies SocketAttachment);
    this.state.acceptWebSocket(server);
    await this.scheduleAlarm(room);
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: securityHeaders,
    });
  }

  async webSocketMessage(
    ws: WebSocket,
    frame: string | ArrayBuffer,
  ): Promise<void> {
    const size =
      typeof frame === 'string'
        ? new TextEncoder().encode(frame).byteLength
        : frame.byteLength;
    if (size > MAX_MESSAGE_BYTES) {
      this.rejectSocket(ws, 'message_too_large', 'Message is too large');
      return;
    }
    if (typeof frame !== 'string') {
      this.rejectSocket(
        ws,
        'invalid_message',
        'Text JSON messages are required',
      );
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(frame);
    } catch {
      this.rejectSocket(ws, 'invalid_json', 'Message must be valid JSON');
      return;
    }
    if (!isStrictClientMessage(value)) {
      this.rejectSocket(ws, 'invalid_message', 'Invalid protocol message');
      return;
    }

    const attachment = socketAttachment(ws);
    if (!attachment.joined) {
      if (value.type !== 'join') {
        this.rejectSocket(ws, 'join_required', 'First message must be join');
        return;
      }
      await this.join(ws, value);
      return;
    }
    if (value.type === 'join') {
      this.send(ws, {
        type: 'error',
        code: 'already_joined',
        message: 'Already joined',
      });
      return;
    }
    await this.handleJoinedMessage(ws, attachment, value);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.socketGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.socketGone(ws);
  }

  async alarm(): Promise<void> {
    const room = await this.state.storage.get<RoomRecord>(ROOM_KEY);
    if (!room) return;
    const now = Date.now();
    for (const socket of this.state.getWebSockets()) {
      const attachment = socketAttachment(socket);
      if (
        !attachment.joined &&
        attachment.connectedAt !== undefined &&
        now >= attachment.connectedAt + SOCKET_JOIN_MS
      ) {
        socket.serializeAttachment({
          joined: false,
        } satisfies SocketAttachment);
        socket.close(1008, 'Join timeout');
      }
    }
    const inactivityDeadline = room.lastActivity + INACTIVITY_MS;
    if (room.hostHasJoined) {
      if (this.hasJoinedHost()) {
        room.hostLastSeenAt = now;
        delete room.hostMissingSince;
      } else {
        room.hostMissingSince ??= room.hostLastSeenAt ?? now;
      }
      await this.state.storage.put(ROOM_KEY, room);
    }
    const initialHostDeadline = room.hostHasJoined
      ? Number.POSITIVE_INFINITY
      : (room.createdAt ?? room.lastActivity) + HOST_JOIN_MS;
    const hostDeadline = room.hostMissingSince
      ? room.hostMissingSince + HOST_GRACE_MS
      : Number.POSITIVE_INFINITY;
    if (now >= initialHostDeadline) {
      await this.closeRoom('host_never_joined');
      return;
    }
    if (now >= hostDeadline) {
      await this.closeRoom('host_disconnected');
      return;
    }
    if (now >= inactivityDeadline) {
      await this.closeRoom('inactive');
      return;
    }
    await this.scheduleAlarm(room);
  }

  private async join(
    ws: WebSocket,
    message: Extract<ClientMessage, { type: 'join' }>,
  ): Promise<void> {
    const room = await this.state.storage.get<RoomRecord>(ROOM_KEY);
    if (!room) {
      this.rejectSocket(ws, 'room_not_found', 'Room not found');
      return;
    }
    if (
      !room.hostHasJoined &&
      Date.now() >= (room.createdAt ?? room.lastActivity) + HOST_JOIN_MS
    ) {
      await this.closeRoom('host_never_joined');
      return;
    }
    if (message.roomCode !== room.roomCode) {
      this.rejectSocket(ws, 'room_mismatch', 'Join room code does not match');
      return;
    }
    if (
      message.hostToken !== undefined &&
      message.hostToken !== room.hostToken
    ) {
      this.rejectSocket(ws, 'invalid_host_token', 'Invalid host token');
      return;
    }
    const role: Role = message.hostToken === room.hostToken ? 'host' : 'guest';
    if (this.participantCount() >= MAX_SOCKETS) {
      this.rejectSocket(ws, 'room_full', 'Room is full');
      return;
    }
    if (role === 'host' && this.hasJoinedHost()) {
      this.rejectSocket(ws, 'host_connected', 'Host is already connected');
      return;
    }
    const attachment: SocketAttachment = {
      joined: true,
      participantId: message.participantId,
      role,
    };
    ws.serializeAttachment(attachment);

    room.lastActivity = Date.now();
    if (role === 'host') {
      room.hostHasJoined = true;
      room.hostLastSeenAt = Date.now();
      delete room.hostMissingSince;
    }
    await this.saveRoom(room);
    const participantCount = this.participantCount();
    this.send(ws, {
      type: 'joined',
      role,
      participantCount,
      serverTime: Date.now(),
      ...(room.snapshot ? { state: room.snapshot } : {}),
    });
    this.broadcast({ type: 'presence', participantCount });
  }

  private async handleJoinedMessage(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: Exclude<ClientMessage, { type: 'join' }>,
  ): Promise<void> {
    const room = await this.state.storage.get<RoomRecord>(ROOM_KEY);
    if (!room) {
      this.rejectSocket(ws, 'room_closed', 'Room is closed');
      return;
    }
    const now = Date.now();
    room.lastActivity = now;
    if (attachment.role === 'host') room.hostLastSeenAt = now;

    if (message.type === 'ping') {
      await this.saveRoom(room);
      this.send(ws, { type: 'pong', sentAt: message.sentAt, serverTime: now });
      return;
    }
    if (message.type === 'leave') {
      await this.saveRoom(room);
      ws.close(1000, 'Left room');
      return;
    }
    if (attachment.role !== 'host') {
      this.send(ws, {
        type: 'error',
        code: 'host_required',
        message: 'Host role required',
      });
      return;
    }
    if (room.snapshot && message.state.sequence <= room.snapshot.sequence) {
      this.send(ws, {
        type: 'error',
        code: 'sequence_out_of_order',
        message: 'Playback sequence must increase',
      });
      return;
    }

    room.snapshot = { ...message.state, capturedAt: now };
    await this.saveRoom(room);
    this.broadcast({ type: 'playback', state: room.snapshot, serverTime: now });
  }

  private async socketGone(ws: WebSocket): Promise<void> {
    const attachment = socketAttachment(ws);
    if (!attachment.joined) return;
    ws.serializeAttachment({ ...attachment, joined: false });
    const room = await this.state.storage.get<RoomRecord>(ROOM_KEY);
    if (!room) return;

    if (attachment.role === 'host' && !this.hasJoinedHost(ws)) {
      room.hostMissingSince ??= Date.now();
      await this.saveRoom(room);
    }
    this.broadcast({
      type: 'presence',
      participantCount: this.participantCount(ws),
    });
  }

  private participantCount(excluding?: WebSocket): number {
    return this.state
      .getWebSockets()
      .filter(
        (socket) => socket !== excluding && socketAttachment(socket).joined,
      ).length;
  }

  private hasJoinedHost(excluding?: WebSocket): boolean {
    return this.state
      .getWebSockets()
      .some(
        (socket) =>
          socket !== excluding &&
          socketAttachment(socket).joined &&
          socketAttachment(socket).role === 'host',
      );
  }

  private async saveRoom(room: RoomRecord): Promise<void> {
    await this.state.storage.put(ROOM_KEY, room);
    await this.scheduleAlarm(room);
  }

  private async scheduleAlarm(room: RoomRecord): Promise<void> {
    const socketDeadline = this.state
      .getWebSockets()
      .map((socket) => socketAttachment(socket))
      .filter(
        (attachment) =>
          !attachment.joined && attachment.connectedAt !== undefined,
      )
      .reduce(
        (earliest, attachment) =>
          Math.min(earliest, attachment.connectedAt! + SOCKET_JOIN_MS),
        Number.POSITIVE_INFINITY,
      );
    const nextAlarm = Math.min(
      room.lastActivity + INACTIVITY_MS,
      room.hostHasJoined
        ? room.hostMissingSince
          ? Number.POSITIVE_INFINITY
          : (room.hostLastSeenAt ?? Date.now()) + HOST_GRACE_MS
        : (room.createdAt ?? room.lastActivity) + HOST_JOIN_MS,
      room.hostMissingSince
        ? room.hostMissingSince + HOST_GRACE_MS
        : Number.POSITIVE_INFINITY,
      socketDeadline,
    );
    await this.state.storage.setAlarm(nextAlarm);
  }

  private async closeRoom(reason: string): Promise<void> {
    this.broadcast({ type: 'room-closed', reason });
    for (const socket of this.state.getWebSockets())
      socket.close(4001, 'Room closed');
    await this.state.storage.deleteAll();
  }

  private rejectSocket(ws: WebSocket, code: string, message: string): void {
    this.send(ws, { type: 'error', code, message });
    ws.close(1008, message.slice(0, 123));
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // The close callback handles presence and host grace.
    }
  }

  private broadcast(message: ServerMessage): void {
    const serialized = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (!socketAttachment(socket).joined) continue;
      try {
        socket.send(serialized);
      } catch {
        // The close callback handles cleanup.
      }
    }
  }
}

export class CreationLimiter implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/consume' || request.method !== 'POST') {
      return new Response(null, { status: 404 });
    }
    const now = Date.now();
    const requestedLimit = Number(request.headers.get('X-Rate-Limit'));
    const limit =
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? requestedLimit
        : MAX_CREATIONS_PER_WINDOW;
    const result = await this.state.storage.transaction(async (transaction) => {
      const stored = await transaction.get<RateRecord>(RATE_KEY);
      const timestamps = (stored?.timestamps ?? []).filter(
        (timestamp) => now - timestamp < CREATION_WINDOW_MS,
      );
      if (timestamps.length >= limit) {
        return {
          allowed: false,
          retryAfter: Math.max(
            1,
            Math.ceil((timestamps[0] + CREATION_WINDOW_MS - now) / 1000),
          ),
          resetAt: timestamps[0] + CREATION_WINDOW_MS,
        };
      }
      timestamps.push(now);
      await transaction.put<RateRecord>(RATE_KEY, { timestamps });
      return {
        allowed: true,
        retryAfter: 0,
        resetAt: timestamps[0] + CREATION_WINDOW_MS,
      };
    });
    if (!result.allowed) {
      return new Response(null, {
        status: 429,
        headers: { 'Retry-After': String(result.retryAfter) },
      });
    }
    await this.state.storage.setAlarm(result.resetAt);
    return new Response(null, { status: 204 });
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const stored = await this.state.storage.get<RateRecord>(RATE_KEY);
    const timestamps = (stored?.timestamps ?? []).filter(
      (timestamp) => now - timestamp < CREATION_WINDOW_MS,
    );
    if (timestamps.length === 0) {
      await this.state.storage.deleteAll();
      return;
    }
    await this.state.storage.put<RateRecord>(RATE_KEY, { timestamps });
    await this.state.storage.setAlarm(timestamps[0] + CREATION_WINDOW_MS);
  }
}

function publicCreation(env: Env): boolean {
  return env.PUBLIC_ROOM_CREATION === 'true';
}

function globalCreationLimit(env: Env): number {
  const configured = Number(env.MAX_ROOM_CREATIONS_PER_MINUTE);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : MAX_CREATIONS_PER_WINDOW;
}

// Public servers throttle each client by an hourly-rotating hash of its
// address. The address itself is never stored, and limiter state expires
// with the creation window.
async function clientLimiterName(request: Request): Promise<string> {
  const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const bucket = Math.floor(Date.now() / CLIENT_BUCKET_MS);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${bucket}:${address}`),
  );
  return `client:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`;
}

const FIREFOX_PACKAGE = '/listen-along.xpi';
const CHROMIUM_PACKAGE = '/listen-along-chrome.zip';

async function renderLandingPage(env: Env): Promise<string> {
  return landingPage.replace('{{INSTALL}}', await installInstructions(env));
}

async function installInstructions(env: Env): Promise<string> {
  const hosted = async (path: string) =>
    env.ASSETS
      ? (await env.ASSETS.fetch(new URL(path, 'https://assets.internal'))).ok
      : false;
  const [firefox, chromium] = await Promise.all([
    hosted(FIREFOX_PACKAGE),
    hosted(CHROMIUM_PACKAGE),
  ]);
  if (!firefox && !chromium) {
    const url = httpsUrl(env.INSTALL_URL);
    return url
      ? `<p><a class="button" href="${escapeHtml(url)}" rel="noreferrer">Get the extension</a></p>`
      : '<p>Use the install link from the person who invited you.</p>';
  }
  return [
    firefox
      ? `<p><a class="button" href="${FIREFOX_PACKAGE}">Install for Firefox</a></p>`
      : '',
    chromium
      ? `<details${firefox ? '' : ' open'}>
        <summary>Using Chrome, Edge or Brave?</summary>
        <ol>
          <li><a href="${CHROMIUM_PACKAGE}">Download the extension</a> and unzip it.</li>
          <li>Open <code>chrome://extensions</code> and turn on <b>Developer mode</b>.</li>
          <li>Click <b>Load unpacked</b> and choose the unzipped folder.</li>
        </ol>
      </details>`
      : '',
  ].join('\n');
}

function httpsUrl(value?: string): string | null {
  try {
    const url = value ? new URL(value) : null;
    return url?.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function socketAttachment(ws: WebSocket): SocketAttachment {
  return (
    (ws.deserializeAttachment() as SocketAttachment | null) ?? { joined: false }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}

function isHostToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function allowedOrigin(
  request: Request,
  configured?: string,
): string | false | undefined {
  const requestOrigin = request.headers.get('Origin') ?? undefined;
  if (!configured) return requestOrigin;
  if (!requestOrigin) return undefined;
  const allowed = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return allowed.includes(requestOrigin) ? requestOrigin : false;
}

async function readBodyAtMost(
  request: Request,
  maximum: number,
): Promise<Uint8Array | null> {
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum))
    return null;
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function methodNotAllowed(allow: string, origin?: string): Response {
  return jsonError(405, 'method_not_allowed', 'Method not allowed', origin, {
    Allow: allow,
  });
}

function jsonError(
  status: number,
  code: string,
  message: string,
  origin?: string,
  extraHeaders?: Record<string, string>,
): Response {
  return jsonResponse(
    { error: { code, message } },
    status,
    origin,
    extraHeaders,
  );
}

function jsonResponse(
  body: unknown,
  status: number,
  origin?: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({
    ...securityHeaders,
    ...extraHeaders,
    'Content-Type': 'application/json; charset=utf-8',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.append('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function emptyResponse(
  status: number,
  origin?: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({ ...securityHeaders, ...extraHeaders });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.append('Vary', 'Origin');
  }
  return new Response(null, { status, headers });
}

function documentResponse(body: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      ...securityHeaders,
      'Content-Security-Policy':
        "default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'Content-Type': contentType,
    },
  });
}

function safeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
