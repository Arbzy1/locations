import { useState, type FormEvent, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { authClient, signIn } from '../lib/auth';
import { startDemoSession } from '../lib/demo';
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
  const [linkSent, setLinkSent] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · Locations';
  }, []);

  const sendMagicLink = async () => {
    setError('');
    if (!email) {
      setError('Enter your email first.');
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: `${window.location.origin}/hotspots`,
      });
      if (result.error) {
        setError(result.error.message || 'Could not send sign-in link');
        return;
      }
      setLinkSent(true);
    } catch {
      setError('Unable to send sign-in link.');
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    setError('');
    if (!email) {
      setError('Enter your email first.');
      return;
    }
    setOtpLoading(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });
      if (result.error) {
        setError(result.error.message || 'Could not send sign-in code');
        return;
      }
      setOtpSent(true);
    } catch {
      setError('Unable to send sign-in code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError('');
    setOtpLoading(true);
    try {
      const result = await authClient.signIn.emailOtp({ email, otp });
      if (result.error) {
        setError(result.error.message || 'Invalid code');
      }
    } catch {
      setError('Unable to verify code.');
    } finally {
      setOtpLoading(false);
    }
  };

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
    const result = await startDemoSession();
    if (!result.ok) {
      setError(result.error);
      setDemoLoading(false);
      return;
    }
    window.location.assign('/hotspots');
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
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs text-text-muted">Or sign in without a password</p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                title="Email a one-time sign-in link"
                disabled={loading || demoLoading}
                onClick={() => void sendMagicLink()}
              >
                {linkSent ? 'Link sent' : 'Email me a sign-in link'}
              </Button>
              <Button
                type="button"
                variant="outline"
                title="Email a six-digit sign-in code"
                disabled={otpLoading || demoLoading}
                onClick={() => void sendOtp()}
              >
                {otpSent ? 'Code sent' : 'Email me a code'}
              </Button>
              {otpSent && (
                <>
                  <Label htmlFor="signin-otp">Sign-in code</Label>
                  <Input
                    id="signin-otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    title="Six-digit sign-in code from email"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                  <Button
                    type="button"
                    title="Verify sign-in code"
                    disabled={otpLoading || otp.length < 6}
                    onClick={() => void verifyOtp()}
                  >
                    {otpLoading ? 'Verifying…' : 'Verify code'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </form>
        <LegalFooter />
        <p className="mt-3 text-center text-xs">
          <Link className="text-accent hover:underline" to="/" title="Product home">
            About Locations
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
