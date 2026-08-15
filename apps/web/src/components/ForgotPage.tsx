import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { authClient } from '../lib/auth';
import ThemeToggle from './ThemeToggle';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { LegalFooter } from './LegalFooter';
import { enterMotion } from '../lib/motion';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

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
    <div className="relative flex h-dvh w-screen items-center justify-center bg-bg safe-pt safe-pb safe-px">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <motion.form
        {...enterMotion}
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
      >
        <h1 className="font-display text-2xl font-semibold text-text">Reset password</h1>
        {done ? (
          <p className="mt-4 text-sm text-walk">If that email exists, we sent a reset link.</p>
        ) : (
          <>
            <Label htmlFor="email" className="mt-4">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              required
              title="Account email for password reset"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4"
            />
            {error && <p className="mb-3 text-sm text-train">{error}</p>}
            <Button type="submit" className="w-full" title="Send reset link" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
          </>
        )}
        <p className="mt-4 text-center text-xs">
          <Link className="text-accent" to="/login" title="Back to sign in">
            Back to sign in
          </Link>
        </p>
        <LegalFooter />
      </motion.form>
    </div>
  );
}
