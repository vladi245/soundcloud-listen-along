import './style.css';
import { backendPermission, normalizeBackendUrl } from '@/lib/backend';
import {
  message,
  type ExtensionState,
  type RuntimeResponse,
} from '@/lib/messages';
import { normalizeRoomCode } from '@/lib/protocol';

const app = document.querySelector<HTMLDivElement>('#app')!;
let currentState: ExtensionState = { status: 'idle', participantCount: 0 };

async function send(
  request: Parameters<typeof message>[0],
): Promise<RuntimeResponse> {
  return (await browser.runtime.sendMessage(
    message(request),
  )) as RuntimeResponse;
}

async function activeTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab found');
  return tab.id;
}

function shell(content: string): string {
  return `
    <main>
      <header>
        <div class="signal" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div>
          <span class="eyebrow">Unofficial extension</span>
          <h1>Listen Along</h1>
        </div>
      </header>
      ${content}
      <p class="legal">Audio stays on SoundCloud. This extension is independent and unofficial.</p>
    </main>
  `;
}

function renderBackendForm(error?: string): void {
  app.innerHTML = shell(`
    <section>
      <span class="step">01 / Connect</span>
      <h2>Use your room server</h2>
      <p class="muted">Enter the origin of a deployed server from this repository.</p>
      <form id="backend-form">
        <label for="backend">Backend origin</label>
        <input id="backend" name="backend" type="url" placeholder="https://rooms.example.com" autocomplete="url" required>
        <button class="primary" type="submit">Save backend</button>
      </form>
      <p id="notice" class="notice" role="status"></p>
    </section>
  `);
  const notice = document.querySelector<HTMLParagraphElement>('#notice')!;
  if (error) notice.textContent = error;
  document
    .querySelector<HTMLFormElement>('#backend-form')!
    .addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector<HTMLInputElement>('#backend')!;
      const backendUrl = normalizeBackendUrl(input.value);
      if (!backendUrl) {
        notice.textContent = 'Use HTTPS, or HTTP on localhost for development.';
        return;
      }
      let granted: boolean;
      try {
        granted = await browser.permissions.request({
          origins: [backendPermission(backendUrl)],
        });
      } catch {
        notice.textContent = 'This backend origin cannot be permitted.';
        return;
      }
      if (!granted) {
        notice.textContent = 'Backend access was not granted.';
        return;
      }
      const response = await send({ type: 'configure-backend', backendUrl });
      currentState = response.state;
      render();
    });
}

function renderLobby(): void {
  app.innerHTML = shell(`
    <section>
      <div class="server-row">
        <span><b class="dot"></b><span id="backend"></span></span>
        <button id="change-backend" class="text-button" type="button">Change</button>
      </div>
      <span class="step">02 / Room</span>
      <h2>Start together</h2>
      <p class="muted">Open the track you want on SoundCloud, then host or join a room.</p>
      <label class="consent">
        <input id="consent" type="checkbox">
        <span>Send the current track URL and playback timing to this backend while connected.</span>
      </label>
      <button id="create" class="primary" type="button">Create room</button>
      <div class="divider"><span>or join</span></div>
      <form id="join-form" class="join-form">
        <label for="room-code">Room code</label>
        <div class="input-row">
          <input id="room-code" maxlength="19" placeholder="ABCD-EFGH-JKMN-PQRS" spellcheck="false" required>
          <button type="submit">Join</button>
        </div>
      </form>
      <p id="notice" class="notice" role="status"></p>
    </section>
  `);
  document.querySelector('#backend')!.textContent =
    currentState.backendUrl ?? '';
  const notice = document.querySelector<HTMLParagraphElement>('#notice')!;
  if (currentState.error) notice.textContent = currentState.error;

  const begin = async (
    type: 'create-room' | 'join-room',
    roomCode?: string,
  ) => {
    const consent = document.querySelector<HTMLInputElement>('#consent')!;
    if (!consent.checked) {
      notice.textContent = 'Review and accept the transmission notice first.';
      return;
    }
    try {
      const tabId = await activeTabId();
      const response = await send(
        type === 'create-room'
          ? { type, tabId }
          : { type, tabId, roomCode: roomCode ?? '' },
      );
      currentState = response.state;
      render();
    } catch (error) {
      notice.textContent =
        error instanceof Error ? error.message : 'Unable to continue';
    }
  };

  document.querySelector('#create')!.addEventListener('click', () => {
    void begin('create-room');
  });
  document.querySelector('#change-backend')!.addEventListener('click', () => {
    renderBackendForm();
  });
  document
    .querySelector<HTMLFormElement>('#join-form')!
    .addEventListener('submit', (event) => {
      event.preventDefault();
      const input = document.querySelector<HTMLInputElement>('#room-code')!;
      void begin('join-room', normalizeRoomCode(input.value));
    });
}

function formatRoomCode(value: string): string {
  return value.match(/.{1,4}/g)?.join('-') ?? value;
}

function renderSession(): void {
  const connected = currentState.status === 'connected';
  app.innerHTML = shell(`
    <section>
      <div class="session-status ${currentState.status}">
        <b class="dot"></b>${connected ? 'In sync' : currentState.status}
      </div>
      <span class="step">03 / Listening</span>
      <h2>${currentState.role === 'host' ? 'Your room' : 'Listening room'}</h2>
      <button id="copy-code" class="room-code" type="button" aria-label="Copy room code">
        <span id="room-code"></span>
        <small>Click to copy</small>
      </button>
      <dl>
        <div><dt>Role</dt><dd id="role"></dd></div>
        <div><dt>Listeners</dt><dd id="participants"></dd></div>
      </dl>
      <p id="notice" class="notice" role="status"></p>
      <button id="leave" class="secondary" type="button">Leave room</button>
    </section>
  `);
  document.querySelector('#room-code')!.textContent = formatRoomCode(
    currentState.roomCode ?? '',
  );
  document.querySelector('#role')!.textContent =
    currentState.role ?? 'Connecting';
  document.querySelector('#participants')!.textContent = String(
    currentState.participantCount,
  );
  const notice = document.querySelector<HTMLParagraphElement>('#notice')!;
  if (currentState.error) notice.textContent = currentState.error;
  document.querySelector('#copy-code')!.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentState.roomCode ?? '');
      notice.textContent = 'Room code copied.';
    } catch {
      notice.textContent = 'Select the code and copy it manually.';
    }
  });
  document.querySelector('#leave')!.addEventListener('click', async () => {
    const response = await send({ type: 'leave-room' });
    currentState = response.state;
    render();
  });
}

function render(): void {
  if (!currentState.backendUrl) {
    renderBackendForm(currentState.error);
  } else if (currentState.roomCode) {
    renderSession();
  } else {
    renderLobby();
  }
}

async function refresh(): Promise<void> {
  try {
    currentState = (await send({ type: 'get-state' })).state;
    render();
  } catch {
    renderBackendForm('Extension background is unavailable.');
  }
}

void refresh();
setInterval(() => {
  if (currentState.roomCode) void refresh();
}, 1_000);
