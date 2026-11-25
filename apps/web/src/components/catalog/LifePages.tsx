import { Link } from 'react-router-dom';
import { useState } from 'react';
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
  useChapters,
  useCreateChapter,
  useDeleteChapter,
  useHeatmap,
  useUpdateChapter,
  type ChapterRecord,
} from '../../hooks/useApi';
import { placePath } from '../../lib/nav/paths';
import { useSession } from '../../lib/auth';
import { useUnits } from '../../lib/units';
import { formatMilesOrKm } from '../../utils/format';
import type { ActivityGuessCount, BadgeSummary } from '../../types';

export function FirstsPage() {
  const { data } = useCachedAnalytics<{
    clusters: { name: string; date: string; label?: string }[];
    types: { name: string; date: string }[];
  }>('firsts');
  const clusters = data && !Array.isArray(data) ? data.clusters : [];
  const types = data && !Array.isArray(data) ? data.types : [];
  return (
    <CatalogPage title="Firsts" description="First imported visit to each place and place type.">
      {clusters.length === 0 && types.length === 0 ? (
        <EmptyState
          title="No first visits yet."
          body="First visits to places and categories appear once your Timeline is imported."
        />
      ) : (
        <>
          <h3 className="text-sm font-semibold text-text-muted">Places</h3>
          {clusters.length === 0 ? (
            <p className="text-sm text-text-muted">No place firsts recorded yet.</p>
          ) : (
            <ul className="space-y-1">
              {clusters.map((r) => (
                <li key={r.name} className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    asChild
                    title={`Open ${r.label || r.name}`}
                    className="h-11 min-w-0 flex-1 justify-between font-normal"
                  >
                    <Link to={placePath(r.name)}>
                      <span className="truncate">{r.label || r.name}</span>
                    </Link>
                  </Button>
                  <Button variant="ghost" asChild title={`Open ${r.date}`} className="h-11 shrink-0">
                    <Link to={`/day/${r.date}`}>{r.date}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <h3 className="text-sm font-semibold text-text-muted">Types</h3>
          {types.length === 0 ? (
            <p className="text-sm text-text-muted">No place categories recorded yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {types.map((r) => (
                <li key={r.name} className="flex min-h-11 items-center justify-between">
                  <span>{r.name}</span>
                  <Link className="inline-flex min-h-11 items-center text-accent hover:underline" to={`/day/${r.date}`} title={`Open ${r.date}`}>
                    {r.date}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </CatalogPage>
  );
}

export function MovingPage() {
  const { data } = useCachedAnalytics<
    { year: number; cluster: string; nights: number; label?: string; placeKey?: string }[]
  >('moving');
  const rows = Array.isArray(data) ? data : [];
  return (
    <CatalogPage title="Moving history" description="Overnight area with the most nights each year. Labelled as a guess.">
      {rows.length === 0 ? (
        <EmptyState
          title="No overnight history yet."
          body="Yearly home-area guesses appear once overnight visits are imported."
        />
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => {
            const display = r.label || r.cluster;
            const target = r.placeKey || r.cluster;
            return (
              <li key={r.year}>
                <Button variant="ghost" asChild title={`Open ${display}`} className="h-11 w-full justify-between font-normal">
                  <Link to={placePath(target)}>
                    <span className="truncate">
                      {r.year}: {display}
                    </span>
                    <span className="shrink-0 text-xs text-text-muted">{r.nights} nights</span>
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </CatalogPage>
  );
}

export function AnomalyPage() {
  const { data } = useCachedAnalytics<{ date: string; weekday: number; miles: number; visits: number; reason: string }[]>(
    'anomaly',
  );
  const { unit } = useUnits();
  const rows = Array.isArray(data) ? data : [];
  return (
    <CatalogPage title="Routine vs anomaly" description="Days that differ a lot from the typical same weekday. Not machine learning.">
      {rows.length === 0 ? (
        <EmptyState
          title="No unusual days spotted yet."
          body="Once enough days are imported to establish weekday medians, outlier days appear here."
        />
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.date}>
              <Button variant="ghost" asChild title={`Open ${r.date}`} className="h-11 w-full justify-between font-normal">
                <Link to={`/day/${r.date}`}>
                  <span>{r.date}</span>
                  <span className="truncate text-xs text-text-muted">
                    {formatMilesOrKm(r.miles, unit)} · {r.reason}
                  </span>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </CatalogPage>
  );
}

export function ChaptersPage() {
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === 'demo';
  const { data: chapters = [] } = useChapters();
  const { data: heatmap } = useHeatmap();
  const createMut = useCreateChapter();
  const updateMut = useUpdateChapter();
  const deleteMut = useDeleteChapter();

  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [formError, setFormError] = useState('');
  const [selected, setSelected] = useState<{ start: string; end: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ChapterRecord | null>(null);

  const save = async () => {
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
      await createMut.mutateAsync({ name: trimmed, start, end });
      setName('');
      toast.success('Chapter saved.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save chapter.';
      setFormError(msg);
      toast.error(msg);
    }
  };

  const beginEdit = (c: ChapterRecord) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditStart(c.start);
    setEditEnd(c.end);
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
      const updated = await updateMut.mutateAsync({
        id: editingId,
        name: trimmed,
        start: editStart,
        end: editEnd,
      });
      setSelected({ start: updated.start, end: updated.end });
      setEditingId(null);
      toast.success('Chapter updated.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update chapter.';
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
      if (editingId === target.id) setEditingId(null);
      if (selected && selected.start === target.start && selected.end === target.end) {
        setSelected(null);
      }
      toast.success(`Deleted "${target.name}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete chapter.');
    }
  };

  return (
    <CatalogPage title="Life chapters" description="Your names for date ranges. Private to this account.">
      {isDemo ? (
        <p className="text-sm text-text-muted">Demo accounts cannot save chapters.</p>
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-bg p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <EjectField label="Chapter name" htmlFor="chapter-name" className="min-w-0 flex-1">
              <Input
                id="chapter-name"
                title="Chapter name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </EjectField>
            <EjectField label="Start date" htmlFor="chapter-start">
              <Input
                id="chapter-start"
                title="Chapter start date"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </EjectField>
            <EjectField label="End date" htmlFor="chapter-end">
              <Input
                id="chapter-end"
                title="Chapter end date"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </EjectField>
            <Button
              type="button"
              title="Save chapter"
              disabled={createMut.isPending || !name.trim() || !start || !end}
              onClick={() => void save()}
            >
              {createMut.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
          {formError && <p className="text-xs text-train">{formError}</p>}
        </div>
      )}

      {chapters.length === 0 ? (
        <EmptyState
          title="No chapters saved yet."
          body="Name eras like university, a move, or a sabbatical to filter the heatmap below."
        />
      ) : (
        <ul className="space-y-2">
          {chapters.map((c) => {
            const isEditing = editingId === c.id;
            const isSelected = selected?.start === c.start && selected?.end === c.end;
            return (
              <li
                key={c.id}
                className={`rounded-lg border p-2 ${
                  isSelected ? 'border-accent/50 bg-accent/5' : 'border-border bg-bg'
                }`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <EjectField label="Chapter name" htmlFor={`edit-chapter-name-${c.id}`} className="min-w-0 flex-1">
                        <Input
                          id={`edit-chapter-name-${c.id}`}
                          title="Edit chapter name"
                          value={editName}
                          maxLength={80}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </EjectField>
                      <EjectField label="Start date" htmlFor={`edit-chapter-start-${c.id}`}>
                        <Input
                          id={`edit-chapter-start-${c.id}`}
                          title="Edit start date"
                          type="date"
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                        />
                      </EjectField>
                      <EjectField label="End date" htmlFor={`edit-chapter-end-${c.id}`}>
                        <Input
                          id={`edit-chapter-end-${c.id}`}
                          title="Edit end date"
                          type="date"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                        />
                      </EjectField>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        title="Cancel editing chapter"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={updateMut.isPending || !editName.trim() || !editStart || !editEnd}
                        title="Save chapter changes"
                        onClick={() => void saveEdit()}
                      >
                        {updateMut.isPending ? 'Saving...' : 'Save changes'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      title={`Show heatmap for ${c.name}`}
                      className="h-11 min-w-0 flex-1 justify-between font-normal"
                      onClick={() => setSelected({ start: c.start, end: c.end })}
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 text-xs text-text-muted">
                        {c.start} to {c.end}
                      </span>
                    </Button>
                    {!isDemo && (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          title={`Edit ${c.name}`}
                          aria-label={`Edit ${c.name}`}
                          onClick={() => beginEdit(c)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 text-train"
                          title={`Delete ${c.name}`}
                          aria-label={`Delete ${c.name}`}
                          onClick={() => setDeleteTarget(c)}
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

      <ChapterMap start={selected?.start} end={selected?.end} fallback={heatmap} />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent title="Delete chapter">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved chapter ({deleteTarget?.start} to {deleteTarget?.end}). Your
              imported Timeline data is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel title="Keep this chapter">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMut.isPending}
              title="Delete this chapter"
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

function ChapterMap({
  start,
  end,
  fallback,
}: {
  start?: string;
  end?: string;
  fallback?: { lat: number; lon: number; count: number }[];
}) {
  const { data } = useHeatmap({ from: start, to: end });
  const points = start ? data : fallback;
  return (
    <div className="h-56 overflow-hidden rounded-lg border border-border">
      <MapView compact heatmapPoints={points || []} />
    </div>
  );
}

export function BadgesPage() {
  const { data } = useCachedAnalytics<BadgeSummary>('badges');
  const summary = data && !Array.isArray(data) ? data : null;
  return (
    <CatalogPage
      title="Badges"
      description="Coverage percent and visit counts from your import. Not a live streak with anyone else."
    >
      {summary ? (
        <>
          <p className="text-sm text-text">
            {summary.coveragePercent}% of days in the span have Timeline ({summary.daysWithData} of{' '}
            {summary.spanDays}).
          </p>
          <ul className="space-y-2">
            {summary.badges.map((b) => (
              <li
                key={b.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  b.earned ? 'border-accent/40 bg-accent/10 text-text' : 'border-border bg-bg text-text-muted'
                }`}
              >
                <div className="font-semibold">{b.label}</div>
                <div className="text-xs">{b.detail}</div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-text-muted">Badges appear after the next Timeline import.</p>
      )}
    </CatalogPage>
  );
}

export function GuessesPage() {
  const { data } = useCachedAnalytics<ActivityGuessCount[]>('activity-guesses');
  const rows = Array.isArray(data) ? data : [];
  return (
    <CatalogPage
      title="Activity guesses"
      description="Labels from dwell time, hour of day, and Google place type. Not an LLM. Place names stay off this list."
    >
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex h-11 items-center justify-between rounded-lg border border-border bg-bg px-3">
            <span className="text-text">{r.label}</span>
            <span className="text-text-muted">{r.count}</span>
          </li>
        ))}
      </ul>
      {rows.length === 0 && (
        <p className="text-sm text-text-muted">Guesses appear after the next Timeline import.</p>
      )}
    </CatalogPage>
  );
}
