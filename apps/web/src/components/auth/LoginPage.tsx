import { useState, type FormEvent, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { authClient, signIn, continueWithGoogle } from '../../lib/auth';
import { startDemoSession } from '../../lib/demo';
import { Play } from 'lucide-react';
import PasswordInput from './PasswordInput';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';
import AuthShell from './AuthShell';
import GoogleButton from './GoogleButton';
import { usePublicConfig } from '../../hooks/useApi';

export default function LoginPage() {
  const { data: config } = usePublicConfig();
  const googleAuth = Boolean(config?.googleAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [passwordless, setPasswordless] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · Locations';
  }, []);

  const busy = loading || demoLoading || googleLoading;

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

  const tryGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const result = await continueWithGoogle();
      if (result.error) {
        setError(result.error.message || 'Google sign-in failed');
        setGoogleLoading(false);
      }
    } catch {
      setError('Unable to start Google sign-in.');
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Your Google Timeline, private, as a map journal.">
      {googleAuth ? (
        <GoogleButton disabled={busy} onClick={() => void tryGoogle()} />
      ) : null}

      <Button
        type="button"
        variant="outline"
        className={`w-full border-accent/40 bg-accent/10 text-accent ${googleAuth ? 'mt-3' : ''}`}
        title="Try the public demo with sample journeys"
        onClick={() => void tryDemo()}
        disabled={busy}
      >
        <Play size={16} />
        {demoLoading ? 'Starting demo…' : 'Try the demo'}
      </Button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-text-muted">or use email</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit}>
        <EjectField label="Email" htmlFor="email" className="mb-4">
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            title="Your account email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </EjectField>
        <EjectField label="Password" htmlFor="password" className="mb-4">
          <PasswordInput
            id="password"
            required
            autoComplete="current-password"
            title="Your account password"
            wrapperClassName=""
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </EjectField>
        {error ? (
          <p className="mb-4 rounded-lg border border-train/30 bg-train/10 px-3 py-2 text-sm text-train">{error}</p>
        ) : null}
        <Button type="submit" className="w-full" title="Sign in" disabled={busy}>
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

      <Button
        type="button"
        variant="ghost"
        className="mt-4 w-full justify-center text-text-muted"
        title="Sign in with a magic link or email code"
        onClick={() => setPasswordless((open) => !open)}
      >
        {passwordless ? 'Hide passwordless options' : 'Sign in without a password'}
      </Button>
      {passwordless ? (
        <div className="mt-2 flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            title="Email a one-time sign-in link"
            disabled={busy}
            onClick={() => void sendMagicLink()}
          >
            {linkSent ? 'Link sent' : 'Email me a sign-in link'}
          </Button>
          <Button
            type="button"
            variant="outline"
            title="Email a six-digit sign-in code"
            disabled={otpLoading || demoLoading || googleLoading}
            onClick={() => void sendOtp()}
          >
            {otpSent ? 'Code sent' : 'Email me a code'}
          </Button>
          {otpSent ? (
            <>
              <EjectField label="Sign-in code" htmlFor="signin-otp">
                <Input
                  id="signin-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  title="Six-digit sign-in code from email"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </EjectField>
              <Button
                type="button"
                title="Verify sign-in code"
                disabled={otpLoading || otp.length < 6}
                onClick={() => void verifyOtp()}
              >
                {otpLoading ? 'Verifying…' : 'Verify code'}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="mt-4 text-center text-xs">
        <Link className="text-accent hover:underline" to="/" title="Product home">
          About Locations
        </Link>
      </p>
    </AuthShell>
  );
}
