import type { PlaybackState } from './protocol';
import { isSoundCloudUrl } from './protocol';
import { requiredSeek } from './sync';

export interface ApplyResult {
  navigationUrl?: string;
  autoplayBlocked?: boolean;
}

export function canonicalTrackUrl(value: string): string | null {
  if (!isSoundCloudUrl(value)) return null;
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  return url.toString();
}

export function findPlayer(document: Document): HTMLAudioElement | null {
  return document.querySelector('audio');
}

export function readPlaybackState(
  audio: HTMLAudioElement,
  pageUrl: string,
  sequence: number,
  now = Date.now(),
): PlaybackState | null {
  const trackUrl = canonicalTrackUrl(pageUrl);
  if (!trackUrl || !Number.isFinite(audio.currentTime)) return null;

  return {
    trackUrl,
    playing: !audio.paused && !audio.ended,
    positionMs: Math.max(0, audio.currentTime * 1_000),
    capturedAt: now,
    sequence,
  };
}

export async function applyPlaybackState(
  audio: HTMLAudioElement,
  pageUrl: string,
  state: PlaybackState,
  now = Date.now(),
): Promise<ApplyResult> {
  if (canonicalTrackUrl(pageUrl) !== canonicalTrackUrl(state.trackUrl)) {
    return { navigationUrl: state.trackUrl };
  }

  const seek = requiredSeek(state, audio.currentTime * 1_000, now);
  if (seek !== null && Number.isFinite(audio.duration)) {
    audio.currentTime = Math.min(seek / 1_000, audio.duration);
  }

  if (!state.playing) {
    audio.pause();
    return {};
  }

  try {
    await audio.play();
    return {};
  } catch {
    return { autoplayBlocked: true };
  }
}
