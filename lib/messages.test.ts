import { describe, expect, it } from 'vitest';
import { isRuntimeMessage, message, MESSAGE_NAMESPACE } from './messages';

describe('extension messages', () => {
  it('adds the project namespace', () => {
    expect(message({ type: 'get-state' })).toEqual({
      namespace: MESSAGE_NAMESPACE,
      type: 'get-state',
    });
  });

  it('rejects messages from pages and other extensions', () => {
    expect(isRuntimeMessage({ type: 'get-state' })).toBe(false);
    expect(
      isRuntimeMessage({ namespace: 'another-extension', type: 'get-state' }),
    ).toBe(false);
  });

  it('validates command values', () => {
    expect(
      isRuntimeMessage(
        message({ type: 'join-room', tabId: 1, roomCode: 'room' }),
      ),
    ).toBe(true);
    expect(
      isRuntimeMessage(
        message({ type: 'join-room', tabId: -1, roomCode: 'room' }),
      ),
    ).toBe(false);
  });
});
