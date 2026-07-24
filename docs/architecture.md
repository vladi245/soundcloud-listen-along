# Architecture

## Status

The MVP includes the browser extension, shared protocol and synchronization modules, and a self-hosted Cloudflare Worker with Durable Objects. It supports room creation, host and guest admission, host-authoritative playback synchronization, presence, heartbeat timing, reconnection, and room expiration.

This is an early implementation, not a stable protocol or production-readiness claim. It depends on SoundCloud's current page audio element and browser autoplay behavior.

## Components

| Component           | Implemented responsibility                                                                                                                                         | Trust boundary        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| Popup               | Requests backend-origin permission, records transmission consent, configures the backend, creates or joins a room, and shows room state                            | Extension UI          |
| Content script      | Finds the SoundCloud audio element, reports local playback, navigates guests to the host track, and applies play, pause, and seek state                            | SoundCloud page       |
| Background worker   | Stores the active session, creates participant IDs, owns the WebSocket, validates messages, reconnects, estimates clock offset, and coordinates one SoundCloud tab | Browser extension     |
| Cloudflare Worker   | Applies origin policy, creates room credentials, validates public routes, and routes room sockets to Durable Objects                                               | Self-hosting operator |
| Room Durable Object | Admits participants, enforces host authority and ordering, stores the latest room snapshot, broadcasts state and presence, and expires the room                    | Cloudflare account    |

```text
popup --------------------+
                          v
SoundCloud page <-> content script <-> background worker
                                               |
                                      HTTPS + WebSocket
                                               |
                                      Cloudflare Worker
                                               |
                                      room Durable Object
```

## Session flow

1. The user enters a backend origin. The popup validates it and requests an optional browser host permission for that origin.
2. The user opens SoundCloud, accepts the transmission notice, and creates or joins a room.
3. Room creation sends an empty `POST /rooms`. The Worker returns a random 16-character room code and a 256-bit host token.
4. The background worker creates an ephemeral participant ID and connects to `GET /rooms/{roomCode}/socket` over WebSocket.
5. The first socket message must be a versioned `join`. Possession of the host token assigns the host role; all other admitted participants are guests.
6. The host content script reports track URL, play/pause state, position, and timing. The background worker assigns increasing sequence numbers and sends this state to the room.
7. The Durable Object accepts playback updates only from the connected host, replaces the latest snapshot, and broadcasts it with server time.
8. Guest background workers adjust timestamps for estimated clock offset and ask their content scripts to navigate, seek when drift reaches one second, play, or pause.
9. Heartbeats run every 20 seconds. A closed socket reconnects after two seconds while the room session remains active.

Hosts share an invitation rooted at their own Worker origin with the room code in the URL fragment. The fragment is not sent in the HTTP request. The Worker serves a static explanation page, and the popup reads the active tab URL after the user opens the extension. Accepting the invitation requests access to that backend, verifies its protocol metadata, stores a pending room code in session storage, and opens SoundCloud.

The extension session is associated with the SoundCloud tab active when the room was created or joined. Guest navigation stays within validated HTTPS SoundCloud URLs. Browser autoplay blocking is surfaced in the popup and may require one user-initiated playback action.

## Protocol and limits

The JSON protocol is version 1 and is defined in `lib/protocol.ts`. The server requires exact client message fields, text frames, and a maximum frame size of 16 KiB. Playback URLs must use HTTPS on `soundcloud.com` or a subdomain, timestamps must be finite and non-negative, and host sequence numbers must increase.

Each room allows at most 25 WebSocket connections, including connections that have not completed the join handshake, and one connected host. A socket must join within ten seconds. Room creation is limited across each operator deployment without retaining client IP addresses. The room code is an unlisted locator and the only guest admission credential; it is not a password. The host token controls playback and must not be shared with guests.

## State and retention

The extension stores the selected default backend origin and reported room capacity in `browser.storage.local`. It stores temporary invitation backend selection, pending invitation state, room and participant identifiers, host token, latest playback state, and connection state in `browser.storage.session`. Accepting an invitation for another backend does not replace a remembered host configuration. The user can explicitly choose to keep the room creation key in local storage; otherwise it remains session-only. Leaving clears active room state while retaining the current backend. Closing the browser session clears session storage according to browser behavior and restores the default backend on the next session.

The Durable Object stores the room code, host token, creation and activity timestamps, host-presence state, and latest playback snapshot. A new room is deleted if its host does not join within five minutes. An active room is deleted after six hours without a valid joined message. Host heartbeats maintain a persistent liveness deadline. After a host that has joined disconnects, or after Durable Object activation finds no restored host socket, the room is deleted if the host's last observed connection is more than one minute old. Room closure removes all Durable Object storage and closes its sockets. A separate Durable Object enforces a deployment-wide limit of 30 room creations in any rolling 60-second period and stores only up to 30 request timestamps.

Cloudflare platform logs, metrics, backups, and account retention are outside the application-level cleanup and remain the operator's responsibility.

## Deployment model

Every operator deploys the Worker and Durable Object in their own Cloudflare account and gives participants that deployment's origin. There is no central project service, account system, room directory, analytics endpoint, or fallback relay. See [deployment](deployment.md), [privacy](privacy.md), and [compliance](compliance.md).
