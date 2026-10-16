# Native iPhone and synchronized seasons

The web app and native iOS app share a Strava athlete identity, versioned season JSON and the same server-side public data adapters. The SwiftUI client is in `apps/ios`; installation instructions are in its README. The backend remains open source and can run on your own Docker host.

## Test locally in Simulator

With your existing Strava `.env.local` and Docker Desktop running:

```sh
npm run ios:setup
npm run dev:ios
```

The setup creates a separate PostgreSQL container `mystats-ios-local`, persistent volume `mystats_ios_local_data`, and private ignored `.env.ios.local` / `.env.ios-db.local` files. It reuses only your Strava client ID/secret, generates independent session/encryption/database secrets, and runs migrations. The native test server uses `http://localhost:3001`, separate build files and cookie names; the original web server on port 3000 stays separate. Keep these environment files and volume to retain your data. Do not run database tests against this personal database.

Enter `http://localhost:3001` in the simulator’s Profile, or build with `MYSTATS_SERVER_URL=http://localhost:3001` to prefill that installation. The Strava callback domain must permit localhost. The user completes Strava login inside the simulator’s system authentication window; their Mac browser session is not copied. Existing seasons can be transferred using the JSON export/import flow.

To stop PostgreSQL without removing data: `docker stop mystats-ios-local`. Running setup again starts the same container.

## Test on your iPhone over private Wi-Fi

Keep the Mac running and connect both devices to the same trusted Wi-Fi. Find the Mac's private IPv4 address in System Settings → Wi-Fi → Details → TCP/IP (for example `192.168.1.102`), then:

```sh
npm run ios:setup -- --host=192.168.1.102
npm run dev:ios
```

Restart an already running `dev:ios` process after changing its configuration. Setup updates only the iOS environment's public URL and OAuth callback; it retains the same database, secrets and seasons. The server binds specifically to the selected private interface. This does not create a public tunnel or a router port forwarding rule. PostgreSQL stays bound to Mac loopback. Anyone on the same local network can reach the app's login page; personal data still requires authentication.

