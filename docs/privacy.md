# Privacy

## Scope and current behavior

This document describes the open-source extension, the public room server operated by the extension maintainer, and the self-hosted room design. It is not a privacy policy for SoundCloud or for any independently operated backend.

The content script runs only on `https://soundcloud.com/*` and `https://*.soundcloud.com/*`. After a user explicitly creates or joins a room, the extension sends room and playback messages to that user's configured backend. By default this is the public room server, a Cloudflare Worker operated by the extension maintainer. Users may instead select a backend deployed under their own or another operator's Cloudflare account. The project contains no analytics or advertising integration, and the extension contacts the public room server only when the user creates or joins a room there or opens one of its invitations.

The extension is disabled in private browsing so room and playback state cannot cross private and regular browser contexts.

Visiting SoundCloud remains subject to SoundCloud's own data practices. The browser, extension development tools, package registry, Cloudflare, and each operator deployment may have separate practices.

## Roles

**Extension maintainers** publish source code and extension builds and operate the default public room server. For that server they are the backend operator described below, with Workers observability logging disabled in its deployment configuration. They receive information submitted through GitHub, such as issues, pull requests, and security reports, under GitHub's applicable terms.

**Backend operators** are the people or organizations who deploy the room backend. Each operator independently chooses hosting providers, access controls, logging, retention, jurisdiction, and participant disclosures. Operators are responsible for their deployment; installing this extension does not make its maintainers the operator of that backend.

**Users** choose whether to install the extension and which backend to trust. Room participants should receive the operator's identity and data terms before connecting.

## Extension data

The extension stores in persistent browser extension storage:

- the selected backend URL;
- the nickname the user sets, if any;
- the room capacity reported by that backend;
- the operator-provided room creation key only when the user explicitly chooses to remember it on that device.

The extension stores in browser session storage:

- room and participant identifiers and a host token when hosting;
- the operator-provided room creation key when it is not remembered;
- transient connection and synchronization state;
- a pending room code and transmission choice while completing an invitation.

Room session data is removed when the user leaves and when the browser session ends. The selected default backend URL remains available until it is replaced or the extension's local data is cleared. An invitation may temporarily select a different backend for the browser session without replacing the saved default. A remembered creation key has the same lifetime as the default backend and is available to other software or people with access to that browser profile; users should enable the option only on a trusted device.

The extension/backend protocol processes:

- room identifier and host authority token;
- ephemeral participant identifier, presence, and role;
- the user's nickname, if set, which the server shares with everyone in the room along with each member's role and a random member ID;
- current SoundCloud page URL;
- playback state, including playing or paused state and position;
- event and synchronization timestamps, sequence information, and playback changes such as seek, play, pause, or track change;
- connection/session metadata needed to join and reconnect;
- protocol version and error information needed for interoperability;
- backend compatibility metadata, including service identifier, protocol version, room capacity, and whether a creation key is required.

Room invitation links place the room code in the URL fragment. Browsers do not send that fragment in the HTTP request for the operator's landing page. The extension reads the active invitation tab only after the user opens its popup and uses the fragment to prepare the selected backend and room.

The room Durable Object stores the room code, host token, creation, activity and host-presence timestamps, and latest playback snapshot. It deletes application room storage when the host does not join within five minutes, after six hours of inactivity, or, once the host has joined, when its last observed connection is more than one minute old. A separate creation limiter stores request timestamps covering the preceding minute. A server that allows room creation without a key, such as the public room server, also limits each client: it derives a limiter name from a SHA-256 hash of the client IP address combined with the current hour, stores only timestamps under that name, and deletes them after the one-minute window. The IP address itself is not stored. Cloudflare and network providers may still observe IP addresses, connection times, user-agent or protocol metadata, and operational logs. Their retention is controlled by the backend operator and hosting stack rather than this application cleanup.

## Exclusions and minimization

The design does not require the extension to send SoundCloud passwords, authentication cookies, private messages, contact lists, or audio content to a room backend. Implementations should not collect them. Playback messages should contain only what is necessary to identify and synchronize the selected public or user-accessible track.

The extension has no telemetry, holds host access only for the public room server, requests access to any other backend as an optional per-origin permission, requires TLS except for local development, and exposes a room-leave control. Operators remain responsible for platform logging and retention disclosures.

## Operator checklist

- Identify the backend operator and hosting provider to participants.
- Document collected fields, purpose, lawful basis where applicable, retention, access, deletion, and incident contacts.
- Use TLS, access controls, secret rotation, software updates, and minimal logs.
- Avoid public room indexing unless participants explicitly expect it.
- Provide a process for access or deletion requests where required.

These are engineering and transparency guidelines, not legal advice. See [compliance](compliance.md).
