import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Loader2,
  Upload,
  Trash2,
  Pencil,
  RefreshCw,
  Settings,
  User,
} from 'lucide-react';
import type { DataSourceInfo } from '../types';
import {
  useImportStatus,
  useInvalidateLocationQueries,
  useSources,
} from '../hooks/useApi';
import { useSession } from '../lib/auth';

export default function SettingsView() {
  const { data: session } = useSession();
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
  const user = session?.user as { email?: string; name?: string } | undefined;

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
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    fileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Settings size={20} />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-text">Settings</h1>
            <p className="text-sm text-text-muted">Account and Timeline data</p>
          </div>
        </div>

        <section className="mb-8 rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            <User size={12} />
            Account
          </div>
          <div className="text-sm text-text">{user?.name || 'User'}</div>
          <div className="mt-0.5 text-sm text-text-muted">{user?.email}</div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            <Upload size={12} />
            Timeline data
          </div>
          <p className="mb-5 text-sm leading-relaxed text-text-muted">
            Upload a Google Timeline JSON export (visit/activity array, Timeline Edits, or
            semanticSegments). Replacing a source updates only that Google account’s data.
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {(busy || latest?.status === 'pending' || latest?.status === 'processing') && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
              <Loader2 size={16} className="animate-spin" />
              Importing… {latest?.status === 'processing' ? 'parsing file' : 'queued'}
            </div>
          )}

          {latest?.status === 'ready' && !busy && (
            <div className="mb-4 rounded-lg border border-walk/40 bg-walk/10 px-3 py-2 text-sm text-walk">
              Imported {latest.visitCount ?? 0} visits, {latest.activityCount ?? 0} activities.
              Map views will refresh automatically.
            </div>
          )}

          <form
            onSubmit={startImport}
            className="mb-6 space-y-3 rounded-lg border border-border bg-bg/50 p-4"
          >
            <div className="text-sm font-medium text-text">
              {reuploadSourceId ? `Replace data: ${label}` : 'Add or update Timeline'}
            </div>
            {!reuploadSourceId && (
              <div>
                <label className="mb-1 block text-xs text-text-muted">
                  Label (Google account name)
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. personal@gmail.com"
                  title="Label for this Google account / Timeline source"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-text-muted">Timeline JSON file</label>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                title="Choose a Google Timeline JSON export to upload"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent/20 file:px-3 file:py-1.5 file:text-sm file:text-accent"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={busy || !file}
                title={
                  reuploadSourceId
                    ? 'Replace this source with the selected Timeline JSON'
                    : 'Upload Timeline JSON as a new or updated source'
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-bg transition-colors duration-300 ease-out hover:brightness-110 disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {reuploadSourceId ? 'Replace Timeline data' : 'Upload Timeline data'}
              </button>
              {reuploadSourceId && (
                <button
                  type="button"
                  title="Cancel re-upload and keep existing source data"
                  onClick={() => {
                    setReuploadSourceId(null);
                    setLabel('');
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  className="rounded-md border border-border px-4 py-2.5 text-sm text-text-muted transition-colors duration-300 ease-out hover:text-text"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">
            Your sources ({sources?.length ?? 0})
          </div>

          {isLoading && (
            <div className="flex justify-center py-8 text-text-muted">
              <Loader2 className="animate-spin" size={20} />
            </div>
          )}

          {!isLoading && (!sources || sources.length === 0) && (
            <p className="py-4 text-center text-sm text-text-muted">
              No Timeline data yet. Upload a JSON export above.
            </p>
          )}

          <ul className="space-y-2">
            {sources?.map((source) => (
              <li
                key={source.id}
                className="rounded-lg border border-border bg-bg/40 px-4 py-3"
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
                      title="New label for this Timeline source"
                      className="flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
                    />
                    <button
                      type="submit"
                      title="Save the new source label"
                      className="text-sm text-accent"
                    >
                      Save
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text">{source.label}</div>
                      <div className="mt-0.5 text-xs text-text-muted">
                        {source.visitCount} visits · {source.activityCount} activities
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title="Re-upload Timeline JSON to replace this source"
                        onClick={() => beginReupload(source)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors duration-300 ease-out hover:bg-accent/20"
                      >
                        <RefreshCw size={12} />
                        Re-upload
                      </button>
                      <button
                        type="button"
                        title="Rename this Timeline source"
                        aria-label="Rename"
                        onClick={() => {
                          setRenameId(source.id);
                          setRenameValue(source.label);
                        }}
                        className="rounded p-1.5 text-text-muted transition-colors duration-300 ease-out hover:bg-bg hover:text-text"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title="Delete this Timeline source and its data"
                        aria-label="Delete"
                        onClick={() => void onDelete(source)}
                        className="rounded p-1.5 text-text-muted transition-colors duration-300 ease-out hover:bg-bg hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
