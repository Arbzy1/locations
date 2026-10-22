export interface Visit {
  start: string;
  end: string;
  lat: number;
  lon: number;
  cluster: string;
  semantic_type: string;
  place_id?: string;
  place_name?: string;
  place_address?: string;
  place_short_address?: string;
  duration_minutes: number;
  arrived_by?: string | null;
  departed_by?: string | null;
  stop_number?: number;
  total_stops?: number;
  source_id?: string | null;
  /** Google's place position; `lat`/`lon` may be the GPS-fix median instead. */
  place_lat?: number;
  place_lon?: number;
  /** GPS fixes recorded during the stay (0 when the position is Google's place). */
  fix_count?: number;
  /** Metres between Google's place and the GPS-fix position. */
  moved_m?: number;
  /** The real place this stay belongs to. */
  place_key?: string | null;
  /** The user's own note. */
  note?: string | null;
}

export interface RouteStep {
  name: string;
  distance_meters: number;
  duration_seconds: number;
  direction: string;
  geometry: [number, number][];
}

export interface Activity {
  start: string;
  end: string;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  mode: string;
  distance_meters: number;
  route_geometry?: [number, number][];
  steps?: RouteStep[];
  duration_minutes: number;
  has_osrm_route?: boolean;
  is_rail?: boolean;
  /** How the line was drawn; see `RouteSource` in apps/api/src/services.ts. */
  route_source?: 'gps-road' | 'gps' | 'road-estimate' | 'rail-arc' | 'straight';
  /** Recorded GPS fixes behind this journey (Timeline `timelinePath`). */
  gps_points?: number;
  /** Start, recorded GPS fixes, end, joined to the same stops as `route_geometry`. */
  recorded_geometry?: [number, number][] | null;
  /** OSRM route between start and end, only when the day was loaded with compare. */
  predicted_geometry?: [number, number][];
  /** How far the predicted line strays from the GPS fixes. */
  prediction_gap?: { medianM: number; maxM: number; within100Pct: number } | null;
  accuracy?: JourneyAccuracy;
  /** Towns or areas the recorded trace passed through. */
  via_places?: string[];
  from_place?: string;
  to_place?: string;
  source_id?: string | null;
  /** Raw GPS fixes as recorded: [lat, lon, unixSeconds]. */
  gps_fixes?: [number, number, number][];
  /** The user's own note. */
  note?: string | null;
  /** True when the user corrected Google's transport mode. */
  mode_corrected?: boolean;
  google_mode?: string;
}

export interface Connector {
  from_time: string;
  to_time: string;
  from_lat: number;
  from_lon: number;
  to_lat: number;
  to_lon: number;
  route_geometry: [number, number][];
  steps: RouteStep[];
  distance_meters: number;
  is_routed?: boolean;
  from_label?: string;
  to_label?: string;
}

export interface DayData {
  date: string;
  visits: Visit[];
  activities: Activity[];
  connectors: Connector[];
  total_distance_miles: number;
  modes: Record<string, number>;
  clusters: string[];
}

/** Lightweight per-day stats for calendar highlights (from day_stats). */
export interface DaySummary {
  date: string;
  total_distance_miles: number;
  modes: Record<string, number>;
  visit_count: number;
  activity_count: number;
}

export interface DayTrip {
  date: string;
  clusters: string[];
  total_miles: number;
  max_range: number;
  stops: number;
  journeys: number;
  modes: string[];
}

export interface MonthlyStats {
  month: string;
  distance_miles: number;
  visits: number;
  activities: number;
  days_tracked?: number;
  top_places: [string, number][];
  modes: Record<string, number>;
  mode_miles?: Record<string, number>;
}

export interface YearlyStats {
  year: number;
  distance_miles: number;
  visits: number;
  activities: number;
  days_tracked: number;
  modes: Record<string, number>;
  drive_miles?: number;
  transit_miles?: number;
  mode_miles?: Record<string, number>;
}

export interface Overview {
  total_records: number;
  total_visits: number;
  total_activities: number;
  total_distance_miles: number;
  date_range: [string, string];
  days_with_data: number;
  unique_places: number;
}

export interface HeatmapPoint {
  lat: number;
  lon: number;
  count: number;
  /** Most common visit cluster / place label for this cell */
  label?: string;
  cluster?: string;
  /** Town / city / village guessed from coordinates (Nominatim) */
  settlement?: string | null;
  totalDurationMinutes?: number;
  uniqueDays?: number;
  topTypes?: string[];
  /** Heat intensity; defaults to `count` when omitted */
  weight?: number;
}

/** Named hotspot markers shown on the Hotspots map */
export interface HotspotLabel {
  lat: number;
  lon: number;
  label: string;
  count: number;
  rank: number;
  badge?: string;
  color?: string;
}

