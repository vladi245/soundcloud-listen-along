import './style.css';
import {
  backendPermission,
  createRoomInvite,
  normalizeBackendUrl,
  parseRoomInvite,
  type RoomInvite,
} from '@/lib/backend';
import { HOSTED_BACKEND_URL, isHostedBackend } from '@/lib/hosted';
import {
  message,
  type ExtensionState,
  type RuntimeResponse,
} from '@/lib/messages';
import { normalizeRoomCode } from '@/lib/protocol';
import { describeTrack } from '@/lib/track';
import {
  isNewerVersion,
  parseLatestRelease,
  type LatestRelease,
} from '@/lib/version';

const app = document.querySelector<HTMLDivElement>('#app')!;
let currentState: ExtensionState = { status: 'idle', participantCount: 0 };
let activeInvite: RoomInvite | null = null;
let onSoundCloud = false;
let update: LatestRelease | null = null;
let sessionNotice = '';
let sessionNoticeUntil = 0;

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

async function inspectActiveTab(): Promise<{
  invite: RoomInvite | null;
  soundCloud: boolean;
}> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return {
    invite: tab?.url ? parseRoomInvite(tab.url) : null,
    soundCloud: Boolean(
      tab?.url && /^https:\/\/([^.]+\.)?soundcloud\.com\//.test(tab.url),
    ),
  };
}

function transmissionNotice(action: string): string {
  return `<p class="fine">${action} shares the current track link and playback position with the room server while you are connected.</p>`;
}

function shell(content: string): string {
  const server = !currentState.backendUrl
    ? ''
    : isHostedBackend(currentState.backendUrl)
      ? 'Public server'
      : 'Own server';
  return `
    <header class="top">
      <img class="logo" src="/icon/32.png" alt="" width="20" height="20">
      <span class="brand">Listen Along</span>
      <span class="server">${server}</span>
    </header>
    ${
      update
        ? `<div class="update">
            <p><b>Update available</b> · version ${update.version}</p>
            <p class="fine">Download it, unzip it over your current extension folder, then select reload on Listen Along in the extensions page.</p>
            <div class="row">
              <a class="btn btn-primary btn-small" href="${update.download}" target="_blank" rel="noreferrer">Download</a>
              <button id="open-extensions" class="btn btn-small" type="button">Open extensions page</button>
            </div>
          </div>`
        : ''
    }
    <main class="body">${content}</main>
    <footer class="foot">Unofficial extension. Audio plays from SoundCloud.</footer>
  `;
}

function renderStart(error?: string): void {
  app.innerHTML = shell(`
    <h1 class="title">Listen together</h1>
    <p class="lead">Connect a room server to host, or join with the server address the host gave you.</p>
    <button id="host-setup" class="btn btn-primary" type="button">Host a room</button>
    <button id="guest-setup" class="btn btn-secondary" type="button">Join a room</button>
    <p id="notice" class="notice" role="status"></p>
  `);
  if (error) document.querySelector('#notice')!.textContent = error;
  document.querySelector('#host-setup')!.addEventListener('click', () => {
    renderBackendForm('host');
  });
  document.querySelector('#guest-setup')!.addEventListener('click', () => {
    renderBackendForm('guest');
  });
}

