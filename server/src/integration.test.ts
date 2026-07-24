import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('room service', () => {
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
});
