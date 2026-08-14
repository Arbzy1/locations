import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Loader2,
  Upload,
  Trash2,
  Pencil,
  RefreshCw,
  Settings,
  User,
  CreditCard,
  Ruler,
  Download,
} from 'lucide-react';
import type { DataSourceInfo } from '../types';
import {
  useImportStatus,
  useInvalidateLocationQueries,
  useSources,
} from '../hooks/useApi';
import { authClient, useSession } from '../lib/auth';
import { useUnits } from '../lib/units';
import type { DistanceUnit } from '../utils/format';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Dialog, DialogContent } from './ui/dialog';
import PasswordInput from './PasswordInput';

export default function SettingsView() {
  const { data: session, refetch: refetchSession } = useSession();
  const { data: sources, isLoading } = useSources();
  const { unit, timezone, monthlyRecapEnabled, entitlements } = useUnits();
  const [poll, setPoll] = useState(false);
  const { data: importStatus } = useImportStatus({ poll });
  const invalidate = useInvalidateLocationQueries();

  const [label, setLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [merge, setMerge] = useState(false);
  const [reuploadSourceId, setReuploadSourceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(unit);
  const [tz, setTz] = useState(timezone ?? '');
  const [recapEnabled, setRecapEnabled] = useState(monthlyRecapEnabled);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSource, setDeleteSource] = useState<DataSourceInfo | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMsg, setAccountMsg] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const latest = importStatus?.latestJob;
  const user = session?.user as { email?: string; name?: string; emailVerified?: boolean } | undefined;

  useEffect(() => {
    setDistanceUnit(unit);
    setTz(timezone ?? '');
    setRecapEnabled(monthlyRecapEnabled);
  }, [unit, timezone, monthlyRecapEnabled]);

  useEffect(() => {
    if (user?.name) setDisplayName(user.name);
  }, [user?.name]);

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
      setError('Choose a Timeline JSON or Takeout zip');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (merge) form.append('merge', '1');
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
    setDeleteSource(null);
    invalidate();
  };

  const savePrefs = async () => {
    setError('');
    const res = await fetch('/api/account/settings', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distanceUnit,
        timezone: tz || null,
        monthlyRecapEnabled: recapEnabled,
      }),
    });
    if (!res.ok) {
      setError('Could not save preferences');
      return;
    }
    invalidate();
  };

  const startCheckout = async (interval: 'monthly' | 'yearly') => {
    setError('');
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interval }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      setError(body.error || 'Billing is not available');
      return;
    }
    window.location.assign(body.url);
  };

  const openPortal = async () => {
    setError('');
    const res = await fetch('/api/billing/portal', {
      method: 'POST',
      credentials: 'include',
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      setError(body.error || 'No billing account');
      return;
    }
    window.location.assign(body.url);
  };

  const deleteAccount = async () => {
    setError('');
    const res = await fetch('/api/account/delete', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      setError('Could not delete account');
      return;
    }
    window.location.assign('/');
  };

  const changePassword = async () => {
    setAccountMsg('');
    setError('');
    setAccountBusy(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        setError(result.error.message || 'Could not change password');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setAccountMsg('Password updated. Other sessions were signed out.');
    } catch {
      setError('Unable to change password.');
    } finally {
      setAccountBusy(false);
    }
  };

  const changeEmail = async () => {
    setAccountMsg('');
    setError('');
    if (!newEmail.trim()) {
      setError('Enter a new email');
      return;
    }
    setAccountBusy(true);
    try {
      const result = await authClient.changeEmail({ newEmail: newEmail.trim() });
      if (result.error) {
        setError(result.error.message || 'Could not change email');
        return;
      }
      setAccountMsg('Check the new inbox to confirm the email change.');
    } catch {
      setError('Unable to change email.');
    } finally {
      setAccountBusy(false);
    }
  };

  const changeDisplayName = async () => {
    setAccountMsg('');
    setError('');
    const next = displayName.trim();
    if (!next) {
      setError('Enter a display name');
      return;
    }
    setAccountBusy(true);
    try {
      const result = await authClient.updateUser({ name: next });
      if (result.error) {
        setError(result.error.message || 'Could not update name');
        return;
      }
      await refetchSession();
      setAccountMsg('Display name updated.');
    } catch {
      setError('Unable to update display name.');
    } finally {
      setAccountBusy(false);
    }
  };

  const exportData = async () => {
    setError('');
    setExportBusy(true);
    try {
      const res = await fetch('/api/account/export', { credentials: 'include' });
      if (!res.ok) {
        throw new Error('Could not export data');
      }
      const blob = await res.blob();
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `locations-export-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setAccountMsg('Download started.');
    } catch {
      setError('Unable to export data.');
    } finally {
      setExportBusy(false);
    }
  };

  const resendVerification = async () => {
    setAccountMsg('');
    setError('');
    if (!user?.email) return;
    setAccountBusy(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email: user.email,
        callbackURL: `${window.location.origin}/settings`,
      });
      if (result.error) {
        setError(result.error.message || 'Could not resend verification');
        return;
      }
      setAccountMsg('Verification email sent.');
    } catch {
      setError('Unable to resend verification.');
    } finally {
      setAccountBusy(false);
    }
  };

  const beginReupload = (source: DataSourceInfo) => {
    setReuploadSourceId(source.id);
    setLabel(source.label);
    setError('');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    fileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const status = entitlements?.status ?? 'none';
  const graceUntil = entitlements?.graceUntil;
  const graceActive =
    Boolean(graceUntil) &&
    new Date(graceUntil as string) > new Date() &&
    status !== 'active' &&
    status !== 'trialing';
  const graceUntilLabel = graceUntil
    ? new Date(graceUntil).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Settings size={20} />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-text">Settings</h1>
            <p className="text-sm text-text-muted">Account, billing, and Timeline data</p>
          </div>
        </div>

        <section className="mb-8 rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            <User size={12} />
            Account
          </div>
          <div className="text-sm text-text">{user?.name || 'User'}</div>
          <div className="mt-0.5 text-sm text-text-muted">{user?.email}</div>
          <p className="mt-1 text-xs text-text-muted">
            {user?.emailVerified ? 'Email verified' : 'Email not verified (required before import)'}
          </p>
          {accountMsg && <p className="mt-2 text-sm text-walk">{accountMsg}</p>}
          <div className="mt-4 border-t border-border pt-4">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              title="Your display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mb-2"
            />
            <Button
              type="button"
              variant="outline"
              title="Save display name"
              disabled={accountBusy}
              onClick={() => void changeDisplayName()}
            >
              Save name
            </Button>
          </div>
          {!user?.emailVerified && (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              title="Resend email verification link and code"
              disabled={accountBusy}
              onClick={() => void resendVerification()}
            >
              Resend verification
            </Button>
          )}
          <div className="mt-5 border-t border-border pt-4">
            <Label htmlFor="new-email">Change email</Label>
            <Input
              id="new-email"
              type="email"
              title="New account email (requires re-verification)"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="mb-2"
            />
            <Button
              type="button"
              variant="outline"
              title="Send confirmation to the new email"
              disabled={accountBusy}
              onClick={() => void changeEmail()}
            >
              Update email
            </Button>
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              title="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <Label htmlFor="settings-new-password" className="mt-3">
              New password
            </Label>
            <PasswordInput
              id="settings-new-password"
              autoComplete="new-password"
              title="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              title="Change password and sign out other sessions"
              disabled={accountBusy || !currentPassword || !newPassword}
              onClick={() => void changePassword()}
            >
              Change password
            </Button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              title="Download a JSON copy of your account summary"
              disabled={exportBusy}
              onClick={() => void exportData()}
            >
              {exportBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Export my data
            </Button>
          </div>
          <Button
            type="button"
            variant="destructive"
            className="mt-4"
            title="Delete account and all Timeline data"
            onClick={() => setDeleteOpen(true)}
          >
            Delete account
          </Button>
        </section>

        <section className="mb-8 rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            <CreditCard size={12} />
            Billing
          </div>
          <p className="mb-3 text-sm text-text-muted">
            Status: {status}
            {entitlements?.entitled ? ' (entitled)' : ''}
          </p>
          {graceActive && (
            <p className="mb-3 text-sm text-text">
              Payment failed. Import is paused. You still have read-only access until {graceUntilLabel}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" title="Subscribe monthly" onClick={() => void startCheckout('monthly')}>
              Subscribe monthly
            </Button>
            <Button
              type="button"
              variant="outline"
              title="Subscribe yearly"
              onClick={() => void startCheckout('yearly')}
            >
              Subscribe yearly
            </Button>
            <Button type="button" variant="outline" title="Open Stripe customer portal" onClick={() => void openPortal()}>
              Manage billing
            </Button>
          </div>
        </section>

        <section className="mb-8 rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            <Ruler size={12} />
            Display
          </div>
          <Label htmlFor="unit">Distance unit</Label>
          <select
            id="unit"
            title="Miles or kilometres"
            value={distanceUnit}
            onChange={(e) => setDistanceUnit(e.target.value as DistanceUnit)}
            className="mb-3 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text"
          >
            <option value="mi">Miles</option>
            <option value="km">Kilometres</option>
          </select>
          <Label htmlFor="tz">Timezone (IANA)</Label>
          <Input
            id="tz"
            title="IANA timezone such as Europe/London"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="Europe/London"
            className="mb-3"
          />
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="monthly-recap">Monthly recap email</Label>
              <p className="text-xs text-text-muted">
                Opt in to a counts-only recap after each month. No place names or coordinates.
              </p>
            </div>
            <Switch
              id="monthly-recap"
              title="Enable monthly recap email"
              checked={recapEnabled}
              onCheckedChange={setRecapEnabled}
            />
          </div>
          <Button type="button" title="Save display preferences" onClick={() => void savePrefs()}>
            Save preferences
          </Button>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            <Upload size={12} />
            Timeline data
          </div>
          <p className="mb-5 text-sm leading-relaxed text-text-muted">
            Upload Google Timeline JSON or a Takeout zip (Timeline.json / Records.json). In Takeout,
            select Location History only, then download. Merge keeps existing rows for this source.
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {(busy || latest?.status === 'pending' || latest?.status === 'processing') && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
              <Loader2 size={16} className="animate-spin" />
              Importing…{' '}
              {latest?.parsedCount
                ? `${latest.parsedCount} records parsed`
                : latest?.status === 'processing'
                  ? 'parsing file'
                  : 'queued'}
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
                <Label htmlFor="src-label">Label (Google account name)</Label>
                <Input
                  id="src-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. personal@gmail.com"
                  title="Label for this Google account / Timeline source"
                />
              </div>
            )}
            <div>
              <Label htmlFor="timeline-file">Timeline JSON or zip</Label>
              <input
                id="timeline-file"
                ref={fileRef}
                type="file"
                accept=".json,.zip,application/json,application/zip"
                title="Choose a Google Timeline JSON or Takeout zip"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent/20 file:px-3 file:py-1.5 file:text-sm file:text-accent"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="merge"
                title="Merge into existing source instead of replacing"
                checked={merge}
                onCheckedChange={setMerge}
              />
              <Label htmlFor="merge" className="mb-0">
                Merge (keep existing rows)
              </Label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                type="submit"
                disabled={busy || !file}
                title={
                  reuploadSourceId
                    ? 'Replace this source with the selected file'
                    : 'Upload Timeline JSON or zip'
                }
                className="flex-1"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {reuploadSourceId ? 'Replace Timeline data' : 'Upload Timeline data'}
              </Button>
              {reuploadSourceId && (
                <Button
                  type="button"
                  variant="outline"
                  title="Cancel re-upload and keep existing source data"
                  onClick={() => {
                    setReuploadSourceId(null);
                    setLabel('');
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                >
                  Cancel
                </Button>
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
              No Timeline data yet. Upload a JSON or zip export above.
            </p>
          )}

          <ul className="space-y-2">
            {sources?.map((source) => (
              <li key={source.id} className="rounded-lg border border-border bg-bg/40 px-4 py-3">
                {renameId === source.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void onRename(source);
                    }}
                  >
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      title="New label for this Timeline source"
                    />
                    <Button type="submit" title="Save the new source label">
                      Save
                    </Button>
                  </form>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text">{source.label}</div>
                      <div className="mt-0.5 text-xs text-text-muted">
                        {source.visitCount} visits · {source.activityCount} activities
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        title="Re-upload Timeline JSON to replace this source"
                        onClick={() => beginReupload(source)}
                      >
                        <RefreshCw size={12} />
                        Re-upload
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Rename this Timeline source"
                        aria-label="Rename"
                        onClick={() => {
                          setRenameId(source.id);
                          setRenameValue(source.label);
                        }}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Delete this Timeline source and its data"
                        aria-label="Delete"
                        onClick={() => setDeleteSource(source)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent title="Delete account">
          <h2 className="text-lg font-semibold">Delete account?</h2>
          <p className="mt-2 text-sm text-text-muted">
            This wipes Timeline data, uploads, and billing. This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" title="Cancel" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" title="Confirm delete account" onClick={() => void deleteAccount()}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteSource)} onOpenChange={(o) => !o && setDeleteSource(null)}>
        <DialogContent title="Delete source">
          <h2 className="text-lg font-semibold">Remove source?</h2>
          <p className="mt-2 text-sm text-text-muted">
            Remove “{deleteSource?.label}” and all visits from that Google account? Other sources stay.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" title="Cancel" onClick={() => setDeleteSource(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              title="Confirm delete source"
              onClick={() => deleteSource && void onDelete(deleteSource)}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
