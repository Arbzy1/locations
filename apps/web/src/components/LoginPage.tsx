import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { signIn } from '../lib/auth';
import { MapPinned, Lock, Play } from 'lucide-react';
import PasswordInput from './PasswordInput';
import ThemeToggle from './ThemeToggle';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { LegalFooter } from './LegalFooter';
import { enterMotion } from '../lib/motion';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message || 'Sign in failed');
      }
    } catch {
      setError('Unable to sign in. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const tryDemo = async () => {
    setError('');
    setDemoLoading(true);
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || 'Demo unavailable right now');
        return;
      }
      window.location.assign('/hotspots');
    } catch {
      setError('Unable to start demo. Try again shortly.');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="relative flex h-dvh w-screen items-center justify-center overflow-hidden bg-bg safe-pt safe-pb safe-px">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <motion.div className="relative z-10 w-full max-w-md px-6" {...enterMotion}>
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <MapPinned size={28} />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Locations</h1>
          <p className="mt-2 text-sm text-text-muted">Your Google Timeline, private, as a map journal</p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="mb-4 w-full border-accent/40 bg-accent/10 text-accent"
          title="Try the public demo with sample journeys"
          onClick={() => void tryDemo()}
          disabled={demoLoading || loading}
        >
          <Play size={16} />
          {demoLoading ? 'Starting demo…' : 'Try the demo (sample journeys)'}
        </Button>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-border bg-surface/90 p-6 shadow-2xl backdrop-blur"
        >
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-wider text-text-muted">
            <Lock size={12} />
            Sign in
          </div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            title="Your account email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4"
          />
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            required
            autoComplete="current-password"
            title="Your account password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="mb-4 rounded-lg border border-train/30 bg-train/10 px-3 py-2 text-sm text-train">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" title="Sign in" disabled={loading || demoLoading}>
            {loading ? 'Signing in…' : 'Enter'}
          </Button>
          <div className="mt-3 flex justify-between text-xs">
            <Link className="text-accent hover:underline" to="/signup" title="Create an account">
              Create account
            </Link>
            <Link className="text-accent hover:underline" to="/forgot" title="Reset your password">
              Forgot password
            </Link>
          </div>
        </form>
        <LegalFooter />
      </motion.div>
    </div>
  );
}
