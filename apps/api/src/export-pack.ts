import { zipSync, strToU8 } from "fflate";

export type ExportAccountPayload = {
  tenant: string;
  exportedAt: string;
  overview: {
    total_visits?: number;
    total_activities?: number;
    date_range?: [string, string];
    days_with_data?: number;
    unique_places?: number;
  };
  sources: Array<{ id: string; label: string; visitCount?: number; activityCount?: number }>;
  settings: unknown;
  labels: unknown;
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

export function rowsToJsonl(rows: unknown[]): string {
  if (rows.length === 0) return "";
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

export function buildExportReadmeHtml(payload: ExportAccountPayload): string {
  const range = payload.overview.date_range;
  const from = range?.[0] ? escapeHtml(range[0]) : "none";
  const to = range?.[1] ? escapeHtml(range[1]) : "none";
  const sources = payload.sources
    .map(
      (s) =>
        `<li>${escapeHtml(s.label)} (${s.visitCount ?? 0} visits, ${s.activityCount ?? 0} activities)</li>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Locations GDPR pack</title>
</head>
<body>
  <h1>Locations data pack</h1>
  <p>This ZIP is your copy of Timeline data stored in Locations. It has no map tiles and no third-party map keys.</p>
  <p>Exported at ${escapeHtml(payload.exportedAt)} for tenant ${escapeHtml(payload.tenant)}.</p>
  <h2>Contents</h2>
  <ul>
    <li><code>account.json</code>: overview, sources, settings, and place labels</li>
    <li><code>visits.jsonl</code>: one visit per line</li>
    <li><code>activities.jsonl</code>: one activity per line</li>
  </ul>
  <h2>Counts</h2>
  <ul>
    <li>Visits: ${payload.overview.total_visits ?? 0}</li>
    <li>Activities: ${payload.overview.total_activities ?? 0}</li>
    <li>Days with data: ${payload.overview.days_with_data ?? 0}</li>
    <li>Unique places: ${payload.overview.unique_places ?? 0}</li>
    <li>Date range: ${from} to ${to}</li>
  </ul>
  <h2>Sources</h2>
  <ul>${sources || "<li>None</li>"}</ul>
  <h2>Rights</h2>
  <p>UK GDPR access and portability. This file is for you. Do not email it to Locations support. Delete your account in Settings to erase hosted copies.</p>
</body>
</html>
`;
}

export function buildGdprPackZip(opts: {
  account: ExportAccountPayload;
  visits: unknown[];
  activities: unknown[];
}): Uint8Array {
  const readme = buildExportReadmeHtml(opts.account);
  return zipSync({
    "account.json": strToU8(`${JSON.stringify(opts.account, null, 2)}\n`),
    "visits.jsonl": strToU8(rowsToJsonl(opts.visits)),
    "activities.jsonl": strToU8(rowsToJsonl(opts.activities)),
    "README.html": strToU8(readme),
  });
}

export function publicExportJob(job: {
  id: string;
  status: string;
  error?: string | null;
  visitCount?: number | null;
  activityCount?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}) {
  return {
    id: job.id,
    status: job.status,
    error: job.error ?? null,
    visitCount: job.visitCount ?? null,
    activityCount: job.activityCount ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
