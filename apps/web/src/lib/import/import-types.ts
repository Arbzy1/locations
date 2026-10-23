import type { ActivityDraft, DayStatsRow, JourneyModeFields, PathPoint, VisitDraft } from '@locations/db/pure';

/** A stored journey as /api/journeys/detect-input pages it out. */
export type DetectInputRow = {
  id: number;
  start: string;
  end: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  mode: string;
  googleMode: string | null;
  distanceMeters: number;
  path: PathPoint[] | null;
  hasDetail: boolean;
  hasRail: boolean;
  overridden: boolean;
};

export type ModeUpdate = { id: number } & JourneyModeFields;

/** Google's own trips, as sent to the finish step. */
export type MemoryInput = { start: string; end: string; distanceKm: number | null };

export type WorkerRequest =
  | { type: 'parse'; file: File }
  | {
      type: 'aggregate';
      visits: Record<string, unknown>[];
      activities: Record<string, unknown>[];
      timezone: string | null;
    }
  | { type: 'detect'; rows: DetectInputRow[] };

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
  | { type: 'aggregated'; dayStats: DayStatsRow[]; analytics: Record<string, unknown> }
  | { type: 'detected'; updates: ModeUpdate[]; checked: number };
