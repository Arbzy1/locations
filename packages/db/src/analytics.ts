import {
  classifyLocation,
  haversineKm,
  METERS_TO_MILES,
} from "./geo.js";
import type { ActivityRow, DayStatsRow, VisitRow } from "./schema.js";

export type DayTrip = {
  date: string;
  clusters: string[];
  total_miles: number;
  max_range: number;
  stops: number;
  journeys: number;
  modes: string[];
};

export type MonthlyStats = {
  month: string;
  distance_miles: number;
  visits: number;
  activities: number;
  top_places: [string, number][];
  modes: Record<string, number>;
};

export type YearlyStats = {
  year: number;
  distance_miles: number;
  visits: number;
  activities: number;
  days_tracked: number;
  modes: Record<string, number>;
};

export type FunFact = {
  label: string;
  value: string;
  description: string;
};

export type Corridor = { from: string; to: string; count: number };

type Store = {
  visits: VisitRow[];
  activities: ActivityRow[];
  days: Map<string, DayStatsRow & { visits: VisitRow[]; activities: ActivityRow[] }>;
  allDates: string[];
};

export function buildStore(
  visits: VisitRow[],
  activities: ActivityRow[],
  dayStats: DayStatsRow[],
): Store {
  const days = new Map<
    string,
    DayStatsRow & { visits: VisitRow[]; activities: ActivityRow[] }
  >();
  for (const d of dayStats) {
    days.set(d.date, { ...d, visits: [], activities: [] });
  }
  for (const v of visits) {
    const day = days.get(v.date);
    if (day) day.visits.push(v);
  }
  for (const a of activities) {
    const day = days.get(a.date);
    if (day) day.activities.push(a);
  }
  const allDates = [...days.keys()].sort();
  return { visits, activities, days, allDates };
}

export function detectDayTrips(store: Store): DayTrip[] {
  const trips: DayTrip[] = [];
  for (const [date, day] of store.days) {
    if (!day.visits.length && !day.activities.length) continue;
    const coords: [number, number][] = [];
    for (const v of day.visits) coords.push([v.lat, v.lon]);
    for (const a of day.activities) {
      coords.push([a.startLat, a.startLon]);
      coords.push([a.endLat, a.endLon]);
    }
    if (coords.length < 2) continue;

    const start = coords[0];
    let maxRangeKm = 0;
    for (let i = 1; i < coords.length; i++) {
      maxRangeKm = Math.max(maxRangeKm, haversineKm(start[0], start[1], coords[i][0], coords[i][1]));
    }
    const maxRangeMiles = maxRangeKm * 0.621371;

    const clusters = [...(day.clusters as string[])];
    for (const a of day.activities) {
      const sc = classifyLocation(a.startLat, a.startLon);
      const ec = classifyLocation(a.endLat, a.endLon);
      if (!clusters.includes(sc)) clusters.push(sc);
      if (!clusters.includes(ec)) clusters.push(ec);
    }

    if (maxRangeMiles > 5 || clusters.length >= 2) {
      const modes: string[] = [];
      for (const a of day.activities) {
        if (!modes.includes(a.mode)) modes.push(a.mode);
      }
      trips.push({
        date,
        clusters,
        total_miles: day.totalDistanceMiles,
        max_range: Math.round(maxRangeMiles * 10) / 10,
        stops: day.visits.length,
        journeys: day.activities.length,
        modes,
      });
    }
  }
  return trips.sort((a, b) => b.date.localeCompare(a.date));
}

export function computeMonthlyStats(store: Store): MonthlyStats[] {
  const monthly = new Map<
    string,
    {
      distance: number;
      visits: number;
      activities: number;
      places: Map<string, number>;
      modes: Record<string, number>;
    }
  >();

  for (const [date, day] of store.days) {
    const month = date.slice(0, 7);
    let m = monthly.get(month);
    if (!m) {
      m = { distance: 0, visits: 0, activities: 0, places: new Map(), modes: {} };
      monthly.set(month, m);
    }
    m.distance += day.totalDistanceMiles;
    m.visits += day.visits.length;
    m.activities += day.activities.length;
    for (const v of day.visits) m.places.set(v.cluster, (m.places.get(v.cluster) ?? 0) + 1);
    for (const [mode, count] of Object.entries(day.modes as Record<string, number>)) {
      m.modes[mode] = (m.modes[mode] ?? 0) + count;
    }
  }

  return [...monthly.keys()].sort().map((month) => {
    const m = monthly.get(month)!;
    const topPlaces = [...m.places.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) as [string, number][];
    return {
      month,
      distance_miles: Math.round(m.distance * 10) / 10,
      visits: m.visits,
      activities: m.activities,
      top_places: topPlaces,
      modes: m.modes,
    };
  });
}

