import type { PlaybackState, Role } from './protocol';
import { isPlaybackState } from './protocol';

export const MESSAGE_NAMESPACE = 'soundcloud-listen-along';

export interface ExtensionState {
  backendUrl?: string;
  hasCreationKey?: boolean;
  maxParticipants?: number;
  status: 'idle' | 'connecting' | 'connected' | 'error';
  roomCode?: string;
  role?: Role;
  participantCount: number;
  error?: string;
  autoplayBlocked?: boolean;
}

export type RuntimeMessage =
  | { namespace: typeof MESSAGE_NAMESPACE; type: 'content-ready' }
  | {
      namespace: typeof MESSAGE_NAMESPACE;
      type: 'local-playback';
      state: PlaybackState;
    }
  | {
      namespace: typeof MESSAGE_NAMESPACE;
      type: 'player-error';
      code: 'player_unavailable' | 'autoplay_blocked';
    }
  | {
      namespace: typeof MESSAGE_NAMESPACE;
      type: 'apply-playback';
      state: PlaybackState;
    }
  | { namespace: typeof MESSAGE_NAMESPACE; type: 'get-state' }
  | {
      namespace: typeof MESSAGE_NAMESPACE;
      type: 'configure-backend';
      backendUrl: string;
      creationKey: string;
      rememberCreationKey: boolean;
    }
  | {
      namespace: typeof MESSAGE_NAMESPACE;
      type: 'create-room';
      tabId: number;
    }
  | {
      namespace: typeof MESSAGE_NAMESPACE;
      type: 'join-room';
      tabId: number;
      roomCode: string;
    }
  | { namespace: typeof MESSAGE_NAMESPACE; type: 'leave-room' };

export interface RuntimeResponse {
  ok: boolean;
  state: ExtensionState;
}

type MessagePayload = RuntimeMessage extends infer T
  ? T extends RuntimeMessage
    ? Omit<T, 'namespace'>
    : never
  : never;

export function message(value: MessagePayload): RuntimeMessage {
  return { namespace: MESSAGE_NAMESPACE, ...value } as RuntimeMessage;
}

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!isRecord(value) || value.namespace !== MESSAGE_NAMESPACE) return false;

  switch (value.type) {
    case 'content-ready':
    case 'get-state':
    case 'leave-room':
      return true;
    case 'local-playback':
    case 'apply-playback':
      return isPlaybackState(value.state);
    case 'player-error':
      return (
        value.code === 'player_unavailable' || value.code === 'autoplay_blocked'
      );
    case 'configure-backend':
      return (
        typeof value.backendUrl === 'string' &&
        typeof value.creationKey === 'string' &&
        value.creationKey.length <= 128 &&
        typeof value.rememberCreationKey === 'boolean'
      );
    case 'create-room':
      return Number.isInteger(value.tabId) && Number(value.tabId) >= 0;
    case 'join-room':
      return (
        Number.isInteger(value.tabId) &&
        Number(value.tabId) >= 0 &&
        typeof value.roomCode === 'string'
      );
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
