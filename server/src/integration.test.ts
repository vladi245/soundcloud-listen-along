import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from './index';

describe('room service', () => {
  it('serves the invitation landing page', async () => {
    const response = await SELF.fetch('https://rooms.example/');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "style-src 'self'",
    );
  });

  it('advertises a compatible service', async () => {
    const response = await SELF.fetch('https://rooms.example/meta');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: 'soundcloud-listen-along',
      protocolVersion: 1,
      creationKeyRequired: true,
      roomCreationEnabled: true,
    });
  });

  it('creates and resolves an ephemeral room', async () => {
    const created = await SELF.fetch('https://rooms.example/rooms', {
      method: 'POST',
      headers: { Authorization: 'Bearer integration-test-key' },
    });

    expect(created.status).toBe(201);
    const body = await created.json<{
      roomCode: string;
      hostToken: string;
    }>();
    expect(body.roomCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(body.hostToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const existing = await SELF.fetch(
      `https://rooms.example/rooms/${body.roomCode}`,
    );
    expect(existing.status).toBe(204);
  });

  it('does not allocate rooms without the operator key', async () => {
    const response = await SELF.fetch('https://rooms.example/rooms', {
      method: 'POST',
    });
    expect(response.status).toBe(401);
  });

  it('returns not found for an unknown room', async () => {
    const response = await SELF.fetch(
      'https://rooms.example/rooms/0123456789ABCDEF',
    );
    expect(response.status).toBe(404);
  });

  it('throttles excessive room creation without tracking client IPs', async () => {
    const limiterNamespace = (
      env as typeof env & { CREATION_LIMITER: DurableObjectNamespace }
    ).CREATION_LIMITER;
    const limiter = limiterNamespace.get(limiterNamespace.newUniqueId());
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await limiter.fetch('https://limiter.internal/consume', {
        method: 'POST',
      });
      expect(response.status).toBe(204);
    }
    const limited = await limiter.fetch('https://limiter.internal/consume', {
      method: 'POST',
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('creates rooms without a key on a public server', async () => {
    const publicEnv = { ...env, PUBLIC_ROOM_CREATION: 'true' } as Parameters<
      typeof worker.fetch
    >[1];
    const meta = await worker.fetch(
      new Request('https://rooms.example/meta'),
      publicEnv,
    );
    await expect(meta.json()).resolves.toMatchObject({
      creationKeyRequired: false,
      roomCreationEnabled: true,
    });

    const created = await worker.fetch(
      new Request('https://rooms.example/rooms', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '203.0.113.7' },
      }),
      publicEnv,
    );
    expect(created.status).toBe(201);
  });

  it('throttles each client on a public server', async () => {
    const publicEnv = { ...env, PUBLIC_ROOM_CREATION: 'true' } as Parameters<
      typeof worker.fetch
    >[1];
    const create = (address: string) =>
      worker.fetch(
        new Request('https://rooms.example/rooms', {
          method: 'POST',
          headers: { 'CF-Connecting-IP': address },
        }),
        publicEnv,
      );
    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect((await create('198.51.100.20')).status).toBe(201);
    }
    expect((await create('198.51.100.20')).status).toBe(429);
    expect((await create('198.51.100.21')).status).toBe(201);
  });

  it('applies a requested limiter quota', async () => {
    const limiterNamespace = (
      env as typeof env & { CREATION_LIMITER: DurableObjectNamespace }
    ).CREATION_LIMITER;
    const limiter = limiterNamespace.get(limiterNamespace.newUniqueId());
    const consume = () =>
      limiter.fetch('https://limiter.internal/consume', {
        method: 'POST',
        headers: { 'X-Rate-Limit': '2' },
      });
    expect((await consume()).status).toBe(204);
    expect((await consume()).status).toBe(204);
    expect((await consume()).status).toBe(429);
  });

  it('tells guests when the host leaves', async () => {
    const created = await SELF.fetch('https://rooms.example/rooms', {
      method: 'POST',
      headers: { Authorization: 'Bearer integration-test-key' },
    });
    const { roomCode, hostToken } = await created.json<{
      roomCode: string;
      hostToken: string;
    }>();
    const join = async (participantId: string, token?: string) => {
      const response = await SELF.fetch(
        `https://rooms.example/rooms/${roomCode}/socket`,
        { headers: { Upgrade: 'websocket' } },
      );
      const socket = response.webSocket!;
      socket.accept();
      const messages: { type: string; [key: string]: unknown }[] = [];
      socket.addEventListener('message', (event) => {
        messages.push(JSON.parse(event.data as string));
      });
      socket.send(
        JSON.stringify({
          type: 'join',
          version: 1,
          roomCode,
          participantId,
          ...(token ? { hostToken: token } : {}),
        }),
      );
      return { socket, messages };
    };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

    const host = await join('host-participant-0001', hostToken);
    await settle();
    const guest = await join('guest-participant-001');
    await settle();
    expect(guest.messages).toContainEqual(
      expect.objectContaining({ type: 'presence', hostConnected: true }),
    );

    host.socket.send(JSON.stringify({ type: 'leave' }));
    await settle();
    expect(guest.messages).toContainEqual({
      type: 'room-closed',
      reason: 'host_left',
    });
    const after = await SELF.fetch(`https://rooms.example/rooms/${roomCode}`);
    expect(after.status).toBe(404);
  });
});
