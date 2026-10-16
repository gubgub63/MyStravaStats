# Web / iOS contract

`season-v1.schema.json` is generated from the authoritative Zod schema with `npm run contracts` (Node 22.12+). `npm run contracts:check` detects drift. The portable JSON backup remains version 1; optional additive fields have defaults. Swift explicitly emits nullable fields as JSON null, rather than omitting required wire keys.

`trail-v1.json` contains synthetic reference inputs and expected effort, pace, difficulty, time range, equivalent level, GPX and ranking outputs. Both Vitest and Swift XCTest use this fixture. The generator copies it into the Swift package test resources; edit the canonical file here, then regenerate. Current general index observations live in `indexHistory` with their actual observation date; they are never backfilled into old race scores.

## HTTP interface

All private responses use `Cache-Control: private, no-store` and vary on Cookie and Authorization. Errors use `{code,message,retryAfter?}`; no provider tokens are returned. Body size is bounded to 15 MiB (2 KiB or less for authentication).

| Endpoint | Request | Response |
| --- | --- | --- |
| `POST /api/v1/auth/start` | `{challenge}`: base64url SHA-256 of a 43–128 character verifier | `{authorizationUrl,state}` |
| `GET /api/v1/auth/callback` | Strava OAuth callback | Redirect to fixed `mystats://auth/callback?code=…&state=…`, or `error` |
| `POST /api/v1/auth/exchange` | `{code,verifier}` | `{token,expiresIn}` for the myStats session |
| `GET /api/v1/session` | `Authorization: Bearer <myStats token>` | `{authenticated:true,athlete}` |
| `GET /api/v1/season` | Browser cookie or mobile bearer | `{revision,season,updatedAt}`; revision 0 and season null if absent |
| `PUT /api/v1/season` | `{revision,season}` | Same envelope after atomic save; HTTP 409 `{code,message,workspace}` on conflict |
| `POST /api/v1/auth/logout` | Mobile bearer or same-origin browser cookie | `{ok:true}` |
| `POST /api/v1/auth/disconnect` | Same | `{ok:true,revoked}`; all athlete sessions invalidated even if Strava is unavailable |

Web mutations require the exact configured Origin. Native mutations require a valid mobile bearer; cookies are not used to infer a native caller. The pending OAuth transaction lasts ten minutes; its handoff code lasts one minute and is consumed once, bound to the original verifier. Mobile sessions last 30 days; web sessions last 24 hours. Signing in again never deletes a saved season. Authorization is always resolved server-side from the session, never from an athlete ID supplied by the client.

Existing `/api/dashboard` and `/api/trail/{runners,races,history,gpx}` data services are reused by the native client. Dashboard periods accept `days=90|180|365` or inclusive `from=YYYY-MM-DD&to=YYYY-MM-DD`. Provider responses remain independently validated in their adapters.
