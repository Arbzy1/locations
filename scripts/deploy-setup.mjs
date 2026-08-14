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
     npm run db:migrate -- --env staging
     npm run db:migrate -- --env production
   (fill `.env.staging` / `.env.production` first)
3. Cloudflare (if not already created):
     npx wrangler r2 bucket create locations-uploads-staging
     npx wrangler queues create locations-imports-staging
     npx wrangler queues create locations-imports
4. Secrets, staging first (test-mode Stripe), then production (live Stripe):
     npx wrangler secret put DATABASE_URL --env staging
     npx wrangler secret put BETTER_AUTH_SECRET --env staging
     npx wrangler secret put RESEND_API_KEY --env staging
     npx wrangler secret put DEMO_EMAIL --env staging
     npx wrangler secret put DEMO_PASSWORD --env staging
     npx wrangler secret put STRIPE_SECRET_KEY --env staging
     npx wrangler secret put STRIPE_WEBHOOK_SECRET --env staging
     npx wrangler secret put STRIPE_PRICE_MONTHLY --env staging
     npx wrangler secret put STRIPE_PRICE_YEARLY --env staging
     # repeat with --env production
   Staging Stripe webhook: https://locations-staging.aden.website/api/billing/webhook
5. npx wrangler login (if needed)
6. npm run deploy:staging
   Confirm https://locations-staging.aden.website/api/health
7. npm run deploy:prod
   Confirm https://locations.aden.website/api/health
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
