import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Loader2,
  Upload,
  Trash2,
  Pencil,
  X,
  Database,
  RefreshCw,
} from 'lucide-react';
import type { DataSourceInfo } from '../types';
import {
  useImportStatus,
  useInvalidateLocationQueries,
  useSources,
} from '../hooks/useApi';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SourcesPanel({ open, onClose }: Props) {
  const { data: sources, isLoading } = useSources();
  const [poll, setPoll] = useState(false);
  const { data: importStatus } = useImportStatus({ poll });
  const invalidate = useInvalidateLocationQueries();

  const [label, setLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [reuploadSourceId, setReuploadSourceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const latest = importStatus?.latestJob;

  useEffect(() => {
    if (latest?.status === 'ready') {
      setPoll(false);
      setBusy(false);
      invalidate();
      setFile(null);
      setLabel('');
      setReuploadSourceId(null);
      if (fileRef.current) fileRef.current.value = '';
    } else if (latest?.status === 'error') {
      setPoll(false);
      setBusy(false);
      setError(latest.error || 'Import failed');
    }
  }, [latest?.status, latest?.error, latest?.id, invalidate]);

  if (!open) return null;

  const startImport = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Choose a Timeline JSON file');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (reuploadSourceId) {
        form.append('sourceId', reuploadSourceId);
      } else if (label.trim()) {
        form.append('label', label.trim());
      }
      const res = await fetch('/api/import', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        jobId?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      setPoll(true);
      invalidate();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onRename = async (source: DataSourceInfo) => {
    const next = renameValue.trim();
    if (!next || next === source.label) {
      setRenameId(null);
      return;
    }
    setError('');
    const res = await fetch(`/api/sources/${source.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: next }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error || 'Rename failed');
      return;
    }
    setRenameId(null);
    invalidate();
  };

  const onDelete = async (source: DataSourceInfo) => {
    if (
      !confirm(
        `Remove “${source.label}” and all visits/activities from that Google account? Other sources stay.`,
      )
    ) {
      return;
    }
    setError('');
    const res = await fetch(`/api/sources/${source.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error || 'Delete failed');
      return;
    }
    invalidate();
  };

  const beginReupload = (source: DataSourceInfo) => {
    setReuploadSourceId(source.id);
    setLabel(source.label);
    setError('');
    fileRef.current?.click();
  };

  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-black/50">
      <button
        type="button"
        className="flex-1 cursor-default"
        aria-label="Close sources panel"
        onClick={onClose}
      />
      <div className="flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-accent" />
            <h2 className="font-display text-sm font-semibold">Data sources</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-bg/50 hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-4 text-xs leading-relaxed text-text-muted">
            Add a Timeline JSON export for each Google account. Everything merges into one map
            view. Re-uploading replaces only that account’s data.
          </p>

          {error && (
            <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {(busy || latest?.status === 'pending' || latest?.status === 'processing') && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
              <Loader2 size={14} className="animate-spin" />
              Importing… {latest?.status === 'processing' ? 'parsing' : 'queued'}
            </div>
          )}

          {latest?.status === 'ready' && !busy && (
            <div className="mb-3 rounded-lg border border-walk/40 bg-walk/10 px-3 py-2 text-xs text-walk">
              Imported {latest.visitCount ?? 0} visits, {latest.activityCount ?? 0} activities.
            </div>
          )}

          <form onSubmit={startImport} className="mb-6 space-y-3 rounded-lg border border-border bg-bg/40 p-3">
            <div className="text-xs font-medium text-text">
              {reuploadSourceId ? `Re-upload: ${label}` : 'Add Google account'}
            </div>
            {!reuploadSourceId && (
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label (e.g. personal@gmail.com)"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-text-muted file:mr-2 file:rounded-md file:border-0 file:bg-accent/20 file:px-2 file:py-1 file:text-accent"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || !file}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {reuploadSourceId ? 'Replace data' : 'Import'}
              </button>
              {reuploadSourceId && (
                <button
                  type="button"
                  onClick={() => {
                    setReuploadSourceId(null);
                    setLabel('');
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  className="rounded-md border border-border px-3 py-2 text-sm text-text-muted hover:text-text"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            Sources ({sources?.length ?? 0})
          </div>

          {isLoading && (
            <div className="flex justify-center py-8 text-text-muted">
              <Loader2 className="animate-spin" size={20} />
            </div>
          )}

          {!isLoading && (!sources || sources.length === 0) && (
            <p className="py-6 text-center text-sm text-text-muted">
              No sources yet. Import your first Timeline JSON above.
            </p>
          )}

          <ul className="space-y-2">
            {sources?.map((source) => (
              <li
                key={source.id}
                className="rounded-lg border border-border bg-bg/30 px-3 py-2.5"
              >
                {renameId === source.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void onRename(source);
                    }}
                  >
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="flex-1 rounded-md border border-border bg-bg px-2 py-1 text-sm"
                    />
                    <button type="submit" className="text-xs text-accent">
                      Save
                    </button>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{source.label}</div>
                      <div className="mt-0.5 text-xs text-text-muted">
                        {source.visitCount} visits · {source.activityCount} activities
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        title="Rename"
                        onClick={() => {
                          setRenameId(source.id);
                          setRenameValue(source.label);
                        }}
                        className="rounded p-1.5 text-text-muted hover:bg-bg hover:text-text"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title="Re-upload"
                        onClick={() => beginReupload(source)}
                        className="rounded p-1.5 text-text-muted hover:bg-bg hover:text-text"
                      >
                        <RefreshCw size={14} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => void onDelete(source)}
                        className="rounded p-1.5 text-text-muted hover:bg-bg hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
