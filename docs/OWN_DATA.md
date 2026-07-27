# How to run Locations with your own Google Timeline

`locations.aden.website` is **not** a shared host for other people's data.
Clone this repo and run your own instance.

## Fast path

```bash
npm install
npm run setup          # Neon URL + sample or your JSON + admin user
npm run build:web
npm run dev:api        # http://localhost:8787
```

## Google Takeout

1. [takeout.google.com](https://takeout.google.com/) → Location History / Timeline
2. Unzip until you have a JSON **array** of objects with `startTime` / `endTime` and either `visit` or `activity`
3. Point at it:

```bash
# .env
DATA_PATH=../my-location-history.json
npm run db:import
```

`db:import` **replaces** all location tables in that Neon database (auth users are kept).

## Deploy

Use your own Worker name and domain in `wrangler.toml`, then:

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put BETTER_AUTH_SECRET
npm run deploy
```
