# Self-hosting

myStats runs without Vercel or a database. It needs a Node.js server and HTTPS for Strava sign-in. This repository includes a standalone Docker image and an optional Caddy reverse proxy with automatic certificates.

## Configure your server

1. Point a domain's DNS records to your server. For the Caddy setup, make TCP ports 80 and 443 available (UDP 443 is optional).
2. Install Docker Engine and Docker Compose, then clone this repository.
3. Copy `.env.example` to `.env.production` and configure it:

   ```env
   STRAVA_CLIENT_ID=your-client-id
   STRAVA_CLIENT_SECRET=your-client-secret
   SESSION_SECRET=your-new-random-secret
   NEXT_PUBLIC_APP_URL=https://stats.example.com
   STRAVA_REDIRECT_URI=https://stats.example.com/api/auth/strava/callback
   APP_DOMAIN=stats.example.com
   ```

   Generate a new secret with at least 32 characters:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   chmod 600 .env.production
   ```

4. In your Strava application's settings, set **Authorization Callback Domain** to `stats.example.com`, without a protocol or path.
5. Start the app and HTTPS proxy:

   ```sh
   docker compose --env-file .env.production -f compose.server.yaml up -d --build
   ```

Visit your HTTPS domain. `/demo` is publicly accessible with fictional data; `/dashboard` and private API data require a Strava session. Making the homepage public does not publish athletes' activities.

## Use an existing reverse proxy

If you already use Caddy, nginx, Traefik or a hosting panel, start just the app:

```sh
docker compose up -d --build
```

The app listens on `127.0.0.1:3000`. Configure your existing proxy to serve it at the HTTPS origin in `.env.production`. The local HTTP address is for proxying and health checks; production authentication requires HTTPS and Secure cookies. A proxy in another container should share a Docker network with the app instead of using this loopback binding.

## Use Node.js without Docker

With Node.js 22.12+:

```sh
npm ci
npm run build
cp -R .next/static .next/standalone/.next/static
NODE_ENV=production HOSTNAME=127.0.0.1 PORT=3000 node --env-file=.env.production .next/standalone/server.js
```

Use a process manager or systemd to restart the process, and put an HTTPS reverse proxy in front of it. The standalone output excludes `.env*`; credentials are supplied at runtime. No `NEXT_PUBLIC_APP_URL` is used by browser code in this app; its current use is server-side OAuth validation.

## Updates and operations

For the Caddy deployment:

```sh
git pull --ff-only
docker compose --env-file .env.production -f compose.server.yaml up -d --build
docker compose --env-file .env.production -f compose.server.yaml ps
```

Keep `.env.production` and the `caddy_data` volume when updating. Back them up securely. All replicas must use the same session secret; changing it signs users out. Activities are cached only in memory for ten minutes, so restarts discard the cache and new requests reload it from Strava. Prefer a single app instance for personal use; multiple instances do not share the activity cache or token-refresh coordination.

After deploying, verify sign-in, real activity loading, logout and access revocation. Private API responses must remain `private, no-store`; do not cache them at the proxy. Avoid logging OAuth query parameters. Availability to other athletes still depends on your Strava application's capacity.

The build and standalone server can be tested independently of Docker. A working image build and HTTPS/OAuth check on your own server remain necessary before considering that server verified.
