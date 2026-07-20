import { message, isRuntimeMessage } from '@/lib/messages';
import {
  applyPlaybackState,
  findPlayer,
  readPlaybackState,
} from '@/lib/player';

export default defineContentScript({
  matches: ['https://soundcloud.com/*', 'https://*.soundcloud.com/*'],
  main() {
    let player: HTMLAudioElement | null = null;
    let sequence = 0;
    let suppressEventsUntil = 0;

    const publishState = () => {
      if (Date.now() < suppressEventsUntil) return;
      const state = player
        ? readPlaybackState(player, location.href, sequence++, Date.now())
        : null;
      if (state) {
        void browser.runtime
          .sendMessage(message({ type: 'local-playback', state }))
          .catch(() => undefined);
      }
    };

    const attachPlayer = () => {
      const next = findPlayer(document);
      if (next === player) return;
      if (player) {
        for (const event of playbackEvents) {
          player.removeEventListener(event, publishState);
        }
      }
      player = next;
      if (player) {
        for (const event of playbackEvents) {
          player.addEventListener(event, publishState);
        }
        publishState();
      }
    };

    browser.runtime.onMessage.addListener((request: unknown) => {
      if (!isRuntimeMessage(request) || request.type !== 'apply-playback')
        return;
      attachPlayer();
      if (!player) {
        return browser.runtime.sendMessage(
          message({ type: 'player-error', code: 'player_unavailable' }),
        );
      }

      suppressEventsUntil = Date.now() + 750;
      return applyPlaybackState(player, location.href, request.state).then(
        (result) => {
          if (result.navigationUrl) {
            location.assign(result.navigationUrl);
          } else if (result.autoplayBlocked) {
            return browser.runtime.sendMessage(
              message({ type: 'player-error', code: 'autoplay_blocked' }),
            );
          }
        },
      );
    });

    attachPlayer();
    setInterval(attachPlayer, 1_000);
    setInterval(publishState, 2_000);
    void browser.runtime
      .sendMessage(message({ type: 'content-ready' }))
      .catch(() => undefined);
  },
});

const playbackEvents = ['play', 'pause', 'seeked', 'loadedmetadata'] as const;
