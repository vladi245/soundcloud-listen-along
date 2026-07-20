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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