function renderBackendForm(mode: SetupMode, error?: string): void {
  const hosting = mode === 'host';
  app.innerHTML = shell(`
    <button id="setup-back" class="link back" type="button">Back</button>
    <h1 class="title">${hosting ? 'Your room server' : "Host's room server"}</h1>
    <p class="lead">${hosting ? 'Enter your server address, and its room creation key if it has one.' : 'Paste the server address the host gave you.'}</p>
    ${hosting ? '<a class="link" href="https://github.com/vladi245/soundcloud-listen-along/blob/main/docs/deployment.md#self-hosted-deployment" target="_blank" rel="noreferrer">How to run your own server</a>' : ''}
    <form id="backend-form" class="form">
      <label for="backend">Server address</label>
      <input id="backend" name="backend" type="url" placeholder="https://rooms.example.workers.dev" autocomplete="url" required>
      ${
        hosting
          ? `<label for="creation-key">Room creation key <span class="optional">(if your server needs one)</span></label>
             <input id="creation-key" name="creation-key" type="password" maxlength="128" autocomplete="off">
             <label class="check"><input id="remember-key" type="checkbox"><span>Remember key on this device</span></label>`
          : ''
      }
      <button class="btn btn-primary" type="submit">Connect</button>
    </form>
    ${HOSTED_BACKEND_URL && !isHostedBackend(currentState.backendUrl) ? '<button id="use-hosted" class="link" type="button">Use the public server instead</button>' : ''}
    <p id="notice" class="notice" role="status"></p>
  `);
  document.querySelector('#setup-back')!.addEventListener('click', () => {
    if (currentState.backendUrl) renderLobby();
    else renderStart();
  });
  document.querySelector('#use-hosted')?.addEventListener('click', async () => {
    const previousBackend = currentState.backendUrl;
    const response = await send({
      type: 'configure-backend',
      backendUrl: HOSTED_BACKEND_URL!,
      creationKey: '',
      rememberCreationKey: false,
    });
    currentState = response.state;
    if (response.ok && previousBackend && !isHostedBackend(previousBackend)) {
      await browser.permissions
        .remove({ origins: [backendPermission(previousBackend)] })
        .catch(() => false);
    }
    if (response.ok) render();
    else notice.textContent = response.state.error ?? 'Server unavailable.';
  });
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
          !isHostedBackend(previousBackend) &&
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
  const canHost = currentState.hasCreationKey || currentState.openRoomCreation;
  const hosted = isHostedBackend(currentState.backendUrl);
  const invited = Boolean(currentState.pendingRoomCode);
  app.innerHTML = shell(`
    <h1 class="title">${invited ? 'Invitation ready' : canHost ? 'Listen together' : 'Join a room'}</h1>
    ${
      onSoundCloud
        ? `<p class="lead">${canHost ? 'Start a room from this tab and share the link. Everyone hears what you play.' : 'Join from this tab to follow the host.'}</p>`
        : `<p class="lead">Rooms follow the SoundCloud tab you start them from.</p>
           <button id="open-soundcloud" class="btn btn-secondary" type="button">Open SoundCloud</button>`
    }
    ${nicknameField()}
    ${canHost && !invited ? `<button id="create" class="btn btn-primary" type="button" ${onSoundCloud ? '' : 'disabled'}>Start a room</button>` : ''}
    <form id="join-form" class="form">
      <label for="room-code">${invited ? 'Room code' : 'Have a room code?'}</label>
      <div class="row">
        <input id="room-code" maxlength="19" placeholder="ABCD-EFGH-JKMN-PQRS" spellcheck="false" autocomplete="off" required>
        <button class="btn ${invited ? 'btn-primary' : 'btn-secondary'}" type="submit" ${onSoundCloud ? '' : 'disabled'}>Join</button>
      </div>
    </form>
    ${transmissionNotice(canHost ? 'Starting or joining a room' : 'Joining a room')}
    <p id="notice" class="notice" role="status"></p>
    <div class="meta">
      <span id="backend"></span>
      <button id="change-backend" class="link" type="button">${hosted ? 'Use own server' : 'Change'}</button>
    </div>
  `);
  document.querySelector('#backend')!.textContent = hosted
    ? 'Public room server'
    : (currentState.backendUrl ?? '');
  const roomInput = document.querySelector<HTMLInputElement>('#room-code')!;
  roomInput.value = currentState.pendingRoomCode
    ? formatRoomCode(currentState.pendingRoomCode)
    : '';
  const notice = document.querySelector<HTMLParagraphElement>('#notice')!;
  if (currentState.error) notice.textContent = currentState.error;

  const begin = async (
    type: 'create-room' | 'join-room',
    roomCode?: string,
  ) => {
    try {
      const tabId = await activeTabId();
      const response = await send(
        type === 'create-room'
          ? { type, tabId }
          : { type, tabId, roomCode: roomCode ?? '' },
      );
      currentState = response.state;
      if (response.ok && type === 'create-room') {
        sessionNotice = (await copyInvite())
          ? 'Invitation link copied. Send it to your friends.'
          : 'Click the room code to copy the invitation link.';
        sessionNoticeUntil = Date.now() + 6_000;
      }
      render();
    } catch (error) {
      notice.textContent =
        error instanceof Error ? error.message : 'Unable to continue';
    }
  };

  document
    .querySelector('#open-soundcloud')
    ?.addEventListener('click', async () => {
      await browser.tabs.create({ url: 'https://soundcloud.com/' });
      window.close();
    });
  document.querySelector('#create')?.addEventListener('click', () => {
    void begin('create-room');
  });
  document.querySelector('#change-backend')!.addEventListener('click', () => {
    if (currentState.hasCreationKey || hosted) {
      renderBackendForm('host');
    } else {
      renderBackendForm('guest');
    }
  });
  document
    .querySelector<HTMLFormElement>('#join-form')!
    .addEventListener('submit', (event) => {
      event.preventDefault();
      void begin('join-room', normalizeRoomCode(roomInput.value));
    });
}

