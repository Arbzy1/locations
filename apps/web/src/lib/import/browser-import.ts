/**
 * Browser-driven import for the Workers free plan (10 ms CPU per request): the export is
 * parsed and aggregated in a Web Worker, and the server only stores small batches.
 */
import { MODE_DETECTOR_VERSION, importDayDiff, timezoneSkewWarning } from '@locations/db/pure';
import type { DetectInputRow, ParsedExport, WorkerRequest, WorkerResponse } from './import-types';

/** Target request size. Long GPS paths make bytes, not rows, the server's CPU cost. */
const BATCH_TARGET_BYTES = 120 * 1024;
const BATCH_MAX_ROWS = 250;
/** Analytics entries per aggregate write, by serialised size. */
const ANALYTICS_TARGET_BYTES = 150 * 1024;
const DAY_STATS_PER_WRITE = 500;

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; res?: WorkerResponse; error?: string }>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      if (event.data.ok && event.data.res) job.resolve(event.data.res);
      else job.reject(new Error(event.data.error || 'Import worker failed'));
    };
  }
  return worker;
}

function runInWorker(req: WorkerRequest): Promise<WorkerResponse> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...req });
  });
}

/** fetch with JSON, retrying network errors, 429 and 5xx a few times. */
async function api<T>(path: string, init?: RequestInit, attempts = 4): Promise<T> {
  let lastError: Error = new Error('Request failed');
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(path, {
        credentials: 'include',
        ...init,
        headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
      });
      const body = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (res.ok) return body;
      lastError = new Error(body.error || `Request failed (${res.status})`);
      if (res.status !== 429 && res.status < 500) throw lastError;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message && !/fetch|network|Failed|5\d\d|429/i.test(lastError.message)) throw lastError;
    }
    await new Promise((r) => setTimeout(r, 800 * 2 ** i));
  }
  throw lastError;
}

export type ImportPreview = {
  chosenPath: string | null;
  candidates: string[];
  format: string;
  visitCount: number;
  activityCount: number;
  dateMin: string | null;
  dateMax: string | null;
  overlappingDays: number;
  newDays: number;
  existingDays: number;
  overlappingSample: string[];
  replaceWouldRemoveVisits: number;
  mergeWouldAppendVisits: number;
  skipOverlapWouldAppendVisits: number;
  timezoneWarning: { warn: boolean; skewedShare: number; sampleCount: number };
};

export type PreparedImport = { parsed: ParsedExport; existingDates: string[]; preview: ImportPreview };

/** Parse locally and compare with what this export source already has stored. */
export async function prepareImport(
  file: File,
  opts: { sourceId?: string | null; timezone: string | null },
): Promise<PreparedImport> {
  const parsed = (await runInWorker({ type: 'parse', file })) as ParsedExport;
  if (!parsed.visits.length && !parsed.activities.length) {
    throw new Error('No stays or journeys found in this file. Export Timeline again, or try the Takeout zip.');
  }
  const existing = opts.sourceId
    ? await api<{ visitCount: number; dates: string[] }>(`/api/import/existing?sourceId=${encodeURIComponent(opts.sourceId)}`)
    : { visitCount: 0, dates: [] as string[] };
  const incoming = [...new Set([...parsed.visits, ...parsed.activities].map((r) => r.date))].sort();
  const diff = importDayDiff(incoming, existing.dates);
  const existSet = new Set(existing.dates);
  const basename = (p: string) => p.replace(/\\/g, '/').split('/').pop() || p;
  return {
    parsed,
    existingDates: existing.dates,
    preview: {
      chosenPath: parsed.chosenPath ? basename(parsed.chosenPath) : null,
      candidates: parsed.candidates.map(basename).slice(0, 20),
      format: parsed.format,
      visitCount: parsed.visits.length,
      activityCount: parsed.activities.length,
      dateMin: incoming[0] ?? null,
      dateMax: incoming.at(-1) ?? null,
      overlappingDays: diff.overlappingDays,
      newDays: diff.newDays,
      existingDays: diff.existingDays,
      overlappingSample: diff.overlappingSample,
      replaceWouldRemoveVisits: existing.visitCount,
      mergeWouldAppendVisits: parsed.visits.length,
      skipOverlapWouldAppendVisits: parsed.visits.filter((v) => !existSet.has(v.date)).length,
      timezoneWarning: timezoneSkewWarning(parsed.visits, opts.timezone),
    },
  };
}

