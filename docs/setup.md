# Strava setup

The demo at `/demo` works without credentials. Connecting a real account requires a Strava application and the five variables from [.env.example](../.env.example).

## Create an application

1. Open [Strava API settings](https://www.strava.com/settings/api) and register an application.
2. Enter its name and website. Set the **Authorization Callback Domain** to `localhost` for local development. Strava also allows `127.0.0.1`.
3. Copy the **Client ID** and **Client Secret** into `.env.local`. The personal access and refresh tokens shown on the settings page are not needed: users connect through OAuth.
4. Generate a session secret:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

5. Paste the output into `SESSION_SECRET`. Start or restart `npm run dev`, open [localhost:3000](http://localhost:3000), and select **Connect with Strava**.

## Environment variables

| Variable               | Value                                            |
| ---------------------- | ------------------------------------------------ |
| `STRAVA_CLIENT_ID`     | Your application's Client ID                     |
| `STRAVA_CLIENT_SECRET` | Your application's Client Secret                 |
| `SESSION_SECRET`       | Random secret, at least 32 characters            |
| `STRAVA_REDIRECT_URI`  | `http://localhost:3000/api/auth/strava/callback` |
| `NEXT_PUBLIC_APP_URL`  | `http://localhost:3000`                          |

The redirect URI must use the same origin as the app URL and end in `/api/auth/strava/callback`. Production requires HTTPS. Use different session secrets for development and production.

`.env.local` is ignored by Git. Keep the client secret and session secret out of frontend code, issues and screenshots.

## Permissions and limits

The app requests `read` and `activity:read`. This includes activities visible to everyone or followers. Activities set to **Only You**, privacy-zone data and GPS tracks are not requested. No write permissions are needed.

Your Strava application's athlete capacity determines how many people can connect. Check its API settings before inviting users; capacity increases may require a Strava review. API request quotas are read from response headers and may differ between applications.

See Strava's [OAuth documentation](https://developers.strava.com/docs/authentication/), [getting started guide](https://developers.strava.com/docs/getting-started/) and [rate limits](https://developers.strava.com/docs/rate-limits/).

## Troubleshooting

| Symptom                              | Check                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Connection is not configured         | All five environment variables must be set. Restart the local server after editing them.                          |
| Strava rejects the redirect          | Check the app's callback domain and `STRAVA_REDIRECT_URI`.                                                        |
| Activities are missing               | Check the selected dates and sport. Only You activities are excluded. Periods above 1,000 activities are partial. |
| Refresh does not show a new activity | The private cache lasts ten minutes. Refreshing does not bypass it.                                               |
| Strava rate limit reached            | Wait until the retry time shown by the app. Repeated refreshes will not reset the quota.                          |

Tests use simulated Strava responses. Verify sign-in, activity loading, logout and revocation with a real account on both localhost and your production domain. Current verification notes are in [VALIDATION.md](VALIDATION.md) (French).
