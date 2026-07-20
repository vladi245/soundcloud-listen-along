import { message, isRuntimeMessage } from '@/lib/messages';
import {
  activatePageTrack,
  activeTrackUrl,
  applyPlaybackState,
  findPlayer,
  readPlaybackState,
  trackPageUrl,
} from '@/lib/player';

export default defineContentScript({
  matches: ['https://soundcloud.com/*', 'https://*.soundcloud.com/*'],
  main() {
    let player: HTMLAudioElement | null = null;
    let sequence = 0;
    let suppressEventsUntil = 0;

    const publishState = () => {
      if (Date.now() < suppressEventsUntil) return;
      const trackUrl = activeTrackUrl(document);
      const state = player
        ? readPlaybackState(player, trackUrl ?? '', sequence++, Date.now())
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

    const applyRemoteState = async (
      state: Parameters<typeof applyPlaybackState>[2],
      activationAttempted = false,
    ) => {
      attachPlayer();
      if (!player) {
        await browser.runtime.sendMessage(
          message({ type: 'player-error', code: 'player_unavailable' }),
        );
        return;
      }

      const activeUrl = activeTrackUrl(document);
      if (activeUrl !== state.trackUrl) {
        if (trackPageUrl(location.href) !== state.trackUrl) {
          location.assign(state.trackUrl);
          return;
        }
        if (!activationAttempted && activatePageTrack(document)) {
          setTimeout(() => void applyRemoteState(state, true), 750);
          return;
        }
        await browser.runtime.sendMessage(
          message({ type: 'player-error', code: 'player_unavailable' }),
        );
        return;
      }

      suppressEventsUntil = Date.now() + 750;
      const result = await applyPlaybackState(player, activeUrl, state);
      if (result.autoplayBlocked) {
        await browser.runtime.sendMessage(
          message({ type: 'player-error', code: 'autoplay_blocked' }),
        );
      }
    };

    browser.runtime.onMessage.addListener((request: unknown) => {
      if (!isRuntimeMessage(request) || request.type !== 'apply-playback')
        return;
      return applyRemoteState(request.state);
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
