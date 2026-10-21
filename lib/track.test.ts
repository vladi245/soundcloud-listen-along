import { describe, expect, it } from 'vitest';
import { describeTrack } from './track';

describe('track labels', () => {
  it('reads artist and title from a permalink', () => {
    expect(
      describeTrack('https://soundcloud.com/dreaming4luna/frailty-v2?si=1'),
    ).toEqual({ artist: 'dreaming4luna', title: 'frailty v2' });
  });

  it('ignores pages that are not tracks', () => {
    expect(describeTrack('https://soundcloud.com/discover')).toBeNull();
    expect(describeTrack(undefined)).toBeNull();
  });
});
