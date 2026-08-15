import { useEffect, useState } from "react";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import type { DataSourceInfo } from "../../types";
import { useImportStatus, useInvalidateLocationQueries, useSources } from "../../hooks/useApi";
import { useSession } from "../../lib/auth";
import { PLACE_COLOR_TOKENS, sourceTokenVar } from "../../lib/hotspots";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent } from "../ui/dialog";
import { AlertDialog, AlertDialogContent } from "../ui/alert-dialog";
import ImportDropZone, { TIMEZONE_SKEW_COPY } from "../explorer/ImportDropZone";

type Props = {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
};

export default function SettingsTimeline({ onMessage, onError }: Props) {
  const { data: session } = useSession();
  const { data: sources, isLoading } = useSources();
  const [poll, setPoll] = useState(false);
  const { data: importStatus } = useImportStatus({ poll });
  const invalidate = useInvalidateLocationQueries();
  const user = session?.user as { role?: string } | undefined;
  const isDemo = user?.role === "demo";

  const [label, setLabel] = useState("");
  const [reuploadSourceId, setReuploadSourceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteSource, setDeleteSource] = useState<DataSourceInfo | null>(null);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeSourceId, setRangeSourceId] = useState("");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rewarmBusy, setRewarmBusy] = useState(false);
  const [rewarmMsg, setRewarmMsg] = useState("");

  const latest = importStatus?.latestJob;

  useEffect(() => {
    if (latest?.status === "ready") {
      setPoll(false);
      setBusy(false);
      invalidate();
      setLabel("");
      setReuploadSourceId(null);
    } else if (latest?.status === "error") {
      setPoll(false);
      setBusy(false);
      onError(latest.error || "Import failed");
    }
  }, [latest?.status, latest?.error, latest?.id, invalidate, onError]);

  const onRename = async (source: DataSourceInfo) => {
    const next = renameValue.trim();
    if (!next || next === source.label) {
      setRenameId(null);
      return;
    }
    onError("");
    const res = await fetch(`/api/sources/${source.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: next }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      onError(body.error || "Rename failed");
      return;
    }
    setRenameId(null);
    invalidate();
  };

  const onDelete = async (source: DataSourceInfo) => {
    onError("");
    const res = await fetch(`/api/sources/${source.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      onError(body.error || "Delete failed");
      return;
    }
    setDeleteSource(null);
    invalidate();
  };

  const patchSourceColor = async (source: DataSourceInfo, color: string | null) => {
    onError("");
    const res = await fetch(`/api/sources/${source.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      onError(body.error || "Could not update colour");
      return;
    }
    invalidate();
  };

  const deleteRange = async () => {
    onError("");
    const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
    if (rangeSourceId) params.set("sourceId", rangeSourceId);
    const res = await fetch(`/api/days?${params.toString()}`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      onError(body.error || "Could not delete that date range");
      return;
    }
    setRangeOpen(false);
    invalidate();
  };

  const rewarm = async () => {
    setRewarmBusy(true);
    setRewarmMsg("");
    onError("");
    try {
      const res = await fetch("/api/routes/rewarm", { method: "POST", credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        warmed?: number;
        remaining?: number;
      };
      if (!res.ok) throw new Error(body.error || "Rewarm failed");
      setRewarmMsg(`Warmed ${body.warmed ?? 0} routes. ${body.remaining ?? 0} remaining.`);
      invalidate();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setRewarmBusy(false);
    }
  };

  const beginReupload = (source: DataSourceInfo) => {
    setReuploadSourceId(source.id);
    setLabel(source.label);
    onError("");
    document.getElementById("timeline-upload")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle className="text-base">Add or replace Timeline</CardTitle>
        <p className="mt-1 mb-4 text-sm leading-relaxed text-text-muted">
          Upload Google Timeline JSON or a Takeout zip (Timeline.json / Records.json). Zip the
          Takeout folder if you have a directory. After a drop we preview which file won and how
          days overlap, then you choose replace, merge, or skip overlapping days.
        </p>

        {importStatus?.timezoneWarning?.warn && (
          <p className="mb-4 rounded-lg border border-border bg-bg/60 px-3 py-2 text-sm text-text-muted">
            {TIMEZONE_SKEW_COPY}
          </p>
        )}

        {(busy || latest?.status === "pending" || latest?.status === "processing") && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
            <Loader2 size={16} className="animate-spin" />
            Importing…{" "}
            {latest?.parsedCount
              ? `${latest.parsedCount} records parsed`
              : latest?.status === "processing"
                ? "parsing file"
                : "queued"}
          </div>
        )}

        {latest?.status === "ready" && !busy && (
          <div className="mb-4 rounded-lg border border-walk/40 bg-walk/10 px-3 py-2 text-sm text-walk">
            Imported {latest.visitCount ?? 0} visits, {latest.activityCount ?? 0} activities
            {latest.chosenFile ? ` from ${latest.chosenFile}` : ""}. Map views will refresh
            automatically.
          </div>
        )}

        <div id="timeline-upload" className="space-y-3 rounded-lg border border-border bg-bg/50 p-4">
          <div className="text-sm font-medium text-text">
            {reuploadSourceId ? `Replace data: ${label}` : "Add or update Timeline"}
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
          <ImportDropZone
            sourceId={reuploadSourceId}
            label={label}
            disabled={isDemo || busy}
            disabledReason={isDemo ? "Demo accounts cannot import Timeline data." : undefined}
            onStarted={() => {
              setPoll(true);
              setBusy(true);
              onMessage("");
            }}
            onError={(msg) => onError(msg)}
          />
          {reuploadSourceId && (
            <Button
              type="button"
              variant="outline"
              title="Cancel re-upload and keep existing source data"
              onClick={() => {
                setReuploadSourceId(null);
                setLabel("");
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle className="text-base">Your sources ({sources?.length ?? 0})</CardTitle>
        {isLoading && (
          <div className="flex justify-center py-8 text-text-muted">
            <Loader2 className="animate-spin" size={20} />
          </div>
        )}
        {!isLoading && (!sources || sources.length === 0) && (
          <p className="py-4 text-sm text-text-muted">
            No Timeline data yet. Upload a JSON or zip export above.
          </p>
        )}
        <ul className="mt-3 space-y-2">
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
                    <div className="mt-2 flex flex-wrap gap-1">
                      {PLACE_COLOR_TOKENS.map((token) => (
                        <Button
                          key={token}
                          type="button"
                          size="icon"
                          variant="outline"
                          title={`Set ${source.label} colour to ${token}`}
                          aria-label={`Set ${source.label} colour to ${token}`}
                          className={source.color === token ? "ring-2 ring-text" : ""}
                          onClick={() => void patchSourceColor(source, token)}
                          disabled={isDemo}
                        >
                          <span
                            className="h-5 w-5 rounded-full"
                            style={{ background: sourceTokenVar(token) }}
                          />
                        </Button>
                      ))}
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
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="text-base">Delete a date range</CardTitle>
          <p className="mt-1 mb-4 text-xs text-text-muted">
            Removes visits and journeys in this window, then rebuilds day stats. Route cache is
            kept.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="range-from">From</Label>
              <Input
                id="range-from"
                type="date"
                title="Start date to delete"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="range-to">To</Label>
              <Input
                id="range-to"
                type="date"
                title="End date to delete"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3">
            <Label htmlFor="range-source">Source (optional)</Label>
            <select
              id="range-source"
              title="Limit delete to one Timeline source"
              value={rangeSourceId}
              onChange={(e) => setRangeSourceId(e.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text"
            >
              <option value="">All sources</option>
              {sources?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="destructive"
            className="mt-4"
            disabled={isDemo || !rangeFrom || !rangeTo || rangeFrom > rangeTo}
            title="Delete visits in this date range"
            onClick={() => setRangeOpen(true)}
          >
            Delete date range
          </Button>
        </Card>

        <Card>
          <CardTitle className="text-base">Predicted routes</CardTitle>
          <p className="mt-1 mb-4 text-xs text-text-muted">
            Warm up to 100 uncached walking/driving journeys. Click again if more remain. Flights
            and rail are skipped.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={isDemo || rewarmBusy}
            title="Reprocess uncached predicted routes"
            onClick={() => void rewarm()}
          >
            {rewarmBusy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Reprocess routes
          </Button>
          {rewarmMsg && <p className="mt-3 text-sm text-text-muted">{rewarmMsg}</p>}
        </Card>
      </div>

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

      <AlertDialog open={rangeOpen} onOpenChange={setRangeOpen}>
        <AlertDialogContent title="Delete date range">
          <h2 className="text-lg font-semibold">Delete this date range?</h2>
          <p className="mt-2 text-sm text-text-muted">
            Remove visits from {rangeFrom} to {rangeTo}
            {rangeSourceId ? " for the selected source" : " for all sources"}. Day stats will
            rebuild. This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" title="Cancel" onClick={() => setRangeOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              title="Confirm delete date range"
              onClick={() => void deleteRange()}
            >
              Delete range
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