export function computeYearlyStats(store: Store): YearlyStats[] {
  const yearly = new Map<
    number,
    { distance: number; visits: number; activities: number; days: Set<string>; modes: Record<string, number> }
  >();

  for (const [date, day] of store.days) {
    const year = Number(date.slice(0, 4));
    let y = yearly.get(year);
    if (!y) {
      y = { distance: 0, visits: 0, activities: 0, days: new Set(), modes: {} };
      yearly.set(year, y);
    }
    y.distance += day.totalDistanceMiles;
    y.visits += day.visits.length;
    y.activities += day.activities.length;
    y.days.add(date);
    for (const [mode, count] of Object.entries(day.modes as Record<string, number>)) {
      y.modes[mode] = (y.modes[mode] ?? 0) + count;
    }
  }

  return [...yearly.keys()].sort().map((year) => {
    const y = yearly.get(year)!;
    return {
      year,
      distance_miles: Math.round(y.distance * 10) / 10,
      visits: y.visits,
      activities: y.activities,
      days_tracked: y.days.size,
      modes: y.modes,
    };
  });
}

export function computeCorridors(store: Store): Corridor[] {
  const transitions = new Map<string, { from: string; to: string; count: number }>();

  for (const day of store.days.values()) {
    const events: Array<[string, string]> = [];
    for (const v of day.visits) events.push([v.start, v.cluster]);
    for (const a of day.activities) {
      events.push([a.start, classifyLocation(a.startLat, a.startLon)]);
      events.push([a.end, classifyLocation(a.endLat, a.endLon)]);
    }
    events.sort((a, b) => a[0].localeCompare(b[0]));

    let prev: string | null = null;
    for (const [, cluster] of events) {
      if (prev && cluster !== prev) {
        const [from, to] = [prev, cluster].sort();
        const key = `${from}||${to}`;
        const existing = transitions.get(key);
        if (existing) existing.count += 1;
        else transitions.set(key, { from, to, count: 1 });
      }
      prev = cluster;
    }
  }

  return [...transitions.values()].sort((a, b) => b.count - a.count).slice(0, 20);
}

export function computeFunFacts(store: Store): FunFact[] {
  const facts: FunFact[] = [];
  const totalMiles = [...store.days.values()].reduce((s, d) => s + d.totalDistanceMiles, 0);

  facts.push({
    label: "Total Distance",
    value: `${Math.round(totalMiles).toLocaleString()} miles`,
    description: `That's ${(totalMiles / 24901).toFixed(1)}x around the Earth`,
  });

  if (store.allDates.length) {
    facts.push({
      label: "Days Tracked",
      value: String(store.allDates.length),
      description: `From ${store.allDates[0]} to ${store.allDates[store.allDates.length - 1]}`,
    });
  }

  const placeIds = new Set(store.visits.map((v) => v.placeId).filter(Boolean));
  facts.push({
    label: "Unique Places",
    value: String(placeIds.size),
    description: "Distinct Google Place IDs visited",
  });

  const walkMeters = store.activities
    .filter((a) => a.mode === "walking")
    .reduce((s, a) => s + a.distanceMeters, 0);
  facts.push({
    label: "Estimated Steps",
    value: Math.floor(walkMeters / 0.762).toLocaleString(),
    description: "Based on walking distance (0.762m avg stride)",
  });

  let busiestDate = "";
  let busiestCount = 0;
  for (const [date, day] of store.days) {
    const count = day.visits.length + day.activities.length;
    if (count > busiestCount) {
      busiestCount = count;
      busiestDate = date;
    }
  }
  facts.push({
    label: "Busiest Day",
    value: busiestDate,
    description: `${busiestCount} records`,
  });

  const modeDist = new Map<string, number>();
  for (const a of store.activities) {
    modeDist.set(a.mode, (modeDist.get(a.mode) ?? 0) + a.distanceMeters * METERS_TO_MILES);
  }
  for (const mode of [...modeDist.keys()].sort((a, b) => (modeDist.get(b) ?? 0) - (modeDist.get(a) ?? 0))) {
    facts.push({
      label: `Distance by ${mode.charAt(0).toUpperCase()}${mode.slice(1)}`,
      value: `${Math.round(modeDist.get(mode)!).toLocaleString()} miles`,
      description: "",
    });
  }

  if (store.activities.length) {
    const longest = store.activities.reduce((best, a) =>
      a.distanceMeters > best.distanceMeters ? a : best,
    );
    facts.push({
      label: "Longest Single Journey",
      value: `${Math.round(longest.distanceMeters * METERS_TO_MILES).toLocaleString()} miles`,
      description: `${longest.mode} on ${longest.start.slice(0, 10)}`,
    });
  }

  const clusterCounts = new Map<string, number>();
  for (const v of store.visits) {
    clusterCounts.set(v.cluster, (clusterCounts.get(v.cluster) ?? 0) + 1);
  }
  const topClusters = [...clusterCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [cluster, count] of topClusters) {
    facts.push({ label: `Visits to ${cluster}`, value: String(count), description: "" });
  }

  return facts;
}

export function computeAllAnalytics(store: Store) {
  return {
    "day-trips": detectDayTrips(store),
    monthly: computeMonthlyStats(store),
    yearly: computeYearlyStats(store),
    corridors: computeCorridors(store),
    facts: computeFunFacts(store),
  };
}
