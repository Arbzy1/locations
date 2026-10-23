import { useRef, useState, type DragEvent } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';
import { hoverSpring } from '../../lib/motion';
import { Button } from '../ui/button';
import { AlertDialog, AlertDialogContent } from '../ui/alert-dialog';
import { useInvalidateLocationQueries } from '../../hooks/useApi';
import { useUnits } from '../../lib/units';
import {
  prepareImport,
  runImport,
  type ImportPreview,
  type ImportProgress,
  type PreparedImport,
} from '../../lib/import/browser-import';

const formatMb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export type { ImportPreview } from '../../lib/import/browser-import';

export const TIMEZONE_SKEW_COPY =
  'Some visit dates may sit on a different local day than UTC. This is a guess; stored dates are not rewritten.';

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
  const { uploadLimitBytes, timezone } = useUnits();
  const invalidate = useInvalidateLocationQueries();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const preview: ImportPreview | null = prepared?.preview ?? null;
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const fail = (message: string) => {
    onError?.(message);
    setBusy(false);
  };

  const runPreview = async (next: File) => {
    if (disabled) return;
    if (uploadLimitBytes && next.size > uploadLimitBytes) {
      onError?.(
        `${next.name} is ${formatMb(next.size)}; your plan accepts up to ${formatMb(uploadLimitBytes)}. ` +
          'Export Location History only (not the whole Takeout), or zip the JSON.',
      );
      return;
    }
    setBusy(true);
    onError?.('');
    setProgress({ stage: 'Reading your file', done: 0, total: 0 });
    try {
      // Parsed on this device: the server's free plan cannot afford the CPU.
      setPrepared(await prepareImport(next, { sourceId, timezone }));
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
      setPrepared(null);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const confirm = async (policy: 'replace' | 'merge' | 'skip-overlap') => {
    if (!prepared) return;
    setBusy(true);
    onError?.('');
    try {
      onStarted?.();
      await runImport(prepared, { policy, sourceId, label, timezone, onProgress: setProgress });
      setPrepared(null);
      if (fileRef.current) fileRef.current.value = '';
      invalidate();
    } catch (err) {
      fail(
        `${err instanceof Error ? err.message : String(err)} Keep this tab open while importing; you can safely start again.`,
      );
    } finally {
      setBusy(false);
      setProgress(null);
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
          have a directory of files.{uploadLimitBytes ? ` Up to ${formatMb(uploadLimitBytes)}.` : ''}
        </p>
        {disabledReason && <p className="mb-3 text-sm text-text-muted">{disabledReason}</p>}
        {!preview && progress && (
          <div className="mt-3 space-y-1" aria-live="polite">
            <div className="flex justify-between text-xs text-text-muted">
              <span>{progress.stage}</span>
              {progress.total > 0 && (
                <span>
                  {progress.done.toLocaleString()} of {progress.total.toLocaleString()}
                </span>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-ui-progress ease-ui"
                style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 15}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">Keep this tab open until it finishes.</p>
          </div>
        )}
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
            className="sr-only"
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

      <AlertDialog open={Boolean(preview)} onOpenChange={(open) => !open && !busy && setPrepared(null)}>
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
          {progress && (
            <div className="mt-3 space-y-1" aria-live="polite">
              <div className="flex justify-between text-xs text-text-muted">
                <span>{progress.stage}</span>
                {progress.total > 0 && (
                  <span>
                    {progress.done.toLocaleString()} of {progress.total.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-ui-progress ease-ui"
                  style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 15}%` }}
                />
              </div>
              <p className="text-xs text-text-muted">Keep this tab open until it finishes.</p>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              variant="outline"
              title="Cancel this import"
              disabled={busy}
              onClick={() => setPrepared(null)}
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
