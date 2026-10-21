import { describe, expect, it } from 'vitest';
import {
  isPlaybackState,
  normalizeNickname,
  isSoundCloudUrl,
  normalizeRoomCode,
  parseClientMessage,
  parseServerMessage,
  PROTOCOL_VERSION,
} from './protocol';

describe('protocol validation', () => {
  it('normalizes readable room codes', () => {
    expect(normalizeRoomCode('abcd-efgh jkmn-pqrs')).toBe('ABCDEFGHJKMNPQRS');
  });

  it('accepts only secure SoundCloud URLs', () => {
    expect(isSoundCloudUrl('https://soundcloud.com/artist/track')).toBe(true);
    expect(isSoundCloudUrl('https://m.soundcloud.com/artist/track')).toBe(true);
    expect(isSoundCloudUrl('http://soundcloud.com/artist/track')).toBe(false);
    expect(isSoundCloudUrl('https://soundcloud.com.evil.test/track')).toBe(
      false,
    );
    expect(isSoundCloudUrl('https://user:pass@soundcloud.com/track')).toBe(
      false,
    );
  });

  it('rejects malformed playback state', () => {
    expect(
      isPlaybackState({
        trackUrl: 'https://example.com/track',
        playing: true,
        positionMs: 100,
        capturedAt: 200,
        sequence: 1,
      }),
    ).toBe(false);
  });

  it('parses a valid join message', () => {
    expect(
      parseClientMessage({
        type: 'join',
        version: PROTOCOL_VERSION,
        roomCode: 'ABCDEFGHJKMNPQRS',
        participantId: 'abcdefghijklmnopqrstuv',
      }),
    ).toMatchObject({ type: 'join', roomCode: 'ABCDEFGHJKMNPQRS' });
  });

  it('rejects unknown and oversized messages', () => {
    expect(parseClientMessage({ type: 'admin' })).toBeNull();
    expect(
      parseClientMessage({
        type: 'join',
        version: PROTOCOL_VERSION,
        roomCode: 'short',
        participantId: 'abcdefghijklmnopqrstuv',
      }),
    ).toBeNull();
  });

  it('validates server messages', () => {
    expect(
      parseServerMessage({
        type: 'joined',
        role: 'guest',
        participantCount: 2,
        serverTime: 100,
      }),
    ).toMatchObject({ type: 'joined', role: 'guest' });
    expect(
      parseServerMessage({ type: 'presence', participantCount: 26 }),
    ).toBeNull();
  });

  it('cleans nicknames', () => {
    expect(normalizeNickname('  Sam \n  Smith ')).toBe('Sam Smith');
    expect(normalizeNickname('a\u200Bb')).toBe('ab');
    expect(normalizeNickname('x'.repeat(40))).toHaveLength(24);
    expect(normalizeNickname('   ')).toBeNull();
    expect(normalizeNickname(42)).toBeNull();
  });
});
