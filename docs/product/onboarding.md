# Onboarding

1. Create an account (email + password), or use the closed-signup page if `DISABLE_SIGNUP=true`.
2. Verify with the email link or the 6-digit code before importing. The in-app `/onboarding` checklist covers this.
3. Open Settings (or the empty-state CTA) and upload Timeline JSON or a Takeout zip.
4. Wait for import status (visit/activity counts). Map views refresh when the job is `ready`. You also get a status email (counts only, no map details).
5. Optionally start a subscription from Settings if import is gated on a paid plan.

You can sign in with a password, a one-time link, or a 6-digit code. Change email or password from Settings.

Units (miles/km) and timezone preference are stored per account under Settings.

If signup is disabled (`DISABLE_SIGNUP=true`), `/signup` explains that new accounts are closed. An operator creates users with `npm run auth:create-user`.