function renderInvite(invite: RoomInvite): void {
  const hosted = isHostedBackend(invite.backendUrl);
  app.innerHTML = shell(`
    <h1 class="title">You're invited</h1>
    <p class="lead">${hosted ? 'SoundCloud opens in a new tab and plays along with the host.' : "This room is on the host's own server. Your browser will ask to allow access to it."}</p>
    <div class="code-box">
      <span class="label">Room</span>
      <span id="invite-room" class="code"></span>
      <span id="invite-backend" class="sub"></span>
    </div>
    ${nicknameField()}
    <button id="accept-invite" class="btn btn-primary" type="button">Join room</button>
    ${transmissionNotice('Joining')}
    <p id="notice" class="notice" role="status"></p>
  `);
  document.querySelector('#invite-backend')!.textContent = hosted
    ? 'Public room server'
    : invite.backendUrl;
  document.querySelector('#invite-room')!.textContent = formatRoomCode(
    invite.roomCode,
  );
  const notice = document.querySelector<HTMLParagraphElement>('#notice')!;
  document
    .querySelector('#accept-invite')!
    .addEventListener('click', async () => {
      const permission = backendPermission(invite.backendUrl);
      let alreadyGranted: boolean;
      let granted: boolean;
      try {
        alreadyGranted = await browser.permissions.contains({
          origins: [permission],
        });
        granted =
          alreadyGranted ||
          (await browser.permissions.request({ origins: [permission] }));
      } catch {
        notice.textContent = 'This invitation backend cannot be permitted.';
        return;
      }
      if (!granted) {
        notice.textContent = 'Backend access was not granted.';
        return;
      }
      const response = await send({
        type: 'configure-invite',
        backendUrl: invite.backendUrl,
        roomCode: invite.roomCode,
      });
      currentState = response.state;
      if (!response.ok) {
        if (!alreadyGranted) {
          await browser.permissions.remove({ origins: [permission] });
        }
        notice.textContent =
          response.state.error ?? 'Invitation is unavailable.';
      }
    });
}

async function copyInvite(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(
      createRoomInvite(
        currentState.backendUrl ?? '',
        currentState.roomCode ?? '',
      ),
    );
    return true;
  } catch {
    return false;
  }
}

function nicknameField(): string {
  return `<label class="name-field">
    <span>Your nickname</span>
    <input id="nickname" maxlength="24" placeholder="Listener" autocomplete="nickname" spellcheck="false">
  </label>`;
}

// Called after each render that includes the nickname field.
function bindNickname(): void {
  const input = document.querySelector<HTMLInputElement>('#nickname');
  if (!input) return;
  input.value = currentState.nickname ?? '';
  input.addEventListener('change', async () => {
    const response = await send({ type: 'set-nickname', name: input.value });
    currentState = response.state;
    input.value = currentState.nickname ?? '';
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });
}

function renderMembers(): void {
  const list = document.querySelector('#members');
  if (!list) return;
  for (const member of currentState.participants ?? []) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = member.name ?? 'Listener';
    if (!member.name) name.className = 'unnamed';
    item.append(name);
    const tags = [
      member.role === 'host' ? 'Host' : '',
      member.id === currentState.memberId ? 'you' : '',
    ].filter(Boolean);
    if (tags.length) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = tags.join(' · ');
      item.append(tag);
    }
    list.append(item);
  }
}

function formatRoomCode(value: string): string {
  return value.match(/.{1,4}/g)?.join('-') ?? value;
}

