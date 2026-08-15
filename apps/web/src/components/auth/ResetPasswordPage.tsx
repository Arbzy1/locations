import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authClient } from '../../lib/auth';
import PasswordInput from './PasswordInput';
import { Button } from '../ui/button';
import { EjectField } from '../ui/eject-field';
import AuthShell from './AuthShell';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = 'Choose a new password · Locations';
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('This reset link is missing a token. Request a new one.');
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(result.error.message || 'Could not reset password');
        return;
      }
      setDone(true);
    } catch {
      setError('Unable to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="Pick a password you have not used here before.">
      {done ? (
        <p className="text-sm text-walk">
          Password updated.{' '}
          <Link className="text-accent" to="/login" title="Sign in">
            Sign in
          </Link>
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <EjectField label="New password" htmlFor="new-password" className="mb-4">
            <PasswordInput
              id="new-password"
              required
              autoComplete="new-password"
              title="Choose a new password"
              wrapperClassName=""
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </EjectField>
          {error ? <p className="mb-3 text-sm text-train">{error}</p> : null}
          <Button type="submit" className="w-full" title="Save new password" disabled={loading}>
            {loading ? 'Saving…' : 'Save password'}
          </Button>
        </form>
      )}
      <p className="mt-4 text-center text-xs">
        <Link className="text-accent" to="/forgot" title="Request another reset email">
          Request a new link
        </Link>
      </p>
    </AuthShell>
  );
}
