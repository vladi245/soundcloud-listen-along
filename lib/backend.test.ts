import { describe, expect, it } from 'vitest';
import {
  backendPermission,
  normalizeBackendUrl,
  roomSocketUrl,
} from './backend';

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