export interface FunFact {
  label: string;
  value: string;
  description: string;
  miles?: number;
  date?: string;
  minutes?: number;
}

export interface Streaks {
  current: number;
  longest: number;
  longestGap: number;
  lastDate: string | null;
}

export interface PlaceDeltaMonth {
  month: string;
  newClusters: string[];
  returnedClusters: string[];
}

export interface LapsedPlace {
  cluster: string;
  lastDate: string;
  years: number;
}

export interface PersonalityTag {
  id: 'walker' | 'flyer' | 'creature_of_habit';
  reason: string;
}

export interface ActivityGuessCount {
  id: string;
  label: string;
  count: number;
}

export interface CoverageBadge {
  id: string;
  label: string;
  earned: boolean;
  detail: string;
}

export interface BadgeSummary {
  coveragePercent: number;
  daysWithData: number;
  spanDays: number;
  uniquePlaces: number;
  visitCount: number;
  badges: CoverageBadge[];
}

export interface YearInReviewChapter {
  year: number;
  distance_miles: number;
  visits: number;
  activities: number;
  days_tracked: number;
  top_places: [string, number][];
  modes: Record<string, number>;
  drive_miles?: number;
  transit_miles?: number;
  trips?: MultiDayTrip[];
  firsts?: { cluster: string; date: string }[];
  streaks?: { longest: number; current: number };
}

export interface MultiDayTrip {
  start: string;
  end: string;
  dates: string[];
  total_miles: number;
  clusters: string[];
  name?: string;
  modes?: string[];
}

export interface FlightSummary {
  tagged: number;
  guessed: number;
  taggedMiles: number;
  guessedMiles: number;
}

export interface TrainHop {
  date: string;
  from: string;
  to: string;
  miles: number;
  hops: number;
}

export interface LowMovementDay {
  date: string;
  miles: number;
  clusters: string[];
}

export interface RouteProgress {
  running: boolean;
  total: number;
  cached: number;
  errors: number;
  percent: number;
}

export type TabId = 'hotspots' | 'day' | 'routes' | 'trips' | 'insights' | 'journey-cost' | 'settings';

export interface DataSourceInfo {
  id: string;
  label: string;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
  visitCount: number;
  activityCount: number;
}

export interface ImportJobInfo {
  id: string;
  sourceId: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
  error: string | null;
  visitCount: number | null;
  activityCount: number | null;
  parsedCount?: number | null;
  merge?: boolean;
  chosenFile?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportStatus {
  hasData: boolean;
  visitCount: number;
  sourceCount: number;
  sources: DataSourceInfo[];
  latestJob: ImportJobInfo | null;
  recentJobs: ImportJobInfo[];
  timezoneWarning?: { warn: boolean; skewedShare: number; sampleCount: number };
}

/** Map pan/zoom target when focusing a timeline segment (bounds or point). */
export type MapFocusTarget =
  | { bounds: [number, number][] }
  | { lat: number; lon: number; zoom?: number };

export const MODE_COLORS: Record<string, string> = {
  walking: '#3fb950',
  car: '#f778ba',
  bus: '#d29922',
  train: '#f47067',
  cycling: '#56d364',
  subway: '#f47067',
  flying: '#79c0ff',
  unknown: '#8b949e',
};

export const MODE_LABELS: Record<string, string> = {
  walking: 'Walking',
  car: 'Car',
  bus: 'Bus',
  train: 'Train',
  cycling: 'Cycling',
  subway: 'Subway',
  flying: 'Flying',
  unknown: 'Unknown',
};

export interface JourneyAccuracy {
  score: 'high' | 'medium' | 'low';
  fixes: number;
  maxGapMin: number;
  meanOffsetM: number | null;
}

/** Which line Day View draws for each journey. */
export type LineVariant = 'best' | 'recorded' | 'predicted' | 'points';

/** One journey in the Routes (period) view, as recorded. */
export interface RouteLine {
  date: string;
  start: string;
  mode: string;
  source_id: string | null;
  /** True when the line follows recorded GPS fixes; false is a straight start-to-end guess. */
  recorded: boolean;
  miles: number;
  coords: [number, number][];
}

export interface RouteLinesResponse {
  from: string;
  to: string;
  truncated: boolean;
  days: number;
  total_miles: number;
  modes: Record<string, { count: number; miles: number }>;
  lines: RouteLine[];
}

export interface HotspotDay {
  date: string;
  minutes: number;
  visits: number;
  first: string;
  last: string;
}

export interface HotspotDaysResponse {
  lat: number;
  lon: number;
  radius_m: number;
  total_days: number;
  total_minutes: number;
  truncated: boolean;
  days: HotspotDay[];
}
