import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/** The primary section a catalog page belongs to, for the breadcrumb back. */
const PARENTS: { prefix: string; label: string; to: string }[] = [
  { prefix: '/places/', label: 'Places', to: '/places' },
  { prefix: '/areas/', label: 'Map', to: '/hotspots' },
  { prefix: '/trips/', label: 'Trips', to: '/trips' },
  { prefix: '/month/', label: 'Days', to: '/day' },
  { prefix: '/week/', label: 'Days', to: '/day' },
  { prefix: '/corridors', label: 'Insights', to: '/insights' },
  { prefix: '/review', label: 'Insights', to: '/insights' },
];

export default function CatalogPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const parent = PARENTS.find((p) => pathname.startsWith(p.prefix));
  return (
    <div className="h-full overflow-y-auto bg-surface">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <div>
          {parent && (
            <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-sm text-text-muted">
              <Link
                to={parent.to}
                title={`Back to ${parent.label}`}
                className="inline-flex min-h-11 items-center rounded-md transition-colors duration-ui-hover ease-ui hover:text-text"
              >
                {parent.label}
              </Link>
              <ChevronRight size={14} aria-hidden />
              <span className="truncate text-text">{title}</span>
            </nav>
          )}
          <h2 className="text-xl font-semibold text-text">{title}</h2>
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
