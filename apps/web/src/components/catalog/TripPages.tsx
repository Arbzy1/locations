import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import CatalogPage from './CatalogPage';
import MapView from '../explorer/Map';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';
import { EmptyState } from '../ui/states';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  useCachedAnalytics,
  useCreateNamedTrip,
  useDays,
  useDeleteNamedTrip,
  useHomeWork,
  useMultiDayTrips,
  useNamedTrips,
  useTripRange,
  useUpdateNamedTrip,
  type NamedTripRecord,
} from '../../hooks/useApi';
import { formatMilesOrKm } from '../../utils/format';
import { useUnits } from '../../lib/units';
import { MODE_COLORS, MODE_LABELS } from '../../types';
import { placePath, tripPath } from '../../lib/nav/paths';
import { useSession } from '../../lib/auth';
import { loadTripNotes, saveTripNote } from '../../lib/explorer/trips';

const STORY_DAYS_PREVIEW = 14;

export function TripStoryPage() {
  const { start = '', end = '' } = useParams();
  const { data } = useTripRange(start, end);
  const { data: named = [] } = useNamedTrips();
  const { unit } = useUnits();
  const [showAllDays, setShowAllDays] = useState(false);

  const matchedTrip = useMemo(
    () =>
      named.find((t) => t.start === start && t.end === end) ??
      named.find((t) => t.start <= end && t.end >= start) ??
      null,
    [named, start, end],
  );
  const savedNote = useMemo(() => {
    if (!matchedTrip) return '';
    return loadTripNotes()[matchedTrip.id] ?? '';
  }, [matchedTrip]);

  if (!data) {
    return (
      <CatalogPage title="Trip">
        <p className="text-sm text-text-muted">Loading...</p>
      </CatalogPage>
    );
  }

  const days = data.dates;
  const visibleDays = showAllDays ? days : days.slice(0, STORY_DAYS_PREVIEW);
  const title = matchedTrip?.name?.trim() ? matchedTrip.name.trim() : `${data.start} to ${data.end}`;
  const descriptionParts = [
    matchedTrip?.name?.trim() ? `${data.start} to ${data.end}` : null,
    formatMilesOrKm(data.total_miles, unit),
    `${days.length} ${days.length === 1 ? 'day' : 'days'}`,
  ].filter(Boolean);

  return (
    <CatalogPage title={title} description={descriptionParts.join(' · ')}>
      {savedNote && (
        <p className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text whitespace-pre-line">
          {savedNote}
        </p>
      )}
      <div className="h-64 overflow-hidden rounded-lg border border-border">
        <MapView compact visits={data.visits} activities={data.activities} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Days ({visibleDays.length} of {days.length})
        </span>
        <Button variant="outline" size="sm" asChild title="Edit or name trips">
          <Link to="/trips/new">{matchedTrip ? 'Edit named trips' : 'Name this trip'}</Link>
        </Button>
      </div>
      <ul className="space-y-1">
        {visibleDays.map((d) => (
          <li key={d}>
            <Button variant="ghost" asChild title={`Open ${d}`} className="h-11 w-full justify-start font-normal">
              <Link to={`/day/${d}`}>{d}</Link>
            </Button>
          </li>
        ))}
      </ul>
      {days.length > STORY_DAYS_PREVIEW && (
        <Button
          type="button"
          variant="outline"
          title={showAllDays ? `Show first ${STORY_DAYS_PREVIEW} days` : `Show all ${days.length} days`}
          onClick={() => setShowAllDays((v) => !v)}
        >
          {showAllDays ? `Show first ${STORY_DAYS_PREVIEW} days` : `Show all ${days.length} days`}
        </Button>
      )}
    </CatalogPage>
  );
}

