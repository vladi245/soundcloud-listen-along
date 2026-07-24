import './style.css';
import {
  backendPermission,
  normalizeBackendUrl,
  randomOpaqueId,
} from '@/lib/backend';
import {
  message,
  type ExtensionState,
  type RuntimeResponse,
} from '@/lib/messages';
import { normalizeRoomCode } from '@/lib/protocol';

const app = document.querySelector<HTMLDivElement>('#app')!;
let currentState: ExtensionState = { status: 'idle', participantCount: 0 };
let setupCreationKey = '';

type SetupMode = 'host' | 'guest';

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
          <span class="eyebrow">SC // Room link</span>
          <h1>Listen Along</h1>
        </div>
        <span class="build-tag">SELF-HOSTED</span>
      </header>
      ${content}
      <p class="legal">Audio stays on SoundCloud. This extension is independent and unofficial.</p>
    </main>
  `;
}

function renderStart(error?: string): void {
  app.innerHTML = shell(`
    <section>
      <span class="step">01 / Start</span>
      <h2>Choose your role</h2>
      <p class="muted">Host with your own room server, or join someone else's invitation.</p>
      <div class="mode-grid">
        <button id="host-setup" class="mode-button primary" type="button">
          <b>Host a room</b>
          <span>Deploy or connect a server</span>
        </button>
        <button id="guest-setup" class="mode-button" type="button">
          <b>Join a room</b>
          <span>Use a host's backend</span>
        </button>
      </div>
      <p id="notice" class="notice" role="status"></p>
    </section>
  `);
  if (error) document.querySelector('#notice')!.textContent = error;
  document.querySelector('#host-setup')!.addEventListener('click', () => {
    setupCreationKey ||= randomOpaqueId(32);
    renderBackendForm('host');
  });
  document.querySelector('#guest-setup')!.addEventListener('click', () => {
    renderBackendForm('guest');
  });
}

function renderBackendForm(mode: SetupMode, error?: string): void {
  const hosting = mode === 'host';
  const newDeployment = hosting && Boolean(setupCreationKey);
  app.innerHTML = shell(`
    <section>
      <button id="setup-back" class="text-button back-button" type="button">&lt; Back</button>
      <span class="step">01 / ${hosting ? 'Host setup' : 'Join setup'}</span>
      <h2>${hosting ? 'Connect your room server' : "Connect to the host's server"}</h2>
      <p class="muted">${hosting ? (newDeployment ? 'Deploy a private Cloudflare room server, then enter its address below.' : 'Enter the deployed server address and its creation key.') : 'Paste the backend address provided by the host.'}</p>
      ${
        newDeployment
          ? `<div class="deploy-panel">
              <span class="panel-label">Deployment secret</span>
              <code id="generated-key"></code>
              <button id="copy-key" type="button">Copy key</button>
              <a class="button-link" href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" rel="noreferrer">Open Cloudflare</a>
              <p>Paste this key into <code>ROOM_CREATION_KEY</code> when deploying the Worker. Cloudflare will show its address when deployment finishes.</p>
            </div>`
          : ''
      }
      <form id="backend-form">
        <label for="backend">Backend origin</label>
        <input id="backend" name="backend" type="url" placeholder="https://rooms.example.workers.dev" autocomplete="url" required>
        ${
          hosting
            ? `<label for="creation-key">Room creation key</label>
               <input id="creation-key" name="creation-key" type="password" maxlength="128" autocomplete="off" required>
               <label class="remember"><input id="remember-key" type="checkbox"><span>Remember this key on this device</span></label>`
            : ''
        }
        <button class="primary" type="submit">Verify and save</button>
      </form>
      <p id="notice" class="notice" role="status"></p>
    </section>
  `);
  document.querySelector('#setup-back')!.addEventListener('click', () => {
    renderStart();
  });
  if (newDeployment) {
    const keyInput = document.querySelector<HTMLInputElement>('#creation-key')!;
    keyInput.value = setupCreationKey;
    document.querySelector('#generated-key')!.textContent = setupCreationKey;
    document.querySelector('#copy-key')!.addEventListener('click', async () => {
      const notice = document.querySelector<HTMLParagraphElement>('#notice')!;
      try {
        await navigator.clipboard.writeText(setupCreationKey);
        notice.textContent = 'Deployment key copied.';
      } catch {
        notice.textContent = 'Select and copy the deployment key manually.';
      }
    });
  }
  const notice = document.querySelector<HTMLParagraphElement>('#notice')!;
  if (error) notice.textContent = error;
  document
    .querySelector<HTMLFormElement>('#backend-form')!
    .addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector<HTMLInputElement>('#backend')!;
      const keyInput =
        document.querySelector<HTMLInputElement>('#creation-key');
      const rememberInput =
        document.querySelector<HTMLInputElement>('#remember-key');
      const backendUrl = normalizeBackendUrl(input.value);
      if (!backendUrl) {
        notice.textContent = 'Use HTTPS, or HTTP on localhost for development.';
        return;
      }
      let granted: boolean;
      let alreadyGranted: boolean;
      try {
        alreadyGranted = await browser.permissions.contains({
          origins: [backendPermission(backendUrl)],
        });
        granted =
          alreadyGranted ||
          (await browser.permissions.request({
            origins: [backendPermission(backendUrl)],
          }));
      } catch {
        notice.textContent = 'This backend origin cannot be permitted.';
        return;
      }
      if (!granted) {
        notice.textContent = 'Backend access was not granted.';
        return;
      }
      const previousBackend = currentState.backendUrl;
      const response = await send({
        type: 'configure-backend',
        backendUrl,
        creationKey: keyInput?.value ?? '',
        rememberCreationKey: rememberInput?.checked ?? false,
      });
      currentState = response.state;
      if (response.ok) {
        if (
          previousBackend &&
          backendPermission(previousBackend) !== backendPermission(backendUrl)
        ) {
          await browser.permissions.remove({
            origins: [backendPermission(previousBackend)],
          });
        }
        render();
      } else {
        if (!alreadyGranted) {
          await browser.permissions.remove({
            origins: [backendPermission(backendUrl)],
          });
        }
        notice.textContent = response.state.error ?? 'Backend setup failed.';
      }
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
    if (currentState.hasCreationKey) {
      setupCreationKey = '';
      renderBackendForm('host');
    } else {
      renderBackendForm('guest');
    }
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
    renderStart(currentState.error);
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
    renderStart('Extension background is unavailable.');
  }
}

void refresh();
setInterval(() => {
  if (currentState.roomCode) void refresh();
}, 1_000);