function renderSession(): void {
  const statusText = {
    connected: 'Connected',
    connecting: 'Connecting…',
    error: 'Connection problem',
    idle: 'Not connected',
  }[currentState.status];
  const hosting = currentState.role === 'host';
  const track = describeTrack(currentState.trackUrl);
  app.innerHTML = shell(`
    <div class="status is-${currentState.status}"><span class="dot"></span>${statusText}<span class="count" id="participants"></span></div>
    <h1 class="title">${hosting ? 'Your room' : 'Listening along'}</h1>
    <p class="lead">${hosting ? 'Play anything on SoundCloud in this tab. Everyone in the room follows.' : 'Playback follows the host. You can keep this tab in the background.'}</p>
    ${track ? '<div class="now"><span class="label">Now playing</span><span class="now-title"></span><span class="sub now-artist"></span></div>' : ''}
    <div class="code-box">
      <span class="label">Room code</span>
      <span id="room-code" class="code"></span>
      <span id="role" class="sub"></span>
    </div>
    <button id="copy-code" class="btn btn-primary" type="button">Copy invite link</button>
    <div class="members">
      <span class="label">In this room</span>
      <ul id="members"></ul>
    </div>
    ${nicknameField()}
    <p id="notice" class="notice" role="status"></p>
    <button id="leave" class="btn btn-secondary" type="button">Leave room</button>
  `);
  document.querySelector('#room-code')!.textContent = formatRoomCode(
    currentState.roomCode ?? '',
  );
  if (track) {
    document.querySelector('.now-title')!.textContent = track.title;
    document.querySelector('.now-artist')!.textContent = track.artist;
  }
  document.querySelector('#role')!.textContent = hosting
    ? 'You are the host'
    : 'The host controls playback';
  document.querySelector('#participants')!.textContent =
    currentState.participantCount > 0
      ? `${currentState.participantCount} listening`
      : '';
  const notice = document.querySelector<HTMLParagraphElement>('#notice')!;
  if (currentState.error) notice.textContent = currentState.error;
  else if (Date.now() < sessionNoticeUntil) notice.textContent = sessionNotice;
  document.querySelector('#copy-code')!.addEventListener('click', async () => {
    sessionNotice = (await copyInvite())
      ? 'Invitation link copied.'
      : 'Share the backend and room code manually.';
    sessionNoticeUntil = Date.now() + 4_000;
    notice.textContent = sessionNotice;
  });
  document.querySelector('#leave')!.addEventListener('click', async () => {
    const response = await send({ type: 'leave-room' });
    currentState = response.state;
    render();
  });
}

function render(): void {
  if (
    activeInvite &&
    !currentState.roomCode &&
    (currentState.backendUrl !== activeInvite.backendUrl ||
      currentState.pendingRoomCode !== activeInvite.roomCode)
  ) {
    renderInvite(activeInvite);
  } else if (!currentState.backendUrl) {
    renderStart(currentState.error);
  } else if (currentState.roomCode) {
    renderSession();
    renderMembers();
  } else {
    renderLobby();
  }
  bindNickname();
}

// Unpacked Chromium installs never update themselves, so tell the user when
// the public server has a newer release. Firefox builds update automatically.
async function checkForUpdate(): Promise<void> {
  if (import.meta.env.FIREFOX || !HOSTED_BACKEND_URL) return;
  try {
    const response = await fetch(`${HOSTED_BACKEND_URL}/version.json`, {
      cache: 'no-store',
    });
    if (!response.ok) return;
    const latest = parseLatestRelease(
      await response.json(),
      HOSTED_BACKEND_URL,
    );
    if (
      latest &&
      isNewerVersion(latest.version, browser.runtime.getManifest().version)
    ) {
      update = latest;
      render();
    }
  } catch {
    // No notice when the server is unreachable.
  }
}

async function refresh(): Promise<void> {
  try {
    let tab: Awaited<ReturnType<typeof inspectActiveTab>>;
    [currentState, tab] = await Promise.all([
      send({ type: 'get-state' }).then((response) => response.state),
      inspectActiveTab(),
    ]);
    activeInvite = tab.invite;
    onSoundCloud = tab.soundCloud;
    // Re-rendering while the nickname field is focused would discard typing.
    if (document.activeElement?.id === 'nickname') return;
    render();
  } catch {
    renderStart('Extension background is unavailable.');
  }
}

// Delegated, since every view re-renders the update banner.
document.addEventListener('click', (event) => {
  if ((event.target as Element).closest('#open-extensions')) {
    void browser.tabs.create({
      url: `chrome://extensions/?id=${browser.runtime.id}`,
    });
  }
});

void refresh();
void checkForUpdate();
setInterval(() => {
  if (currentState.roomCode) void refresh();
}, 1_000);
