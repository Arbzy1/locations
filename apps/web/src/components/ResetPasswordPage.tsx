import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { authClient } from '../lib/auth';
import PasswordInput from './PasswordInput';
import ThemeToggle from './ThemeToggle';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { LegalFooter } from './LegalFooter';
import { enterMotion } from '../lib/motion';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

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
    <div className="relative flex h-dvh w-screen items-center justify-center bg-bg safe-pt safe-pb safe-px">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <motion.form
        {...enterMotion}
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
      >
        <h1 className="font-display text-2xl font-semibold text-text">Choose a new password</h1>
        {done ? (
          <p className="mt-4 text-sm text-walk">
            Password updated.{' '}
            <Link className="text-accent" to="/" title="Sign in">
              Sign in
            </Link>
          </p>
        ) : (
          <>
            <Label htmlFor="new-password" className="mt-4">
              New password
            </Label>
            <PasswordInput
              id="new-password"
              required
              autoComplete="new-password"
              title="Choose a new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="mb-3 text-sm text-train">{error}</p>}
            <Button type="submit" className="w-full" title="Save new password" disabled={loading}>
              {loading ? 'Saving…' : 'Save password'}
            </Button>
          </>
        )}
        <p className="mt-4 text-center text-xs">
          <Link className="text-accent" to="/forgot" title="Request another reset email">
            Request a new link
          </Link>
        </p>
        <LegalFooter />
      </motion.form>
    </div>
  );
}
