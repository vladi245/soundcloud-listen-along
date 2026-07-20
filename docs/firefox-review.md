# Firefox Review Notes

## Status

Firefox distribution is planned through unlisted signing on addons.mozilla.org (AMO). No signed Firefox package is currently distributed, and this project does not claim AMO approval or review readiness.

The current command builds a Manifest V3 artifact:

```sh
npm ci
npm run typecheck
npm run build:firefox
npm run zip:firefox
```

The unpacked build is written to `.output/firefox-mv3/`; the zip command writes its archive under `.output/`.

## Current extension surface

- Extension ID: `soundcloud-listen-along@vladi245.github.io`
- Permissions: `activeTab`, `storage`
- Content-script matches: `https://soundcloud.com/*`, `https://*.soundcloud.com/*`
- Background worker: manages one room session and the configured backend
- Content script: reads and applies native audio playback state
- Remote code: none in project source
- Analytics or advertising: none in project source
- Backend communication: HTTPS room creation and WSS room synchronization

The manifest requires Firefox 140 or newer and declares `authenticationInfo`, `browsingActivity`, `personallyIdentifyingInfo`, and `websiteActivity`. These cover the host token, track URL, ephemeral room identifiers, and playback actions required by synchronization.

## Planned submission checklist

- Finish and document the behavior being submitted.
- Confirm the stable extension ID, version, and Manifest V3 support requirements.
- Keep manifest and AMO data declarations aligned with the implementation.
- Justify `activeTab`, `storage`, and SoundCloud host matching in reviewer notes.
- Remove unused permissions and ensure user-facing controls match the declarations.
- Confirm that all executable code is packaged locally and reproducible from source.
- Include exact build instructions, Node.js/npm prerequisites, and the lockfile.
- Run `npm ci`, `npm run typecheck`, `npm run build:firefox`, and `npm run zip:firefox` from a clean checkout.
- Review third-party licenses and source-code submission requirements.
- Update [privacy](privacy.md) for implemented local storage and backend fields.
- Test install, popup behavior, tab matching, room exit, data deletion, reconnect, and update behavior on supported Firefox versions.

## Proposed reviewer explanation

The extension is intended to synchronize playback state between participants in a private room hosted on a backend selected by those participants. It does not download or redistribute audio and does not provide a public central service. The content script is limited to SoundCloud pages to read and apply supported playback state; the background worker coordinates extension state and the selected backend; `storage` retains user-selected configuration and session state. This explanation must be revised to match the final implementation before submission.

Unlisted signing limits public AMO discovery; it does not waive Mozilla policies or review requirements. A signed artifact should be distributed only with the applicable privacy notice, source revision, checksum, and installation instructions.