export function TripBuilderPage() {
  const { data: multi = [] } = useMultiDayTrips();
  const { data: named = [] } = useNamedTrips();
  const createMut = useCreateNamedTrip();
  const updateMut = useUpdateNamedTrip();
  const deleteMut = useDeleteNamedTrip();
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === 'demo';

  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [notesById, setNotesById] = useState<Record<string, string>>(() => loadTripNotes());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editNote, setEditNote] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<NamedTripRecord | null>(null);

  useEffect(() => {
    if (!multi[0]) return;
    setStart((cur) => cur || multi[0].start);
    setEnd((cur) => cur || multi[0].end);
  }, [multi]);

  const saveNew = async () => {
    const trimmed = name.trim();
    if (!trimmed || !start || !end) return;
    if (start > end) {
      const msg = 'Start date must be on or before end date.';
      setFormError(msg);
      toast.error(msg);
      return;
    }
    setFormError('');
    try {
      const created = await createMut.mutateAsync({ name: trimmed, start, end });
      if (note.trim()) {
        setNotesById(saveTripNote(created.id, note));
      }
      setName('');
      setNote('');
      toast.success('Named trip saved.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save trip.';
      setFormError(msg);
      toast.error(msg);
    }
  };

  const beginEdit = (t: NamedTripRecord) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditStart(t.start);
    setEditEnd(t.end);
    setEditNote(notesById[t.id] ?? '');
    setFormError('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed || !editStart || !editEnd) return;
    if (editStart > editEnd) {
      const msg = 'Start date must be on or before end date.';
      setFormError(msg);
      toast.error(msg);
      return;
    }
    setFormError('');
    try {
      await updateMut.mutateAsync({
        id: editingId,
        name: trimmed,
        start: editStart,
        end: editEnd,
      });
      setNotesById(saveTripNote(editingId, editNote));
      setEditingId(null);
      toast.success('Trip updated.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update trip.';
      setFormError(msg);
      toast.error(msg);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteMut.mutateAsync(target.id);
      setNotesById(saveTripNote(target.id, ''));
      if (editingId === target.id) setEditingId(null);
      toast.success(`Deleted "${target.name}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete trip.');
    }
  };

  return (
    <CatalogPage title="Name a trip" description="Save a multi-day range with your own title and notes. No photos.">
      {isDemo ? (
        <p className="text-sm text-text-muted">Demo accounts cannot save named trips.</p>
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-bg p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <EjectField label="Trip name" htmlFor="trip-name" className="min-w-0 flex-1">
              <Input
                id="trip-name"
                title="Trip name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </EjectField>
            <EjectField label="Start date" htmlFor="trip-start">
              <Input
                id="trip-start"
                title="Trip start date"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </EjectField>
            <EjectField label="End date" htmlFor="trip-end">
              <Input
                id="trip-end"
                title="Trip end date"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </EjectField>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <EjectField label="Notes (optional)" htmlFor="trip-note" className="min-w-0 flex-1">
              <Input
                id="trip-note"
                title="Optional notes for this trip"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </EjectField>
            <Button
              type="button"
              title="Save named trip"
              disabled={createMut.isPending || !name.trim() || !start || !end}
              onClick={() => void saveNew()}
            >
              {createMut.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
          {formError && <p className="text-xs text-train">{formError}</p>}
        </div>
      )}

      <h3 className="text-sm font-semibold text-text-muted">Saved</h3>
      {named.length === 0 ? (
        <p className="text-sm text-text-muted">No named trips saved yet.</p>
      ) : (
        <ul className="space-y-2">
          {named.map((t) => {
            const isEditing = editingId === t.id;
            const savedNote = notesById[t.id];
            return (
              <li key={t.id} className="rounded-lg border border-border bg-bg p-2.5">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <EjectField label="Trip name" htmlFor={`edit-trip-name-${t.id}`} className="min-w-0 flex-1">
                        <Input
                          id={`edit-trip-name-${t.id}`}
                          title="Edit trip name"
                          value={editName}
                          maxLength={80}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </EjectField>
                      <EjectField label="Start date" htmlFor={`edit-trip-start-${t.id}`}>
                        <Input
                          id={`edit-trip-start-${t.id}`}
                          title="Edit start date"
                          type="date"
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                        />
                      </EjectField>
                      <EjectField label="End date" htmlFor={`edit-trip-end-${t.id}`}>
                        <Input
                          id={`edit-trip-end-${t.id}`}
                          title="Edit end date"
                          type="date"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                        />
                      </EjectField>
                    </div>
                    <EjectField label="Notes" htmlFor={`edit-trip-note-${t.id}`}>
                      <Input
                        id={`edit-trip-note-${t.id}`}
                        title="Edit notes for this trip"
                        value={editNote}
                        maxLength={500}
                        onChange={(e) => setEditNote(e.target.value)}
                      />
                    </EjectField>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        title="Cancel editing trip"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={updateMut.isPending || !editName.trim() || !editStart || !editEnd}
                        title="Save changes to trip"
                        onClick={() => void saveEdit()}
                      >
                        {updateMut.isPending ? 'Saving...' : 'Save changes'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      to={tripPath(t.start, t.end)}
                      title={`Open ${t.name}`}
                      className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded px-1 hover:bg-surface/60"
                    >
                      <span className="truncate font-medium text-text">{t.name}</span>
                      <span className="text-xs text-text-muted">
                        {t.start} to {t.end}
                        {savedNote ? ` · ${savedNote}` : ''}
                      </span>
                    </Link>
                    {!isDemo && (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          title={`Edit ${t.name}`}
                          aria-label={`Edit ${t.name}`}
                          onClick={() => beginEdit(t)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 text-train"
                          title={`Delete ${t.name}`}
                          aria-label={`Delete ${t.name}`}
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="text-sm font-semibold text-text-muted">Detected multi-day</h3>
      <ul className="space-y-1">
        {multi.slice(0, 20).map((t) => (
          <li key={`${t.start}-${t.end}`}>
            <Button variant="ghost" asChild title={`Open trip ${t.start} to ${t.end}`} className="h-11 w-full justify-between font-normal">
              <Link to={tripPath(t.start, t.end)}>
                <span>
                  {t.start} to {t.end}
                </span>
                <span className="text-xs text-text-muted">{t.clusters.slice(0, 3).join(', ')}</span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent title="Delete named trip">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved trip title ({deleteTarget?.start} to {deleteTarget?.end}). Your
              underlying Timeline days and visits stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel title="Keep this named trip">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMut.isPending}
              title="Delete this named trip"
              onClick={() => void confirmDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CatalogPage>
  );
}

export function HolidaysPage() {
  const { data } = useCachedAnalytics<{ date: string; cluster: string; label?: string }[]>('away-nights');
  const rows = Array.isArray(data) ? data : [];
  return (
    <CatalogPage
      title="Away nights"
      description="Overnight visits whose cluster is not the home guess. This is a guess, not a confirmed address."
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No away nights yet."
          body="Overnight visits outside your guessed home appear here once Timeline analytics are built."
        />
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 80).map((r) => (
            <li key={`${r.date}-${r.cluster}`}>
              <Button variant="ghost" asChild title={`Open ${r.date}`} className="h-11 w-full justify-between font-normal">
                <Link to={`/day/${r.date}`}>
                  <span>{r.date}</span>
                  <span className="truncate text-xs text-text-muted">{r.label || r.cluster}</span>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </CatalogPage>
  );
}

export function CommutePage() {
  const { data } = useCachedAnalytics<{
    home: string;
    work: string;
    homeLabel?: string;
    workLabel?: string;
    count: number;
    modes: Record<string, number>;
    departHours: number[];
  } | null>('commute');
  const { data: hw } = useHomeWork();
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const hourBuckets = useMemo(() => {
    const bins = Array.from({ length: 24 }, () => 0);
    if (!data || Array.isArray(data)) return bins;
    const raw = data.departHours ?? [];
    for (const h of raw) {
      if (Number.isInteger(h) && h >= 0 && h < 24) {
        bins[h] += 1;
      }
    }
    return bins;
  }, [data]);

  if (!data || Array.isArray(data)) {
    return (
      <CatalogPage title="Commute" description="Weekday home to work loops from overnight and weekday guesses.">
        <EmptyState
          title={
            hw?.home && hw?.work && hw.home.cluster === hw.work.cluster
              ? 'Home and work share the same area.'
              : 'No commute loops detected yet.'
          }
          body={
            hw?.home && hw?.work && hw.home.cluster === hw.work.cluster
              ? 'Because both guesses fall in the same area, there are no cross-area transitions to chart.'
              : hw?.home && hw?.work
                ? 'Commute stats appear after the next Timeline import.'
                : 'Home or work could not be guessed from overnight and weekday stays yet.'
          }
        />
      </CatalogPage>
    );
  }

  const maxDepart = hourBuckets.reduce((m, n) => Math.max(m, n), 1);
  const peakHour = hourBuckets.reduce((best, n, h) => (n > (hourBuckets[best] ?? -1) ? h : best), 0);
  const activeHour = selectedHour ?? peakHour;

  return (
    <CatalogPage title="Commute" description={`${data.count} weekday home and work transitions.`}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-bg p-3 text-sm">
          <div className="text-xs text-text-muted">Home guess</div>
          <Link
            className="mt-1 inline-flex min-h-11 items-center font-medium text-accent underline"
            to={placePath(data.home)}
            title="Open home guess"
          >
            {data.homeLabel || data.home}
          </Link>
        </div>
        <div className="rounded-lg border border-border bg-bg p-3 text-sm">
          <div className="text-xs text-text-muted">Work guess</div>
          <Link
            className="mt-1 inline-flex min-h-11 items-center font-medium text-accent underline"
            to={placePath(data.work)}
            title="Open work guess"
          >
            {data.workLabel || data.work}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(data.modes).map(([mode, n]) => (
          <span key={mode} className="rounded-full border border-border bg-bg px-2.5 py-1 text-xs">
            {MODE_LABELS[mode] || mode} · {n}
          </span>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-bg p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-muted">Departure hours</h3>
          <span className="font-mono text-xs text-text-muted">
            {String(activeHour).padStart(2, '0')}:00 · {hourBuckets[activeHour] ?? 0}{' '}
            {hourBuckets[activeHour] === 1 ? 'trip' : 'trips'}
          </span>
        </div>
        <div className="flex h-24 items-end gap-0.5">
          {hourBuckets.map((n, hour) => (
            <button
              key={hour}
              type="button"
              title={`${String(hour).padStart(2, '0')}:00 · ${n} commute departures`}
              aria-label={`${String(hour).padStart(2, '0')}:00, ${n} commute departures`}
              onClick={() => setSelectedHour(hour)}
              className="flex h-full min-h-11 flex-1 items-end focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <span
                className={`w-full rounded-t-xs transition-opacity ${
                  activeHour === hour ? 'bg-accent' : n > 0 ? 'bg-accent/70 hover:bg-accent' : 'bg-border/60'
                }`}
                style={{ height: `${n > 0 ? Math.max(10, (n / maxDepart) * 100) : 4}%` }}
              />
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[11px] text-text-muted">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </div>
    </CatalogPage>
  );
}

export function WeekdayPage() {
  const { data: days = [] } = useDays();
  const { unit } = useUnits();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const weekday = {
      days: 0,
      miles: 0,
      visits: 0,
      journeys: 0,
      modes: {} as Record<string, number>,
    };
    const weekend = {
      days: 0,
      miles: 0,
      visits: 0,
      journeys: 0,
      modes: {} as Record<string, number>,
    };
    for (const d of days) {
      const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      const bucket = wd === 0 || wd === 6 ? weekend : weekday;
      bucket.days += 1;
      bucket.miles += d.total_distance_miles;
      bucket.visits += d.visit_count;
      bucket.journeys += d.activity_count;
      for (const [mode, count] of Object.entries(d.modes ?? {})) {
        bucket.modes[mode] = (bucket.modes[mode] ?? 0) + count;
      }
    }
    const avg = (total: number, count: number) => (count > 0 ? total / count : 0);
    return {
      weekday: {
        ...weekday,
        avgMiles: avg(weekday.miles, weekday.days),
        avgVisits: avg(weekday.visits, weekday.days),
        avgJourneys: avg(weekday.journeys, weekday.days),
      },
      weekend: {
        ...weekend,
        avgMiles: avg(weekend.miles, weekend.days),
        avgVisits: avg(weekend.visits, weekend.days),
        avgJourneys: avg(weekend.journeys, weekend.days),
      },
    };
  }, [days]);

  if (days.length === 0) {
    return (
      <CatalogPage title="Weekend vs weekday" description="Daily averages and mode split from imported day stats.">
        <EmptyState
          title="No days imported yet."
          body="Import your Google Timeline to compare weekday routines with weekend travel."
        />
      </CatalogPage>
    );
  }

  const maxAvgMiles = Math.max(stats.weekday.avgMiles, stats.weekend.avgMiles, 0.1);
  const maxAvgVisits = Math.max(stats.weekday.avgVisits, stats.weekend.avgVisits, 0.1);
  const maxAvgJourneys = Math.max(stats.weekday.avgJourneys, stats.weekend.avgJourneys, 0.1);

  const topModes = (modes: Record<string, number>) =>
    Object.entries(modes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

  return (
    <CatalogPage title="Weekend vs weekday" description="Daily averages, stop frequency, and transport split across imported days.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(
          [
            { key: 'weekday', title: 'Weekdays (Mon - Fri)', row: stats.weekday, barClass: 'bg-accent' },
            { key: 'weekend', title: 'Weekends (Sat - Sun)', row: stats.weekend, barClass: 'bg-visit' },
          ] as const
        ).map(({ key, title, row, barClass }) => (
          <div key={key} className="space-y-2 rounded-lg border border-border bg-bg p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-text">{title}</h3>
              <span className="font-mono text-xs text-text-muted">{row.days} days</span>
            </div>
            <div className="text-2xl font-semibold text-accent">
              {formatMilesOrKm(row.avgMiles, unit)}
              <span className="ml-1 text-xs font-normal text-text-muted">/ day</span>
            </div>
            <p className="text-xs text-text-muted">
              Total {formatMilesOrKm(row.miles, unit)} · {row.avgVisits.toFixed(1)} visits/day ·{' '}
              {row.avgJourneys.toFixed(1)} journeys/day
            </p>
            {topModes(row.modes).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {topModes(row.modes).map(([mode, count]) => (
                  <span
                    key={mode}
                    className="rounded-full border px-2 py-0.5 text-[11px]"
                    style={{
                      color: MODE_COLORS[mode] || 'var(--text-muted)',
                      borderColor: MODE_COLORS[mode] || 'var(--border)',
                    }}
                  >
                    {MODE_LABELS[mode] || mode} · {count}
                  </span>
                ))}
              </div>
            )}
            <div className="sr-only">{barClass}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-bg p-4">
        <h3 className="text-sm font-semibold text-text-muted">Side-by-side daily averages</h3>
        {(
          [
            {
              label: 'Average daily distance',
              wkVal: formatMilesOrKm(stats.weekday.avgMiles, unit),
              weVal: formatMilesOrKm(stats.weekend.avgMiles, unit),
              wkPct: (stats.weekday.avgMiles / maxAvgMiles) * 100,
              wePct: (stats.weekend.avgMiles / maxAvgMiles) * 100,
            },
            {
              label: 'Visits per day',
              wkVal: stats.weekday.avgVisits.toFixed(1),
              weVal: stats.weekend.avgVisits.toFixed(1),
              wkPct: (stats.weekday.avgVisits / maxAvgVisits) * 100,
              wePct: (stats.weekend.avgVisits / maxAvgVisits) * 100,
            },
            {
              label: 'Journeys per day',
              wkVal: stats.weekday.avgJourneys.toFixed(1),
              weVal: stats.weekend.avgJourneys.toFixed(1),
              wkPct: (stats.weekday.avgJourneys / maxAvgJourneys) * 100,
              wePct: (stats.weekend.avgJourneys / maxAvgJourneys) * 100,
            },
          ] as const
        ).map((metric) => (
          <div key={metric.label} className="space-y-1.5 text-xs">
            <div className="font-medium text-text">{metric.label}</div>
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-text-muted">Weekday</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full origin-left rounded-full bg-accent"
                  style={{ width: `${Math.max(4, metric.wkPct)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-text">{metric.wkVal}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-text-muted">Weekend</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full origin-left rounded-full bg-visit"
                  style={{ width: `${Math.max(4, metric.wePct)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-text">{metric.weVal}</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <Button type="button" variant="outline" title="Open Day Trips" onClick={() => void navigate('/trips')}>
          Open Day Trips
        </Button>
      </div>
    </CatalogPage>
  );
}

export { WeekdayPage as WeekendPage };
