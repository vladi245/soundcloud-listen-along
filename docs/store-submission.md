# Browser Store Submission

The intended distribution is an unlisted Chrome Web Store listing and an unlisted AMO-signed Firefox package. Store accounts, acceptance, and listing URLs are external prerequisites and are not represented as complete until each store confirms them.

## Release artifacts

Create a release from a clean tagged revision:

```sh
npm ci
REQUIRE_RELEASE_TAG=1 npm run release:package
```

The tag must match the package version as `vX.Y.Z`. The command checks source formatting, lint, types, extension and Worker tests, both production manifests, and release filenames. It produces:

- `soundcloud-listen-along-X.Y.Z-chrome.zip` for Chrome Web Store submission;
- `soundcloud-listen-along-X.Y.Z-firefox.zip` for AMO unlisted signing;
- `soundcloud-listen-along-X.Y.Z-sources.zip` for AMO source review.

The GitHub release workflow records SHA-256 checksums. Its private release is maintainer provenance, not the end-user installation channel.

## Public references

- Privacy policy: `https://github.com/vladi245/soundcloud-listen-along-server/blob/main/PRIVACY.md`
- Backend template: `https://github.com/vladi245/soundcloud-listen-along-server`
- Public support: `https://github.com/vladi245/soundcloud-listen-along-server/issues`
- Private vulnerability reports: `https://github.com/vladi245/soundcloud-listen-along-server/security/advisories/new`

## Listing copy

**Name:** SoundCloud Listen Along (Unofficial)

**Summary:** Synchronize SoundCloud playback in private rooms using a Cloudflare backend you control.

**Description:**

SoundCloud Listen Along synchronizes track navigation, play and pause state, position, and seeks between a room host and guests. Audio continues to stream independently from SoundCloud. The extension has no project-operated room service, analytics, advertising, or public room directory. A host deploys the backend into their own Cloudflare account and shares a room invitation link.

This independent extension is not affiliated with, authorized by, sponsored by, or endorsed by SoundCloud.

## Permission justification

- `activeTab`: identifies the SoundCloud tab selected for synchronization and reads an invitation only after the user opens the popup from that tab.
- `storage`: retains the selected backend preference and active ephemeral room state. Saving a room-creation key is explicit and optional.
- SoundCloud content-script matches: observe and apply playback state only on SoundCloud pages.
- Optional HTTPS host access: requested for the single self-hosted backend selected by the user. Failed and replaced manual configurations remove permissions when safe to do so.

## Chrome Web Store

1. Register the publisher account and complete any required identity verification.
2. Create an unlisted item and upload the Chromium ZIP.
3. Add screenshots of first-run role selection, backend setup, room lobby, invitation acceptance, and connected state.
4. Use the public privacy-policy URL and complete data-use disclosures from `docs/privacy.md`.
5. Submit for review, record the final listing URL, and test installation plus automatic update behavior.

## Firefox AMO

1. Confirm the stable add-on ID and supported Firefox minimum in `wxt.config.ts`.
2. Upload the Firefox ZIP as an unlisted add-on with the matching source ZIP.
3. Supply the exact Node.js 22 build commands and permission explanation from this document.
4. Keep AMO data-collection declarations aligned with `docs/privacy.md` and the submitted version.
5. Download the signed XPI, verify its checksum and installation, and distribute only that signed artifact.
6. Define and test the signed-update path before promising automatic Firefox updates.

Unsigned Firefox ZIP files must never be presented as normally installable packages.

AMO reviewers can reproduce the Firefox build from the submitted source archive with `npm ci`, `npm run typecheck`, and `npm run build:firefox`. WXT excludes tests and dotfiles from that archive; `prettier.config.mjs` is intentionally non-hidden so formatting configuration remains available.
