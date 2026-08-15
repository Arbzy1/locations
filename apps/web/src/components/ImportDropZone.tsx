import { useRef, useState, type DragEvent } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';
import { hoverSpring } from '../lib/motion';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogContent } from './ui/alert-dialog';
import { useInvalidateLocationQueries } from '../hooks/useApi';

export type ImportPreview = {
  chosenPath: string | null;
  candidates: string[];
  format: string;
  visitCount: number;
  activityCount: number;
  dateMin: string | null;
  dateMax: string | null;
  overlappingDays: number;
  newDays: number;
  existingDays: number;
  overlappingSample: string[];
  replaceWouldRemoveVisits: number;
  mergeWouldAppendVisits: number;
  skipOverlapWouldAppendVisits: number;
  timezoneWarning: { warn: boolean; skewedShare: number; sampleCount: number };
};

export const TIMEZONE_SKEW_COPY =
  'Some visit dates may sit on a different local day than UTC. This is a guess; stored dates are not rewritten.';

async function postForm(path: string, form: FormData) {
  const res = await fetch(path, { method: 'POST', credentials: 'include', body: form });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & ImportPreview;
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export default function ImportDropZone({
  sourceId,
  label,
  disabled,
  disabledReason,
  onStarted,
  onError,
}: {
  sourceId?: string | null;
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
  onStarted?: () => void;
  onError?: (message: string) => void;
}) {
  const reduce = useReducedMotion();
  const invalidate = useInvalidateLocationQueries();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const fail = (message: string) => {
    onError?.(message);
    setBusy(false);
  };

  const runPreview = async (next: File) => {
    if (disabled) return;
    setBusy(true);
    onError?.('');
    try {
      const form = new FormData();
      form.append('file', next);
      if (sourceId) form.append('sourceId', sourceId);
      const body = await postForm('/api/import/preview', form);
      setFile(next);
      setPreview(body);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
      setFile(null);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (policy: 'replace' | 'merge' | 'skip-overlap') => {
    if (!file) return;
    setBusy(true);
    onError?.('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (sourceId) form.append('sourceId', sourceId);
      else if (label?.trim()) form.append('label', label.trim());
      if (policy === 'merge' || policy === 'skip-overlap') form.append('merge', '1');
      if (policy === 'skip-overlap') form.append('skipOverlappingDays', '1');
      await postForm('/api/import', form);
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onStarted?.();
      invalidate();
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const next = e.dataTransfer.files?.[0];
    if (next) void runPreview(next);
  };

  return (
    <>
      <motion.div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        animate={
          reduce
            ? { opacity: dragOver ? 0.92 : 1 }
            : { scale: dragOver ? 1.02 : 1, y: dragOver ? -1 : 0 }
        }
        transition={reduce ? { duration: 0.08 } : hoverSpring}
        className={cn(
          'rounded-xl border border-dashed border-border bg-bg/40 p-4',
          dragOver && 'border-accent bg-accent/10',
          disabled && 'opacity-60',
        )}
      >
        <p className="mb-3 text-sm text-text-muted">
          Drop a Timeline JSON or Takeout zip here, or choose a file. Zip the Takeout folder if you
          have a directory of files.
        </p>
        {disabledReason && <p className="mb-3 text-sm text-text-muted">{disabledReason}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            title="Choose a Google Timeline JSON or Takeout zip"
            disabled={disabled || busy}
            onChange={(e) => {
              const next = e.target.files?.[0];
              if (next) void runPreview(next);
            }}
            className="w-full max-w-md text-sm text-text-muted file:mr-3 file:h-11 file:rounded-md file:border-0 file:bg-accent/20 file:px-3 file:text-sm file:text-accent"
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || busy}
            title="Choose a Timeline JSON or Takeout zip"
            onClick={() => fileRef.current?.click()}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Choose file
          </Button>
        </div>
      </motion.div>

      <AlertDialog open={Boolean(preview)} onOpenChange={(open) => !open && !busy && setPreview(null)}>
        <AlertDialogContent title="Import preview">
          <h2 className="text-lg font-semibold">What this import would change</h2>
          {preview && (
            <div className="mt-3 space-y-2 text-sm text-text">
              <p>
                File used: {preview.chosenPath || 'JSON upload'} ({preview.format})
              </p>
              {preview.candidates.length > 1 && (
                <p className="text-text-muted">Also found: {preview.candidates.slice(0, 8).join(', ')}</p>
              )}
              <p>
                {preview.visitCount} visits, {preview.activityCount} journeys
                {preview.dateMin && preview.dateMax ? ` (${preview.dateMin} to ${preview.dateMax})` : ''}
              </p>
              <p>
                {preview.newDays} new days, {preview.overlappingDays} overlapping,{' '}
                {preview.existingDays} already stored
              </p>
              <p className="text-text-muted">
                Replace would remove {preview.replaceWouldRemoveVisits} existing visits. Merge would
                append {preview.mergeWouldAppendVisits}. Skip overlap would add{' '}
                {preview.skipOverlapWouldAppendVisits}.
              </p>
              {preview.timezoneWarning.warn && (
                <p className="rounded-lg border border-border bg-bg/60 px-3 py-2 text-text-muted">
                  {TIMEZONE_SKEW_COPY}
                </p>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              variant="outline"
              title="Cancel this import"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              title="Replace this source with the file"
              disabled={busy}
              onClick={() => void confirm('replace')}
            >
              Replace source
            </Button>
            <Button
              type="button"
              variant="outline"
              title="Append all rows from the file"
              disabled={busy}
              onClick={() => void confirm('merge')}
            >
              Merge
            </Button>
            <Button
              type="button"
              title="Append only days that are not already stored"
              disabled={busy}
              onClick={() => void confirm('skip-overlap')}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              Merge, skip overlapping days
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
