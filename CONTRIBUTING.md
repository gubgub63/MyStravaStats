# Contributing

Open an issue to discuss a substantial change, or send a pull request for a small fix. Include a short description of the change and how you checked it.

## Local development

Follow [Strava setup](docs/setup.md) to connect a real account. For UI work, `/demo` uses sample data and needs no credentials.

```sh
npm ci
npm run dev
```

Before submitting a pull request:

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

## Project conventions

Keep authentication Strava-only and preserve the design without a database. OAuth tokens must stay out of React, browser storage, logs and public caches.

Use the shared unit helpers for new metrics. Activity dates and weekly aggregates must respect the activity's local calendar date. Document custom calculations and distinguish them from Strava metrics.

Use fictional data in screenshots and fixtures. Never include `.env.local`, session cookies, real OAuth credentials or private activity data in a commit or issue.

The app interface is currently in French. Keep UI text consistent unless the change adds a complete translation flow.
