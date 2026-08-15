export function placePath(cluster: string) {
  return `/places/${encodeURIComponent(cluster)}`;
}

export function corridorPath(a: string, b: string) {
  return `/corridors/${encodeURIComponent(a)}/${encodeURIComponent(b)}`;
}

export function tripPath(start: string, end: string) {
  return `/trips/${start}/${end}`;
}

export type ExploreLink = { to: string; label: string; title: string; group: string };

export const EXPLORE_LINKS: ExploreLink[] = [
  { group: "Places", to: "/places", label: "Place directory", title: "Browse named places" },
  { group: "Places", to: "/areas", label: "Areas", title: "Places grouped by settlement" },
  { group: "Places", to: "/coverage", label: "Coverage map", title: "Where imported history exists" },
  { group: "Places", to: "/compare", label: "Compare days", title: "Compare two dates" },
  { group: "Places", to: "/replay", label: "Time-lapse", title: "Replay a day on the map" },
  { group: "Time", to: "/on-this-day", label: "On this day", title: "Same calendar date across years" },
  { group: "Time", to: "/gaps", label: "Gaps", title: "Days with no Timeline" },
  { group: "Time", to: "/review", label: "Year in review", title: "Private yearly recap" },
  { group: "Time", to: "/firsts", label: "Firsts", title: "First visit to each place" },
  { group: "Trips", to: "/holidays", label: "Away nights", title: "Nights not at the home guess" },
  { group: "Trips", to: "/commute", label: "Commute", title: "Weekday home and work loops" },
  { group: "Trips", to: "/weekday", label: "Weekend vs weekday", title: "Compare weekend and weekday travel" },
  { group: "Trips", to: "/trips/new", label: "Name a trip", title: "Save a multi-day trip name" },
  { group: "Life", to: "/chapters", label: "Life chapters", title: "Name date ranges" },
  { group: "Life", to: "/moving", label: "Moving history", title: "Home guess by year" },
  { group: "Life", to: "/anomaly", label: "Routine vs anomaly", title: "Days that look unusual" },
  { group: "Life", to: "/badges", label: "Badges", title: "Coverage percent and visit badges" },
  { group: "Life", to: "/guesses", label: "Activity guesses", title: "Heuristic labels from dwell, hour, and type" },
  { group: "Account", to: "/onboarding", label: "Onboarding", title: "Verify email and import Timeline" },
  { group: "Account", to: "/imports", label: "Import history", title: "Past import jobs" },
  { group: "Account", to: "/health", label: "Data health", title: "Duplicates and unknown modes" },
  { group: "Account", to: "/updates", label: "Changelog", title: "What changed in the product" },
  { group: "Account", to: "/globe", label: "Globe", title: "3D coverage globe" },
];

const CATALOG_EXACT = new Set([
  "/places",
  "/areas",
  "/coverage",
  "/compare",
  "/replay",
  "/on-this-day",
  "/gaps",
  "/review",
  "/firsts",
  "/holidays",
  "/commute",
  "/weekday",
  "/chapters",
  "/moving",
  "/anomaly",
  "/onboarding",
  "/imports",
  "/health",
  "/admin",
  "/globe",
  "/updates",
  "/badges",
  "/guesses",
  "/trips/new",
]);

export function isCatalogPath(pathname: string): boolean {
  if (CATALOG_EXACT.has(pathname)) return true;
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/places/")) return true;
  if (pathname.startsWith("/corridors/")) return true;
  if (pathname.startsWith("/areas/")) return true;
  if (pathname.startsWith("/month/")) return true;
  if (pathname.startsWith("/week/")) return true;
  if (pathname.startsWith("/review/")) return true;
  if (/^\/trips\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(pathname)) return true;
  return false;
}

export function catalogTitle(pathname: string): string {
  if (pathname.startsWith("/admin")) return "Operator";
  if (pathname.startsWith("/places")) return "Places";
  if (pathname.startsWith("/corridors")) return "Corridor";
  if (pathname.startsWith("/review")) return "Year in review";
  if (pathname.startsWith("/month")) return "Month";
  if (pathname.startsWith("/week")) return "Week";
  if (pathname.startsWith("/trips/")) return "Trip";
  const hit = EXPLORE_LINKS.find((l) => l.to === pathname);
  return hit?.label ?? "Explore";
}
