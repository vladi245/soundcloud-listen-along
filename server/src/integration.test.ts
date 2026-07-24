import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

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
});
