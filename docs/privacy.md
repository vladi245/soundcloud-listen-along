# Privacy

## Scope and current behavior

This document describes the open-source extension and its self-hosted room design. It is not a privacy policy for SoundCloud or for any independently operated backend.

The content script runs only on `https://soundcloud.com/*` and `https://*.soundcloud.com/*`. After a user explicitly creates or joins a room, the extension sends room and playback messages to that user's configured backend. The implemented backend is a Cloudflare Worker deployed under a self-hosting operator's account. The project contains no analytics or advertising integration and sends nothing to a service operated by the extension maintainers.

Visiting SoundCloud remains subject to SoundCloud's own data practices. The browser, extension development tools, package registry, Cloudflare, and each operator deployment may have separate practices.

## Roles

**Extension maintainers** publish source code and extension builds. They do not operate a public central room service. They receive information submitted through GitHub, such as issues, pull requests, and security reports, under GitHub's applicable terms.

**Backend operators** are the people or organizations who deploy the room backend. Each operator independently chooses hosting providers, access controls, logging, retention, jurisdiction, and participant disclosures. Operators are responsible for their deployment; installing this extension does not make its maintainers the operator of that backend.

**Users** choose whether to install the extension and which backend to trust. Room participants should receive the operator's identity and data terms before connecting.

## Extension data

The extension stores in browser session storage:

- the selected backend URL;
- room and participant identifiers and a host token when hosting;
- the operator-provided room creation key when configured;
- transient connection and synchronization state.

Room session data is removed when the user leaves and when the browser session ends. The selected backend URL remains available only for that browser session.

The extension/backend protocol processes:

- room identifier and host authority token;
- ephemeral participant identifier, presence, and role;
- current SoundCloud page URL;
- playback state, including playing or paused state and position;
- event and synchronization timestamps, sequence information, and playback changes such as seek, play, pause, or track change;
- connection/session metadata needed to join and reconnect;
- protocol version and error information needed for interoperability.

The Durable Object stores the room code, host token, activity and host-presence timestamps, and latest playback snapshot. It deletes application room storage after six hours of inactivity or, once the host has joined, one minute after the host disconnects without returning. Cloudflare and network providers may also observe IP addresses, connection times, user-agent or protocol metadata, and operational logs. Their retention is controlled by the backend operator and hosting stack rather than this application cleanup.

## Exclusions and minimization

The design does not require the extension to send SoundCloud passwords, authentication cookies, private messages, contact lists, or audio content to a room backend. Implementations should not collect them. Playback messages should contain only what is necessary to identify and synchronize the selected public or user-accessible track.

The extension has no telemetry, requests backend access as an optional per-origin permission, requires TLS except for local development, and exposes a room-leave control. Operators remain responsible for platform logging and retention disclosures.

## Operator checklist

- Identify the backend operator and hosting provider to participants.
- Document collected fields, purpose, lawful basis where applicable, retention, access, deletion, and incident contacts.
- Use TLS, access controls, secret rotation, software updates, and minimal logs.
- Avoid public room indexing unless participants explicitly expect it.
- Provide a process for access or deletion requests where required.

These are engineering and transparency guidelines, not legal advice. See [compliance](compliance.md).
