# Contributing

Thanks for taking a look. The full rules live in [`AGENTS.md`](AGENTS.md) (they also drive the AI coding tools); this is the short version.

## Getting started

```bash
npm install
npm run setup:project
npm run dev:all
```

See [docs/engineering/local-setup.md](docs/engineering/local-setup.md) for details.

## How we work

- **One branch per change, one pull request.** Branch from an up-to-date `master`.
- **npm only.** Do not add another lockfile.
- **Tests live in `tests/`**, never next to source. `npm run test:placement` checks it. New `/api/*` routes need integration tests (signed out, owner, another account, demo) and a row in `tests/helpers/api-route-catalog.ts`.
- **Before opening a PR:** `npm run typecheck:all`, `npm run test:unit`, `npm run test:integration`, and `npm run build:web`.
- **UI:** shadcn/ui primitives, Motion springs and a `title` on every control, theme tokens only (both dark and light must work), a sheet layout below `lg`, and touch targets of at least 44 px.
- **Writing:** no em dashes anywhere (code, comments, docs, UI copy, commits).

## Privacy

This app handles people's location history.

- Never commit Takeout exports, `.env*` or `.dev.vars*` files, or database credentials. Use the synthetic data in `tests/fixtures/` and `data/sample-location-history.json`.
- Never put real coordinates, place names or trips in code, tests, docs, commits, issues or pull requests.
- Never log coordinates, place names or Timeline payloads, or send them in email.
- Every query stays scoped to the signed-in account and Postgres row-level security.

## Security issues

Please do not open a public issue for a vulnerability. See [docs/SECURITY.md](docs/SECURITY.md).
