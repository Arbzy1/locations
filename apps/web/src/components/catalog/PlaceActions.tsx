import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeOff, Eye, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';
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
import { useInvalidateLocationQueries } from '../../hooks/useApi';
import { PLACE_COLOR_TOKENS, isPlaceColorToken } from '../../lib/explorer/hotspots';

const COLOR_BG: Record<(typeof PLACE_COLOR_TOKENS)[number], string> = {
  accent: 'bg-accent',
  visit: 'bg-visit',
  walk: 'bg-walk',
  train: 'bg-train',
  car: 'bg-car',
  bus: 'bg-bus',
  cycle: 'bg-cycle',
};

async function patchLabel(body: Record<string, unknown>) {
  const res = await fetch('/api/places/labels', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

/** Rename, favourite, colour, tag, hide, or delete everything at one real place. */
export default function PlaceActions({
  placeKey,
  label,
  hidden,
  favourite = false,
  color = null,
  tags = [],
}: {
  placeKey: string;
  label: string;
  hidden: boolean;
  favourite?: boolean;
  color?: string | null;
  tags?: string[];
}) {
  const navigate = useNavigate();
  const invalidate = useInvalidateLocationQueries();
  const [name, setName] = useState(label);
  const [tagsDraft, setTagsDraft] = useState(() => tags.join(', '));
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setName(label);
  }, [label]);

  useEffect(() => {
    setTagsDraft(tags.join(', '));
  }, [tags]);

  const save = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    const ok = await patchLabel({ placeKey, ...body });
    setBusy(false);
    if (!ok) {
      toast.error('Could not save that change.');
      return;
    }
    invalidate();
    toast.success(done);
  };

  const saveTags = () => {
    const nextTags = [
      ...new Set(
        tagsDraft
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ].slice(0, 5);
    void save({ tags: nextTags }, nextTags.length ? 'Tags saved.' : 'Tags cleared.');
  };

  const deleteAll = async () => {
    setBusy(true);
    const res = await fetch(`/api/places/${encodeURIComponent(placeKey)}/data`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setBusy(false);
    setConfirmOpen(false);
    if (!res.ok) {
      toast.error('Could not delete this place.');
      return;
    }
    const body = (await res.json()) as { visitCount: number; activityCount: number };
    invalidate();
    toast.success(`Deleted ${body.visitCount} stays and ${body.activityCount} journeys.`);
    void navigate('/places');
  };

  const activeColor = isPlaceColorToken(color) ? color : null;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-bg p-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ label: name.trim() || label }, 'Renamed. Day View uses this name now.');
        }}
      >
        <EjectField label="Name" htmlFor="place-name" className="min-w-0 flex-1">
          <Input
            id="place-name"
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            title="Your name for this place"
          />
        </EjectField>
        <Button type="submit" disabled={busy || name.trim() === label} title="Save this name">
          Save name
        </Button>
      </form>

      <div>
        <p className="mb-1.5 text-xs font-medium text-text-muted">Colour</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant={activeColor ? 'outline' : 'default'}
            size="sm"
            className="h-11 px-3"
            disabled={busy}
            title="Clear custom place colour"
            onClick={() => void save({ color: null }, 'Colour cleared.')}
          >
            Clear
          </Button>
          {PLACE_COLOR_TOKENS.map((token) => (
            <Button
              key={token}
              type="button"
              variant="outline"
              size="icon"
              disabled={busy}
              title={`Set place colour to ${token}`}
              aria-label={`Set place colour to ${token}`}
              className={activeColor === token ? 'h-11 w-11 ring-2 ring-accent' : 'h-11 w-11'}
              onClick={() => void save({ color: token }, `Colour set to ${token}.`)}
            >
              <span className={`h-5 w-5 rounded ${COLOR_BG[token]}`} />
            </Button>
          ))}
        </div>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveTags();
        }}
      >
        <EjectField
          label="Tags (comma-separated)"
          htmlFor="place-tags"
          className="min-w-0 flex-1"
        >
          <Input
            id="place-tags"
            value={tagsDraft}
            maxLength={160}
            onChange={(e) => setTagsDraft(e.target.value)}
            title="Comma-separated tags for this place (up to 5)"
          />
        </EjectField>
        <Button
          type="submit"
          variant="outline"
          disabled={busy || tagsDraft.trim() === tags.join(', ').trim()}
          title="Save comma-separated tags"
        >
          Save tags
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={favourite ? 'default' : 'outline'}
          disabled={busy}
          title={favourite ? 'Remove from favourites' : 'Mark this place as a favourite'}
          aria-pressed={favourite}
          onClick={() =>
            void save(
              { favourite: !favourite },
              favourite ? 'Removed from favourites.' : 'Added to favourites.',
            )
          }
        >
          <Star size={14} className={favourite ? 'fill-current' : ''} />
          {favourite ? 'Favourited' : 'Favourite'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          title={
            hidden
              ? 'Show this place on the map and in the directory again'
              : 'Hide this place from the map and the directory'
          }
          onClick={() =>
            void save(
              { hidden: !hidden, label: name.trim() || label },
              hidden ? 'Shown again.' : 'Hidden from the map and directory.',
            )
          }
        >
          {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
          {hidden ? 'Show again' : 'Hide'}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={busy}
          title="Delete every stay here, journeys to and from it, and nearby GPS points"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 size={14} />
          Delete everything here
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent title="Delete everything at this place">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete everything at {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every stay here, journeys that start or end here, and GPS points within
              200 m of it. It cannot be undone here; re-importing your Google export brings it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel title="Keep this place">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              title="Delete everything at this place"
              onClick={() => void deleteAll()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
