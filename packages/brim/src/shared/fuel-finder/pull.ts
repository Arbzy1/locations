export const FUEL_FINDER_ORIGIN = "https://www.fuel-finder.service.gov.uk";
export const FUEL_FINDER_PAGE_SIZE = 500;
export const FUEL_FINDER_PAGE_SLEEP_MS = 4000;

export function formatFuelFinderTimestamp(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function fuelFinderTokenUrl(): string {
  return `${FUEL_FINDER_ORIGIN}/api/v1/oauth/generate_access_token`;
}

export function fuelFinderPfsUrl(batchNumber: number, watermark?: string): string {
  return fuelFinderListUrl("/api/v1/pfs", batchNumber, watermark);
}

export function fuelFinderPricesUrl(batchNumber: number, watermark?: string): string {
  return fuelFinderListUrl("/api/v1/pfs/fuel-prices", batchNumber, watermark);
}

function fuelFinderListUrl(path: string, batchNumber: number, watermark?: string): string {
  const url = new URL(path, FUEL_FINDER_ORIGIN);
  url.searchParams.set("batch-number", String(batchNumber));
  if (watermark) url.searchParams.set("effective-start-timestamp", watermark);
  return url.toString();
}

export function parseAccessToken(json: unknown): string {
  if (json && typeof json === "object") {
    const rec = json as { access_token?: unknown; data?: { access_token?: unknown } };
    const token = rec.data?.access_token ?? rec.access_token;
    if (typeof token === "string" && token.length > 0) return token;
  }
  throw new Error("Fuel Finder token response missing access_token");
}

export function unwrapFuelFinderList(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && "data" in json) {
    const data = (json as { data: unknown }).data;
    if (Array.isArray(data)) return data;
  }
  throw new Error("Fuel Finder batch was not a list");
}

export async function pullFuelFinder(deps: {
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  clientId: string;
  clientSecret: string;
  watermark?: string;
  onRaw?: (kind: "pfs" | "prices", batchNumber: number, body: unknown) => void | Promise<void>;
}): Promise<{ pfs: unknown[]; prices: unknown[] }> {
  const token = await requestToken(deps);
  const pfs = await pullPages(deps, token, "pfs");
  const prices = await pullPages(deps, token, "prices");
  return { pfs, prices };
}

async function requestToken(deps: {
  fetch: typeof globalThis.fetch;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const res = await deps.fetch(fuelFinderTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: deps.clientId, client_secret: deps.clientSecret }),
  });
  const json: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new Error(`Fuel Finder token failed (${res.status})`);
  }
  return parseAccessToken(json);
}

async function pullPages(
  deps: {
    fetch: typeof globalThis.fetch;
    sleep: (ms: number) => Promise<void>;
    watermark?: string;
    onRaw?: (kind: "pfs" | "prices", batchNumber: number, body: unknown) => void | Promise<void>;
  },
  token: string,
  kind: "pfs" | "prices",
): Promise<unknown[]> {
  const out: unknown[] = [];
  let batch = 1;
  while (true) {
    await deps.sleep(FUEL_FINDER_PAGE_SLEEP_MS);
    const url = kind === "pfs" ? fuelFinderPfsUrl(batch, deps.watermark) : fuelFinderPricesUrl(batch, deps.watermark);
    const json = await requestJson(deps.fetch, deps.sleep, url, token);
    if (deps.onRaw) await deps.onRaw(kind, batch, json);
    const rows = unwrapFuelFinderList(json);
    out.push(...rows);
    if (rows.length < FUEL_FINDER_PAGE_SIZE) break;
    batch += 1;
  }
  return out;
}

async function requestJson(
  fetchFn: typeof globalThis.fetch,
  sleep: (ms: number) => Promise<void>,
  url: string,
  token: string,
): Promise<unknown> {
  let attempt = 0;
  while (true) {
    const res = await fetchFn(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 429 && attempt < 5) {
      attempt += 1;
      await sleep(FUEL_FINDER_PAGE_SLEEP_MS * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Fuel Finder request failed (${res.status})`);
    }
    return res.json();
  }
}
