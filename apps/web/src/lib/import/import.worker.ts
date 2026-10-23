/// <reference lib="webworker" />
/**
 * Off-main-thread Timeline work: unzip, parse and aggregate. Runs the same code the
 * server and CLI use (@locations/db/pure) so results match, without freezing the page
 * on large exports.
 */
import {
  computeTenantAggregates,
  countTimelineRecords,
  detectTimelineFormat,
  extractTimelineJsonFromZip,
  isZipMagic,
  parseTimelineJson,
  type ActivityRow,
  type VisitRow,
} from '@locations/db/pure';
import type { WorkerRequest, WorkerResponse } from './import-types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

async function handle(req: WorkerRequest): Promise<WorkerResponse> {
  if (req.type === 'parse') {
    const bytes = await req.file.arrayBuffer();
    let text: string;
    let chosenPath: string | null = null;
    let candidates: string[] = [];
    if (req.file.name.toLowerCase().endsWith('.zip') || isZipMagic(bytes)) {
      const zip = await extractTimelineJsonFromZip(bytes);
      text = zip.text;
      chosenPath = zip.chosenPath;
      candidates = zip.candidates;
    } else {
      text = new TextDecoder().decode(bytes);
    }
    let raw: unknown;
    try {
      // Strip a UTF-8 byte-order mark, which some exports start with.
      raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    } catch {
      throw new Error('This file is not valid JSON. Export Timeline again, or use the Takeout zip.');
    }
    const format = detectTimelineFormat(raw);
    const parsedCount = countTimelineRecords(raw);
    const parsed = parseTimelineJson(raw);
    return {
      type: 'parsed',
      format,
      parsedCount,
      chosenPath,
      candidates,
      visits: parsed.visits,
      activities: parsed.activities,
      memories: (parsed.memories ?? []).map((m) => ({ start: m.start, end: m.end, distanceKm: m.distanceKm })),
    };
  }
  const result = computeTenantAggregates(
    'self',
    req.visits as VisitRow[],
    req.activities.map((a) => ({ ...a, path: null })) as ActivityRow[],
    req.timezone,
  );
  return { type: 'aggregated', dayStats: result.dayStats, analytics: result.analytics };
}

ctx.onmessage = (event: MessageEvent<WorkerRequest & { id: number }>) => {
  const { id, ...req } = event.data;
  handle(req as WorkerRequest).then(
    (res) => ctx.postMessage({ id, ok: true, res }),
    (err: unknown) => ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
};
