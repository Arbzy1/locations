import { useState, type FormEvent } from 'react';
import { signIn } from '../lib/auth';
import { MapPinned, Lock, ExternalLink } from 'lucide-react';

const GITHUB_URL = 'https://github.com/Arbzy1/locations';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-bg">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(88,166,255,0.25), transparent), radial-gradient(circle at 20% 80%, rgba(188,140,255,0.12), transparent 40%), radial-gradient(circle at 80% 60%, rgba(63,185,80,0.08), transparent 35%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(#30363d 1px, transparent 1px), linear-gradient(90deg, #30363d 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <MapPinned size={28} />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text">
            Locations
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Private map journal — invite only
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-border bg-surface/90 p-6 shadow-2xl backdrop-blur"
        >
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-wider text-text-muted">
            <Lock size={12} />
            Sign in
          </div>

          <label className="mb-1 block text-xs text-text-muted">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none ring-accent focus:ring-1"
          />

          <label className="mb-1 block text-xs text-text-muted">Password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none ring-accent focus:ring-1"
          />

          {error && (
            <p className="mb-4 rounded-lg border border-train/30 bg-train/10 px-3 py-2 text-sm text-train">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-[#0d1117] transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Enter'}
          </button>
        </form>

        <div className="mt-6 rounded-xl border border-border/80 bg-surface/50 px-4 py-3 text-center">
          <p className="text-xs text-text-muted">
            Want to explore <span className="text-text">your</span> Google Timeline?
            This site is a private demo — fork the project and run it with your own data.
          </p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
          >
            <ExternalLink size={16} />
            Deploy your own on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
