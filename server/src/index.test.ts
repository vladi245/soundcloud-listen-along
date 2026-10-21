import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../../lib/protocol';
import {
  createHostToken,
  createRoomCode,
  isStrictClientMessage,
} from './index';
import worker from './index';

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

describe('room creation authorization', () => {
  const rooms = {} as DurableObjectNamespace;
  const limiter = {} as DurableObjectNamespace;

  it('requires server configuration', async () => {
    const response = await worker.fetch(
      new Request('https://rooms.example/rooms', { method: 'POST' }),
      { ROOMS: rooms, CREATION_LIMITER: limiter },
    );
    expect(response.status).toBe(503);
  });

  it('rejects an invalid creation key', async () => {
    const response = await worker.fetch(
      new Request('https://rooms.example/rooms', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-key' },
      }),
      {
        ROOMS: rooms,
        CREATION_LIMITER: limiter,
        ROOM_CREATION_KEY: 'correct-key',
      },
    );
    expect(response.status).toBe(401);
  });

  it('validates the request before consuming creation quota', async () => {
    let limiterUsed = false;
    const response = await worker.fetch(
      new Request('https://rooms.example/rooms', {
        method: 'POST',
        headers: { Authorization: 'Bearer correct-key' },
        body: 'unexpected',
      }),
      {
        ROOMS: rooms,
        CREATION_LIMITER: {
          get() {
            limiterUsed = true;
            throw new Error('Limiter should not be called');
          },
        } as unknown as DurableObjectNamespace,
        ROOM_CREATION_KEY: 'correct-key',
      },
    );
    expect(response.status).toBe(400);
    expect(limiterUsed).toBe(false);
  });
});

describe('service metadata', () => {
  it('reports protocol compatibility without credentials', async () => {
    const response = await worker.fetch(
      new Request('https://rooms.example/meta'),
      {
        ROOMS: {} as DurableObjectNamespace,
        CREATION_LIMITER: {} as DurableObjectNamespace,
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: 'soundcloud-listen-along',
      protocolVersion: PROTOCOL_VERSION,
      maxParticipants: 25,
      creationKeyRequired: true,
      roomCreationEnabled: false,
    });
  });
});

describe('public room creation', () => {
  it('does not require a creation key', async () => {
    const response = await worker.fetch(
      new Request('https://rooms.example/meta'),
      {
        ROOMS: {} as DurableObjectNamespace,
        CREATION_LIMITER: {} as DurableObjectNamespace,
        PUBLIC_ROOM_CREATION: 'true',
      },
    );
    await expect(response.json()).resolves.toMatchObject({
      creationKeyRequired: false,
      roomCreationEnabled: true,
    });
  });
});

describe('invitation landing page', () => {
  it('links to a configured HTTPS install page', async () => {
    const response = await worker.fetch(new Request('https://rooms.example/'), {
      ROOMS: {} as DurableObjectNamespace,
      CREATION_LIMITER: {} as DurableObjectNamespace,
      INSTALL_URL: 'https://example.com/install?a="b"',
    });
    const html = await response.text();
    expect(html).toContain('href="https://example.com/install?a=%22b%22"');
  });

  it('offers hosted extension packages', async () => {
    const response = await worker.fetch(new Request('https://rooms.example/'), {
      ROOMS: {} as DurableObjectNamespace,
      CREATION_LIMITER: {} as DurableObjectNamespace,
      ASSETS: {
        fetch: async (input: RequestInfo | URL) =>
          new Response(null, {
            status: String(input).endsWith('.xpi') ? 200 : 404,
          }),
      } as unknown as Fetcher,
    });
    const html = await response.text();
    expect(html).toContain('href="/listen-along.xpi"');
    expect(html).not.toContain('listen-along-chrome.zip');
  });

  it('serves a static page without receiving fragment credentials', async () => {
    const response = await worker.fetch(new Request('https://rooms.example/'), {
      ROOMS: {} as DurableObjectNamespace,
      CREATION_LIMITER: {} as DurableObjectNamespace,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/html; charset=utf-8',
    );
    expect(await response.text()).toContain('Listen Along');
  });
});
