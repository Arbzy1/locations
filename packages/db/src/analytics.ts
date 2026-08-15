import {
  classifyLocation,
  haversineKm,
  METERS_TO_MILES,
} from "./geo.js";
import type { ActivityRow, DayStatsRow, VisitRow } from "./schema.js";
import { computeActivityGuesses, computeBadges } from "./activity-guess.js";

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
  days_tracked: number;
  top_places: [string, number][];
  modes: Record<string, number>;
  mode_miles?: Record<string, number>;
};

export type YearlyStats = {
  year: number;
  distance_miles: number;
  visits: number;
  activities: number;
  days_tracked: number;
  modes: Record<string, number>;
  drive_miles: number;
  transit_miles: number;
  mode_miles?: Record<string, number>;
};

export type FunFact = {
  label: string;
  value: string;
  description: string;
  miles?: number;
  date?: string;
  minutes?: number;
};

export type Streaks = {
  current: number;
  longest: number;
  longestGap: number;
  lastDate: string | null;
};

export type PlaceDeltaMonth = {
  month: string;
  newClusters: string[];
  returnedClusters: string[];
};

export type LapsedPlace = {
  cluster: string;
  lastDate: string;
  years: number;
};

export type PersonalityTag = {
  id: "walker" | "flyer" | "creature_of_habit";
  reason: string;
};

export type FlightSummary = {
  tagged: number;
  guessed: number;
  taggedMiles: number;
  guessedMiles: number;
};

export type TrainHop = {
  date: string;
  from: string;
  to: string;
  miles: number;
  hops: number;
};

export type LowMovementDay = {
  date: string;
  miles: number;
  clusters: string[];
};

const KM_TO_MILES = 0.621371;
const GRID_CLUSTER = /^\d+\.\d+°[NS] \d+\.\d+°[EW]$/;
const TRANSIT_TYPE = /transit|station|train/i;
const TRANSIT_MODES = new Set(["bus", "train", "subway"]);
const FLIGHT_MIN_KM = 400;
const FLIGHT_MIN_KMH = 250;
const LOW_MOVEMENT_MAX_CLUSTERS = 2;
const LOW_MOVEMENT_MAX_RANGE_MI = 1.5;
const LOW_MOVEMENT_MAX_MILES = 3;

export function isGridCluster(name: string): boolean {
  return GRID_CLUSTER.test(name);
}

function visitClusterNames(clusters: string[]): string[] {
  return clusters.filter((c) => c && !isGridCluster(c));
}

export function tripNameFromClusters(startClusters: string[], endClusters: string[]): string {
  const startNamed = visitClusterNames(startClusters);
  const endNamed = visitClusterNames(endClusters);
  const start = startNamed[0];
  const end = endNamed[endNamed.length - 1] ?? startNamed[startNamed.length - 1];
  if (!start && !end) return "Trip";
  if (!end || start === end) return start ?? end ?? "Trip";
  return `${start} to ${end}`;
}