type Row = { kind: 'visits' | 'activities'; row: unknown; bytes: number };

/** Split rows into requests of about BATCH_TARGET_BYTES (and at most BATCH_MAX_ROWS). */
export function planBatches(visits: unknown[], activities: unknown[]): Array<{ visits: unknown[]; activities: unknown[] }> {
  const rows: Row[] = [
    ...visits.map((row) => ({ kind: 'visits' as const, row, bytes: JSON.stringify(row).length })),
    ...activities.map((row) => ({ kind: 'activities' as const, row, bytes: JSON.stringify(row).length })),
  ];
  const batches: Array<{ visits: unknown[]; activities: unknown[] }> = [];
  let current = { visits: [] as unknown[], activities: [] as unknown[] };
  let bytes = 0;
  let count = 0;
  for (const r of rows) {
    if (count > 0 && (count >= BATCH_MAX_ROWS || bytes + r.bytes > BATCH_TARGET_BYTES)) {
      batches.push(current);
      current = { visits: [], activities: [] };
      bytes = 0;
      count = 0;
    }
    current[r.kind].push(r.row);
    bytes += r.bytes;
    count += 1;
  }
  if (count) batches.push(current);
  return batches;
}

export type ImportProgress = { stage: string; done: number; total: number };

/** Upload a prepared import in batches, finish it, then rebuild the aggregates. */
export async function runImport(
  prepared: PreparedImport,
  opts: {
    policy: 'replace' | 'merge' | 'skip-overlap';
    sourceId?: string | null;
    label?: string;
    timezone: string | null;
    onProgress: (p: ImportProgress) => void;
  },
): Promise<{ visitCount: number; activityCount: number }> {
  const { parsed } = prepared;
  const skip = opts.policy === 'skip-overlap' ? new Set(prepared.existingDates) : null;
  const visits = skip ? parsed.visits.filter((v) => !skip.has(v.date)) : parsed.visits;
  const activities = skip ? parsed.activities.filter((a) => !skip.has(a.date)) : parsed.activities;
  if (!visits.length && !activities.length) throw new Error('Nothing new to add: every day in this file is already stored.');

  const started = await api<{ jobId: string }>('/api/import/start', {
    method: 'POST',
    body: JSON.stringify({
      sourceId: opts.sourceId || undefined,
      label: opts.label?.trim() || undefined,
      merge: opts.policy !== 'replace',
      chosenFile: prepared.preview.chosenPath,
      parsedCount: parsed.parsedCount,
      visitCount: visits.length,
      activityCount: activities.length,
    }),
  });

  const batches = planBatches(visits, activities);
  const total = visits.length + activities.length;
  let done = 0;
  opts.onProgress({ stage: 'Saving stays and journeys', done, total });
  for (const batch of batches) {
    await api(`/api/import/${started.jobId}/rows`, { method: 'POST', body: JSON.stringify(batch) });
    done += batch.visits.length + batch.activities.length;
    opts.onProgress({ stage: 'Saving stays and journeys', done, total });
  }
  await api(`/api/import/${started.jobId}/finish`, {
    method: 'POST',
    body: JSON.stringify({ memories: parsed.memories }),
  });
  await rebuildAggregates({ timezone: opts.timezone, onProgress: opts.onProgress });
  return { visitCount: visits.length, activityCount: activities.length };
}

let rebuilding: Promise<void> | null = null;

/**
 * Recompute day_stats and analytics from everything stored for this account and upload
 * them. Runs after an import, and whenever the server marks the aggregates stale.
 */
