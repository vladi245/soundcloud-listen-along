# Architecture

## Status

Only the browser-extension scaffold exists today. The popup renders a milestone notice, the background worker is empty, and the SoundCloud-matched content script performs no work. No backend implementation or wire protocol is present in this repository.

Everything below marked "planned" is design direction, not shipped behavior or a compatibility guarantee.

## Planned components

| Component         | Responsibility                                                                           | Trust boundary        |
| ----------------- | ---------------------------------------------------------------------------------------- | --------------------- |
| Popup             | Configure a backend, create or join a room, and show connection state                    | Extension UI          |
| Content script    | Observe supported player state and apply authorized remote playback changes              | SoundCloud page       |
| Background worker | Own room lifecycle, validate messages, coordinate tabs, and communicate with the backend | Browser extension     |
| Room backend      | Authenticate or admit participants, order room events, and relay current state           | Self-hosting operator |

```text
popup --------------------+
                          v
SoundCloud page <-> content script <-> background worker <-> operator backend
```

The content script should receive the minimum control surface required for synchronization. Page-derived messages must be treated as untrusted at the extension boundary. Backend messages must be authenticated where the selected deployment supports authentication, schema-validated, bounded, and scoped to the active room and tab.

## Planned state flow

1. A user selects an operator-provided backend and creates or joins a room.
2. The background worker establishes the room session and tracks connection state.
3. The active tab reports track and playback changes through the content script.
4. The backend orders or relays state to room participants.
5. Each background worker validates incoming state before asking its content script to apply it.

Conflict resolution, host authority, drift correction, reconnection, authentication, and protocol versioning remain undecided. They must be documented before the protocol is considered stable.

## Deployment model

The extension is self-hosted-only by design: users connect to a backend chosen for their group or deployment. The project does not operate a central discovery service, room service, analytics endpoint, or fallback relay. The backend is a planned separate component and is not currently available in this repository.

See [privacy](privacy.md) for expected data boundaries and [compliance](compliance.md) for operator considerations.
