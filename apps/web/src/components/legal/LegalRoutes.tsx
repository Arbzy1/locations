import LegalPage from './LegalPage';

export function PrivacyRoute() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        We store your account email, Timeline visits and activities, and billing identifiers. We do
        not sell location data. Email is transactional only (sign-in, import status, billing). It
        never includes coordinates, place names, or day routes.
      </p>
      <p>
        You can export or delete your account in Settings. Full policy:{' '}
        <span className="text-text">docs/legal/privacy.md</span> in the repository.
      </p>
    </LegalPage>
  );
}

export function TermsRoute() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        Upload only Timeline data you are entitled to export. Paid plans are billed by Stripe. You
        may delete your account at any time.
      </p>
    </LegalPage>
  );
}

export function CookiesRoute() {
  return (
    <LegalPage title="Cookies">
      <p>
        We use an essential session cookie, plus `locations-theme` and `locations-mood` in
        localStorage. No advertising cookies.
      </p>
    </LegalPage>
  );
}