In [Strava API settings](https://www.strava.com/settings/api), set **Authorization Callback Domain** to the Mac's address only, e.g. `192.168.1.102`, without a protocol, port or path. Strava must accept this callback host before login can complete. Localhost remains whitelisted by Strava for simulator use. Build the app in **Debug**, enter `http://192.168.1.102:3001` in **Profil**, save, and connect Strava. Allow iOS's local network access prompt (or enable it under Settings → Privacy & Security → Local Network → myStats). To verify reachability first, open `http://192.168.1.102:3001/api/health` in Safari on the phone; it should show `{"ok":true}`.

Debug builds permit HTTP only to loopback in Simulator or RFC1918 private IPv4 addresses (10/8, 172.16/12, 192.168/16), with matching ATS exceptions. Release builds require HTTPS and contain no HTTP ATS exceptions. Local HTTP is intended for development on a trusted network; use the HTTPS deployment below for regular or remote use. No Strava secret or provider token is embedded in the app. When DHCP changes the Mac's address, repeat setup and update the app and Strava callback host; a router DHCP reservation can keep it stable. To return to Simulator loopback, run setup with `--host=localhost` and restart the server.

## Production hosting

Use a server with a domain pointing to it, Docker Compose and ports 80/443 available. This requires an actual server and domain; neither is purchased or provisioned by the source code.

Add to `.env.production`, alongside the existing Strava and HTTPS settings:

```env
APP_DOMAIN=stats.example.org
NEXT_PUBLIC_APP_URL=https://stats.example.org
STRAVA_REDIRECT_URI=https://stats.example.org/api/auth/strava/callback
STRAVA_CLIENT_ID=your-client-id
STRAVA_CLIENT_SECRET=your-client-secret
SESSION_SECRET=independent-random-secret-at-least-32-characters
TOKEN_ENCRYPTION_KEY=another-independent-random-secret-at-least-32-characters
POSTGRES_USER=mystats
POSTGRES_DB=mystats
POSTGRES_PASSWORD=url-safe-random-password
```

Generate each secret independently, for example `openssl rand -hex 32`; protect the environment file with `chmod 600 .env.production`. The PostgreSQL password is embedded in a URL by Compose: use the suggested hexadecimal generator to avoid URL escaping issues.

The Strava authorization callback **domain** must be your production hostname, without a path. Both `/api/auth/strava/callback` (web) and `/api/v1/auth/callback` (native) use that same domain. The native callback returns to a fixed custom scheme after the server has exchanged the provider code. Provider secrets are never included in the app or redirect.

```sh
docker compose --env-file .env.production -f compose.server.yaml up -d --build
```

Compose starts PostgreSQL 16 with a persistent private volume, then the app and HTTPS proxy. Database migrations run under an advisory lock before the app starts. A migration failure prevents startup. PostgreSQL is not exposed on a host port. `/api/health` checks the migrated schema and token encryption configuration without revealing credentials. Private responses must not be cached at a proxy. Configure infrastructure logs to redact all OAuth callback query parameters and Authorization headers.

For an external database or existing proxy, set `DATABASE_URL` explicitly and run `npm run db:migrate` before starting Node, or let the Docker entrypoint migrate. Database connections use the URL’s SSL configuration; require TLS for databases outside a trusted private container network. For self-signed/private CA deployments, configure trust rather than disabling certificate verification.

The existing local web-only mode remains usable with `DATABASE_URL` unset. Synchronization and native login return a clear unavailable response until PostgreSQL and `TOKEN_ENCRYPTION_KEY` are configured. The public GitHub Pages preview remains a static demonstration.

## Existing web data and sessions

Enabling PostgreSQL invalidates old cookie-only sessions: reconnect Strava. Seasons stay in browser storage. On the season page, an import prompt shows local and server objective/result counts before a local workspace is uploaded. Anonymous local data is never silently assigned to a Strava athlete. Export the JSON first if in doubt. If both devices edit the same revision, neither wins automatically: compare the versions and explicitly keep one. Local web copies are retained under the workspace’s `:before-sync` key before server replacement; export the current season before resolving if you want an immediately downloadable copy.

On iPhone the version before replacement appears in **Profil → Copies locales conservées**. Season and unsent changes survive app restart. A network failure leaves changes pending; reopening the app or restoring connectivity retries. App session expiry requests a new Strava login without erasing the local season. Native sessions are stored in Keychain, server session hashes in PostgreSQL, and provider credentials are encrypted using `TOKEN_ENCRYPTION_KEY`. Web sessions expire after 24 hours, mobile sessions after 30 days. Logout revokes only the current app session; disconnect invalidates all app sessions for that athlete and attempts Strava access revocation.

Provider refreshes are serialized by a PostgreSQL row lock across devices and app instances. Activity results retain the existing private ten-minute memory cache; they are not stored in PostgreSQL. Per-instance quota/cache limits still apply, so one app instance is recommended for personal hosting.

## Backups, updates and recovery

Back up the PostgreSQL volume using a logical dump, plus your environment file and encryption key in a separate secure location. Losing the key makes stored Strava credentials unreadable. JSON season exports remain readable independently.

```sh
scripts/db/backup.sh /secure/backups/mystats-2026-10-14.dump
```

The script refuses to overwrite an existing file and creates it with private permissions. Check its exit status. To restore, first make a fresh backup, stop app writes, restore the dump, and start the app again:

```sh
docker compose --env-file .env.production -f compose.server.yaml stop app
scripts/db/restore.sh /secure/backups/mystats-2026-10-14.dump
docker compose --env-file .env.production -f compose.server.yaml up -d app
```

Restoring replaces server state. Other devices may hold unsent revisions; reconnect them and resolve conflicts before overwriting restored data. Do not delete `postgres_data` during updates. Keep migrations and encryption keys with the matching release; roll back an incompatible schema using a verified pre-update dump rather than deleting tables.

## Acceptance on your server and phone

Verify: HTTPS health, web Strava login, native Strava login, importing the existing season, editing a goal in both directions, offline edit/restart/reconnect, simultaneous edits with explicit conflict resolution, JSON restore, UTMB lookup, UTLAC historical comparison, logout and access revocation. External live OAuth needs your configured hostname and Apple signing account. No source-only check can certify those deployment-specific steps.