/** Driving (car) vs public transit (bus, train, subway) miles. Walk, cycle, and flying are omitted. */
export function splitDriveTransitMiles(
  activities: Array<{ mode: string; distanceMeters: number }>,
): { drive_miles: number; transit_miles: number } {
  let drive = 0;
  let transit = 0;
  for (const a of activities) {
    const miles = a.distanceMeters * METERS_TO_MILES;
    if (a.mode === "car") drive += miles;
    else if (TRANSIT_MODES.has(a.mode)) transit += miles;
  }
  return {
    drive_miles: Math.round(drive * 10) / 10,
    transit_miles: Math.round(transit * 10) / 10,
  };
}

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
    const maxRangeMiles = maxRangeKm * KM_TO_MILES;

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
      days: Set<string>;
      places: Map<string, number>;
      modes: Record<string, number>;
      modeMiles: Record<string, number>;
    }
  >();

  for (const [date, day] of store.days) {
    const month = date.slice(0, 7);
    let m = monthly.get(month);
    if (!m) {
      m = {
        distance: 0,
        visits: 0,
        activities: 0,
        days: new Set(),
        places: new Map(),
        modes: {},
        modeMiles: {},
      };
      monthly.set(month, m);
    }
    m.days.add(date);
    m.distance += day.totalDistanceMiles;
    m.visits += day.visits.length;
    m.activities += day.activities.length;
    for (const v of day.visits) m.places.set(v.cluster, (m.places.get(v.cluster) ?? 0) + 1);
    for (const [mode, count] of Object.entries(day.modes as Record<string, number>)) {
      m.modes[mode] = (m.modes[mode] ?? 0) + count;
    }
    for (const a of day.activities) {
      m.modeMiles[a.mode] = (m.modeMiles[a.mode] ?? 0) + a.distanceMeters * METERS_TO_MILES;
    }
  }

  return [...monthly.keys()].sort().map((month) => {
    const m = monthly.get(month)!;
    const topPlaces = [...m.places.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) as [string, number][];
    const modeMiles: Record<string, number> = {};
    for (const [mode, miles] of Object.entries(m.modeMiles)) {
      modeMiles[mode] = Math.round(miles * 10) / 10;
    }
    return {
      month,
      distance_miles: Math.round(m.distance * 10) / 10,
      visits: m.visits,
      activities: m.activities,
      days_tracked: m.days.size,
      top_places: topPlaces,
      modes: m.modes,
      mode_miles: modeMiles,
    };
  });
}

