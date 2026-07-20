# Privacy

## Scope and current behavior

This document describes the open-source extension and the planned self-hosted room design. It is not a privacy policy for SoundCloud or for any independently operated backend.

The current extension is an early scaffold. Its content script runs only on `https://soundcloud.com/*` and `https://*.soundcloud.com/*`, but is empty. Room connectivity and playback synchronization are not implemented. The project code contains no analytics or advertising integration and sends no room or playback data to a service operated by the extension maintainers.

Visiting SoundCloud remains subject to SoundCloud's own data practices. The browser, extension development tools, package registry, and a future backend may have separate practices.

## Roles

**Extension maintainers** publish source code and may distribute extension builds in the future. They do not operate a public central room service. They receive information submitted through GitHub, such as issues, pull requests, and security reports, under GitHub's applicable terms.

**Backend operators** are the people or organizations who deploy a future room backend. Each operator independently chooses hosting providers, access controls, logging, retention, jurisdiction, and participant disclosures. Operators are responsible for their deployment; installing this extension does not make its maintainers the operator of that backend.

**Users** choose whether to install the extension and which backend to trust. Room participants should receive the operator's identity and data terms before connecting.

## Planned extension data

The planned extension may store locally:

- the selected backend URL;
- user preferences and feature settings;
- room/session identifiers and credentials needed to maintain a session;
- transient connection and synchronization state.

Session secrets should be minimized, scoped, and removed when no longer needed. Exact storage and deletion behavior must be documented before release.

The planned extension/backend protocol is expected to process:

- room identifier and room configuration;
- participant identifier, optional display name, presence, and role or control authority;
- track URL or platform track identifier;
- playback state, including playing or paused state and position;
- event and synchronization timestamps, sequence information, and control events such as seek, play, pause, or track change;
- connection/session metadata needed to join, reconnect, and prevent unauthorized room access;
- protocol version and error information needed for interoperability.

A backend host or network provider may also observe IP addresses, connection times, user-agent or protocol metadata, and operational logs. Whether these are retained is controlled by the backend operator and hosting stack.

## Exclusions and minimization

The design does not require the extension to send SoundCloud passwords, authentication cookies, private messages, contact lists, or audio content to a room backend. Implementations should not collect them. Playback messages should contain only what is necessary to identify and synchronize the selected public or user-accessible track.

The project should avoid telemetry by default, use narrow browser permissions, encrypt backend transport with TLS in non-local deployments, expose clear room-leave and local-data deletion controls, and document retention before a usable release.

## Operator checklist

- Identify the backend operator and hosting provider to participants.
- Document collected fields, purpose, lawful basis where applicable, retention, access, deletion, and incident contacts.
- Use TLS, access controls, secret rotation, software updates, and minimal logs.
- Avoid public room indexing unless participants explicitly expect it.
- Provide a process for access or deletion requests where required.

These are engineering and transparency guidelines, not legal advice. See [compliance](compliance.md).
