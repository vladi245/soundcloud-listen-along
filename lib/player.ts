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
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

export function trackPageUrl(value: string): string | null {
  const canonical = canonicalTrackUrl(value);
  if (!canonical) return null;
  const segments = new URL(canonical).pathname.split('/').filter(Boolean);
  return segments.length === 2 ? canonical : null;
}

export function activeTrackUrl(document: Document): string | null {
  const link = document.querySelector<HTMLAnchorElement>(
    '.playbackSoundBadge__titleLink[href]',
  );
  return link ? trackPageUrl(link.href) : null;
}

export function activatePageTrack(document: Document): boolean {
  const button = document.querySelector<HTMLElement>(
    '.soundActions .playButton, .listenEngagement .playButton',
  );
  if (!button) return false;
  button.click();
  return true;
}

export function findPlayer(document: Document): HTMLAudioElement | null {
  return document.querySelector('audio');
}

export function readPlaybackState(
  audio: HTMLAudioElement,
  trackUrlValue: string,
  sequence: number,
  now = Date.now(),
): PlaybackState | null {
  const trackUrl = trackPageUrl(trackUrlValue);
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
  activeUrl: string,
  state: PlaybackState,
  now = Date.now(),
): Promise<ApplyResult> {
  if (canonicalTrackUrl(activeUrl) !== canonicalTrackUrl(state.trackUrl)) {
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
