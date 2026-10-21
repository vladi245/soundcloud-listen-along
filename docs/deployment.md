# Deployment

## Public room server

The extension uses a project-operated public room server by default. It runs the same Worker with `wrangler.hosted.toml`, which enables `PUBLIC_ROOM_CREATION` so rooms can be created without a key. Room creation is limited per client (six per minute, keyed by an hourly-rotating hash of the client address) and globally (`MAX_ROOM_CREATIONS_PER_MINUTE`).

Deploy the public server from `server/`:

```sh
npx wrangler login
npm run deploy:hosted
```

Copy the printed `https://...workers.dev` origin into `HOSTED_BACKEND_URL` in `lib/hosted.ts`; the extension manifest grants host access to that origin automatically. Optionally set `INSTALL_URL` in `wrangler.hosted.toml` to an external install page for servers that do not host the packages themselves, then redeploy. Set `HOSTED_BACKEND_URL` to `null` to build an extension with no default server.

### Extension packages

`npm run release:hosted` builds both browser packages, signs the Firefox build as an unlisted add-on, writes `updates.json` for Firefox auto-updates, and redeploys the server with these files under `server/hosted-assets/`. The invitation page then offers an **Install for Firefox** button and Chromium load-unpacked steps.

Signing needs AMO API credentials in `.env.amo` (git-ignored):

```sh
AMO_JWT_ISSUER=user:12345678:123
AMO_JWT_SECRET=...
```

Raise `version` in `package.json` before every release; AMO signs each version once.

## Self-hosted deployment

Instead of the public server, anyone can run the same Worker in their own Cloudflare account. A self-hosted server requires a room creation key by default, so only people with the key can start rooms; guests join with the invitation link alone.

## Requirements

- A Cloudflare account with Workers and Durable Objects available.
- Node.js and npm.
- A local checkout of this repository.

The checked-in `server/wrangler.toml` defines the Worker name, entry point, `Room` and `CreationLimiter` Durable Object bindings, and their SQLite-class migrations.

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

Set a secret before creating rooms. Generate a long random value, for example with `openssl rand -base64 32`, and from `server/` set it without writing it to the repository:

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

Wrangler creates the Worker, applies pending Durable Object migrations, and prints the deployed URL. For a workers.dev deployment it normally has this form:

```text
https://soundcloud-listen-along-server.<workers-subdomain>.workers.dev
```

The extension requires the exact printed origin: scheme and host only, with no path, query, credentials, or fragment. If you configure a Cloudflare custom domain, use its HTTPS origin instead.

## Configure the extension

1. Install the extension (see the [README](../README.md)).
2. In the popup, select **Use own server**, enter the deployed Worker origin and the room creation key, and allow access to that origin when the browser asks. The extension checks the server's protocol before saving it.
3. Open a SoundCloud track, select **Start a room**, and share the copied invitation link. The room code travels in the URL fragment, which is not sent to the Worker.

Guests open the invitation link, select the extension in the toolbar, approve access to the server, and select **Join room**. SoundCloud then opens and follows the host. To go back to the public server, select **Use the public server instead** on the same screen.

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
- A room accepts at most 25 WebSocket connections, requires a join message within ten seconds, and accepts text messages up to 16 KiB.
- Each deployment accepts at most `MAX_ROOM_CREATIONS_PER_MINUTE` room creations per rolling minute (30 by default, 120 on the public server). Servers with keyless creation also allow six per client per minute, tracked under an hourly-rotating hash of the client address. Limiters store only timestamps.
- Only the host-token holder can publish playback state, and host sequence numbers must increase.
- Application room storage is deleted after six hours of inactivity.
- A new room is deleted if its host does not join within five minutes.
- Once a host has joined, its disconnection starts a one-minute grace period; the room is deleted if the host does not return.
- Application cleanup does not define Cloudflare's retention for logs, metrics, backups, abuse records, or account data.

## Shut down your server

To stop hosting, remove the Worker from your Cloudflare account and review any remaining platform data. Uninstalling the extension leaves the Worker running. See [security reporting](../SECURITY.md).
