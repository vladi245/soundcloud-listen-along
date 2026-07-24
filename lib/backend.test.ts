import { describe, expect, it } from 'vitest';
import {
  BACKEND_SERVICE,
  backendPermission,
  createRoomInvite,
  normalizeBackendUrl,
  parseBackendMetadata,
  parseRoomInvite,
  roomSocketUrl,
} from './backend';
import { PROTOCOL_VERSION } from './protocol';

describe('backend configuration', () => {
  it('accepts secure origins and local development', () => {
    expect(normalizeBackendUrl('https://rooms.example.com/')).toBe(
      'https://rooms.example.com',
    );
    expect(normalizeBackendUrl('http://localhost:8787')).toBe(
      'http://localhost:8787',
    );
  });

  it('rejects insecure remote and path-based URLs', () => {
    expect(normalizeBackendUrl('http://rooms.example.com')).toBeNull();
    expect(normalizeBackendUrl('http://[::1]:8787')).toBeNull();
    expect(normalizeBackendUrl('https://rooms.example.com/api')).toBeNull();
    expect(normalizeBackendUrl('https://user@rooms.example.com')).toBeNull();
  });

  it('builds exact permission and socket URLs', () => {
    expect(backendPermission('https://rooms.example.com')).toBe(
      'https://rooms.example.com/*',
    );
    expect(backendPermission('http://localhost:8787')).toBe(
      'http://localhost/*',
    );
    expect(roomSocketUrl('https://rooms.example.com', 'ABC')).toBe(
      'wss://rooms.example.com/rooms/ABC/socket',
    );
  });
});

describe('room invitations', () => {
  const roomCode = '0123456789ABCDEF';

  it('round trips the backend and room code in a fragment', () => {
    const invite = createRoomInvite('https://rooms.example.com', roomCode);
    expect(invite).toBe('https://rooms.example.com/#join=0123456789ABCDEF');
    expect(parseRoomInvite(invite)).toEqual({
      backendUrl: 'https://rooms.example.com',
      roomCode,
    });
  });

  it('accepts formatted codes and rejects paths or queries', () => {
    expect(
      parseRoomInvite('https://rooms.example.com/#join=0123-4567-89AB-CDEF'),
    ).toEqual({ backendUrl: 'https://rooms.example.com', roomCode });
    expect(
      parseRoomInvite(`https://rooms.example.com/invite#join=${roomCode}`),
    ).toBeNull();
    expect(
      parseRoomInvite(`https://rooms.example.com/?track=1#join=${roomCode}`),
    ).toBeNull();
    expect(
      parseRoomInvite(`https://user:pass@rooms.example.com/#join=${roomCode}`),
    ).toBeNull();
  });
});

describe('backend metadata', () => {
  it('accepts a compatible room service', () => {
    expect(
      parseBackendMetadata({
        service: BACKEND_SERVICE,
        protocolVersion: PROTOCOL_VERSION,
        maxParticipants: 25,
        creationKeyRequired: true,
        roomCreationEnabled: true,
      }),
    ).toEqual({
      service: BACKEND_SERVICE,
      protocolVersion: PROTOCOL_VERSION,
      maxParticipants: 25,
      creationKeyRequired: true,
      roomCreationEnabled: true,
    });
  });

  it('rejects an incompatible protocol', () => {
    expect(
      parseBackendMetadata({
        service: BACKEND_SERVICE,
        protocolVersion: PROTOCOL_VERSION + 1,
        maxParticipants: 25,
        creationKeyRequired: true,
        roomCreationEnabled: true,
      }),
    ).toBeNull();
  });
});