export function rebuildAggregates(opts: {
  timezone: string | null;
  onProgress?: (p: ImportProgress) => void;
}): Promise<void> {
  if (rebuilding) return rebuilding;
  rebuilding = (async () => {
    const progress = opts.onProgress ?? (() => undefined);
    const fetchAll = async (table: 'visits' | 'activities') => {
      const rows: Record<string, unknown>[] = [];
      let after = 0;
      for (;;) {
        const page = await api<{ rows: Record<string, unknown>[]; next: number | null }>(
          `/api/aggregates/input?table=${table}&after=${after}`,
        );
        rows.push(...page.rows);
        progress({ stage: 'Reading your history to update statistics', done: rows.length, total: 0 });
        if (page.next === null) return rows;
        after = page.next;
      }
    };
    const visits = await fetchAll('visits');
    const activities = await fetchAll('activities');
    progress({ stage: 'Working out your statistics', done: 0, total: 0 });
    const result = (await runInWorker({ type: 'aggregate', visits, activities, timezone: opts.timezone })) as Extract<
      WorkerResponse,
      { type: 'aggregated' }
    >;

    // Chunks: day rows first (the first clears the old aggregates), then analytics by size.
    const chunks: Array<{ dayStats?: unknown[]; analytics?: Record<string, unknown> }> = [];
    for (let i = 0; i < result.dayStats.length; i += DAY_STATS_PER_WRITE) {
      chunks.push({
        // The server sets the tenant from the session; never send one.
        dayStats: result.dayStats.slice(i, i + DAY_STATS_PER_WRITE).map((d) => {
          const row: Record<string, unknown> = { ...d };
          delete row.tenant;
          return row;
        }),
      });
    }
    let group: Record<string, unknown> = {};
    let groupBytes = 0;
    for (const [key, data] of Object.entries(result.analytics)) {
      const bytes = JSON.stringify(data).length;
      if (groupBytes > 0 && groupBytes + bytes > ANALYTICS_TARGET_BYTES) {
        chunks.push({ analytics: group });
        group = {};
        groupBytes = 0;
      }
      group[key] = data;
      groupBytes += bytes;
    }
    if (groupBytes > 0 || !chunks.length) chunks.push({ analytics: group });

    for (const [i, chunk] of chunks.entries()) {
      progress({ stage: 'Saving your statistics', done: i, total: chunks.length });
      await api('/api/aggregates', {
        method: 'POST',
        body: JSON.stringify({ ...chunk, reset: i === 0, done: i === chunks.length - 1 }),
      });
    }
    progress({ stage: 'Done', done: chunks.length, total: chunks.length });
  })().finally(() => {
    rebuilding = null;
  });
  return rebuilding;
}

let detecting: Promise<{ checked: number; changed: number }> | null = null;

/**
 * Check every stored GPS journey for trains Google labelled as driving (and similar
 * mislabels) in the browser, then write back only the rows that change. Safe to rerun:
 * detection always starts from Google's label. Flags aggregates stale when modes change.
 */
export function detectJourneyModes(opts?: { onProgress?: (p: ImportProgress) => void }): Promise<{ checked: number; changed: number }> {
  if (detecting) return detecting;
  detecting = (async () => {
    const progress = opts?.onProgress ?? (() => undefined);
    let after = 0;
    let checked = 0;
    let changed = 0;
    for (;;) {
      const page = await api<{ rows: DetectInputRow[]; next: number | null }>(`/api/journeys/detect-input?after=${after}`);
      const result = (await runInWorker({ type: 'detect', rows: page.rows })) as Extract<WorkerResponse, { type: 'detected' }>;
      checked += result.checked;
      // Rail lines make some rows a few KB: batch by bytes like the import does.
      for (const batch of planBatches([], result.updates)) {
        const res = await api<{ changed: number }>('/api/journeys/modes', {
          method: 'POST',
          body: JSON.stringify({ updates: batch.activities }),
        });
        changed += res.changed;
      }
      progress({ stage: 'Checking your journeys for trains', done: checked, total: 0 });
      if (page.next === null) break;
      after = page.next;
    }
    await api('/api/journeys/modes', { method: 'POST', body: JSON.stringify({ doneVersion: MODE_DETECTOR_VERSION }) });
    return { checked, changed };
  })().finally(() => {
    detecting = null;
  });
  return detecting;
}
