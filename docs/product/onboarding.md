# Onboarding

1. Create an account (email + password).
2. Verify the email link before importing.
3. Open Settings (or the empty-state CTA) and upload Timeline JSON or a Takeout zip.
4. Wait for import status (visit/activity counts). Map views refresh when the job is `ready`.
5. Optionally start a subscription from Settings if import is gated on a paid plan.

Units (miles/km) and timezone preference are stored per account under Settings.

If signup is disabled (`DISABLE_SIGNUP=true`), an operator creates users with `npm run auth:create-user`.
