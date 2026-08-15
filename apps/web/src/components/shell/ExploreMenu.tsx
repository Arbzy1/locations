import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { EXPLORE_LINKS, isCatalogPath, type ExploreLink } from '../../lib/paths';
import { useSession } from '../../lib/auth';

export default function ExploreMenu({ compact, expanded }: { compact?: boolean; expanded?: boolean }) {
  const location = useLocation();
  const active = isCatalogPath(location.pathname);
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isStaff = role === 'admin' || role === 'developer';
  const isDemo = role === 'demo';
  const today = format(new Date(), 'yyyy-MM-dd');
  const month = today.slice(0, 7);

  const extra: ExploreLink[] = [
    { group: 'Time', to: `/month/${month}`, label: 'This month', title: 'Calendar and heatmap for this month' },
    { group: 'Time', to: `/week/${today}`, label: 'This week', title: 'Seven-day strip for this week' },
  ];

  const links = [...EXPLORE_LINKS, ...extra].filter((l) => {
    if (isDemo && (l.to === '/trips/new' || l.to === '/chapters')) return false;
    return true;
  });

  const groups = [...new Set(links.map((l) => l.group))];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact || expanded ? 'default' : 'icon'}
          title="Explore more pages"
          aria-label="Explore more pages"
          aria-current={active ? 'page' : undefined}
          className={
            compact
              ? `h-11 min-w-0 flex-1 flex-col gap-0.5 px-1 text-[10px] font-normal ${active ? 'bg-accent/20 text-accent' : ''}`
              : expanded
                ? `h-11 w-full justify-start gap-2 px-3 font-normal ${active ? 'bg-accent/20 text-accent' : ''}`
                : active
                  ? 'bg-accent/20 text-accent'
                  : ''
          }
        >
          <Compass size={18} />
          {(compact || expanded) && <span className={expanded ? 'truncate text-sm' : undefined}>Explore</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? 'end' : 'start'} side={compact ? 'top' : 'right'} className="max-h-[70vh] overflow-y-auto">
        {groups.map((group) => (
          <div key={group} className="mb-1">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{group}</p>
            {links
              .filter((l) => l.group === group)
              .map((l) => (
                <DropdownMenuItem key={l.to} asChild title={l.title}>
                  <Link to={l.to} className="flex h-11 items-center px-3 text-sm">
                    {l.label}
                  </Link>
                </DropdownMenuItem>
              ))}
          </div>
        ))}
        {isStaff && (
          <DropdownMenuItem asChild title="Open the Admin panel">
            <Link to="/admin" className="flex h-11 items-center px-3 text-sm">
              Admin
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
