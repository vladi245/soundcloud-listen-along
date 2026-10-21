import { describe, expect, it } from 'vitest';
import { isNewerVersion, parseLatestRelease } from './version';

describe('release versions', () => {
  it('compares versions numerically', () => {
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.3.1', '0.3.1')).toBe(false);
    expect(isNewerVersion('0.3.0', '0.3.1')).toBe(false);
    expect(isNewerVersion('latest', '0.3.1')).toBe(false);
  });

  it('accepts only a version and a download path on the server', () => {
    expect(
      parseLatestRelease(
        { version: '0.4.0', download: '/listen-along-chrome.zip' },
        'https://rooms.example',
      ),
    ).toEqual({
      version: '0.4.0',
      download: 'https://rooms.example/listen-along-chrome.zip',
    });
    expect(
      parseLatestRelease(
        { version: '0.4.0', download: 'https://elsewhere.example/x.zip' },
        'https://rooms.example',
      ),
    ).toBeNull();
  });
});
