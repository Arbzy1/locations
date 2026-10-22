import type { CacheStore } from "@locations/brim/routing";
import { routeCacheGet, routeCachePut } from "./repo";
import type { BrimDb } from "./types";

/** Routing response cache in `brim_route_cache` (shared, non-PII request hashes). */
export class NeonRouteCache implements CacheStore {
  constructor(private readonly db: BrimDb) {}

  get(key: string): Promise<string | null> {
    return routeCacheGet(this.db, key);
  }

  put(key: string, value: string, ttlSeconds: number): Promise<void> {
    return routeCachePut(this.db, key, value, ttlSeconds);
  }
}
