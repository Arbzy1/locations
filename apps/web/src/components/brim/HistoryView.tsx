import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { EmptyState, ErrorState } from "../ui/states";
import { api, asList } from "../../lib/brim/api";
import { formatBrimDistance, formatBrimMiles } from "../../lib/brim/units";
import { journeyCostPath } from "../../lib/nav/paths";
import { useUnits } from "../../lib/units";
import { useSession } from "../../lib/auth";

type Row = {
  id: string;
  origin: string;
  destination: string;
  distanceMeters?: number;
  totalPence: number;
  energyPence?: number;
  chargesPence?: number;
  miles?: number;
  vehicleNickname?: string;
  hmrcPence?: number;
  departsAt?: string;
  createdAt: string;
};

type Detail = Row & {
  reasons?: string[];
  consumptionLabel?: string;
  hmrc?: { approvedPence?: number; ytdMiles?: number };
  totalLowPence?: number;
  totalHighPence?: number;
};

type Summary = {
  miles: number;
  actualPence: number;
  approvedPence: number;
  crossedThreshold: boolean;
};

function routeLabel(origin: string, destination: string): string {
  return `${origin} to ${destination}`;
}

export function HistoryView() {
  const navigate = useNavigate();
  const { unit } = useUnits();
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === "demo";
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ journeys: Row[] }>("/api/brim/journeys");
      setRows(asList(res.journeys));
      setSummary(await api<Summary>("/api/brim/journeys/summary").catch(() => null));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not load saved journeys.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function openDetail(id: string) {
    try {
      const row = await api<Detail>(`/api/brim/journeys/${id}`);
      setDetail(row);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Could not load journey details.");
    }
  }

  async function downloadCsv() {
    try {
      const res = await fetch("/api/brim/journeys/export", { credentials: "include" });
      if (!res.ok) {
        toast.error("Could not download your journeys CSV.");
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `journey-cost-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(href);
      toast("CSV download started.");
    } catch {
      toast.error("Could not download your journeys CSV.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try {
      await api(`/api/brim/journeys/${id}`, { method: "DELETE" });
      toast("Journey deleted.");
      if (detail?.id === id) setDetail(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Could not delete journey.");
    }
  }

  function formatRowDistance(r: Row): string | null {
    if (r.distanceMeters !== undefined) return formatBrimDistance(r.distanceMeters, unit, 0);
    if (r.miles !== undefined) return formatBrimMiles(r.miles, unit, 0);
    return null;
  }

  return (
    <main className="mx-auto w-[min(720px,calc(100%-1.5rem))] py-6">
      <h1 className="font-display mb-2 text-3xl md:text-4xl">Journeys</h1>
      <p className="mb-6 text-text-muted">Snapshots. The number will not move if constants change.</p>
      {summary ? (
        <p className="tabular-nums font-mono mb-4 text-sm text-text-muted">
          This tax year: {summary.miles.toFixed(0)} miles (HMRC statutory), £
          {(summary.actualPence / 100).toFixed(2)} actual, HMRC would allow £
          {(summary.approvedPence / 100).toFixed(2)}
          {summary.crossedThreshold ? " (past 10,000 miles)." : "."}
        </p>
      ) : null}

      {loading ? (
        <Card aria-busy="true">
          <Skeleton className="mb-3 h-10 w-44" />
          <Skeleton className="mb-2 h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </Card>
      ) : error ? (
        <ErrorState
          title="Could not load journeys"
          message={error}
          onRetry={() => void refresh()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No saved journeys yet"
          body="Price a trip on Estimate and tap Save journey to keep a snapshot for your records or HMRC mileage tally."
          action={
            <Button asChild title="Go to Estimate to price a trip">
              <Link to={journeyCostPath("estimate")}>Estimate a trip</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Button
            title="Download saved journeys as CSV"
            type="button"
            variant="outline"
            className="mb-6 w-full sm:w-auto"
            onClick={() => void downloadCsv()}
          >
            Download CSV
          </Button>
          <ul className="grid gap-3">
            {rows.map((r) => {
              const label = routeLabel(r.origin, r.destination);
              const distText = formatRowDistance(r);
              return (
                <li key={r.id}>
                  <Card className="grid gap-3">
                    <Button
                      variant="ghost"
                      type="button"
                      className="h-auto min-h-11 w-full flex-col items-stretch px-0 text-left text-text"
                      title={label}
                      onClick={() => void openDetail(r.id)}
                    >
                      <p className="break-words">
                        <span className="line-clamp-2">{r.origin}</span>
                        <span className="text-text-muted"> to </span>
                        <span className="line-clamp-2">{r.destination}</span>
                      </p>
                      <p className="tabular-nums font-mono mt-1 text-sm text-text-muted">
                        £{(r.totalPence / 100).toFixed(2)}
                        {distText ? ` · ${distText}` : ""}
                        {r.vehicleNickname ? ` · ${r.vehicleNickname}` : ""} ·{" "}
                        {(r.departsAt ?? r.createdAt).slice(0, 10)}
                      </p>
                    </Button>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        title="Open this journey on Estimate"
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => navigate(journeyCostPath("estimate", r.id))}
                      >
                        Estimate again
                      </Button>
                      <Button
                        title={isDemo ? "Demo account cannot delete journeys" : "Delete this saved journey"}
                        type="button"
                        variant="destructive"
                        disabled={isDemo}
                        className="w-full sm:w-auto"
                        onClick={() => setDeleteTarget(r)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {detail ? (
        <Card className="mt-6">
          <p className="mb-2 break-words" title={routeLabel(detail.origin, detail.destination)}>
            {detail.origin} to {detail.destination}
          </p>
          <p className="tabular-nums font-mono text-sm">
            £{(detail.totalPence / 100).toFixed(2)}
            {detail.totalLowPence !== undefined && detail.totalHighPence !== undefined
              ? ` (£${(detail.totalLowPence / 100).toFixed(0)} to £${(detail.totalHighPence / 100).toFixed(0)})`
              : ""}
          </p>
          {detail.consumptionLabel ? (
            <p className="mt-2 text-sm text-text-muted">{detail.consumptionLabel}</p>
          ) : null}
          {detail.hmrc?.approvedPence !== undefined ? (
            <p className="tabular-nums font-mono mt-2 text-sm text-text-muted">
              HMRC would allow £{(detail.hmrc.approvedPence / 100).toFixed(2)}.
            </p>
          ) : null}
          {detail.reasons && detail.reasons.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-text-muted">
              {detail.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-muted">
              Stored as the snapshot from the day you saved it.
            </p>
          )}
          <Button
            title="Open this journey on Estimate"
            type="button"
            className="mt-4 w-full sm:w-auto"
            variant="outline"
            onClick={() => navigate(journeyCostPath("estimate", detail.id))}
          >
            Estimate again
          </Button>
        </Card>
      ) : null}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved journey?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This permanently deletes "${deleteTarget.origin} to ${deleteTarget.destination}" from your journey history.`
                : "This permanently deletes this saved journey."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel title="Keep journey">Cancel</AlertDialogCancel>
            <AlertDialogAction title="Confirm deleting journey" onClick={() => void confirmDelete()}>
              Delete journey
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
