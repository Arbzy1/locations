import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import MarketingLayout from './MarketingLayout';
import { usePublicConfig } from '../../hooks/useApi';
import { useSession } from '../../lib/auth';

export default function PricingPage() {
  const { data: config } = usePublicConfig();
  const { data: session } = useSession();
  const billed = Boolean(config?.billingConfigured);

  useEffect(() => {
    document.title = 'Pricing · Locations';
  }, []);

  return (
    <MarketingLayout title="Pricing">
      <p>
        Locations is a hosted Timeline explorer. Checkout runs on the server. The browser never sends a
        Stripe price id or customer id.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardTitle>Monthly</CardTitle>
          <p className="mt-2 text-sm text-text-muted">
            Billed each month through Stripe Checkout. Pause or cancel from Settings (the Stripe customer
            portal).
          </p>
        </Card>
        <Card>
          <CardTitle>Yearly</CardTitle>
          <p className="mt-2 text-sm text-text-muted">
            Same import access, billed once a year. Invoices stay in the Stripe portal.
          </p>
        </Card>
      </div>
      {billed ? (
        <p>
          When billing is enabled, Timeline import needs an active or trial subscription. Demo and staff
          accounts skip that gate. Failed payment is a read-only grace, then import turns off. Timeline
          rows are not deleted on the first failed charge.
        </p>
      ) : (
        <p>
          This deployment does not have Stripe configured. Self-host and local dev can import without a
          subscription.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {session?.user ? (
          <Button asChild title="Open Settings for billing">
            <Link to="/settings">Manage in Settings</Link>
          </Button>
        ) : (
          <>
            <Button asChild title="Create an account">
              <Link to="/signup">Sign up</Link>
            </Button>
            <Button asChild variant="outline" title="Sign in">
              <Link to="/login">Sign in</Link>
            </Button>
          </>
        )}
      </div>
    </MarketingLayout>
  );
}
