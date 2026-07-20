export const PROTOCOL_VERSION = 1;
export const ROOM_CODE_LENGTH = 16;

export type Role = 'host' | 'guest';

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
    }
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
    }
  | { type: 'playback'; state: PlaybackState; serverTime: number }
  | { type: 'presence'; participantCount: number }
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

export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  if (value.type === 'join') {
    if (
      value.version !== PROTOCOL_VERSION ||
      !isRoomCode(value.roomCode) ||
      !isOpaqueId(value.participantId) ||
      (value.hostToken !== undefined && !isOpaqueId(value.hostToken))
    ) {
      return null;
    }
    return value as ClientMessage;
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
    return value as unknown as ServerMessage;
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
    return { type: 'presence', participantCount: value.participantCount };
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
