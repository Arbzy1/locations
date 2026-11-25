import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Fuel, Map as MapIcon, Play, Route } from 'lucide-react';
import { Button } from '../ui/button';
import { startDemoSession } from '../../lib/demo';
import { usePublicConfig } from '../../hooks/useApi';
import AuthShell from '../auth/AuthShell';

const HIGHLIGHTS = [
  {
    icon: MapIcon,
    title: 'Hotspots Heatmap',
    body: 'Browse years of visits by date, place, or multi-account colour layer.',
  },
  {
    icon: Route,
    title: 'Day View & GPS Rail Matching',
    body: 'Replay daily stays and journeys matched to real roads and rail lines.',
  },
  {
    icon: Compass,
    title: 'Trips & Insights',
    body: 'Automatic day trips, multi-day stories, streaks, and yearly reviews.',
  },
  {
    icon: Fuel,
    title: 'UK Journey Cost',
    body: 'Price fuel or EV charging, Clean Air Zones, ULEZ, and UK road tolls.',
  },
] as const;

export default function LandingPage() {
  const { data: config } = usePublicConfig();
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Locations';
  }, []);

  const tryDemo = async () => {
    setError('');
    setDemoLoading(true);
    const result = await startDemoSession();
    if (!result.ok) {
      setError(result.error);
      setDemoLoading(false);
      return;
    }
    window.location.assign('/hotspots');
  };

  return (
    <AuthShell
      title="Locations"
      subtitle="Turn a Google Takeout export into a private map journal: heatmaps, day views, trips, and UK journey costs."
    >
      <div className="flex flex-col gap-2">
        <Button
          asChild
          className="w-full"
          title={config?.signupDisabled ? 'Signup is closed' : 'Create an account'}
        >
          <Link to="/signup">{config?.signupDisabled ? 'Signup is closed' : 'Create account'}</Link>
        </Button>
        <Button asChild variant="outline" className="w-full" title="Sign in to your account">
          <Link to="/login">Sign in</Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full border-accent/40 bg-accent/10 text-accent"
          title="Try the public demo with sample journeys"
          onClick={() => void tryDemo()}
          disabled={demoLoading}
        >
          <Play size={16} />
          {demoLoading ? 'Starting demo…' : 'Try the demo'}
        </Button>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-train/30 bg-train/10 px-3 py-2 text-sm text-train">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {HIGHLIGHTS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="rounded-xl border border-border bg-surface/60 p-3 text-left"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-text">
                <Icon size={14} className="shrink-0 text-accent" />
                <span>{item.title}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{item.body}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild variant="ghost" title="Plans and import access">
          <Link to="/pricing">Pricing</Link>
        </Button>
        <Button asChild variant="ghost" title="Worker and database health">
          <Link to="/status">Status</Link>
        </Button>
        <Button asChild variant="ghost" title="What changed recently">
          <Link to="/changelog">Changelog</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
