import { parseRoomInvite } from '@/lib/backend';
import { HOSTED_BACKEND_URL } from '@/lib/hosted';
import { message, type RuntimeResponse } from '@/lib/messages';

// Turns the public server's invitation page into a one-click join when the
// extension is already installed.
export default defineContentScript({
  matches: HOSTED_BACKEND_URL ? [`${HOSTED_BACKEND_URL}/*`] : [],
  main() {
    document.documentElement.dataset.extension = 'installed';
    const join = document.querySelector<HTMLElement>('#join');
    const button = document.querySelector<HTMLButtonElement>('#join-button');
    const status = document.querySelector<HTMLElement>('#join-status');
    if (!join || !button || !status) return;

    const show = () => {
      const invite = parseRoomInvite(location.href);
      join.hidden = !invite;
      document.querySelector('#steps')?.toggleAttribute('hidden', !!invite);
    };
    show();
    window.addEventListener('hashchange', show);

    button.addEventListener('click', async () => {
      const invite = parseRoomInvite(location.href);
      if (!invite) return;
      button.disabled = true;
      status.textContent = 'Joining…';
      try {
        const response = (await browser.runtime.sendMessage(
          message({
            type: 'configure-invite',
            backendUrl: invite.backendUrl,
            roomCode: invite.roomCode,
          }),
        )) as RuntimeResponse;
        status.textContent = response.ok
          ? 'SoundCloud opened in a new tab.'
          : (response.state.error ?? 'This room is unavailable.');
      } catch {
        status.textContent = 'The extension did not respond. Reload the page.';
      }
      button.disabled = false;
    });
  },
});
