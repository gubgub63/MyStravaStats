# Trail running: useful next features

The current dashboard shows distance, total ascent, moving time, weekly volume, average pace, longest run and largest ascent. It groups running and trail activities, with a separate sport filter. Its effort pace is a custom approximation, not Strava GAP.

## First priority: describe the terrain

- **Ascent per kilometre (m/km)** and **effort kilometres**: already calculable from existing data, useful for putting different routes in context. Effort distance is currently calculated internally but not displayed on its own.
- **Descent (D−) and an elevation profile**: show the descending load and how the climb is distributed. These need additional elevation data; total ascent cannot determine total descent on an open-ended route.
- **Uphill and downhill splits**: pace, gradient and climbing speed on ascent sections. These require activity streams; dividing total ascent by the entire outing's duration does not measure uphill VAM.
- **Elapsed time and stops**: distinguish time on feet from moving time, particularly for long trail outings.

## Second priority: progression and preparation

- Compare complete weeks and equivalent date ranges for distance, ascent and duration; distinguish a partial current week from a completed week.
- Weekly distance/ascent goals, consistency and a race target with its date, distance and elevation.
- Long-outing history and combined consecutive-day volume for race preparation.
- Optional heart-rate analysis when recorded, with clearly stated data coverage. Elevation streams and physiological data require additional API calls and careful handling of missing recordings.

## Later: personal training notes

Perceived effort, fatigue, nutrition/hydration notes, shoe mileage and race planning are useful but require user input or additional sources. Persistent goals and notes need storage; the current app intentionally has no database.

Strava's [API reference](https://developers.strava.com/docs/reference/) documents activity summaries, detailed activities and streams. Additional activity access may affect privacy permissions and API quotas. None of these proposed features are implemented by this document.
