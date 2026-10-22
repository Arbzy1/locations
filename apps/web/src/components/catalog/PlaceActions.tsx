import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeOff, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';
import { Dialog, DialogContent } from '../ui/dialog';
import { useInvalidateLocationQueries } from '../../hooks/useApi';

async function patchLabel(body: Record<string, unknown>) {
  const res = await fetch('/api/places/labels', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

/** Rename, hide, or delete everything at one real place. */
export default function PlaceActions({
  placeKey,
  label,
  hidden,
}: {
  placeKey: string;
  label: string;
  hidden: boolean;
}) {
  const navigate = useNavigate();
  const invalidate = useInvalidateLocationQueries();
  const [name, setName] = useState(label);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  return (
    <div className="space-y-3 rounded-lg border border-border bg-bg p-3">
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
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          title={hidden ? 'Show this place on the map and in the directory again' : 'Hide this place from the map and the directory'}
          onClick={() => void save({ hidden: !hidden }, hidden ? 'Shown again.' : 'Hidden from the map and directory.')}
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
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title="Delete everything at this place">
          <h2 className="text-lg font-semibold">Delete everything at {label}?</h2>
          <p className="mt-2 text-sm text-text-muted">
            This removes every stay here, journeys that start or end here, and GPS points within
            200 m of it. It cannot be undone here; re-importing your Google export brings it back.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" title="Keep this place" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              title="Delete everything at this place"
              onClick={() => void deleteAll()}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
