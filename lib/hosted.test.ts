import { describe, expect, it } from 'vitest';
import { normalizeBackendUrl } from './backend';
import { HOSTED_BACKEND_URL, isHostedBackend } from './hosted';

describe('hosted backend', () => {
  it('is a normalized secure origin', () => {
    if (!HOSTED_BACKEND_URL) return;
    expect(normalizeBackendUrl(HOSTED_BACKEND_URL)).toBe(HOSTED_BACKEND_URL);
    expect(HOSTED_BACKEND_URL.startsWith('https://')).toBe(true);
  });

  it('matches only the exact hosted origin', () => {
    expect(isHostedBackend(undefined)).toBe(false);
    expect(isHostedBackend('https://rooms.example.com')).toBe(false);
    if (HOSTED_BACKEND_URL) {
      expect(isHostedBackend(HOSTED_BACKEND_URL)).toBe(true);
    }
  });
});
