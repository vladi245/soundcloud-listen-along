import { describe, expect, it } from 'vitest';
import type { PlaybackState } from './protocol';
import { estimateServerOffset, expectedPosition, requiredSeek } from './sync';

const state: PlaybackState = {
  trackUrl: 'https://soundcloud.com/artist/track',
  playing: true,
  positionMs: 10_000,
  capturedAt: 1_000,
  sequence: 1,
};

describe('playback synchronization', () => {
  it('advances a playing snapshot', () => {
    expect(expectedPosition(state, 1_500)).toBe(10_500);
  });

  it('keeps a paused snapshot fixed', () => {
    expect(expectedPosition({ ...state, playing: false }, 5_000)).toBe(10_000);
  });

  it('seeks only when drift reaches the threshold', () => {
    expect(requiredSeek(state, 10_000, 1_500)).toBeNull();
    expect(requiredSeek(state, 8_000, 1_500)).toBe(10_500);
  });

  it('estimates server clock offset from a round trip', () => {
    expect(estimateServerOffset(1_000, 1_200, 1_150)).toBe(50);
  });
});
