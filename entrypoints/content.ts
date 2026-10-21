import {
  BRIDGE_EXTENSION,
  isPageMessage,
  type ExtensionMessage,
  type MediaSnapshot,
} from '@/lib/bridge';
import { createRoomInvite } from '@/lib/backend';
import {
  message,
  isRuntimeMessage,
  type ExtensionState,
  type PlayerIssue,
  type RuntimeResponse,
} from '@/lib/messages';
import {
  activatePageTrack,
  activeTrackUrl,
  isAdPlaying,
  readPlaybackState,
  trackPageUrl,
} from '@/lib/player';
import type { PlaybackState } from '@/lib/protocol';
import { createStatusPill } from '@/lib/status-pill';

export default defineContentScript({
  matches: ['https://soundcloud.com/*', 'https://*.soundcloud.com/*'],
  main() {
    let media: MediaSnapshot | null = null;
    let sequence = 0;
    let suppressEventsUntil = 0;
    let nextApplyId = 0;
    const pendingApplies = new Map<
      number,
      (result: { found: boolean; autoplayBlocked: boolean }) => void
    >();

    // Estimate the current position from the latest page report.
    const currentMedia = () => {
      if (!media) return null;
      const elapsed = media.paused || media.ended ? 0 : Date.now() - media.at;
      return { ...media, currentTime: media.currentTime + elapsed / 1_000 };
    };

    const sendPlayback = (state: PlaybackState) =>
      void browser.runtime
        .sendMessage(message({ type: 'local-playback', state }))
        .catch(() => undefined);

    // The last real track state, so an ad can be reported as a pause there.
    let lastTrackState: PlaybackState | null = null;
    let adPausePublished = false;

    const publishState = () => {
      if (Date.now() < suppressEventsUntil) return;
      if (isAdPlaying(document)) {
        // Hold the room on the track instead of broadcasting the ad.
        if (lastTrackState && !adPausePublished) {
          adPausePublished = true;
          sendPlayback({
            ...lastTrackState,
            playing: false,
            sequence: sequence++,
            capturedAt: Date.now(),
          });
        }
        return;
      }
      adPausePublished = false;
      const current = currentMedia();
      const trackUrl = activeTrackUrl(document);
      const state =
        current && trackUrl
          ? readPlaybackState(current, trackUrl, sequence++, Date.now())
          : null;
      if (state) {
        lastTrackState = state;
        sendPlayback(state);
      }
    };

    window.addEventListener('message', (event) => {
      if (event.source !== window || !isPageMessage(event.data)) return;
      const data = event.data;
      if (data.type === 'media') {
        media = data.snapshot;
        if (data.event !== 'tick') publishState();
        return;
      }
      pendingApplies.get(data.id)?.(data);
      pendingApplies.delete(data.id);
    });

    const applyInPage = (state: PlaybackState) =>
      new Promise<{ found: boolean; autoplayBlocked: boolean }>((resolve) => {
        const id = ++nextApplyId;
        pendingApplies.set(id, resolve);
        window.postMessage(
          {
            source: BRIDGE_EXTENSION,
            type: 'apply',
            id,
            state,
          } satisfies ExtensionMessage,
          location.origin,
        );
        setTimeout(() => {
          if (pendingApplies.delete(id)) {
            resolve({ found: false, autoplayBlocked: false });
          }
        }, 3_000);
      });

    const reportError = (code: PlayerIssue) =>
      browser.runtime
        .sendMessage(message({ type: 'player-error', code }))
        .catch(() => undefined);

    // Follow a SoundCloud link in-page so the app's router handles it. A full
    // reload would reset the tab's user activation and block autoplay again.
    const navigateTo = (trackUrl: string) => {
      const link = document.createElement('a');
      link.href = trackUrl;
      link.style.display = 'none';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => {
        if (trackPageUrl(location.href) !== trackUrl) location.assign(trackUrl);
      }, 2_500);
    };

    // The host reports every couple of seconds. Only the newest state matters,
    // and only one attempt to reach it runs at a time.
    let latestRemote: PlaybackState | null = null;
    let syncing = false;
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const syncToRemote = async (): Promise<void> => {
      if (syncing) return;
      syncing = true;
      try {
        let navigatedTo: string | null = null;
        let adWaits = 0;
        let activations = 0;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const state = latestRemote;
          if (!state) return;
          if (isAdPlaying(document) && adWaits < 45) {
            // Seeking or clicking now would act on the ad. Wait it out.
            adWaits += 1;
            await reportError('ad_playing');
            attempt -= 1;
            await wait(2_000);
            continue;
          }
          const onTrackPage = trackPageUrl(location.href) === state.trackUrl;
          const loaded =
            activeTrackUrl(document) === state.trackUrl ||
            (onTrackPage && media !== null && activations > 0);
          if (loaded) {
            suppressEventsUntil = Date.now() + 750;
            const result = await applyInPage(state);
            if (!result.found) await reportError('player_unavailable');
            else if (result.autoplayBlocked)
              await reportError('autoplay_blocked');
            if (latestRemote === state) return;
            continue;
          }
          if (!onTrackPage) {
            if (navigatedTo !== state.trackUrl) {
              navigatedTo = state.trackUrl;
              activations = 0;
              navigateTo(state.trackUrl);
            }
          } else if (activations < 2 && (activations === 0 || !media)) {
            // Start the page's track so SoundCloud creates its player.
            activatePageTrack(document);
            activations += 1;
          }
          await wait(1_500);
        }
        await reportError(media ? 'autoplay_blocked' : 'player_unavailable');
      } finally {
        syncing = false;
      }
    };

    browser.runtime.onMessage.addListener((request: unknown) => {
      if (!isRuntimeMessage(request) || request.type !== 'apply-playback')
        return;
      latestRemote = request.state;
      void syncToRemote();
    });

    let roomState: ExtensionState | null = null;
    const send = (request: Parameters<typeof message>[0]) =>
      browser.runtime
        .sendMessage(message(request))
        .then((response) => response as RuntimeResponse)
        .catch(() => null);
    const pill = createStatusPill({
      // The click itself counts as user activation, so playback is allowed.
      start: () => void send({ type: 'resync' }),
      dismiss: () => void send({ type: 'dismiss-notice' }).then(refreshPill),
      copyInvite: async () => {
        if (!roomState?.backendUrl || !roomState.roomCode) return false;
        try {
          await navigator.clipboard.writeText(
            createRoomInvite(roomState.backendUrl, roomState.roomCode),
          );
          return true;
        } catch {
          return false;
        }
      },
      leave: () =>
        void send({ type: 'leave-room' }).then((response) => {
          if (response) pill.render(response.state);
        }),
    });
    const refreshPill = async () => {
      const response = await send({ type: 'get-state' });
      if (!response) return;
      roomState = response.state;
      pill.render(response.state);
    };
    setInterval(() => void refreshPill(), 1_500);
    void refreshPill();

    setInterval(publishState, 2_000);
    void browser.runtime
      .sendMessage(message({ type: 'content-ready' }))
      .catch(() => undefined);
  },
});
