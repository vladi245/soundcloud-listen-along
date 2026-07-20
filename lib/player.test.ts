import { describe, expect, it, vi } from 'vitest';
import type { PlaybackState } from './protocol';
import {
  applyPlaybackState,
  canonicalTrackUrl,
  readPlaybackState,
  trackPageUrl,
} from './player';

function audio(overrides: Partial<HTMLAudioElement> = {}): HTMLAudioElement {
  return {
    currentTime: 12,
    duration: 200,
    paused: false,
    ended: false,
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as HTMLAudioElement;
}

const state: PlaybackState = {
  trackUrl: 'https://soundcloud.com/artist/track',
  playing: true,
  positionMs: 12_000,
  capturedAt: 1_000,
  sequence: 1,
};

describe('SoundCloud player adapter', () => {
  it('removes tracking parameters and fragments', () => {
    expect(
      canonicalTrackUrl('https://soundcloud.com/artist/track?si=abc#comments'),
    ).toBe('https://soundcloud.com/artist/track');
  });

  it('accepts track permalinks but not browsing pages', () => {
    expect(trackPageUrl('https://soundcloud.com/artist/track')).toBe(
      'https://soundcloud.com/artist/track',
    );
    expect(trackPageUrl('https://soundcloud.com/discover')).toBeNull();
    expect(
      trackPageUrl('https://soundcloud.com/artist/sets/playlist'),
    ).toBeNull();
  });

  it('reads playback without page metadata', () => {
    expect(
      readPlaybackState(audio(), 'https://soundcloud.com/artist/track', 3, 500),
    ).toEqual({ ...state, capturedAt: 500, sequence: 3 });
  });

  it('requests navigation for a different track', async () => {
    await expect(
      applyPlaybackState(
        audio(),
        'https://soundcloud.com/artist/other',
        state,
        1_000,
      ),
    ).resolves.toEqual({ navigationUrl: state.trackUrl });
  });

  it('applies a remote pause and seek', async () => {
    const player = audio({ currentTime: 2 });
    await applyPlaybackState(
      player,
      state.trackUrl,
      { ...state, playing: false },
      1_000,
    );
    expect(player.currentTime).toBe(12);
    expect(player.pause).toHaveBeenCalledOnce();
  });

  it('reports blocked autoplay', async () => {
    const player = audio({
      play: vi.fn().mockRejectedValue(new Error('blocked')),
    });
    await expect(
      applyPlaybackState(player, state.trackUrl, state, 1_000),
    ).resolves.toEqual({ autoplayBlocked: true });
  });
});
