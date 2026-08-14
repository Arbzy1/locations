import { Link } from 'react-router-dom';
import { Button } from './ui/button';
import ThemeToggle from './ThemeToggle';

export default function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg px-6 py-12 text-text">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <article className="ui-enter mx-auto max-w-2xl">
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-text-muted">{children}</div>
        <Button asChild variant="outline" className="mt-8" title="Back to sign in">
          <Link to="/">Back to sign in</Link>
        </Button>
      </article>
    </div>
  );
}
