import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Dialog, DialogContent } from '../ui/dialog';
import { Sheet, SheetContent } from '../ui/sheet';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useDays, usePlaceLabels, useSearch } from '../../hooks/useApi';
import { EXPLORE_LINKS, placePath } from '../../lib/nav/paths';
import {
  chordTarget,
  isPasswordField,
  isTypingTarget,
  parseCommandQuery,
} from '../../lib/nav/command-query';
import { gpsHotspotsPath, hasSavableFilters } from '../../lib/nav/view-search-params';
import {
  deleteFilterPreset,
  loadFilterPresets,
  loadRecentPlaces,
  rememberRecentPlace,
  saveFilterPreset,
  type FilterPreset,
  type RecentPlace,
} from '../../lib/nav/nav-memory';

type Row = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  title: string;
  to: string;
  remember?: { cluster: string; label: string };
};

const TAB_PAGES = [
  { to: '/hotspots', label: 'Hotspots', title: 'Open Hotspots' },
  { to: '/day', label: 'Day View', title: 'Open Day View' },
  { to: '/trips', label: 'Day Trips', title: 'Open Day Trips' },
  { to: '/insights', label: 'Insights', title: 'Open Insights' },
  { to: '/settings', label: 'Settings', title: 'Open Settings' },
];

const HINT_ROWS: Row[] = [
  {
    id: 'hint-k',
    group: 'Hints',
    label: 'Ctrl/Cmd+K opens search',
    title: 'Keyboard shortcut for search',
    to: '',
  },
  {
    id: 'hint-g',
    group: 'Hints',
    label: 'g then h, d, t, i, e, or s jumps pages',
    title: 'Keyboard chords for main pages',
    to: '',
  },
  {
    id: 'hint-brackets',
    group: 'Hints',
    label: '[ and ] previous and next day',
    title: 'Hop days in Day View',
    to: '',
  },
  {
    id: 'hint-query',
    group: 'Hints',
    label: 'Type a date, month, or lat,lon to jump',
    title: 'Dates and GPS in the search box',
    to: '',
  },
];

function matchPage(q: string, label: string, title: string) {
  const n = q.toLowerCase();
  return label.toLowerCase().includes(n) || title.toLowerCase().includes(n);
}

