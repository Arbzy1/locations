import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authClient } from '../../lib/auth';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';
import AuthShell from './AuthShell';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = 'Reset password · Locations';
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) {
        setError(result.error.message || 'Could not send reset email');
        return;
      }
      setDone(true);
    } catch {
      setError('Unable to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Reset password" subtitle="We will email a reset link if that address has an account.">
      {done ? (
        <p className="text-sm text-walk">If that email exists, we sent a reset link.</p>
      ) : (
        <form onSubmit={onSubmit}>
          <EjectField label="Email" htmlFor="email" className="mb-4">
            <Input
              id="email"
              type="email"
              required
              title="Account email for password reset"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </EjectField>
          {error ? <p className="mb-3 text-sm text-train">{error}</p> : null}
          <Button type="submit" className="w-full" title="Send reset link" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <p className="mt-4 text-center text-xs">
        <Link className="text-accent" to="/login" title="Back to sign in">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
