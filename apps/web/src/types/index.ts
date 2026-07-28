import type { LatLngBoundsExpression } from 'leaflet';

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
  from_place?: string;
  to_place?: string;
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
  top_places: [string, number][];
  modes: Record<string, number>;
}

export interface YearlyStats {
  year: number;
  distance_miles: number;
  visits: number;
  activities: number;
  days_tracked: number;
  modes: Record<string, number>;
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
}

export interface FunFact {
  label: string;
  value: string;
  description: string;
}

export interface RouteProgress {
  running: boolean;
  total: number;
  cached: number;
  errors: number;
  percent: number;
}

export type TabId = 'hotspots' | 'day' | 'trips' | 'insights' | 'settings';

export interface DataSourceInfo {
  id: string;
  label: string;
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
}

/** Map pan/zoom target when focusing a timeline segment (bounds or point). */
export type MapFocusTarget =
  | { bounds: LatLngBoundsExpression }
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
