import type { PlaybackState } from './protocol';

export const SEEK_THRESHOLD_MS = 1_000;

export function expectedPosition(state: PlaybackState, now: number): number {
  if (!state.playing) return state.positionMs;
  return state.positionMs + Math.max(0, now - state.capturedAt);
}

export function requiredSeek(
  state: PlaybackState,
  localPositionMs: number,
  now: number,
  thresholdMs = SEEK_THRESHOLD_MS,
): number | null {
  const expected = expectedPosition(state, now);
  return Math.abs(expected - localPositionMs) >= thresholdMs ? expected : null;
}

export function estimateServerOffset(
  clientSentAt: number,
  clientReceivedAt: number,
  serverTime: number,
): number {
  const midpoint = clientSentAt + (clientReceivedAt - clientSentAt) / 2;
  return serverTime - midpoint;
}
