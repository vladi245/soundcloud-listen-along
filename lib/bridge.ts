import { isPlaybackState, type PlaybackState } from './protocol';

// SoundCloud plays audio through media elements that are never attached to
// the document, so only a script in the page's own world can reach them.
// That script and the isolated content script talk through window messages.

export const BRIDGE_PAGE = 'soundcloud-listen-along:page';
export const BRIDGE_EXTENSION = 'soundcloud-listen-along:extension';

export interface MediaSnapshot {
  paused: boolean;
  ended: boolean;
  currentTime: number;
  duration: number | null;
  at: number;
}

export type MediaEventType =
  'play' | 'pause' | 'seeked' | 'loadedmetadata' | 'ended' | 'tick';

export type PageMessage =
  | {
      source: typeof BRIDGE_PAGE;
      type: 'media';
      event: MediaEventType;
      snapshot: MediaSnapshot;
    }
  | {
      source: typeof BRIDGE_PAGE;
      type: 'applied';
      id: number;
      found: boolean;
      autoplayBlocked: boolean;
    };

export type ExtensionMessage = {
  source: typeof BRIDGE_EXTENSION;
  type: 'apply';
  id: number;
  state: PlaybackState;
};

const mediaEvents: readonly MediaEventType[] = [
  'play',
  'pause',
  'seeked',
  'loadedmetadata',
  'ended',
  'tick',
];

export function isMediaSnapshot(value: unknown): value is MediaSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.paused === 'boolean' &&
    typeof value.ended === 'boolean' &&
    Number.isFinite(value.currentTime) &&
    (value.duration === null || Number.isFinite(value.duration)) &&
    Number.isFinite(value.at)
  );
}

export function isPageMessage(value: unknown): value is PageMessage {
  if (!isRecord(value) || value.source !== BRIDGE_PAGE) return false;
  if (value.type === 'media') {
    return (
      mediaEvents.includes(value.event as MediaEventType) &&
      isMediaSnapshot(value.snapshot)
    );
  }
  return (
    value.type === 'applied' &&
    Number.isInteger(value.id) &&
    typeof value.found === 'boolean' &&
    typeof value.autoplayBlocked === 'boolean'
  );
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    isRecord(value) &&
    value.source === BRIDGE_EXTENSION &&
    value.type === 'apply' &&
    Number.isInteger(value.id) &&
    isPlaybackState(value.state)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
