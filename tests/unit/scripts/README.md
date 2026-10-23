# scripts

Unit tests for repo-root `scripts/` helpers.

- `cf-sync/`: Worker secret key derivation and bulk payload prune.
- `ensure-web-dist/`: Stub `apps/web/dist` so Wrangler can start without a Vite production build.
- `kill-servers/`: Parse Windows `netstat` LISTENING rows for `dev:kill`.
- `release/`: Semver bump, changelog promote, lockfile version sync.
- `test-report/`: Vitest JSON classification and markdown report renderer.
