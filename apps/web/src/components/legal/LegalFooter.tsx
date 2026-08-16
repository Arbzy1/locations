import { Link } from 'react-router-dom';
import { AppVersionLink } from '../shell/AppVersion';

export function LegalFooter() {
  return (
    <p className="mt-6 text-center text-xs text-text-muted">
      <AppVersionLink />
      {' · '}
      <Link className="text-accent hover:underline" to="/privacy" title="Privacy Policy">
        Privacy
      </Link>
      {' · '}
      <Link className="text-accent hover:underline" to="/terms" title="Terms of Service">
        Terms
      </Link>
      {' · '}
      <Link className="text-accent hover:underline" to="/cookies" title="Cookie notice">
        Cookies
      </Link>
    </p>
  );
}
