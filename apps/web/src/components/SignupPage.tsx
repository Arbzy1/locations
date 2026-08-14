import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { signUp } from '../lib/auth';
import PasswordInput from './PasswordInput';
import ThemeToggle from './ThemeToggle';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { LegalFooter } from './LegalFooter';
import { enterMotion } from '../lib/motion';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

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
        <h1 className="font-display text-2xl font-semibold text-text">Create account</h1>
        <p className="mt-1 text-sm text-text-muted">Verify your email before importing Timeline data.</p>
        {done ? (
          <p className="mt-4 text-sm text-walk">Check your inbox for a verification link, then sign in.</p>
        ) : (
          <>
            <Label htmlFor="name" className="mt-4">
              Name
            </Label>
            <Input
              id="name"
              title="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Label htmlFor="email" className="mt-3">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              title="Account email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Label htmlFor="password" className="mt-3">
              Password
            </Label>
            <PasswordInput
              id="password"
              required
              autoComplete="new-password"
              title="Choose a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="mb-3 text-sm text-train">{error}</p>}
            <Button type="submit" className="w-full" title="Create account" disabled={loading}>
              {loading ? 'Creating…' : 'Sign up'}
            </Button>
          </>
        )}
        <p className="mt-4 text-center text-xs text-text-muted">
          Already have an account?{' '}
          <Link className="text-accent" to="/" title="Sign in">
            Sign in
          </Link>
        </p>
        <LegalFooter />
      </motion.form>
    </div>
  );
}
