# Self-hosted Deployment

The server is a Cloudflare Worker backed by the `Room` Durable Object. It must be deployed by each operator under that operator's Cloudflare account. The project does not run a central service or fallback relay.

## Requirements

- A Cloudflare account with Workers and Durable Objects available.
- Node.js and npm.
- A local checkout of this repository.

The checked-in `server/wrangler.toml` defines the Worker name `soundcloud-listen-along-server`, entry point `src/index.ts`, `ROOMS` Durable Object binding, `Room` class, and `v1` SQLite-class migration.

## Install and authenticate

From the repository root:

```sh
cd server
npm install
npx wrangler login
```

`wrangler login` opens Cloudflare's authorization flow. Confirm that Wrangler is authenticated to the Cloudflare account that should own the deployment.

## Optional origin restriction

`ALLOWED_ORIGINS` is optional. With no value configured, the Worker accepts requests with or without an `Origin` header and reflects a supplied origin in HTTP responses. This is the simplest setup for unpacked extensions, whose origin can vary by browser or installation.

To restrict browser origins, add a comma-separated value to `server/wrangler.toml` before deployment:

```toml
[vars]
ALLOWED_ORIGINS = "chrome-extension://EXTENSION_ID,moz-extension://EXTENSION_UUID"
```

Values are trimmed and compared as exact strings. Wildcards are not supported. A request with an `Origin` header outside the list receives `403 origin_not_allowed`; a request without an `Origin` header is still accepted. Determine the installed extension origin from the browser's extension debugging page.

This setting is an origin filter, not participant authentication. Guests are admitted by possession of a room code, and host authority is granted by possession of the host token. Do not publish active credentials.

## Room creation key

The Worker requires an operator-defined secret before it creates rooms. From `server/`, set it without writing it to the repository:

```sh
npx wrangler secret put ROOM_CREATION_KEY
```

Give this key only to people allowed to host. They enter it with the backend origin in the extension. Guests configure the same origin without a creation key. The key is held in browser session storage and sent only when creating a room unless the host explicitly chooses to remember it in local extension storage on that device.

## Deploy

From `server/`:

```sh
npm run typecheck
npm test
npm run deploy
```

Wrangler creates the Worker, applies the `v1` Durable Object migration, and prints the deployed URL. For a workers.dev deployment it normally has this form:

```text
https://soundcloud-listen-along-server.<workers-subdomain>.workers.dev
```

The extension requires the exact printed origin: scheme and host only, with no path, query, credentials, or fragment. If the operator later configures a Cloudflare custom domain, use its HTTPS origin instead.

## Configure the extension

1. Build and install the extension as described in the repository README.
2. Open the popup and enter the deployed Worker origin. Hosts also enter the room creation key.
3. Grant the optional browser permission for that origin. The extension verifies the backend service and protocol before saving it.
4. Open a SoundCloud track, review the transmission notice, and create or join a room.
5. Share the invitation link shown for the room. It contains the backend origin and puts the room code in a URL fragment that is not sent to the Worker landing page.

Guests open the invitation link and then select the installed extension from the browser toolbar. After the guest accepts the transmission notice and backend permission, the extension verifies the backend, prepares the room code, and opens SoundCloud. Plain room-code entry remains available when participants have already configured the same backend.

The extension accepts HTTPS origins in normal use. It accepts HTTP only on `localhost` and `127.0.0.1` for development.

## Local development

Install server dependencies and start Wrangler:

```sh
cd server
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Replace the example value in `.dev.vars` before starting the server. This file is ignored by Git.

Use the local origin printed by Wrangler, normally `http://localhost:8787`, in the extension popup. Keep the Wrangler process running while testing. The local Worker uses the same routes, Durable Object binding, and migration configuration as deployment.

For extension development, run `npm install` and `npm run dev` from the repository root in a separate terminal. Grant the popup's requested localhost permission when prompted.

## Security and retention

- Use only HTTPS for deployed origins; Cloudflare terminates TLS for workers.dev and configured custom domains.
- Treat room codes as unlisted guest access credentials and host tokens as control credentials.
- A room accepts at most 25 WebSocket connections and text messages up to 16 KiB.
- Only the host-token holder can publish playback state, and host sequence numbers must increase.
- Application room storage is deleted after six hours of inactivity.
- Once a host has joined, its disconnection starts a one-minute grace period; the room is deleted if the host does not return.
- Application cleanup does not define Cloudflare's retention for logs, metrics, backups, abuse records, or account data.

## Operator responsibilities

The operator controls the Cloudflare account, deployment origin, origin policy, access to logs and metrics, custom domains, updates, incident response, and deletion of the Worker. The operator should monitor Cloudflare usage and limits, keep Wrangler and application dependencies updated, restrict account access, review Cloudflare data-location and retention settings, disclose the operator and hosting provider to participants, and publish any required privacy or retention terms.

Uninstalling the browser extension does not delete the Worker. To end the service, the operator must remove the Cloudflare deployment and review any remaining platform data in the Cloudflare account. See [privacy](privacy.md), [compliance](compliance.md), and [security reporting](../SECURITY.md).
