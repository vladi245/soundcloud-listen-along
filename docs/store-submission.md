# Browser Store Submission

Firefox builds are signed by AMO as an unlisted add-on and served, with automatic updates, from the public room server by `npm run release:hosted` (see [deployment](deployment.md#extension-packages)). Chromium users load the extension unpacked; a Chrome Web Store listing is optional and not currently pursued (see [Chrome Web Store](chrome-web-store.md)).

## Release artifacts

Create a release from a clean tagged revision:

```sh
npm ci
REQUIRE_RELEASE_TAG=1 npm run release:package
```

The tag must match the package version as `vX.Y.Z`. The command checks source formatting, lint, types, extension and Worker tests, both production manifests, and release filenames. It produces:

- `soundcloud-listen-along-X.Y.Z-chrome.zip`, the Chromium package;
- `soundcloud-listen-along-X.Y.Z-firefox.zip` for AMO unlisted signing;
- `soundcloud-listen-along-X.Y.Z-sources.zip` for AMO source review.

The GitHub release workflow records SHA-256 checksums as build provenance. End users install from the public room server, not from GitHub releases.

## Public references

- Privacy policy: `https://soundcloud-listen-along.vladi245.workers.dev/privacy`
- Install page: `https://soundcloud-listen-along.vladi245.workers.dev`
- Public support: `https://github.com/vladi245/soundcloud-listen-along/issues`
- Private vulnerability reports: `https://github.com/vladi245/soundcloud-listen-along/security/advisories/new`

## Listing copy

**Name:** SoundCloud Listen Along (Unofficial)

**Summary:** Listen to SoundCloud together: start a private room in one click and share the link.

**Description:**

SoundCloud Listen Along synchronizes track navigation, play and pause state, position, and seeks between a room host and guests. Audio continues to stream independently from SoundCloud. Rooms run on a public room server by default, so no account or setup is needed: open a track, select Start a room, and share the copied invitation link. Hosts who prefer to control their own backend can deploy it to their own Cloudflare account. There is no analytics, advertising, or public room directory.

This independent extension is not affiliated with, authorized by, sponsored by, or endorsed by SoundCloud.

## Permission justification

- `activeTab`: identifies the SoundCloud tab selected for synchronization and reads an invitation only after the user opens the popup from that tab.
- `storage`: retains the selected backend preference and active ephemeral room state. Saving a room-creation key is explicit and optional.
- SoundCloud content-script matches: observe and apply playback state only on SoundCloud pages.
- Host access to the public room server: creates rooms and carries the synchronization WebSocket for the default backend.
- Optional HTTPS host access: requested for the single self-hosted backend selected by the user. Failed and replaced manual configurations remove permissions when safe to do so.

## Chrome Web Store

Not currently pursued. The complete listing kit, with text, permission justifications, data answers, and images, is in [Chrome Web Store](chrome-web-store.md).

## Firefox AMO

1. Confirm the stable add-on ID and supported Firefox minimum in `wxt.config.ts`.
2. Upload the Firefox ZIP as an unlisted add-on with the matching source ZIP.
3. Supply the exact Node.js 22 build commands and permission explanation from this document.
4. Keep AMO data-collection declarations aligned with `docs/privacy.md` and the submitted version.
5. Download the signed XPI, verify its installation, and distribute only that signed artifact. `npm run release:hosted` performs steps 2 to 5 and publishes `updates.json`.

Unsigned Firefox ZIP files must never be presented as normally installable packages.

AMO reviewers can reproduce the Firefox build from the submitted source archive with `npm ci`, `npm run typecheck`, and `npm run build:firefox`. WXT excludes tests and dotfiles from that archive; `prettier.config.mjs` is intentionally non-hidden so formatting configuration remains available.
