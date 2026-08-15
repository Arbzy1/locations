import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";
import { Dialog, DialogContent } from "../ui/dialog";

type Props = {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
};

export default function SettingsPrivacy({ onMessage, onError }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [packBusy, setPackBusy] = useState(false);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportData = async () => {
    onError("");
    setExportBusy(true);
    try {
      const res = await fetch("/api/account/export", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Could not export data");
      }
      const blob = await res.blob();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `locations-export-${stamp}.json`);
      onMessage("Summary download started.");
    } catch {
      onError("Unable to export data.");
    } finally {
      setExportBusy(false);
    }
  };

  const downloadPackFile = async (jobId: string) => {
    const fileRes = await fetch(`/api/account/export-pack/${jobId}/file`, { credentials: "include" });
    if (!fileRes.ok) {
      const body = (await fileRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Could not download pack");
    }
    const blob = await fileRes.blob();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `locations-gdpr-pack-${stamp}.zip`);
    onMessage("GDPR pack download started.");
  };

  const exportPack = async () => {
    onError("");
    setPackBusy(true);
    try {
      const start = await fetch("/api/account/export-pack", {
        method: "POST",
        credentials: "include",
      });
      const started = (await start.json().catch(() => ({}))) as {
        jobId?: string;
        job?: { id?: string; status?: string };
        error?: string;
        status?: string;
      };
      if (!start.ok && start.status !== 409) {
        throw new Error(started.error || "Could not start GDPR pack");
      }
      const jobId = started.jobId || started.job?.id;
      if (!jobId) {
        throw new Error("Could not start GDPR pack");
      }
      for (let i = 0; i < 90; i += 1) {
        const statusRes = await fetch(`/api/account/export-pack/${jobId}`, { credentials: "include" });
        const statusBody = (await statusRes.json().catch(() => ({}))) as {
          status?: string;
          error?: string;
        };
        if (!statusRes.ok) {
          throw new Error(statusBody.error || "Could not check pack status");
        }
        if (statusBody.status === "ready") {
          await downloadPackFile(jobId);
          return;
        }
        if (statusBody.status === "error") {
          throw new Error(statusBody.error || "Pack failed");
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      throw new Error("Pack is still building. Try again in a moment.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to download GDPR pack.");
    } finally {
      setPackBusy(false);
    }
  };

  const deleteAccount = async () => {
    onError("");
    const res = await fetch("/api/account/delete", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      onError("Could not delete account");
      return;
    }
    window.location.assign("/");
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardTitle className="text-base">Downloads</CardTitle>
        <p className="mt-1 mb-4 text-sm text-text-muted">
          Downloads stay in this browser. We never email coordinates or place names. The GDPR pack
          includes visits and activities as JSONL plus an HTML summary with no map tiles.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            title="Download a JSON summary of account, sources, settings, and labels"
            disabled={exportBusy}
            onClick={() => void exportData()}
          >
            {exportBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download summary JSON
          </Button>
          <Button
            type="button"
            title="Build and download a GDPR pack ZIP of your Timeline"
            disabled={packBusy}
            onClick={() => void exportPack()}
          >
            {packBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {packBusy ? "Building pack…" : "Download GDPR pack"}
          </Button>
        </div>
      </Card>

      <Card className="border-red-500/30">
        <CardTitle className="text-base text-red-400">Danger zone</CardTitle>
        <p className="mt-1 mb-4 text-sm text-text-muted">
          Delete your account and all Timeline data. To remove one Google export only, use Timeline
          data.
        </p>
        <Button
          type="button"
          variant="destructive"
          title="Delete account and all Timeline data"
          onClick={() => setDeleteOpen(true)}
        >
          Delete account
        </Button>
      </Card>

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
            <Button
              type="button"
              variant="destructive"
              title="Confirm delete account"
              onClick={() => void deleteAccount()}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
