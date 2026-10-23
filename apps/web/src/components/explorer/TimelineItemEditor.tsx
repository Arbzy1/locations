import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Dialog, DialogContent } from '../ui/dialog';
import { Label } from '../ui/label';
import { MODE_LABELS } from '../../types';

/** Modes a journey can be corrected to; matches the API's OVERRIDE_MODES. */
const MODES = ['walking', 'cycling', 'car', 'bus', 'train', 'subway', 'flying'] as const;

/**
 * Pencil button on a timeline row: add a note, or for a journey fix the transport mode.
 * Saved per stay or journey and kept across re-imports of the same export.
 */
export default function TimelineItemEditor({
  kind,
  start,
  note,
  mode,
  googleMode,
  detected = false,
}: {
  kind: 'visit' | 'activity';
  start: string;
  note?: string | null;
  mode?: string;
  /** Google's original guess when the user or GPS detection changed it. */
  googleMode?: string | null;
  /** The mode came from GPS detection: save the choice explicitly so it sticks. */
  detected?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draftNote, setDraftNote] = useState(note ?? '');
  const [draftMode, setDraftMode] = useState(mode ?? '');
  const [busy, setBusy] = useState(false);
  const what = kind === 'visit' ? 'stay' : 'journey';

  const save = async () => {
    setBusy(true);
    const original = googleMode ?? mode;
    const res = await fetch('/api/overrides', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        start,
        note: draftNote,
        // Choosing Google's own guess again clears the correction. After GPS detection the
        // choice is always saved, so "it really was a car" is not detected again later.
        mode: kind === 'activity' && draftMode && (detected || draftMode !== original) ? draftMode : null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error || `Could not save this ${what}.`);
      return;
    }
    setOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['day'] });
    // A mode change rewrites mileage by mode and Routes: rebuild statistics.
    void queryClient.invalidateQueries({ queryKey: ['aggregates-status'] });
    toast.success('Saved.');
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-1 right-1 z-10 h-11 w-11 text-text-muted"
        title={kind === 'visit' ? 'Add a note to this stay' : 'Add a note or fix how you travelled'}
        aria-label={kind === 'visit' ? 'Edit this stay' : 'Edit this journey'}
        onClick={(e) => {
          e.stopPropagation();
          setDraftNote(note ?? '');
          setDraftMode(mode ?? '');
          setOpen(true);
        }}
      >
        <Pencil size={14} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Edit this ${what}`}>
          <h2 className="mb-3 text-lg font-semibold">Edit this {what}</h2>
          {kind === 'activity' && (
            <div className="mb-3">
              <Label htmlFor="override-mode" className="mb-1 block text-sm">
                How you travelled
              </Label>
              <select
                id="override-mode"
                title="Correct the transport mode for this journey"
                value={draftMode}
                onChange={(e) => setDraftMode(e.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m] || m}
                    {m === (googleMode ?? mode) ? " (Google's guess)" : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Label htmlFor="override-note" className="mb-1 block text-sm">
            Note
          </Label>
          <textarea
            id="override-note"
            title={`Your note for this ${what}`}
            value={draftNote}
            maxLength={500}
            rows={3}
            onChange={(e) => setDraftNote(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg p-2 text-sm text-text"
            placeholder="Only you can see this."
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" title="Close without saving" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} title={`Save this ${what}`} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
