import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import MarketingLayout from './MarketingLayout';
import { usePublicConfig } from '../../hooks/useApi';
import { useSession } from '../../lib/auth';
import type { PublicPricingInfo } from '../../types';

const FREE_FEATURES = [
  '1 Google Timeline source',
  'Up to 20 MB per upload and 150k rows',
  'Hotspots heatmap, Day View, Trips, Places, and Insights',
  'UK Journey Cost route estimates',
] as const;

const PLAN_FEATURES = [
  'Up to 20 Google Timeline sources with multi-account merge',
  'Up to 80 MB per upload and 1M rows',
  'Full GDPR ZIP archive plus GPX and GeoJSON exports',
  'UK Journey Cost garage, fuel calibration, and saved history',
  'Background road-route pre-warming',
] as const;

export default function PricingPage() {
  const { data: config } = usePublicConfig();
  const { data: session } = useSession();
  const billed = Boolean(config?.billingConfigured);
  const pricing = (config as { pricing?: PublicPricingInfo } | undefined)?.pricing;
  const monthlyLabel = pricing?.monthlyLabel ?? '£4 / month';
  const yearlyLabel = pricing?.yearlyLabel ?? '£36 / year';

  useEffect(() => {
    document.title = 'Pricing · Locations';
  }, []);

  return (
    <MarketingLayout title="Pricing">
      <p>
        Locations turns your Google Timeline export into private maps, day views, trips, and insights,
        plus UK Journey Cost estimates. Choose monthly or yearly billing with full control from Settings.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Monthly</CardTitle>
              <Badge title="Flexible monthly renewal">Flexible</Badge>
            </div>
            <p className="mt-2 font-display text-2xl font-semibold text-text">{monthlyLabel}</p>
            <p className="mt-2 text-sm text-text-muted">
              Pay month to month. Pause or cancel renewal any time from Billing Settings.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between border-accent/40">
          <div>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Yearly</CardTitle>
              <Badge className="border-accent/40 bg-accent/10 text-accent" title="Best value annual billing">
                Save 25%
              </Badge>
            </div>
            <p className="mt-2 font-display text-2xl font-semibold text-text">{yearlyLabel}</p>
            <p className="mt-2 text-sm text-text-muted">
              Every plan feature billed once a year, with VAT/tax receipts in the Stripe portal.
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 pt-2 sm:grid-cols-2">
        <Card>
          <CardTitle className="text-base">Free / Trial tier</CardTitle>
          <p className="mt-1 text-xs text-text-muted">1 source, 20 MB, 150k rows</p>
          <ul className="mt-3 space-y-2 text-sm text-text">
            {FREE_FEATURES.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-text-muted" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="border-accent/30">
          <CardTitle className="text-base">Locations Plan</CardTitle>
          <p className="mt-1 text-xs text-text-muted">20 sources, 80 MB, 1M rows</p>
          <ul className="mt-3 space-y-2 text-sm text-text">
            {PLAN_FEATURES.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-walk" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {billed ? (
        <p>
          An active plan (or trial) unlocks Timeline imports and multi-source quotas. If a renewal
          payment fails, your maps remain open in read-only grace while new imports pause; your
          history is never deleted because of a missed charge.
        </p>
      ) : (
        <p>
          Paid checkout is not enabled on this deployment, so Timeline imports are open without a
          subscription here.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {session?.user ? (
          <Button asChild title="Open Billing Settings">
            <Link to="/settings?section=billing">Manage in Settings</Link>
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
