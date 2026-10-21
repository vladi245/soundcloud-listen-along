# Firefox Review Notes

## Status

Firefox builds are signed by addons.mozilla.org (AMO) as an unlisted add-on and self-distributed from the public room server, which also serves `updates.json` for automatic updates. `npm run release:hosted` builds, signs, and publishes each version (see [deployment](deployment.md#extension-packages)). The privacy policy is served at `https://soundcloud-listen-along.vladi245.workers.dev/privacy`.

## Current extension surface

- Extension ID: `soundcloud-listen-along@vladi245.github.io`
- Permissions: `activeTab`, `storage`; host access to the public room server; optional host access for a user-chosen own server
- Content-script matches: `https://soundcloud.com/*`, `https://*.soundcloud.com/*`, and the public room server's invitation page
- Background worker: manages one room session and the configured backend
- Content scripts: a page-world bridge that reads and applies SoundCloud's playback state, an isolated script that relays it and shows the room status, and a Join room button on invitation pages
- Remote code: none in project source
- Analytics or advertising: none in project source
- Backend communication: HTTPS room creation and WSS room synchronization

The manifest requires Firefox 140 or newer and declares `browsingActivity` and `websiteActivity`. These cover the SoundCloud track URL and the playback actions (play, pause, position, and seeks) sent to the room server while the user is in a room. Room codes and host tokens are short-lived room credentials issued by that server, not account logins, and the extension handles no names, email addresses, or other personal identifiers.

## Reviewer explanation

The extension synchronizes SoundCloud playback between participants in a private room. Audio is never downloaded or relayed; each listener plays the track from SoundCloud. Rooms run on a public room server operated by the maintainer by default, or on a server the user deploys. The SoundCloud content scripts read and apply playback state; a page-world script is needed because SoundCloud plays audio through media elements that are not attached to the document. `storage` keeps the selected server and the active session; `activeTab` reads the current tab when the popup opens.

Unlisted signing limits public AMO discovery; it does not waive Mozilla policies or review requirements.

## Source archive

Each submission includes the source archive created by `npm run zip:firefox`. Reviewers can reproduce the extension from it with `npm ci`, `npm run typecheck`, and `npm run build:firefox` on Node.js 22. Built packages and store images are excluded from the archive.
