# Deployment

myStats needs a server for OAuth, encrypted cookies and authenticated Strava requests. It runs on Vercel or another compatible Node.js host. GitHub Pages only serves static files and cannot run these routes.

[Vercel Hobby](https://vercel.com/docs/plans/hobby) provides free hosting for personal, non-commercial projects within its usage limits. GitHub hosts the source and runs the included deployment workflow.

## Configure Vercel

1. Import this repository into Vercel as a **Next.js** project.
2. Add the five variables from the [setup guide](setup.md) to the **Production** environment. Generate a separate production `SESSION_SECRET`.
3. Use a stable domain and set:

   ```env
   NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
   STRAVA_REDIRECT_URI=https://your-domain.vercel.app/api/auth/strava/callback
   ```

4. Update the Strava application's **Authorization Callback Domain** to that domain, without the protocol or path. Temporary preview domains are not suitable for the production callback.
5. Redeploy after changing environment variables.

## Configure GitHub Actions

In **Settings → Secrets and variables → Actions**, add:

| Type     | Name                | Value                     |
| -------- | ------------------- | ------------------------- |
| Variable | `VERCEL_ORG_ID`     | Vercel account or team ID |
| Variable | `VERCEL_PROJECT_ID` | Vercel project ID         |
| Secret   | `VERCEL_TOKEN`      | Vercel deployment token   |

The IDs are available in Vercel settings or `.vercel/project.json` after running `vercel link`. That directory is ignored by Git.

Disable Vercel's automatic Git deployments when using this workflow to avoid deploying twice on each push.

Push to `main`, or select **Actions → Validate and deploy → Run workflow**. The workflow runs lint, type checking, tests, a production dependency audit and the build. On success, it pulls the Vercel production environment and deploys a prebuilt artifact. The deployment job is skipped until `VERCEL_PROJECT_ID` is set. Pull requests run validation without production secrets.

See the [workflow source](../.github/workflows/ci.yml) and [Vercel's GitHub Actions guide](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel).

## Verify the deployment

On the permanent HTTPS domain, check Strava sign-in, activity loading, session persistence, logout and access revocation. Inspect the session cookie for `HttpOnly`, `Secure` and `SameSite=Lax`. Private API responses must have `Cache-Control: private, no-store`.

Configure the host's logs to redact OAuth callback query parameters. Application code does not log tokens or authorization codes, but infrastructure access logs may capture URLs.
