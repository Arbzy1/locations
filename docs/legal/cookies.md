# Cookies and browser storage

## Essential and optional storage
The inventory below describes first-party app storage, its purpose and lifetime. HTTPS Better Auth cookie names have the __Secure- prefix; development HTTP names do not. Session cookies are HttpOnly, SameSite=Lax and Secure on HTTPS. Remember-me choices can shorten the normal session lifetime. OAuth security state is used only if Google sign-in is configured. Session/account cookie caches are not enabled in the current auth configuration.

Authentication and the storage-choice record are necessary for the features requested or to remember your privacy choice. All listed preference persistence is optional and off until you choose Allow saved preferences. Rejecting it leaves the app usable with preferences held in page memory. No analytics or advertising trackers are installed by the application. There is no sessionStorage use in the application source.

Use Storage choices on any page to allow, refuse or withdraw optional persistence equally easily. Withdrawal removes app preference keys, including recent places and the last estimate. It does not sign you out, erase server history, or delete downloaded files. Persistent localStorage has no automatic expiry; browser cleanup also removes it. Shared-device users should reject saved preferences and sign out when finished. Browser controls can block essential cookies but sign-in may then fail.

## Third-party services
Stripe-hosted checkout/portal and Google OAuth run on their own sites and disclose their own storage. Map requests can disclose your IP and viewport to the configured tile provider without setting an app cookie. The operator must review deployed vendor storage and update this inventory before adding optional third-party scripts. See Service providers and Privacy for recipients and transfer details.
