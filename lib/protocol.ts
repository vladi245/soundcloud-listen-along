export const PROTOCOL_VERSION = 1;
export const ROOM_CODE_LENGTH = 16;
export const MAX_NICKNAME_LENGTH = 24;

export type Role = 'host' | 'guest';

export interface Participant {
  id: string;
  name: string | null;
  role: Role;
}

export interface PlaybackState {
  trackUrl: string;
  playing: boolean;
  positionMs: number;
  capturedAt: number;
  sequence: number;
}

export type ClientMessage =
  | {
      type: 'join';
      version: typeof PROTOCOL_VERSION;
      roomCode: string;
      participantId: string;
      hostToken?: string;
      name?: string;
    }
  | { type: 'rename'; name: string | null }
  | { type: 'playback'; state: PlaybackState }
  | { type: 'ping'; sentAt: number }
  | { type: 'leave' };

export type ServerMessage =
  | {
      type: 'joined';
      role: Role;
      participantCount: number;
      serverTime: number;
      state?: PlaybackState;
      memberId?: string;
      participants?: Participant[];
    }
  | { type: 'playback'; state: PlaybackState; serverTime: number }
  | {
      type: 'presence';
      participantCount: number;
      hostConnected?: boolean;
      participants?: Participant[];
    }
  | { type: 'pong'; sentAt: number; serverTime: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'room-closed'; reason: string };

export interface CreateRoomResponse {
  roomCode: string;
  hostToken: string;
}

const roomCodePattern = /^[0-9A-HJKMNP-TV-Z]{16}$/;
const opaqueIdPattern = /^[A-Za-z0-9_-]{20,64}$/;

export function normalizeRoomCode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && roomCodePattern.test(value);
}

export function isOpaqueId(value: unknown): value is string {
  return typeof value === 'string' && opaqueIdPattern.test(value);
}

export function isSoundCloudUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;

  try {
    const url = new URL(value);
    const soundCloudHost =
      url.hostname === 'soundcloud.com' ||
      url.hostname.endsWith('.soundcloud.com');
    return (
      url.protocol === 'https:' &&
      soundCloudHost &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}

export function isPlaybackState(value: unknown): value is PlaybackState {
  if (!isRecord(value)) return false;

  return (
    isSoundCloudUrl(value.trackUrl) &&
    typeof value.playing === 'boolean' &&
    isNonNegativeFinite(value.positionMs) &&
    isNonNegativeFinite(value.capturedAt) &&
    typeof value.sequence === 'number' &&
    Number.isSafeInteger(value.sequence) &&
    value.sequence >= 0
  );
}

// Display names are free text from other people: strip control and
// formatting characters, collapse whitespace, and cap the length.
export function normalizeNickname(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  const cleaned = value
    .normalize('NFC')
    .replace(/[\p{C}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const name = Array.from(cleaned)
    .slice(0, MAX_NICKNAME_LENGTH)
    .join('')
    .trim();
  return name || null;
}

export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  if (value.type === 'join') {
    const name =
      value.name === undefined ? undefined : normalizeNickname(value.name);
    if (
      value.version !== PROTOCOL_VERSION ||
      !isRoomCode(value.roomCode) ||
      !isOpaqueId(value.participantId) ||
      (value.hostToken !== undefined && !isOpaqueId(value.hostToken)) ||
      name === null
    ) {
      return null;
    }
    return {
      type: 'join',
      version: PROTOCOL_VERSION,
      roomCode: value.roomCode,
      participantId: value.participantId,
      ...(value.hostToken !== undefined
        ? { hostToken: value.hostToken as string }
        : {}),
      ...(name ? { name } : {}),
    };
  }

  if (value.type === 'rename') {
    if (value.name === null) return { type: 'rename', name: null };
    const name = normalizeNickname(value.name);
    return name ? { type: 'rename', name } : null;
  }

  if (value.type === 'playback' && isPlaybackState(value.state)) {
    return { type: 'playback', state: value.state };
  }

  if (value.type === 'ping' && isNonNegativeFinite(value.sentAt)) {
    return { type: 'ping', sentAt: value.sentAt };
  }

  if (value.type === 'leave') return { type: 'leave' };
  return null;
}

export function parseServerMessage(value: unknown): ServerMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  if (
    value.type === 'joined' &&
    (value.role === 'host' || value.role === 'guest') &&
    isCount(value.participantCount) &&
    isNonNegativeFinite(value.serverTime) &&
    (value.state === undefined || isPlaybackState(value.state))
  ) {
    return {
      type: 'joined',
      role: value.role,
      participantCount: value.participantCount,
      serverTime: value.serverTime,
      ...(value.state ? { state: value.state as PlaybackState } : {}),
      ...(isMemberId(value.memberId) ? { memberId: value.memberId } : {}),
      ...(isParticipantList(value.participants)
        ? { participants: value.participants }
        : {}),
    };
  }
  if (
    value.type === 'playback' &&
    isPlaybackState(value.state) &&
    isNonNegativeFinite(value.serverTime)
  ) {
    return {
      type: 'playback',
      state: value.state,
      serverTime: value.serverTime,
    };
  }
  if (value.type === 'presence' && isCount(value.participantCount)) {
    return {
      type: 'presence',
      participantCount: value.participantCount,
      ...(typeof value.hostConnected === 'boolean'
        ? { hostConnected: value.hostConnected }
        : {}),
      ...(isParticipantList(value.participants)
        ? { participants: value.participants }
        : {}),
    };
  }
  if (
    value.type === 'pong' &&
    isNonNegativeFinite(value.sentAt) &&
    isNonNegativeFinite(value.serverTime)
  ) {
    return { type: 'pong', sentAt: value.sentAt, serverTime: value.serverTime };
  }
  if (
    value.type === 'error' &&
    isShortString(value.code) &&
    isShortString(value.message)
  ) {
    return { type: 'error', code: value.code, message: value.message };
  }
  if (value.type === 'room-closed' && isShortString(value.reason)) {
    return { type: 'room-closed', reason: value.reason };
  }
  return null;
}

export function isMemberId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(value);
}

function isParticipantList(value: unknown): value is Participant[] {
  return (
    Array.isArray(value) &&
    value.length <= 25 &&
    value.every(
      (item) =>
        isRecord(item) &&
        isMemberId(item.id) &&
        (item.role === 'host' || item.role === 'guest') &&
        (item.name === null || normalizeNickname(item.name) === item.name),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isCount(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 25
  );
}

function isShortString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160;
}
