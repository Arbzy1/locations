import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";
import { EjectField } from "../ui/eject-field";
import { Dialog, DialogContent } from "../ui/dialog";
import { useUnits } from "../../lib/units";
import { useInvalidateLocationQueries } from "../../hooks/useApi";

const OPTIONS = [
  { value: "", label: "Forever" },
  { value: "1", label: "1 year" },
  { value: "2", label: "2 years" },
  { value: "3", label: "3 years" },
  { value: "5", label: "5 years" },
  { value: "10", label: "10 years" },
];

/** Auto-delete: keep only the last N years of location history. */
export default function RetentionCard({
  onMessage,
  onError,
}: {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { retentionYears } = useUnits();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateLocationQueries();
  const [choice, setChoice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const current = retentionYears ? String(retentionYears) : "";
  const selected = choice ?? current;

  const save = async () => {
    onError("");
    const res = await fetch("/api/account/settings", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retentionYears: selected ? Number(selected) : null }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      onError(body.error || "Could not save");
      return;
    }
    setChoice(null);
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    // Older days are removed in the background; refresh shortly so they disappear.
    window.setTimeout(invalidate, 4000);
    onMessage(selected ? `Keeping the last ${selected} year${selected === "1" ? "" : "s"}.` : "Keeping everything.");
  };

  const shrinking = Boolean(selected) && (!current || Number(selected) < Number(current));

  return (
    <Card>
      <CardTitle className="text-base">Keep history for</CardTitle>
      <p className="mt-1 mb-4 text-sm text-text-muted">
        Older days are deleted for good, now and on the first of every month. Re-import your
        Google export to get them back.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <EjectField label="Keep" htmlFor="retention-years">
          <select
            id="retention-years"
            title="How many years of history to keep"
            value={selected}
            onChange={(e) => setChoice(e.target.value)}
            className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </EjectField>
        <Button
          type="button"
          title="Save how long to keep history"
          disabled={selected === current}
          onClick={() => (shrinking ? setConfirmOpen(true) : void save())}
        >
          Save
        </Button>
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title="Delete older history">
          <h2 className="text-lg font-semibold">
            Delete history older than {selected} year{selected === "1" ? "" : "s"}?
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Every stay and journey before then is removed now. This cannot be undone here.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" title="Keep everything as it is" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              title="Delete older history"
              onClick={() => {
                setConfirmOpen(false);
                void save();
              }}
            >
              Delete older history
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
