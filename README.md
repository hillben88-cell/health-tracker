# Health & Fitness Tracker

A single-page React app for tracking water, food, exercise, and weight, with
live Strava sync and file-based import for Garmin and Apple Health data.
Data is stored in the browser's `localStorage` — there is no database.

## Running locally

```bash
npm install
npm run dev
```

## Deploying

This is a Vite app with a couple of Vercel serverless functions under `api/`
(nutrition lookup, Strava OAuth). Deploying to Vercel with default settings
picks these up automatically.

## Connecting Strava (live sync)

Strava requires you to register your own free API app — there is no shared
key.

1. Go to <https://www.strava.com/settings/api> and create an app.
   - **Authorization Callback Domain**: your deployed domain (e.g.
     `your-app.vercel.app`), or `localhost` for local dev.
2. Copy the **Client ID** and **Client Secret** it gives you.
3. Set these environment variables on your deployment (e.g. Vercel Project
   Settings → Environment Variables — see `.env.example`):
   - `VITE_STRAVA_CLIENT_ID` — the Client ID (safe to expose to the browser).
   - `STRAVA_CLIENT_SECRET` — the Client Secret. **Never commit this or paste
     it into chat** — it must only live in your deployment's env vars.
4. Redeploy, open the app's **Connect** tab, and click **Connect Strava**.
   After authorizing, click **Sync latest activities** any time to pull in
   new runs/rides/swims.

## Importing Garmin data

Garmin has no public personal-use API, so import is file-based from the
**Connect** tab:

- **Bulk history**: Garmin Connect → Activities → the export icon → **Export
  CSV**. Upload the CSV in the app (pick whether your export uses km or mi —
  Garmin's CSV doesn't label the unit).
- **Single activity**: open an activity on Garmin Connect → gear icon →
  **Export Original**, which downloads a `.TCX` or `.GPX` file. Upload it the
  same way.

## Importing Apple Health data

Apple Health also has no remote API — HealthKit data only leaves the device
via a manual export:

1. On iPhone: Health app → tap your profile picture → **Export All Health
   Data** → this produces `export.zip` containing `export.xml`.
2. Unzip it and upload `export.xml` from the **Connect** tab.
3. Parsing happens entirely in your browser (nothing is uploaded anywhere)
   and can take a minute or two for large histories. It aggregates daily
   steps, active energy, heart rate, sleep, and body weight, and imports
   workouts into your exercise log.

## IRONMAN Wales progress (IM Wales tab)

Shows a red/amber/green readiness check against IRONMAN Wales (Tenby, 13 Sep
2026), per discipline (swim/bike/run) and overall. It compares your trailing
4-week average weekly volume (plus swim frequency, and longest ride/run over
6 weeks) against generic age-group full-distance training benchmarks for
whatever phase of the build you're currently in (base/build/peak/taper,
determined from weeks remaining). The thresholds live in
`src/lib/ironmanProgress.js` — these are rough coaching-guideline numbers,
not a certified personalized plan, so treat "red" as a prompt to review your
training, not a verdict.

The app ships with a one-time seed of real Strava history
(`src/data/stravaSeed.json`, ~185 activities from Feb–Jul 2026) so this tab
has real data immediately. It's merged in once on first load (tagged
`source: "strava"`, same id scheme as live sync) and won't reappear if you
delete an entry. Connecting your own Strava account (above) keeps it current
going forward.

## Data model notes

- All records (`exercise`, `weight`) carry a `source` field (`manual`,
  `strava`, `garmin`, `apple_health`) so re-syncing/re-importing never
  creates duplicates — records are upserted by a stable id.
- Apple Health daily aggregates (steps, sleep, resting heart rate, active
  energy) are stored separately per day and shown on the Summary and Trends
  tabs whenever any Health data has been imported.
