import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/brim/api";
import { journeyCostPath } from "../../lib/nav/paths";

type Row = {
  id: string;
  origin: string;
  destination: string;
  totalPence: number;
  energyPence?: number;
  chargesPence?: number;
  miles?: number;
  vehicleNickname?: string;
  hmrcPence?: number;
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
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function refresh() {
    const res = await api<{ journeys: Row[] }>("/api/brim/journeys");
    setRows(res.journeys);
    setSummary(await api<Summary>("/api/brim/journeys/summary").catch(() => null));
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function openDetail(id: string) {
    const row = await api<Detail>(`/api/brim/journeys/${id}`);
    setDetail(row);
  }

  return (
    <main className="mx-auto w-[min(720px,calc(100%-1.5rem))] py-6">
      <h1 className="font-display mb-2 text-3xl md:text-4xl">Journeys</h1>
      <p className="mb-6 text-text-muted">Snapshots. The number will not move if constants change.</p>
      {summary ? (
        <p className="tabular-nums font-mono mb-4 text-sm text-text-muted">
          This tax year: {summary.miles.toFixed(0)} miles, £{(summary.actualPence / 100).toFixed(2)} actual,
          HMRC would allow £{(summary.approvedPence / 100).toFixed(2)}
          {summary.crossedThreshold ? " (past 10,000 miles)." : "."}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="mb-6 w-full sm:w-auto"
        onClick={async () => {
          const res = await fetch("/api/brim/journeys/export", { credentials: "include" });
          const blob = await res.blob();
          const href = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = href;
          a.download = "journey-cost.csv";
          a.click();
          URL.revokeObjectURL(href);
        }}
      >
        Download CSV
      </Button>
      <ul className="grid gap-3">
        {rows.map((r) => {
          const label = routeLabel(r.origin, r.destination);
          return (
            <li key={r.id}>
              <Card className="grid gap-3">
                <Button variant="ghost"
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
                    {r.miles !== undefined ? ` · ${r.miles.toFixed(0)} mi` : ""}
                    {r.vehicleNickname ? ` · ${r.vehicleNickname}` : ""} · {r.createdAt.slice(0, 10)}
                  </p>
                </Button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button title="Estimate again"
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => navigate(journeyCostPath("estimate", r.id))}
                  >
                    Estimate again
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      if (!confirm("Delete this journey permanently?")) return;
                      await api(`/api/brim/journeys/${r.id}`, { method: "DELETE" });
                      toast("Journey deleted.");
                      setDetail(null);
                      await refresh();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {detail ? (
        <Card className="mt-6">
          <p className="mb-2 break-words" title={routeLabel(detail.origin, detail.destination)}>
            {detail.origin} to {detail.destination}
          </p>
          <p className="tabular-nums font-mono text-sm">
            £{(detail.totalPence / 100).toFixed(2)}
            {detail.totalLowPence !== undefined && detail.totalHighPence !== undefined
              ? ` (£${(detail.totalLowPence / 100).toFixed(0)}-${(detail.totalHighPence / 100).toFixed(0)})`
              : ""}
          </p>
          {detail.consumptionLabel ? <p className="mt-2 text-sm text-text-muted">{detail.consumptionLabel}</p> : null}
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
            <p className="mt-3 text-sm text-text-muted">Stored as the snapshot from the day you saved it.</p>
          )}
          <Button title="Estimate again" type="button" className="mt-4 w-full sm:w-auto" variant="outline" onClick={() => navigate(journeyCostPath("estimate", detail.id))}>
            Estimate again
          </Button>
        </Card>
      ) : null}
    </main>
  );
}
