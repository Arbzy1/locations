# Changelog

## Unreleased

Transactional email catalog (verify, OTP, magic link, import and billing status) via Resend. See [docs/product/email.md](product/email.md).

Documented a product idea catalog in [docs/product/ideas.md](product/ideas.md). Not a commitment to build.

## 1.2.0

Named Wrangler environments: `locations-staging` (push to `main`) and `locations` production (manual promote). Isolated R2, import queues, Neon, and Stripe per env.

## 1.1.0

Hosted SaaS foundation: public signup (kill switch `DISABLE_SIGNUP`), Stripe billing, FORCE RLS, import queue + zip, shadcn + Motion UI, docs tree, CI, account export/delete.
