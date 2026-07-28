# How to run Locations with your own Google Timeline

Each signed-in app user gets an isolated dataset (tenant = their user id).
Within that dataset you can attach **multiple Google accounts** as labeled sources;
the map and insights always show the merged view.

Signup stays invite-only (`disableSignUp`). Create users with:

```bash
npm run auth:create-user -- you@example.com 'your-password' YourName
```

## Fast path

```bash
npm install
npm run setup:project  # Neon URL + sample demo data + admin user
npm run db:migrate     # includes data_sources / import_jobs
npm run build:web
npm run dev:api        # http://localhost:8787
```

Sign in, open **Data sources** (database icon in the sidebar), and upload a Timeline JSON.
Or import from the CLI (below).

## Google Takeout format

1. [takeout.google.com](https://takeout.google.com/) → **Location History / Timeline** only  
2. Unzip until you have a JSON **array** of objects with `startTime` / `endTime` and either `visit` or `activity` (`geo:lat,lon` coordinates)  
3. **Not enough:** `Timeline/Settings.json` alone (especially if `timelineEnabled` is false), Mail `.mbox`, or zip archives via the UI

You can repeat this for each Google account and import each file as a separate source.

## Import via the website

1. Sign in (non-demo account)
2. Open **Settings** (gear icon in the sidebar)
3. Under **Timeline data**, choose a JSON file and upload — or click **Re-upload** on an existing source to replace it
4. Wait for the import status; map views refresh when ready

Demo accounts cannot import.

## Import via CLI

```bash
# One Google account export for an app user
npm run db:import -- --email you@example.com --path ./timeline-personal.json --source "personal@gmail.com"

# Another Google account into the same app user (merged view)
npm run db:import -- --email you@example.com --path ./timeline-work.json --source "work@company.com"

# Demo sample data
npm run db:import-demo
```

`--source` creates the source if needed, then replaces only that source’s visits/activities and rebuilds day stats / analytics for the whole tenant.

Files over ~80MB should use the CLI (UI has a soft size limit).

## Deploy

Use your own Worker name and domain in `wrangler.toml`, create the R2 bucket `locations-uploads` (or change the binding), then:

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put BETTER_AUTH_SECRET
npm run db:migrate
npm run deploy:prod
```
