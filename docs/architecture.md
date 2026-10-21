# Architecture

## Status

The extension, shared protocol and synchronization modules, and a Cloudflare Worker with Durable Objects are implemented. They support room creation, host and guest admission, host-authoritative playback synchronization, presence, heartbeat timing, reconnection, and room expiration.

This is an early implementation, not a stable protocol. It depends on SoundCloud's current page markup and player, and on browser autoplay behavior.

## Components

| Component           | Responsibility                                                                                                                                                  | Trust boundary     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Popup               | Starts or joins a room, shows room state and the current track, switches between the public and an own server, and shows update notices on Chromium             | Extension UI       |
| Page bridge         | Runs in SoundCloud's page world, tracks the detached media elements SoundCloud plays through, reports their state, and applies play, pause, and seek            | SoundCloud page    |
| Content script      | Relays playback between the bridge and the background worker, follows the host's track, waits out ads, and shows the status pill                                | SoundCloud page    |
| Invite script       | Adds a Join room button to the public server's invitation page                                                                                                  | Public server page |
| Background worker   | Stores the active session, owns the WebSocket, validates messages, reconnects with backoff, estimates clock offset, and coordinates one SoundCloud tab          | Browser extension  |
| Cloudflare Worker   | Serves the invitation, home, and privacy pages and extension packages, applies origin policy and rate limits, creates room credentials, and routes room sockets | Server operator    |
| Room Durable Object | Admits participants, enforces host authority and ordering, stores the latest snapshot, broadcasts state and presence, and closes the room                       | Server operator    |

```text
popup --------------------+
                          v
SoundCloud page <-> page bridge <-> content script <-> background worker
                                                              |
                                                     HTTPS + WebSocket
                                                              |
                                                     Cloudflare Worker
                                                              |
                                                     room Durable Object
```

## Session flow

1. The extension uses the public room server by default. Hosts can switch to their own server, which needs an optional host permission for that origin.
2. The host opens a SoundCloud track and selects **Start a room**. Room creation sends an empty `POST /rooms` (with a creation key on servers that require one). The Worker returns a random 16-character room code and a 256-bit host token, and the popup copies the invitation link.
3. The background worker creates an ephemeral participant ID and connects to `GET /rooms/{roomCode}/socket` over WebSocket. The first message must be a versioned `join`; the host token assigns the host role.
4. The page bridge reports the playing media element's state. The content script pairs it with the track shown in SoundCloud's player and sends it to the background worker, which assigns increasing sequence numbers.
5. The Durable Object accepts playback only from the connected host, replaces the latest snapshot, and broadcasts it with server time.
6. Guest background workers correct for clock offset and ask their content scripts to follow the track (using SoundCloud's in-page navigation), seek when drift reaches one second, play, or pause.
7. Heartbeats run every 20 seconds. Dropped connections reconnect with a backoff of up to about two minutes.

Invitations point at the server origin with the room code in the URL fragment, which is not sent in the HTTP request. On the public server, the invite script adds a **Join room** button; it opens SoundCloud in a new tab and joins once that tab is ready. On other servers, the popup reads the invitation from the active tab and asks for access to that server first.

During an ad on the host, the room is held paused on the current track; guests wait out their own ads. When the host leaves or closes the room's tab, the room ends and guests are told why. Autoplay blocks and tracks a guest cannot play are shown in the status pill with a one-click fix or retry.

## Protocol and limits

The JSON protocol is version 1 and is defined in `lib/protocol.ts`. The server requires exact client message fields, text frames, and a maximum frame size of 16 KiB. Playback URLs must use HTTPS on `soundcloud.com` or a subdomain, timestamps must be finite and non-negative, and host sequence numbers must increase. Presence messages may report whether the host is connected.

Each room allows at most 25 WebSocket connections and one connected host. A socket must join within ten seconds. Room creation is limited per deployment (`MAX_ROOM_CREATIONS_PER_MINUTE`, 30 by default, 120 on the public server), and servers with keyless creation also limit each client to six per minute using an hourly-rotating hash of its address. The room code is an unlisted locator and the only guest admission credential; it is not a password. The host token controls playback and must not be shared.

## State and retention

The extension stores the selected backend, its reported capacity, and whether it allows keyless rooms in `browser.storage.local`, plus a room creation key only if the user chooses to remember it. Room and participant identifiers, the host token, playback state, and connection state live in `browser.storage.session`. Leaving clears the active room while keeping the selected backend.

The Durable Object stores the room code, host token, creation and activity timestamps, host-presence state, and latest playback snapshot. A room is deleted when the host leaves, when the host never joins within five minutes, one minute after the host's last observed connection, or after six hours without activity. Room closure removes all Durable Object storage and closes its sockets. Rate limiters store only request timestamps for one minute.

Cloudflare platform logs, metrics, and account retention are outside the application-level cleanup and are the server operator's responsibility. The public server's deployment has Workers observability logging disabled.

## Deployment model

The maintainer operates the public room server that the extension uses by default, and serves signed Firefox packages and the Chromium package from it. Anyone can instead deploy the same Worker to their own Cloudflare account and use it from the popup. There is no account system, room directory, or analytics endpoint. See [deployment](deployment.md), [privacy](privacy.md), and [compliance](compliance.md).
