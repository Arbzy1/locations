import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TrainFront } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { MODE_LABELS, type Activity } from '../../types';

const label = (mode: string | undefined) => (mode ? (MODE_LABELS[mode] || mode).toLowerCase() : '');

/**
 * Shown under a journey whose mode came from its GPS points rather than Google: a badge
 * with one-tap undo, or for a weaker match a "Might be a train" suggestion to accept.
 */
export default function ModeDetectionChip({ activity: a, editable }: { activity: Activity; editable: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const detected = a.mode_detected && a.google_mode;
  const hint = !detected && a.mode_hint;
  if (!detected && !hint) return null;

  const setMode = async (mode: string, done: string) => {
    setBusy(true);
    const res = await fetch('/api/overrides', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'activity', start: a.start, note: a.note ?? '', mode }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error('Could not change this journey.');
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['day'] });
    void queryClient.invalidateQueries({ queryKey: ['aggregates-status'] });
    toast.success(done);
  };

  const now = label(a.mode);
  const why =
    a.mode_by === 'speed'
      ? `Google said ${label(a.google_mode)}, but your GPS points moved at ${now} speed`
      : `Google said ${label(a.google_mode)}; your GPS points follow the ${now === 'subway' ? 'underground' : 'railway'} at ${now} speeds`;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge
        className="gap-1 border-accent/30 bg-accent/10 text-accent"
        title={detected ? why : 'Your GPS points mostly follow the railway, but not clearly enough to change it'}
      >
        {a.mode_by !== 'speed' && <TrainFront size={11} aria-hidden />}
        {detected ? `Detected ${now}` : `Might be a ${label(hint || '')}`}
      </Badge>
      {editable && detected && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          className="-my-2 px-2 text-[11px]"
          title={`Change this journey back to ${label(a.google_mode)}, as Google had it`}
          onClick={() => void setMode(a.google_mode!, `Changed back to ${label(a.google_mode)}.`)}
        >
          Not a {now}? Use {label(a.google_mode)}
        </Button>
      )}
      {editable && hint && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          className="-my-2 px-2 text-[11px]"
          title={`Mark this journey as ${label(hint)}`}
          onClick={() => void setMode(hint, `Marked as ${label(hint)}.`)}
        >
          Yes, it was
        </Button>
      )}
    </div>
  );
}
