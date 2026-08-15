import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authClient, signUp, continueWithGoogle } from '../../lib/auth';
import PasswordInput from './PasswordInput';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';
import AuthShell from './AuthShell';
import GoogleButton from './GoogleButton';
import { usePublicConfig } from '../../hooks/useApi';

export default function SignupPage() {
  const { data: config } = usePublicConfig();
  const googleAuth = Boolean(config?.googleAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  useEffect(() => {
    document.title = 'Create account · Locations';
  }, []);

  const verifyOtp = async () => {
    setOtpError('');
    setOtpLoading(true);
    try {
      const result = await authClient.emailOtp.verifyEmail({ email, otp });
      if (result.error) {
        setOtpError(result.error.message || 'Invalid code');
        return;
      }
      window.location.assign('/');
    } catch {
      setOtpError('Unable to verify code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signUp.email({ email, password, name: name || email.split('@')[0] });
      if (result.error) {
        setError(result.error.message || 'Sign up failed');
        return;
      }
      setDone(true);
    } catch {
      setError('Unable to sign up. Check your connection.');
    } finally {
      setLoading(false);
    }
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

  if (config?.signupDisabled) {
    return (
      <AuthShell
        title="Signup is closed"
        subtitle="New accounts are not open right now. If you already have access, sign in. Admins can still invite users."
      >
        <Button asChild className="w-full" title="Go to sign in">
          <Link to="/login">Sign in</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create account" subtitle="Verify your email before importing Timeline data.">
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-walk">
            Check your inbox for a verification link, or enter the 6-digit code we sent.
          </p>
          <EjectField label="Verification code" htmlFor="otp" className="mb-2">
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              title="Six-digit email verification code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
          </EjectField>
          {otpError ? <p className="text-sm text-train">{otpError}</p> : null}
          <Button
            type="button"
            className="w-full"
            title="Verify email with the code from your inbox"
            disabled={otpLoading || otp.length < 6}
            onClick={() => void verifyOtp()}
          >
            {otpLoading ? 'Verifying…' : 'Verify code'}
          </Button>
        </div>
      ) : (
        <>
          {googleAuth ? (
            <>
              <GoogleButton disabled={loading || googleLoading} onClick={() => void tryGoogle()} />
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-text-muted">or use email</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}
          <form onSubmit={onSubmit}>
            <EjectField label="Name" htmlFor="name">
              <Input id="name" title="Display name" value={name} onChange={(e) => setName(e.target.value)} />
            </EjectField>
            <EjectField label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                title="Account email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </EjectField>
            <EjectField label="Password" htmlFor="password" className="mb-4">
              <PasswordInput
                id="password"
                required
                autoComplete="new-password"
                title="Choose a password"
                wrapperClassName=""
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </EjectField>
            {error ? <p className="mb-3 text-sm text-train">{error}</p> : null}
            <Button type="submit" className="w-full" title="Create account" disabled={loading || googleLoading}>
              {loading ? 'Creating…' : 'Sign up'}
            </Button>
          </form>
        </>
      )}
      <p className="mt-4 text-center text-xs text-text-muted">
        Already have an account?{' '}
        <Link className="text-accent" to="/login" title="Sign in">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
