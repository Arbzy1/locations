# Deploy

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npm run db:migrate
npm run deploy:prod
```

Set `BETTER_AUTH_URL` and Stripe price ids in `[vars]`. Create the R2 bucket and import queue named in `wrangler.toml`.
