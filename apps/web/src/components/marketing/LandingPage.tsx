import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { MapPinned, Play } from 'lucide-react';
import { Button } from '../ui/button';
import ThemeToggle from '../ThemeToggle';
import { LegalFooter } from '../LegalFooter';
import { enterMotion } from '../../lib/motion';
import { startDemoSession } from '../../lib/demo';
import { usePublicConfig } from '../../hooks/useApi';

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
    <div className="relative flex min-h-dvh w-screen items-center justify-center overflow-hidden bg-bg safe-pt safe-pb safe-px">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <motion.div className="relative z-10 w-full max-w-lg px-6" {...enterMotion}>
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <MapPinned size={28} />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Locations</h1>
          <p className="mt-2 text-sm text-text-muted">
            A private Google Timeline explorer: heatmaps, day views, and trips. Import Takeout. No live
            tracking.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button asChild className="w-full" title="Create an account">
            <Link to="/signup">{config?.signupDisabled ? 'Signup is closed' : 'Create an account'}</Link>
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
            {demoLoading ? 'Starting demo…' : 'Try the demo (sample journeys)'}
          </Button>
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-train/30 bg-train/10 px-3 py-2 text-sm text-train">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
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
        <LegalFooter />
      </motion.div>
    </div>
  );
}
