<div align="center">
  <pre>LISTEN  / /  ALONG</pre>
  <h1>SoundCloud Listen Along</h1>
  <p>An unofficial, self-hosted browser extension for private synchronized listening rooms.</p>
  <p><code>EARLY DEVELOPMENT</code> &nbsp; <code>SELF-HOSTED ONLY</code> &nbsp; <code>NO CENTRAL SERVICE</code></p>

[![Project status: early development](https://img.shields.io/badge/status-early_development-C65D28)](https://github.com/vladi245/soundcloud-listen-along)
[![Chromium: unpacked](https://img.shields.io/badge/Chromium-unpacked-3B6EA8)](#install-in-a-browser)
[![Firefox: planned](https://img.shields.io/badge/Firefox-unlisted_AMO_planned-7651A8)](docs/firefox-review.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-2E7D68)](LICENSE)
</div>

> [!WARNING]
> This repository is an early scaffold. Room creation, backend connectivity, and playback synchronization are not implemented yet.

## What this is

The project is intended to synchronize playback for people who already use SoundCloud, while keeping room infrastructure under the control of a self-hosting operator. It does not provide audio, bypass platform controls, or include a hosted public service.

Current code provides a Manifest V3 WXT extension shell: a popup, an empty background entry point, and an empty content script limited to SoundCloud pages.

## Setup and build

Requirements: Node.js with npm. The lockfile is authoritative for dependency versions.

```sh
git clone https://github.com/vladi245/soundcloud-listen-along.git
cd soundcloud-listen-along
npm ci
npm run typecheck
npm run build
```

Development and distribution commands are the current `package.json` scripts:

```sh
npm run dev
npm run dev:firefox
npm run build
npm run build:firefox
npm run zip
npm run zip:firefox
```

Production builds are written to `.output/chrome-mv3/` and `.output/firefox-mv3/`. Zip commands produce distribution archives under `.output/`.

## Install in a browser

### Chromium

Chromium distribution is currently unpacked only.

1. Run `npm ci && npm run build`.
2. Open `chrome://extensions` in Chrome, Chromium, Brave, or Edge (`edge://extensions`).
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select `.output/chrome-mv3/`.

Unpacked extensions do not update automatically. Rebuild and reload the extension after pulling changes.

### Firefox

Firefox support is planned through unlisted AMO signing; it is not currently distributed or represented as review-ready. `npm run build:firefox` creates the development build in `.output/firefox-mv3/`. See [Firefox review notes](docs/firefox-review.md) for the planned submission path and open review work.

## Architecture

```text
SoundCloud tab <-> content script <-> background worker <-> self-hosted room backend
                                      ^
                                      |
                                    popup
```

The extension will observe and apply playback state, while the background worker will own room lifecycle and backend communication. The room backend is planned as a separate, operator-controlled service and is not present in this repository. There is no project-operated central service or fallback relay. See [architecture](docs/architecture.md).

## Privacy and self-hosting

The current scaffold has no room backend integration or project analytics. Future room and playback messages will go to the backend selected by the user or deployment, not to an extension-maintainer service. Backend operators, not extension maintainers, control their own hosting, logs, retention, access, and disclosures.

Planned data categories and trust boundaries are documented in [privacy](docs/privacy.md). Operators should also review [compliance](docs/compliance.md); those notes are not legal advice or legal approval.

## Contributing and security

- [Contributing guide](CONTRIBUTING.md)
- [Open an issue](https://github.com/vladi245/soundcloud-listen-along/issues/new/choose)
- [View pull requests](https://github.com/vladi245/soundcloud-listen-along/pulls)
- [Report a vulnerability privately](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## Unofficial project notice

This is an independent, unofficial project. It is not affiliated with, authorized by, sponsored by, or endorsed by SoundCloud or its affiliates. "SoundCloud" is used only to describe compatibility. No SoundCloud logos, artwork, or other brand marks are included. SoundCloud and related marks belong to their respective owners.

Released under the [MIT License](LICENSE).
