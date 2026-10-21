import {
  BRIDGE_PAGE,
  isExtensionMessage,
  type MediaEventType,
  type MediaSnapshot,
  type PageMessage,
} from '@/lib/bridge';
import { applyPlaybackState } from '@/lib/player';

// Runs in the page's own world before SoundCloud loads, so it can see the
// detached media elements SoundCloud creates for playback.
export default defineContentScript({
  matches: ['https://soundcloud.com/*', 'https://*.soundcloud.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const tracked = new WeakSet<HTMLMediaElement>();
    let active: HTMLMediaElement | null = null;

    const post = (message: PageMessage) => {
      window.postMessage(message, location.origin);
    };

    const snapshot = (media: HTMLMediaElement): MediaSnapshot => ({
      paused: media.paused,
      ended: media.ended,
      currentTime: Number.isFinite(media.currentTime) ? media.currentTime : 0,
      duration: Number.isFinite(media.duration) ? media.duration : null,
      at: Date.now(),
    });

    const report = (event: MediaEventType) => {
      if (active)
        post({
          source: BRIDGE_PAGE,
          type: 'media',
          event,
          snapshot: snapshot(active),
        });
    };

    const track = (media: HTMLMediaElement) => {
      if (tracked.has(media)) return media;
      tracked.add(media);
      for (const event of [
        'play',
        'pause',
        'seeked',
        'loadedmetadata',
        'ended',
      ] as const) {
        media.addEventListener(event, () => {
          if (event === 'play') active = media;
          if (media === active) report(event);
        });
      }
      return media;
    };

    const createElement = Document.prototype.createElement;
    Document.prototype.createElement = function (
      this: Document,
      ...args: Parameters<Document['createElement']>
    ) {
      const element = createElement.apply(this, args);
      if (element instanceof HTMLMediaElement) track(element);
      return element;
    } as Document['createElement'];

    const NativeAudio = window.Audio;
    window.Audio = function (src?: string) {
      const media = new NativeAudio(src);
      track(media);
      return media;
    } as unknown as typeof Audio;
    window.Audio.prototype = NativeAudio.prototype;

    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      active = track(this);
      return play.call(active);
    };

    setInterval(() => {
      if (active && !active.paused) report('tick');
    }, 1_000);

    window.addEventListener('message', (event) => {
      if (event.source !== window || !isExtensionMessage(event.data)) return;
      const { id, state } = event.data;
      if (!active) {
        post({
          source: BRIDGE_PAGE,
          type: 'applied',
          id,
          found: false,
          autoplayBlocked: false,
        });
        return;
      }
      void applyPlaybackState(active, state.trackUrl, state).then((result) => {
        post({
          source: BRIDGE_PAGE,
          type: 'applied',
          id,
          found: true,
          autoplayBlocked: Boolean(result.autoplayBlocked),
        });
      });
    });
  },
});
