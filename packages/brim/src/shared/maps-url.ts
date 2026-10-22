export type MapsParseOk = {
  ok: true;
  origin: string;
  destination: string;
  waypoints: string[];
  travelMode: "drive" | "transit" | "walk" | "bike" | "unknown";
};

export type MapsParseFail = {
  ok: false;
  reason: string;
};

export type MapsParseResult = MapsParseOk | MapsParseFail;

const MODE_FROM_3E: Record<string, MapsParseOk["travelMode"]> = {
  "0": "drive",
  "1": "bike",
  "2": "walk",
  "3": "transit",
};

const MODE_FROM_QUERY: Record<string, MapsParseOk["travelMode"]> = {
  driving: "drive",
  drive: "drive",
  walking: "walk",
  walk: "walk",
  bicycling: "bike",
  cycling: "bike",
  bike: "bike",
  transit: "transit",
};

function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function travelModeFromData(data: string | null): MapsParseOk["travelMode"] {
  if (!data) return "unknown";
  const match = /!3e(\d+)/.exec(data);
  if (!match?.[1]) return "unknown";
  return MODE_FROM_3E[match[1]] ?? "unknown";
}

function travelModeFromQuery(raw: string | null): MapsParseOk["travelMode"] | undefined {
  if (!raw) return undefined;
  return MODE_FROM_QUERY[raw.trim().toLowerCase()];
}

function isGoogleMapsHost(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  return (
    h === "google.com" ||
    h === "google.co.uk" ||
    h === "maps.google.com" ||
    h === "maps.google.co.uk" ||
    h.endsWith(".google.com") ||
    h.endsWith(".google.co.uk")
  );
}

/** Google Maps short links. Shared never fetches; the API may follow these hosts. */
export function isMapsShortUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "maps.app.goo.gl") return true;
    if (host === "goo.gl") {
      const path = url.pathname.replace(/\/+$/, "") || "/";
      return path === "/maps" || path.startsWith("/maps/");
    }
    return false;
  } catch {
    return false;
  }
}

function isAppleMapsHost(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  return h === "maps.apple.com";
}

function isBingMapsHost(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  return h === "bing.com";
}

function parseAppleMaps(url: URL): MapsParseResult {
  const origin = decodeSegment(url.searchParams.get("saddr") ?? "");
  const destParts = url.searchParams
    .getAll("daddr")
    .flatMap((part) => part.split(/[|/]/).map(decodeSegment).filter((p) => p.length > 0));
  const destination = destParts[destParts.length - 1];
  if (!origin || !destination) {
    return { ok: false, reason: "Could not find both a start and a destination in that link." };
  }
  const waypoints = destParts.slice(0, -1);
  const flag = (url.searchParams.get("dirflg") ?? "").toLowerCase();
  const travelMode: MapsParseOk["travelMode"] =
    flag === "d" ? "drive" : flag === "w" ? "walk" : flag === "r" ? "transit" : flag === "h" ? "bike" : "unknown";
  return { ok: true, origin, destination, waypoints, travelMode };
}

function bingPlace(token: string): string {
  const raw = decodeSegment(token.trim());
  if (raw.toLowerCase().startsWith("adr.")) return raw.slice(4);
  const pos = /^pos\.(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)(?:_(.*))?$/i.exec(raw);
  if (pos?.[1] && pos[2]) {
    const label = pos[3] ? decodeSegment(pos[3]) : "";
    return label.length > 0 ? label : `${pos[1]},${pos[2]}`;
  }
  return raw;
}

function parseBingMaps(url: URL): MapsParseResult {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const isMaps = path === "/maps" || path.startsWith("/maps/") || path === "/maps/directions";
  if (!isMaps) {
    return { ok: false, reason: "That Maps link has no directions. Open a route, then share or copy the link." };
  }
  const rtp = url.searchParams.get("rtp") ?? "";
  const parts = rtp
    .split("~")
    .map(bingPlace)
    .filter((p) => p.length > 0);
  if (parts.length < 2) {
    return { ok: false, reason: "Could not find both a start and a destination in that link." };
  }
  const origin = parts[0];
  const destination = parts[parts.length - 1];
  if (!origin || !destination) {
    return { ok: false, reason: "Could not find both a start and a destination in that link." };
  }
  return { ok: true, origin, destination, waypoints: parts.slice(1, -1), travelMode: "unknown" };
}

function parseGoogleMaps(url: URL): MapsParseResult {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const isDir = path === "/maps/dir" || path.startsWith("/maps/dir/");
  if (!isDir) {
    return { ok: false, reason: "That Maps link has no directions. Open a route, then share or copy the link." };
  }

  const originParam = url.searchParams.get("origin");
  const destParam = url.searchParams.get("destination");
  if (originParam && destParam) {
    const origin = decodeSegment(originParam);
    const destination = decodeSegment(destParam);
    if (!origin || !destination) {
      return { ok: false, reason: "Could not find both a start and a destination in that link." };
    }
    const wpRaw = url.searchParams.get("waypoints") ?? "";
    const waypoints = wpRaw
      .split(/[|/]/)
      .map((part) => decodeSegment(part.replace(/^via:/i, "")))
      .filter((part) => part.length > 0);
    const travelMode =
      travelModeFromQuery(url.searchParams.get("travelmode")) ??
      travelModeFromData(url.searchParams.get("data"));
    return { ok: true, origin, destination, waypoints, travelMode };
  }

  const dir = url.pathname.match(/\/maps\/dir\/(.+)/);
  if (!dir?.[1]) {
    return { ok: false, reason: "That Maps link has no directions. Open a route, then share or copy the link." };
  }

  const parts = dir[1]
    .split("/")
    .map(decodeSegment)
    .filter((p) => p.length > 0 && !p.startsWith("@") && !p.startsWith("data="));

  if (parts.length < 2) {
    return { ok: false, reason: "Could not find both a start and a destination in that link." };
  }

  const origin = parts[0];
  const destination = parts[parts.length - 1];
  if (!origin || !destination) {
    return { ok: false, reason: "Could not find both a start and a destination in that link." };
  }

  const waypoints = parts.slice(1, -1);
  const travelMode =
    travelModeFromQuery(url.searchParams.get("travelmode")) ??
    travelModeFromData(url.searchParams.get("data") ?? dir[1]);

  return { ok: true, origin, destination, waypoints, travelMode };
}

/**
 * Parse a Google, Apple, or Bing Maps directions URL. URL only - never the DOM. Spec §10.2.
 * Never throws; malformed input returns `{ ok: false, reason }`.
 */
export function parseMapsUrl(input: string): MapsParseResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: "That does not look like a URL. Paste a full maps link or type the places instead." };
  }

  if (isMapsShortUrl(input)) {
    return {
      ok: false,
      reason: "That is a shortened Maps link. Open it in Google Maps, then paste the full directions URL.",
    };
  }

  if (isAppleMapsHost(url.hostname)) return parseAppleMaps(url);
  if (isBingMapsHost(url.hostname)) return parseBingMaps(url);
  if (isGoogleMapsHost(url.hostname)) return parseGoogleMaps(url);

  return { ok: false, reason: "That link is not a Google, Apple, or Bing Maps directions URL." };
}
