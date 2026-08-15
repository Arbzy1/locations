import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MapPinned } from 'lucide-react';
import { Button } from '../ui/button';
import ThemeToggle from '../shell/ThemeToggle';
import { LegalFooter } from '../legal/LegalFooter';
import { useSession } from '../../lib/auth';

const NAV = [
  { to: '/pricing', label: 'Pricing', title: 'Plans and import access' },
  { to: '/status', label: 'Status', title: 'Worker and database health' },
  { to: '/changelog', label: 'Changelog', title: 'What changed recently' },
] as const;

export default function MarketingLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-sm safe-pt">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 sm:px-6">
          <Button asChild variant="ghost" className="h-11 min-w-0 shrink-0 gap-2 px-2" title="Locations home">
            <Link to={signedIn ? '/hotspots' : '/'}>
              <MapPinned size={18} className="text-accent" />
              <span className="font-display font-semibold">Locations</span>
            </Link>
          </Button>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Product">
            {NAV.map((item) => (
              <Button key={item.to} asChild variant="ghost" size="sm" title={item.title}>
                <Link to={item.to}>{item.label}</Link>
              </Button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle className="h-11 w-11" />
            {signedIn ? (
              <Button asChild title="Open the explorer">
                <Link to="/hotspots">Open app</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" title="Sign in">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild title="Create an account">
                  <Link to="/signup">Sign up</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-text-muted">{children}</div>
        <LegalFooter />
      </main>
    </div>
  );
}
