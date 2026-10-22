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
        Locations turns your Google Timeline export into maps, days, trips and insights. One plan,
        paid monthly or yearly.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardTitle>Monthly</CardTitle>
          <p className="mt-2 text-sm text-text-muted">
            Pay each month. Pause or cancel any time from Settings.
          </p>
        </Card>
        <Card>
          <CardTitle>Yearly</CardTitle>
          <p className="mt-2 text-sm text-text-muted">
            The same plan, paid once a year. Receipts are in Settings.
          </p>
        </Card>
      </div>
      {billed ? (
        <p>
          You need a plan (or a trial) to import. If a payment fails you can still look at everything
          for a while; only new imports pause. Your history is never deleted because of a missed
          payment.
        </p>
      ) : (
        <p>
          Payments are not switched on here, so importing is free on this site.
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
