# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue.

Include what you found, how to reproduce it, and what an attacker could do with it. Please do not access, change or download other people's data while testing; use your own account or the public demo.

We aim to acknowledge reports within a few days and will keep you updated until a fix is released.

## Scope

- The hosted app at https://locations.aden.website and its API (`/api/*`)
- This repository's code

Out of scope: denial of service, automated scanner output without a working impact, and issues in third-party services (Cloudflare, Neon, Google, OpenStreetMap services).

## How the app is protected

See [security/README.md](security/README.md): tenant isolation in the app and with Postgres FORCE row-level security, verified email before import, no location data in logs or email, and the automated security checks that run in CI.
