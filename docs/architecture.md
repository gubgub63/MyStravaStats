# Architecture

Next.js App Router, TypeScript, React, Tailwind CSS, Recharts, Zod and iron-session. No database, local account system or persistent activity storage.

```text
Browser → Strava OAuth → server callback
                             ↓
                   encrypted session cookie
                             ↓
           /api/dashboard → Strava API → statistics
```

## Authentication

- A random OAuth state is sealed in a ten-minute cookie, checked at the callback and removed after use.
- Access and refresh tokens are stored in an authenticated, encrypted iron-session cookie. React never receives them.
- The cookie uses `HttpOnly`, `SameSite=Lax`, and `Secure` with the `__Host-` prefix in production. It is a browser-session cookie with a server-side limit of 24 hours. Browsers that restore sessions may retain it after closing.
- Tokens refresh within three minutes of expiry. Both tokens and the expiry are replaced, and the updated cookie is issued before activity loading.
- Concurrent refreshes on one instance share an encrypted result for 30 seconds.
- Logout removes the local cookie and purges the session cache. Disconnect also calls Strava's recommended `/oauth/revoke` endpoint. If revocation fails, the local session is still removed and the user is told to revoke access in Strava settings.

Sensitive POST routes check Origin. Responses use a nonce-based CSP, frame protection and security headers. Production requires HTTPS. Next.js development request logging is disabled; host access logs require separate configuration.

## Activity data and cache

The dashboard loads one period through a single API route. Presets cover 90, 180 or 365 days. Custom ranges include both selected calendar dates, using each activity's local date. The API fetches an extra day at each boundary before filtering to account for timezone offsets.

The memory cache is keyed by session, athlete, granted scopes and period. It holds up to 100 entries per instance for ten minutes. Concurrent reads are coalesced. Logout, disconnect and authentication failures purge the session's entries. Private responses use `Cache-Control: private, no-store`; no Strava data goes into a public cache.

The refresh button respects the cache. There is no polling or persistent browser storage of activities. Up to ten pages of 100 activities are requested per period. Results are marked as partial when this bound is reached.

Strava quota headers are monitored. Exhausted quotas or a 429 response block further requests on the instance until the retry window, with a retry time returned to the UI. An unexpected 401 gets at most one token refresh and retry; another 401 invalidates the local session.

### Serverless limits

Caches, quota guards and refresh coalescing are local to an instance and disappear when it restarts. Different instances can duplicate requests or refresh tokens concurrently. This design does not provide a global cache or lock.

A copied session cookie cannot be revoked individually without server-side state. Revoking the application's access through Strava invalidates its OAuth credentials. Other instances' cached statistics can remain until their ten-minute expiry.

Strava [recommends webhooks](https://developers.strava.com/docs/webhooks/) for activity changes and deauthorization. This version has no webhook subscription. Before expanding public access, review Strava's requirements and plan cache invalidation across instances; an endpoint on a single serverless instance cannot guarantee that.

## Calculations

Distances are summed in kilometres, elevation in metres, and moving time in seconds. Weeks run Monday to Sunday using the activity's local date; UTC timestamps are also retained.

Running pace is weighted by distance:

```text
average pace = total running moving time / total running distance
average speed = total running distance / total running moving time
```

Weekly distance and moving time describe training volume. They are not physiological load estimates.

The running summary includes a custom effort pace:

```text
effort distance (km) = running distance (km) + elevation gain (m) / 100
estimated effort pace (s/km) = running moving time (s) / effort distance (km)
```

This assumes 100 m of ascent adds the effort of 1 km on flat ground. It does not model descents, individual slopes or surface conditions. It is **not Strava GAP**, and is not currently calculated for each activity. Strava's documented activity models do not expose its official grade-adjusted pace. A separate slope-based estimate would require additional stream data and a documented model.

See [Strava's API reference](https://developers.strava.com/docs/reference/) and the [privacy page source](../src/app/privacy/page.tsx).
