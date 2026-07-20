import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../../lib/protocol';
import {
  createHostToken,
  createRoomCode,
  isStrictClientMessage,
} from './index';

describe('credential generation', () => {
  it('maps bytes to a 16-character Crockford code', () => {
    const code = createRoomCode(
      Uint8Array.from({ length: 16 }, (_, index) => index * 17),
    );
    expect(code).toHaveLength(16);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  });

  it('encodes a 256-bit token without padding', () => {
    const token = createHostToken(
      Uint8Array.from({ length: 32 }, (_, index) => index),
    );
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('strict message validation', () => {
  const join = {
    type: 'join',
    version: PROTOCOL_VERSION,
    roomCode: '0123456789ABCDEF',
    participantId: 'abcdefghijklmnopqrst',
  } as const;

  it('accepts exact shared protocol messages', () => {
    expect(isStrictClientMessage(join)).toBe(true);
    expect(isStrictClientMessage({ type: 'ping', sentAt: 0 })).toBe(true);
    expect(isStrictClientMessage({ type: 'leave' })).toBe(true);
  });

  it('rejects unknown fields at every level', () => {
    expect(isStrictClientMessage({ ...join, extra: true })).toBe(false);
    expect(
      isStrictClientMessage({
        type: 'playback',
        state: {
          trackUrl: 'https://soundcloud.com/artist/track',
          playing: true,
          positionMs: 10,
          capturedAt: 20,
          sequence: 1,
          extra: true,
        },
      }),
    ).toBe(false);
  });
});
