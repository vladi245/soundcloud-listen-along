import { PROTOCOL_VERSION } from './protocol';
import { isRoomCode, normalizeRoomCode } from './protocol';

export const BACKEND_SERVICE = 'soundcloud-listen-along';

export interface BackendMetadata {
  service: typeof BACKEND_SERVICE;
  protocolVersion: typeof PROTOCOL_VERSION;
  maxParticipants: number;
  creationKeyRequired: boolean;
  roomCreationEnabled: boolean;
}

export interface RoomInvite {
  backendUrl: string;
  roomCode: string;
}

export function normalizeBackendUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function parseBackendMetadata(value: unknown): BackendMetadata | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const metadata = value as Record<string, unknown>;
  if (
    metadata.service !== BACKEND_SERVICE ||
    metadata.protocolVersion !== PROTOCOL_VERSION ||
    !Number.isInteger(metadata.maxParticipants) ||
    Number(metadata.maxParticipants) < 1 ||
    typeof metadata.creationKeyRequired !== 'boolean' ||
    typeof metadata.roomCreationEnabled !== 'boolean'
  ) {
    return null;
  }
  return metadata as unknown as BackendMetadata;
}

export function createRoomInvite(backendUrl: string, roomCode: string): string {
  return `${backendUrl}/#join=${roomCode}`;
}

export function parseRoomInvite(value: string): RoomInvite | null {
  try {
    const url = new URL(value.trim());
    const backendUrl = normalizeBackendUrl(url.origin);
    const roomCode = normalizeRoomCode(
      new URLSearchParams(url.hash.slice(1)).get('join') ?? '',
    );
    if (
      !backendUrl ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      !isRoomCode(roomCode)
    ) {
      return null;
    }
    return { backendUrl, roomCode };
  } catch {
    return null;
  }
}

export function backendPermission(url: string): string {
  const origin = new URL(url);
  return `${origin.protocol}//${origin.hostname}/*`;
}

export function roomSocketUrl(backendUrl: string, roomCode: string): string {
  const url = new URL(`/rooms/${roomCode}/socket`, backendUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function randomOpaqueId(size = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
