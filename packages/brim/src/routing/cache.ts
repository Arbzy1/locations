export type CacheStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
};

export function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function hourOfWeek(iso: string): number {
  const d = new Date(iso);
  return d.getUTCDay() * 24 + d.getUTCHours();
}

export function routeCacheKey(input: {
  origin: string;
  dest: string;
  mode: string;
  provider: string;
  departureTime?: string | undefined;
  waypoints?: string | undefined;
}): string {
  const time = input.mode === "advanced" && input.departureTime ? String(hourOfWeek(input.departureTime)) : "";
  const via = input.waypoints ?? "";
  return `${input.provider}|${input.mode}|${input.origin}|${input.dest}|${via}|${time}`;
}

export async function cachedRoute<T>(
  store: CacheStore,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const existing = await store.get(key);
  if (existing) return { value: JSON.parse(existing) as T, hit: true };
  const value = await compute();
  await store.put(key, JSON.stringify(value), ttlSeconds);
  return { value, hit: false };
}

export class MemoryCache implements CacheStore {
  private readonly map = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
}
