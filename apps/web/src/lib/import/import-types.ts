import type { ActivityDraft, DayStatsRow, VisitDraft } from '@locations/db/pure';

/** Google's own trips, as sent to the finish step. */
export type MemoryInput = { start: string; end: string; distanceKm: number | null };

export type WorkerRequest =
  | { type: 'parse'; file: File }
  | {
      type: 'aggregate';
      visits: Record<string, unknown>[];
      activities: Record<string, unknown>[];
      timezone: string | null;
    };

export type ParsedExport = {
  type: 'parsed';
  format: string;
  parsedCount: number;
  chosenPath: string | null;
  candidates: string[];
  visits: VisitDraft[];
  activities: ActivityDraft[];
  memories: MemoryInput[];
};

export type WorkerResponse =
  | ParsedExport
  | { type: 'aggregated'; dayStats: DayStatsRow[]; analytics: Record<string, unknown> };
