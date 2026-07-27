#!/usr/bin/env node
/**
 * Interactive-ish deploy helper. Run: node scripts/deploy-setup.mjs
 * Or follow README and use: npm run deploy
 */
import { execSync } from "node:child_process";

console.log(`
Locations deploy checklist
==========================
1. Create a Neon project and copy DATABASE_URL
2. Create .env and .dev.vars with:
     DATABASE_URL=...
     BETTER_AUTH_SECRET=<long random string>
     BETTER_AUTH_URL=https://locations.aden.website
     DATA_PATH=../location-history.json
3. npm run db:migrate
4. npm run db:import
5. npm run auth:create-user -- you@email.com 'password' Aden admin
6. npx wrangler login
7. npx wrangler secret put DATABASE_URL
8. npx wrangler secret put BETTER_AUTH_SECRET
9. npm run deploy
10. Cloudflare dashboard → Workers → locations → Custom Domains
    → add locations.aden.website (CNAME for aden.website zone)
`);

try {
  execSync("npx wrangler whoami", { stdio: "inherit" });
} catch {
  console.log("\nNot logged in yet. Run: npx wrangler login\n");
}
