#!/usr/bin/env node
/**
 * Interactive-ish deploy helper. Run: node scripts/deploy-setup.mjs
 * Deploys: npm run deploy:staging then, when ready, npm run deploy:prod
 */
import { execSync } from "node:child_process";

console.log(`
Locations deploy checklist (staging + production)
=================================================
Cloudflare account is the one in wrangler.toml. Staging and production
are named Wrangler environments. Top-level config is wrangler dev only.

1. Neon: create a staging database (or branch). Do not reuse prod DATABASE_URL.
2. Migrate both:
     npm run db:migrate:staging
     npm run db:migrate:prod
   (fill `.env.staging` / `.env.production` first)
3. Cloudflare (if not already created):
     npx wrangler r2 bucket create locations-uploads-staging
     npx wrangler queues create locations-imports-staging
     npx wrangler queues create locations-imports
4. Secrets, staging first (test-mode Stripe), then production (live Stripe):
     npm run secrets:generate -- --env staging
     npm run cf:sync:staging
     npm run secrets:generate -- --env production
     npm run cf:sync:prod
     # or: npm run cf:sync   (staging + production from .env files)
   Staging Stripe webhook: https://locations-staging.aden.website/api/billing/webhook
5. npx wrangler login (if needed)
6. npm run deploy:staging
   Confirm https://locations-staging.aden.website/api/health
7. npm run deploy:prod
   Confirm https://locations.aden.website/api/health
   (or npm run deploy:both to build once and deploy staging then production)
8. GitHub repository secrets (not Worker secrets):
     CLOUDFLARE_API_TOKEN
     CLOUDFLARE_ACCOUNT_ID
   Push to main deploys staging. Production is workflow_dispatch only.

Never put DATABASE_URL in GitHub Actions. Never wrangler deploy without --env.
`);

try {
  execSync("npx wrangler whoami", { stdio: "inherit" });
} catch {
  console.log("\nNot logged in yet. Run: npx wrangler login\n");
}
