import type { ExtensionState } from './messages';

export interface PillActions {
  start(): void;
  copyInvite(): Promise<boolean>;
  leave(): void;
}

const css = `
:host { all: initial; }
.pill {
  position: fixed; left: 16px; bottom: 64px; z-index: 2147483647;
  display: flex; align-items: center; gap: 10px;
  max-width: calc(100vw - 32px); padding: 8px 10px 8px 12px;
  border: 1px solid #e5e5e5; border-radius: 4px;
  color: #333; background: #fff;
  font: 13px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.pill.dark { border-color: #2b2b2b; color: #f2f2f2; background: #1f1f1f; }
.dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #999; }
.connected .dot { background: #f50; }
.error .dot { background: #d0021b; }
.text { min-width: 0; padding: 1px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.count { color: #999; }
button {
  flex: none; height: 26px; padding: 0 10px; border: 1px solid #ccc; border-radius: 3px;
  color: inherit; background: transparent; font: inherit; font-weight: 600; cursor: pointer;
}
.dark button { border-color: #3d3d3d; }
button.primary { border-color: #f50; color: #fff; background: #f50; }
button.primary:hover { background: #e64d00; }
button.quiet { border: 0; padding: 0 2px; color: #999; font-weight: 400; }
button.quiet:hover { color: inherit; }
`;

export function createStatusPill(actions: PillActions) {
  let host: HTMLElement | null = null;
  let root: ShadowRoot | null = null;
  let flash = '';
  let flashUntil = 0;
  let last: ExtensionState | null = null;
  let rendered = '';

  const mount = () => {
    if (host?.isConnected) return root!;
    host = document.createElement('listen-along-status');
    root = host.attachShadow({ mode: 'closed' });
    document.documentElement.append(host);
    return root;
  };

  const unmount = () => {
    rendered = '';
    host?.remove();
    host = null;
    root = null;
  };

  const pageIsDark = () => {
    const match = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    if (!match) return false;
    const [r, g, b] = match.map(Number);
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
  };

  const render = (state: ExtensionState) => {
    last = state;
    if (!state.inThisTab || !state.roomCode) {
      unmount();
      return;
    }
    const shadow = mount();
    const hosting = state.role === 'host';
    const count =
      state.participantCount > 1 ? `${state.participantCount} listening` : '';
    let tone = state.status;
    let text: string;
    let primary: { label: string; run: () => void } | null = null;

    if (state.status === 'connecting') {
      text = 'Connecting to the room…';
    } else if (state.status === 'error') {
      text = state.error ?? 'Connection problem';
    } else if (!hosting && state.autoplayBlocked) {
      tone = 'connected';
      text = 'Your browser paused playback';
      primary = { label: 'Start listening', run: actions.start };
    } else if (hosting) {
      text = 'Hosting a room';
      primary = {
        label: 'Copy invite',
        run: () =>
          void actions.copyInvite().then((copied) => {
            flash = copied ? 'Invite link copied' : 'Could not copy the link';
            flashUntil = Date.now() + 2_500;
            if (last) render(last);
          }),
      };
    } else {
      text = 'Following the host';
    }
    if (Date.now() < flashUntil) text = flash;

    // Re-rendering on every poll would reset hover and focus.
    const signature = JSON.stringify([
      tone,
      text,
      count,
      primary?.label,
      pageIsDark(),
    ]);
    if (signature === rendered && shadow.childElementCount) return;
    rendered = signature;
    shadow.innerHTML = `<style>${css}</style>
      <div class="pill ${tone} ${pageIsDark() ? 'dark' : ''}" role="status">
        <span class="dot"></span>
        <span class="text"></span>
        ${count ? '<span class="count"></span>' : ''}
        ${primary ? '<button class="primary" type="button"></button>' : ''}
        <button class="quiet leave" type="button">Leave</button>
      </div>`;
    shadow.querySelector('.text')!.textContent = text;
    const countElement = shadow.querySelector('.count');
    if (countElement) countElement.textContent = count;
    const button = shadow.querySelector<HTMLButtonElement>('.primary');
    if (button && primary) {
      button.textContent = primary.label;
      button.addEventListener('click', primary.run);
    }
    shadow
      .querySelector('.leave')!
      .addEventListener('click', () => actions.leave());
  };

  return { render };
}