export function computeYearlyStats(store: Store): YearlyStats[] {
  const yearly = new Map<
    number,
    {
      distance: number;
      visits: number;
      activities: number;
      days: Set<string>;
      modes: Record<string, number>;
      modeMiles: Record<string, number>;
      drive: number;
      transit: number;
    }
  >();

  for (const [date, day] of store.days) {
    const year = Number(date.slice(0, 4));
    let y = yearly.get(year);
    if (!y) {
      y = {
        distance: 0,
        visits: 0,
        activities: 0,
        days: new Set(),
        modes: {},
        modeMiles: {},
        drive: 0,
        transit: 0,
      };
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

  for (const a of store.activities) {
    const year = Number(a.date.slice(0, 4));
    const y = yearly.get(year);
    if (!y) continue;
    const miles = a.distanceMeters * METERS_TO_MILES;
    y.modeMiles[a.mode] = (y.modeMiles[a.mode] ?? 0) + miles;
    if (a.mode === "car") y.drive += miles;
    else if (TRANSIT_MODES.has(a.mode)) y.transit += miles;
  }

  return [...yearly.keys()].sort().map((year) => {
    const y = yearly.get(year)!;
    const modeMiles: Record<string, number> = {};
    for (const [mode, miles] of Object.entries(y.modeMiles)) {
      modeMiles[mode] = Math.round(miles * 10) / 10;
    }
    return {
      year,
      distance_miles: Math.round(y.distance * 10) / 10,
      visits: y.visits,
      activities: y.activities,
      days_tracked: y.days.size,
      modes: y.modes,
      drive_miles: Math.round(y.drive * 10) / 10,
      transit_miles: Math.round(y.transit * 10) / 10,
      mode_miles: modeMiles,
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
    value: String(Math.round(totalMiles)),
    description: `That's ${(totalMiles / 24901).toFixed(1)}x around the Earth`,
    miles: Math.round(totalMiles * 10) / 10,
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
      value: String(Math.round(modeDist.get(mode)!)),
      description: "",
      miles: Math.round(modeDist.get(mode)! * 10) / 10,
    });
  }

  if (store.activities.length) {
    const longest = store.activities.reduce((best, a) =>
      a.distanceMeters > best.distanceMeters ? a : best,
    );
    facts.push({
      label: "Longest Single Journey",
      value: String(Math.round(longest.distanceMeters * METERS_TO_MILES)),
      description: `${longest.mode} on ${longest.start.slice(0, 10)}`,
      miles: Math.round(longest.distanceMeters * METERS_TO_MILES * 10) / 10,
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

  let longestDay = "";
  let longestDayMiles = 0;
  let mostStopsDate = "";
  let mostStops = 0;
  for (const [date, day] of store.days) {
    if (day.totalDistanceMiles > longestDayMiles) {
      longestDayMiles = day.totalDistanceMiles;
      longestDay = date;
    }
    if (day.visits.length > mostStops) {
      mostStops = day.visits.length;
      mostStopsDate = date;
    }
  }
  if (longestDay) {
    facts.push({
      label: "Longest Day",
      value: longestDay,
      description: "",
      miles: Math.round(longestDayMiles * 10) / 10,
      date: longestDay,
    });
  }
  if (mostStopsDate) {
    facts.push({
      label: "Most Stops",
      value: mostStopsDate,
      description: `${mostStops} visits`,
      date: mostStopsDate,
    });
  }

  const homeGuess = inferHomeWork(store).home;
  if (homeGuess) {
    const homeVisits = store.visits.filter((v) => v.cluster === homeGuess.cluster);
    if (homeVisits.length) {
      const homeLat = homeVisits.reduce((s, v) => s + v.lat, 0) / homeVisits.length;
      const homeLon = homeVisits.reduce((s, v) => s + v.lon, 0) / homeVisits.length;
      let farCluster = "";
      let farMiles = 0;
      for (const v of store.visits) {
        if (v.cluster === homeGuess.cluster) continue;
        const miles = haversineKm(homeLat, homeLon, v.lat, v.lon) * KM_TO_MILES;
        if (miles > farMiles) {
          farMiles = miles;
          farCluster = v.cluster;
        }
      }
      if (farCluster) {
        facts.push({
          label: "Farthest from Home",
          value: farCluster,
          description: "from guessed home",
          miles: Math.round(farMiles * 10) / 10,
        });
      }
    }
  }

  const tuesdays: { date: string; miles: number }[] = [];
  for (const [date, day] of store.days) {
    if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 2) continue;
    tuesdays.push({ date, miles: day.totalDistanceMiles });
  }
  if (tuesdays.length) {
    const boring = tuesdays.reduce((best, d) => (d.miles < best.miles ? d : best));
    facts.push({
      label: "Most boring Tuesday",
      value: boring.date,
      description: "Lowest distance among Tuesdays with data",
      miles: Math.round(boring.miles * 10) / 10,
      date: boring.date,
    });
  }

  if (store.visits.length) {
    const longestStay = store.visits.reduce((best, v) =>
      v.durationMinutes > best.durationMinutes ? v : best,
    );
    facts.push({
      label: "Longest stay without leaving",
      value: longestStay.cluster,
      description: longestStay.date,
      minutes: Math.round(longestStay.durationMinutes),
    });
  }

  for (const fact of facts) {
    if (fact.miles != null && /miles$/i.test(fact.value)) {
      fact.value = String(Math.round(fact.miles));
    }
  }

  return facts;
}

function dayPlusOne(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type MultiDayTrip = {
  start: string;
  end: string;
  dates: string[];
  total_miles: number;
  clusters: string[];
  name: string;
  modes: string[];
};

type BuildingTrip = MultiDayTrip & { firstClusters: string[]; lastClusters: string[] };

function finishMultiDay(cur: BuildingTrip): MultiDayTrip {
  return {
    start: cur.start,
    end: cur.end,
    dates: cur.dates,
    total_miles: Math.round(cur.total_miles * 10) / 10,
    clusters: cur.clusters,
    name: tripNameFromClusters(cur.firstClusters, cur.lastClusters),
    modes: cur.modes,
  };
}

/** Consecutive day-trips become one multi-day journey. */
export function groupMultiDayTrips(trips: DayTrip[]): MultiDayTrip[] {
  const sorted = [...trips].sort((a, b) => a.date.localeCompare(b.date));
  const groups: MultiDayTrip[] = [];
  let cur: BuildingTrip | null = null;
  for (const t of sorted) {
    if (cur && dayPlusOne(cur.end) === t.date) {
      cur.end = t.date;
      cur.dates.push(t.date);
      cur.total_miles += t.total_miles;
      cur.lastClusters = t.clusters;
      for (const c of t.clusters) {
        if (!cur.clusters.includes(c)) cur.clusters.push(c);
      }
      for (const m of t.modes) {
        if (!cur.modes.includes(m)) cur.modes.push(m);
      }
    } else {
      if (cur) groups.push(finishMultiDay(cur));
      cur = {
        start: t.date,
        end: t.date,
        dates: [t.date],
        total_miles: t.total_miles,
        clusters: [...t.clusters],
        name: "",
        modes: [...t.modes],
        firstClusters: t.clusters,
        lastClusters: t.clusters,
      };
    }
  }
  if (cur) groups.push(finishMultiDay(cur));
  return groups.filter((g) => g.dates.length > 1);
}

export type HomeWorkGuess = {
  home: { cluster: string; visits: number } | null;
  work: { cluster: string; visits: number } | null;
};

function hourUtc(iso: string): number {
  const h = new Date(iso).getUTCHours();
  return Number.isNaN(h) ? 12 : h;
}

export function inferHomeWork(store: Store): HomeWorkGuess {
  const homeCounts = new Map<string, number>();
  const workCounts = new Map<string, number>();
  for (const v of store.visits) {
    const hour = hourUtc(v.start);
    const day = new Date(`${v.date}T00:00:00Z`).getUTCDay();
    const weekday = day >= 1 && day <= 5;
    if (hour >= 22 || hour < 6) {
      homeCounts.set(v.cluster, (homeCounts.get(v.cluster) ?? 0) + 1);
    }
    if (weekday && hour >= 9 && hour < 17) {
      workCounts.set(v.cluster, (workCounts.get(v.cluster) ?? 0) + 1);
    }
  }
  const top = (m: Map<string, number>) => {
    const [cluster, visits] = [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    return cluster ? { cluster, visits } : null;
  };
  return { home: top(homeCounts), work: top(workCounts) };
}

export type AreaStat = { cluster: string; visits: number; lat: number; lon: number };

export function computeAreas(store: Store): AreaStat[] {
  const map = new Map<string, { visits: number; lat: number; lon: number }>();
  for (const v of store.visits) {
    const cur = map.get(v.cluster) ?? { visits: 0, lat: v.lat, lon: v.lon };
    cur.visits += 1;
    map.set(v.cluster, cur);
  }
  return [...map.entries()]
    .map(([cluster, v]) => ({ cluster, ...v }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 40);
}

export type YearInReview = {
  year: number;
  distance_miles: number;
  visits: number;
  activities: number;
  days_tracked: number;
  top_places: [string, number][];
  modes: Record<string, number>;
  drive_miles: number;
  transit_miles: number;
  trips: MultiDayTrip[];
  firsts: { cluster: string; date: string }[];
  streaks: { longest: number; current: number };
} | null;

export function computeYearInReviewForYear(store: Store, year: number): YearInReview {
  const yearly = computeYearlyStats(store).find((y) => y.year === year);
  if (!yearly) return null;
  const monthly = computeMonthlyStats(store).filter((m) => m.month.startsWith(String(year)));
  const places = new Map<string, number>();
  for (const m of monthly) {
    for (const [name, n] of m.top_places) places.set(name, (places.get(name) ?? 0) + n);
  }
  const prefix = String(year);
  const trips = groupMultiDayTrips(detectDayTrips(store)).filter(
    (t) => t.start.startsWith(prefix) || t.end.startsWith(prefix),
  );
  const firsts = computeFirsts(store)
    .clusters.filter((c) => c.date.startsWith(prefix))
    .slice(0, 20)
    .map((c) => ({ cluster: c.name, date: c.date }));
  const yearDates = store.allDates.filter((d) => d.startsWith(prefix));
  const yearStreaks = streakStats(yearDates);
  return {
    ...yearly,
    top_places: [...places.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) as [string, number][],
    trips,
    firsts,
    streaks: { longest: yearStreaks.longest, current: yearStreaks.current },
  };
}

export function computeYearInReview(store: Store): YearInReview {
  const yearly = computeYearlyStats(store);
  if (!yearly.length) return null;
  return computeYearInReviewForYear(store, yearly[yearly.length - 1].year);
}

export type AwayNight = { date: string; cluster: string };

export function computeAwayNights(store: Store): AwayNight[] {
  const home = inferHomeWork(store).home?.cluster;
  if (!home) return [];
  const nights: AwayNight[] = [];
  const seen = new Set<string>();
  for (const v of store.visits) {
    const hour = hourUtc(v.start);
    if (hour < 22 && hour >= 6) continue;
    if (v.cluster === home) continue;
    const key = `${v.date}|${v.cluster}`;
    if (seen.has(key)) continue;
    seen.add(key);
    nights.push({ date: v.date, cluster: v.cluster });
  }
  return nights.sort((a, b) => a.date.localeCompare(b.date));
}

export type CommuteStats = {
  home: string;
  work: string;
  count: number;
  modes: Record<string, number>;
  departHours: number[];
} | null;

export function computeCommute(store: Store): CommuteStats {
  const hw = inferHomeWork(store);
  if (!hw.home || !hw.work || hw.home.cluster === hw.work.cluster) return null;
  const home = hw.home.cluster;
  const work = hw.work.cluster;
  const modes: Record<string, number> = {};
  const departHours: number[] = [];
  let count = 0;
  for (const day of store.days.values()) {
    const dow = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const visits = [...day.visits].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < visits.length; i++) {
      const from = visits[i - 1];
      const to = visits[i];
      const pair =
        (from.cluster === home && to.cluster === work) ||
        (from.cluster === work && to.cluster === home);
      if (!pair) continue;
      count += 1;
      const act = day.activities.find(
        (a) => a.start >= from.start && a.start <= to.start,
      );
      const mode = act?.mode || "unknown";
      modes[mode] = (modes[mode] || 0) + 1;
      departHours.push(hourUtc(from.end || from.start));
    }
  }
  return { home, work, count, modes, departHours };
}

export type Firsts = {
  clusters: { name: string; date: string }[];
  types: { name: string; date: string }[];
};

export function computeFirsts(store: Store): Firsts {
  const clusterFirst = new Map<string, string>();
  const typeFirst = new Map<string, string>();
  const sorted = [...store.visits].sort((a, b) => a.start.localeCompare(b.start));
  for (const v of sorted) {
    if (!clusterFirst.has(v.cluster)) clusterFirst.set(v.cluster, v.date);
    if (v.semanticType && v.semanticType !== "Unknown" && !typeFirst.has(v.semanticType)) {
      typeFirst.set(v.semanticType, v.date);
    }
  }
  return {
    clusters: [...clusterFirst.entries()]
      .map(([name, date]) => ({ name, date }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 80),
    types: [...typeFirst.entries()]
      .map(([name, date]) => ({ name, date }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export type MovingYear = { year: number; cluster: string; nights: number };

export function computeMovingHistory(store: Store): MovingYear[] {
  const byYear = new Map<number, Map<string, number>>();
  for (const v of store.visits) {
    const hour = hourUtc(v.start);
    if (hour < 22 && hour >= 6) continue;
    const year = Number(v.date.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    const m = byYear.get(year) ?? new Map<string, number>();
    m.set(v.cluster, (m.get(v.cluster) ?? 0) + 1);
    byYear.set(year, m);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, counts]) => {
      const [cluster, nights] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
      return { year, cluster, nights };
    })
    .filter((r) => r.cluster);
}

export type AnomalyDay = {
  date: string;
  weekday: number;
  miles: number;
  visits: number;
  reason: string;
};

export function computeAnomalies(store: Store): AnomalyDay[] {
  const byWeekday = new Map<number, { miles: number[]; visits: number[] }>();
  for (const d of store.days.values()) {
    const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    const cur = byWeekday.get(wd) ?? { miles: [], visits: [] };
    cur.miles.push(d.totalDistanceMiles);
    cur.visits.push(d.visitCount);
    byWeekday.set(wd, cur);
  }
  const median = (vals: number[]) => {
    if (!vals.length) return 0;
    const s = [...vals].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
  };
  const medMiles = new Map<number, number>();
  const medVisits = new Map<number, number>();
  for (const [wd, v] of byWeekday) {
    medMiles.set(wd, median(v.miles));
    medVisits.set(wd, median(v.visits));
  }
  const out: AnomalyDay[] = [];
  for (const d of store.days.values()) {
    const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    const mm = medMiles.get(wd) ?? 0;
    const mv = medVisits.get(wd) ?? 0;
    const reasons: string[] = [];
    if (mm > 0 && d.totalDistanceMiles > Math.max(mm * 2, mm + 20)) reasons.push("unusually far");
    if (mv > 0 && d.visitCount > Math.max(mv * 2, mv + 6)) reasons.push("unusually many stops");
    if (mm > 5 && d.totalDistanceMiles < mm * 0.15) reasons.push("unusually still");
    if (!reasons.length) continue;
    out.push({
      date: d.date,
      weekday: wd,
      miles: d.totalDistanceMiles,
      visits: d.visitCount,
      reason: reasons.join(", "),
    });
  }
  return out.sort((a, b) => b.miles - a.miles).slice(0, 40);
}

export type DataHealth = {
  duplicateVisits: number;
  overlappingActivities: number;
  unknownModes: number;
  midnightCrossings: number;
};

export function computeDataHealth(store: Store): DataHealth {
  const seen = new Set<string>();
  let duplicateVisits = 0;
  let midnightCrossings = 0;
  for (const v of store.visits) {
    const key = `${v.start}|${v.lat.toFixed(5)}|${v.lon.toFixed(5)}|${v.cluster}`;
    if (seen.has(key)) duplicateVisits += 1;
    else seen.add(key);
    const endDate = v.end.slice(0, 10);
    if (endDate && endDate !== v.date) midnightCrossings += 1;
  }
  let overlappingActivities = 0;
  const byDate = new Map<string, typeof store.activities>();
  for (const a of store.activities) {
    const list = byDate.get(a.date) ?? [];
    list.push(a);
    byDate.set(a.date, list);
  }
  for (const list of byDate.values()) {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) overlappingActivities += 1;
    }
  }
  const unknownModes = store.activities.filter((a) => a.mode === "unknown" || !a.mode).length;
  return { duplicateVisits, overlappingActivities, unknownModes, midnightCrossings };
}

export function detectFlights(store: Store): FlightSummary {
  let tagged = 0;
  let guessed = 0;
  let taggedMiles = 0;
  let guessedMiles = 0;
  for (const a of store.activities) {
    const miles = a.distanceMeters * METERS_TO_MILES;
    if (a.mode === "flying") {
      tagged += 1;
      taggedMiles += miles;
      continue;
    }
    const km = a.distanceMeters / 1000;
    const speedKmh = a.durationMinutes > 0 ? km / (a.durationMinutes / 60) : null;
    if (km >= FLIGHT_MIN_KM || (speedKmh != null && speedKmh >= FLIGHT_MIN_KMH)) {
      guessed += 1;
      guessedMiles += miles;
    }
  }
  return {
    tagged,
    guessed,
    taggedMiles: Math.round(taggedMiles * 10) / 10,
    guessedMiles: Math.round(guessedMiles * 10) / 10,
  };
}

function clusterNear(visits: VisitRow[], lat: number, lon: number): string | null {
  if (!visits.length) return null;
  const scored = visits.map((v) => ({
    cluster: v.cluster,
    km: haversineKm(lat, lon, v.lat, v.lon),
    transit: TRANSIT_TYPE.test(v.semanticType) ? 0 : 1,
  }));
  scored.sort((a, b) => a.transit - b.transit || a.km - b.km);
  const best = scored[0];
  return best && !isGridCluster(best.cluster) ? best.cluster : null;
}

export function detectTrainHops(store: Store): TrainHop[] {
  const hops: TrainHop[] = [];
  for (const [date, day] of store.days) {
    const acts = [...day.activities].sort((a, b) => a.start.localeCompare(b.start));
    let i = 0;
    while (i < acts.length) {
      if (acts[i].mode !== "train") {
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < acts.length && acts[j].mode === "train") j += 1;
      const run = acts.slice(i, j);
      if (run.length >= 2) {
        const from = clusterNear(day.visits, run[0].startLat, run[0].startLon);
        const to = clusterNear(
          day.visits,
          run[run.length - 1].endLat,
          run[run.length - 1].endLon,
        );
        if (from && to) {
          const meters = run.reduce((s, a) => s + a.distanceMeters, 0);
          hops.push({
            date,
            from,
            to,
            miles: Math.round(meters * METERS_TO_MILES * 10) / 10,
            hops: run.length,
          });
        }
      }
      i = j;
    }
  }
  return hops.sort((a, b) => b.miles - a.miles || b.date.localeCompare(a.date)).slice(0, 20);
}

function dayMaxRangeMiles(
  day: DayStatsRow & { visits: VisitRow[]; activities: ActivityRow[] },
): number {
  const coords: [number, number][] = [];
  for (const v of day.visits) coords.push([v.lat, v.lon]);
  for (const a of day.activities) {
    coords.push([a.startLat, a.startLon]);
    coords.push([a.endLat, a.endLon]);
  }
  if (coords.length < 2) return 0;
  const start = coords[0];
  let maxRangeKm = 0;
  for (let i = 1; i < coords.length; i++) {
    maxRangeKm = Math.max(maxRangeKm, haversineKm(start[0], start[1], coords[i][0], coords[i][1]));
  }
  return maxRangeKm * KM_TO_MILES;
}

export function detectLowMovementDays(store: Store): LowMovementDay[] {
  const out: LowMovementDay[] = [];
  for (const [date, day] of store.days) {
    if (!day.visits.length) continue;
    const clusters = [...new Set(day.visits.map((v) => v.cluster))];
    if (clusters.length > LOW_MOVEMENT_MAX_CLUSTERS) continue;
    if (day.totalDistanceMiles >= LOW_MOVEMENT_MAX_MILES) continue;
    if (dayMaxRangeMiles(day) >= LOW_MOVEMENT_MAX_RANGE_MI) continue;
    out.push({
      date,
      miles: Math.round(day.totalDistanceMiles * 10) / 10,
      clusters,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
}

function utcWeekdayHour(iso: string, timeZone?: string | null): { weekday: number; hour: number } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { weekday: 0, hour: 0 };
  if (!timeZone) {
    return { weekday: date.getUTCDay(), hour: date.getUTCHours() };
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
    return { weekday: weekday < 0 ? 0 : weekday, hour: Number.isFinite(hour) ? hour : 0 };
  } catch {
    return { weekday: date.getUTCDay(), hour: date.getUTCHours() };
  }
}

export function streakStats(dates: string[]): Streaks {
  const sorted = [...new Set(dates)].sort();
  if (!sorted.length) return { current: 0, longest: 0, longestGap: 0, lastDate: null };
  let longest = 1;
  let run = 1;
  let longestGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (dayPlusOne(sorted[i - 1]) === sorted[i]) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      const gap =
        (Date.parse(`${sorted[i]}T00:00:00Z`) - Date.parse(`${sorted[i - 1]}T00:00:00Z`)) /
          86_400_000 -
        1;
      longestGap = Math.max(longestGap, gap);
      run = 1;
    }
  }
  let current = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (dayPlusOne(sorted[i - 1]) === sorted[i]) current += 1;
    else break;
  }
  return { current, longest, longestGap, lastDate: sorted[sorted.length - 1] };
}

export function computeStreaks(store: Store): Streaks {
  return streakStats(store.allDates);
}

export function computePlaceDeltas(store: Store): PlaceDeltaMonth[] {
  const byMonth = new Map<string, Set<string>>();
  const months: string[] = [];
  for (const v of store.visits) {
    const month = v.date.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, new Set());
      months.push(month);
    }
    byMonth.get(month)!.add(v.cluster);
  }
  months.sort();
  const ever = new Set<string>();
  const out: PlaceDeltaMonth[] = [];
  let prev = new Set<string>();
  for (const month of months) {
    const cur = byMonth.get(month) ?? new Set();
    const newClusters: string[] = [];
    const returnedClusters: string[] = [];
    for (const cluster of cur) {
      if (!prev.has(cluster) && !ever.has(cluster)) newClusters.push(cluster);
      else if (!prev.has(cluster) && ever.has(cluster)) returnedClusters.push(cluster);
    }
    out.push({
      month,
      newClusters: newClusters.sort().slice(0, 40),
      returnedClusters: returnedClusters.sort().slice(0, 40),
    });
    for (const c of cur) ever.add(c);
    prev = cur;
  }
  return out;
}

export function computeLapsedPlaces(store: Store, asOf?: string): LapsedPlace[] {
  const last = new Map<string, string>();
  for (const v of store.visits) {
    const prev = last.get(v.cluster);
    if (!prev || v.date > prev) last.set(v.cluster, v.date);
  }
  const end = asOf ?? store.allDates[store.allDates.length - 1];
  if (!end) return [];
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const out: LapsedPlace[] = [];
  for (const [cluster, lastDate] of last) {
    const years = (endMs - Date.parse(`${lastDate}T00:00:00Z`)) / (365.25 * 86_400_000);
    if (years < 1) continue;
    out.push({ cluster, lastDate, years: Math.floor(years) });
  }
  return out.sort((a, b) => b.years - a.years || a.lastDate.localeCompare(b.lastDate)).slice(0, 40);
}

export function computeHourOfWeek(store: Store, timeZone?: string | null): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const v of store.visits) {
    const { weekday, hour } = utcWeekdayHour(v.start, timeZone);
    if (weekday >= 0 && weekday < 7 && hour >= 0 && hour < 24) {
      grid[weekday][hour] += 1;
    }
  }
  return grid;
}

export function computePersonality(store: Store): PersonalityTag[] {
  const tags: PersonalityTag[] = [];
  let totalMiles = 0;
  const modeMiles = new Map<string, number>();
  for (const a of store.activities) {
    const miles = a.distanceMeters * METERS_TO_MILES;
    totalMiles += miles;
    modeMiles.set(a.mode, (modeMiles.get(a.mode) ?? 0) + miles);
  }
  const walk = modeMiles.get("walking") ?? 0;
  const flying = modeMiles.get("flying") ?? 0;
  const car = modeMiles.get("car") ?? 0;
  const train = modeMiles.get("train") ?? 0;
  if (totalMiles > 0 && walk / totalMiles >= 0.4) {
    tags.push({
      id: "walker",
      reason: "Most of your recorded distance was walking",
    });
  }
  if (flying > 0 && flying >= Math.max(car, train)) {
    tags.push({
      id: "flyer",
      reason: "Flying covered more distance than driving or rail",
    });
  }
  const counts = new Map<string, number>();
  for (const v of store.visits) counts.set(v.cluster, (counts.get(v.cluster) ?? 0) + 1);
  const totalVisits = store.visits.length;
  const top3 = [...counts.values()].sort((a, b) => b - a).slice(0, 3);
  const topShare = top3.reduce((s, n) => s + n, 0);
  if (totalVisits >= 10 && topShare / totalVisits >= 0.6) {
    tags.push({
      id: "creature_of_habit",
      reason: "Three places account for most of your visits",
    });
  }
  return tags;
}

export function computeAllAnalytics(store: Store, opts?: { timezone?: string | null }) {
  const trips = detectDayTrips(store);
  const multiDay = groupMultiDayTrips(trips);
  const yearly = computeYearlyStats(store);
  const reviews: Record<string, YearInReview> = {};
  const extra: Record<string, unknown> = {};
  for (const y of yearly) {
    const chapter = computeYearInReviewForYear(store, y.year);
    extra[`year-in-review:${y.year}`] = chapter;
    if (chapter) reviews[String(y.year)] = chapter;
  }
  return {
    "day-trips": trips,
    monthly: computeMonthlyStats(store),
    yearly,
    corridors: computeCorridors(store),
    facts: computeFunFacts(store),
    "multi-day": multiDay,
    "home-work": inferHomeWork(store),
    areas: computeAreas(store),
    "year-in-review": reviews,
    streaks: computeStreaks(store),
    "place-deltas": computePlaceDeltas(store),
    "lapsed-places": computeLapsedPlaces(store),
    "hour-of-week": computeHourOfWeek(store, opts?.timezone),
    personality: computePersonality(store),
    "away-nights": computeAwayNights(store),
    commute: computeCommute(store),
    firsts: computeFirsts(store),
    "data-health": computeDataHealth(store),
    moving: computeMovingHistory(store),
    anomaly: computeAnomalies(store),
    flights: detectFlights(store),
    "train-hops": detectTrainHops(store),
    "low-movement": detectLowMovementDays(store),
    "activity-guesses": computeActivityGuesses(store.visits),
    badges: computeBadges({
      visits: store.visits,
      activities: store.activities,
      allDates: store.allDates,
    }),
    ...extra,
  };
}