export default function CommandPalette() {
  const { isDesktop } = useBreakpoint();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [recents, setRecents] = useState<RecentPlace[]>([]);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = parseCommandQuery(q);
  const searchQ = parsed.kind === 'text' ? parsed.q : '';
  const { data } = useSearch(searchQ);
  const { data: days = [] } = useDays();
  const { data: labels } = usePlaceLabels();
  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of labels ?? []) {
      if (!row.hidden) map.set(row.placeKey, row.label);
    }
    return map;
  }, [labels]);

  const refreshMemory = useCallback(() => {
    setRecents(loadRecentPlaces());
    setPresets(loadFilterPresets());
  }, []);

  useEffect(() => {
    if (open) {
      refreshMemory();
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQ('');
      setSaving(false);
      setPresetName('');
    }
  }, [open, refreshMemory]);

  const go = useCallback(
    (to: string, remember?: { cluster: string; label: string }) => {
      if (!to) return;
      if (remember) rememberRecentPlace(remember.cluster, remember.label);
      setOpen(false);
      void navigate(to);
    },
    [navigate],
  );

  const rows = useMemo(() => {
    if (parsed.kind === 'help') return HINT_ROWS;
    const out: Row[] = [];
    if (parsed.kind === 'day') {
      out.push({
        id: `day-${parsed.date}`,
        group: 'Jump',
        label: parsed.date,
        hint: 'Day View',
        title: `Open ${parsed.date}`,
        to: `/day/${parsed.date}`,
      });
    }
    if (parsed.kind === 'month') {
      out.push({
        id: `month-${parsed.ym}`,
        group: 'Jump',
        label: parsed.ym,
        hint: 'Month',
        title: `Open month ${parsed.ym}`,
        to: `/month/${parsed.ym}`,
      });
    }
    if (parsed.kind === 'gps') {
      const search = location.pathname === '/hotspots' ? location.search : '';
      out.push({
        id: `gps-${parsed.lat}-${parsed.lon}`,
        group: 'Actions',
        label: 'Jump to coordinates',
        hint: 'Pan map',
        title: 'Jump to these coordinates',
        to: gpsHotspotsPath(parsed.lat, parsed.lon, search),
      });
    }
    if (parsed.kind === 'empty' || parsed.kind === 'text') {
      const needle = parsed.kind === 'text' ? parsed.q : '';
      for (const r of recents) {
        if (needle && !r.label.toLowerCase().includes(needle.toLowerCase()) && !r.cluster.toLowerCase().includes(needle.toLowerCase())) {
          continue;
        }
        out.push({
          id: `recent-${r.cluster}`,
          group: 'Recents',
          label: r.label,
          hint: 'Recent',
          title: `Open ${r.label}`,
          to: placePath(r.cluster),
          remember: { cluster: r.cluster, label: r.label },
        });
      }
    }
    if (parsed.kind === 'text' || parsed.kind === 'empty') {
      for (const p of (data?.places ?? []).slice(0, 8)) {
        const name = p.label || (p.cluster && labelByKey.get(p.cluster)) || p.cluster;
        out.push({
          id: `place-${p.cluster}-${p.date}`,
          group: 'Places',
          label: name,
          hint: p.date,
          title: `Open place ${name}`,
          to: placePath(p.cluster),
          remember: { cluster: p.cluster, label: name },
        });
      }
      for (const d of (data?.days ?? []).slice(0, 5)) {
        out.push({
          id: `api-day-${d.date}`,
          group: 'Days',
          label: d.date,
          title: `Open ${d.date}`,
          to: `/day/${d.date}`,
        });
      }
    }
    const pageNeedle = parsed.kind === 'text' ? parsed.q : '';
    const pages = [...TAB_PAGES, ...EXPLORE_LINKS.map((l) => ({ to: l.to, label: l.label, title: l.title }))];
    for (const page of pages) {
      if (pageNeedle && !matchPage(pageNeedle, page.label, page.title)) continue;
      if (!pageNeedle && parsed.kind !== 'empty') continue;
      if (parsed.kind === 'empty' && TAB_PAGES.some((t) => t.to === page.to) === false && pageNeedle === '') {
        continue;
      }
      out.push({
        id: `page-${page.to}`,
        group: 'Pages',
        label: page.label,
        title: page.title,
        to: page.to,
      });
    }
    if (parsed.kind === 'empty') {
      for (const p of presets) {
        out.push({
          id: `preset-${p.name}`,
          group: 'Presets',
          label: p.name,
          hint: p.path,
          title: `Apply preset ${p.name}`,
          to: p.path,
        });
      }
    }
    if (parsed.kind === 'empty') {
      out.push(...HINT_ROWS);
    }
    const seen = new Set<string>();
    return out.filter((r) => {
      if (seen.has(r.id)) return false;
      if (r.to && seen.has(r.to)) return false;
      seen.add(r.id);
      if (r.to) seen.add(r.to);
      return true;
    });
  }, [parsed, recents, presets, data, location.pathname, location.search, labelByKey]);

  useEffect(() => {
    setActive(0);
  }, [q, rows.length]);

  const choose = useCallback(
    (row: Row) => {
      go(row.to, row.remember);
    },
    [go],
  );

  useEffect(() => {
    let pendingG = false;
    let timer = 0;
    const onKey = (e: KeyboardEvent) => {
      if (isPasswordField(e.target)) return;
      const metaK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (metaK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (open) return;
      if (isTypingTarget(e.target)) return;
      if (pendingG) {
        pendingG = false;
        window.clearTimeout(timer);
        const dest = chordTarget(e.key);
        if (!dest) return;
        e.preventDefault();
        if (dest === '/day') {
          const last = days[days.length - 1]?.date;
          void navigate(last ? `/day/${last}` : '/day');
          return;
        }
        void navigate(dest);
        return;
      }
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        pendingG = true;
        timer = window.setTimeout(() => {
          pendingG = false;
        }, 500);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [open, days, navigate]);

  const onBoxKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (saving) {
        const path = `${location.pathname}${location.search}`;
        setPresets(saveFilterPreset(presetName, path));
        setSaving(false);
        setPresetName('');
        return;
      }
      const row = rows[active];
      if (row) choose(row);
    } else if (e.key === 'Escape') {
      if (saving) {
        setSaving(false);
        return;
      }
      setOpen(false);
    }
  };

  const savable = hasSavableFilters(location.pathname, location.search);

  const body = (
    <div className="flex max-h-[min(70dvh,28rem)] flex-col">
      <EjectField
        label={saving ? 'Preset name' : 'Search places, dates, pages'}
        htmlFor="command-palette-q"
      >
        <Input
          id="command-palette-q"
          ref={inputRef}
          value={saving ? presetName : q}
          onChange={(e) => (saving ? setPresetName(e.target.value) : setQ(e.target.value))}
          onKeyDown={onBoxKey}
          title={saving ? 'Preset name' : 'Search places, dates, and pages'}
          autoComplete="off"
        />
      </EjectField>
      {saving ? (
        <p className="mt-2 text-xs text-text-muted">Enter saves. Escape cancels. Stored on this device only.</p>
      ) : (
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {rows.map((row, i) => (
            <li key={row.id}>
              <Button
                type="button"
                variant="ghost"
                title={row.title}
                className={`h-11 w-full justify-between font-normal ${i === active ? 'bg-bg/70 text-text' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(row)}
              >
                <span className="truncate">
                  <span className="mr-2 text-[10px] uppercase tracking-wide text-text-muted">{row.group}</span>
                  {row.label}
                </span>
                {row.hint && <span className="shrink-0 font-mono text-xs text-text-muted">{row.hint}</span>}
              </Button>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-3 py-2 text-sm text-text-muted">No matches</li>
          )}
        </ul>
      )}
      {!saving && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
          {savable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              title="Save current filters on this device"
              onClick={() => setSaving(true)}
            >
              Save current filters
            </Button>
          )}
          {presets.map((p) => (
            <Button
              key={p.name}
              type="button"
              variant="ghost"
              size="sm"
              title={`Remove preset ${p.name}`}
              onClick={() => setPresets(deleteFilterPreset(p.name))}
            >
              Remove {p.name}
            </Button>
          ))}
          <p className="w-full text-[10px] text-text-muted">
            Type ? for shortcuts. Ctrl/Cmd+K search. g then h/d/t/i/e/s jumps.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <>
      {isDesktop ? (
        <Button
          type="button"
          variant="outline"
          title="Search places, dates, and pages"
          aria-label="Search places, dates, and pages"
          className="h-11 min-w-0 flex-1 justify-start font-normal text-text-muted"
          onClick={() => setOpen(true)}
        >
          <Search size={14} />
          Search
          <span className="ml-auto hidden font-mono text-[10px] sm:inline">Ctrl K</span>
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Search"
          aria-label="Search"
          onClick={() => setOpen(true)}
        >
          <Search size={16} />
        </Button>
      )}
      {isDesktop ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent title="Search" className="w-[min(36rem,calc(100vw-2rem))] p-4">
            <p className="absolute h-px w-px overflow-hidden">Search places, dates, and pages</p>
            {body}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" title="Search" className="z-[1300] safe-pb">
            {body}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
