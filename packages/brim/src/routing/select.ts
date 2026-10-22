import type { CacheStore } from "./cache.js";
import { FixtureProvider } from "./providers/fixture.js";
import { GoogleRoutesProvider } from "./providers/google.js";
import { OsrmProvider } from "./providers/osrm.js";
import { budgetStatus } from "./budget.js";
import { selectRouteStrategy } from "./strategy.js";
import type { RoutingProvider } from "./types.js";

export function chooseProvider(input: {
  fixtureMode: boolean;
  googleKey?: string | undefined;
  osrmUrl?: string | undefined;
  spentUsd: number;
  ceilingUsd: number;
  hasVehicleProfile: boolean;
}): { provider: RoutingProvider; mode: "basic" | "advanced"; branch: string; budgetAlert: "none" | "60" | "85"; exceeded: boolean } {
  const budget = budgetStatus({ spentUsd: input.spentUsd, ceilingUsd: input.ceilingUsd });
  const strategy = selectRouteStrategy({ hasVehicleProfile: input.hasVehicleProfile });
  if (input.fixtureMode) {
    return { provider: new FixtureProvider(), mode: budget.exceeded ? "basic" : strategy.mode, branch: strategy.branch, budgetAlert: budget.alert, exceeded: budget.exceeded };
  }
  if (budget.exceeded) {
    return {
      provider: new OsrmProvider(input.osrmUrl ?? "https://router.project-osrm.org"),
      mode: "basic",
      branch: "osrm-failover",
      budgetAlert: budget.alert,
      exceeded: true,
    };
  }
  if (input.googleKey) {
    return {
      provider: new GoogleRoutesProvider(input.googleKey),
      mode: strategy.mode,
      branch: strategy.branch,
      budgetAlert: budget.alert,
      exceeded: false,
    };
  }
  return {
    provider: new OsrmProvider(input.osrmUrl ?? "https://router.project-osrm.org"),
    mode: "basic",
    branch: "osrm-default",
    budgetAlert: budget.alert,
    exceeded: false,
  };
}

export class DurableNoopCache implements CacheStore {
  async get(): Promise<string | null> {
    return null;
  }
  async put(): Promise<void> {
    return;
  }
}

export type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export class KvCache implements CacheStore {
  constructor(private readonly kv: KvLike) {}
  async get(key: string): Promise<string | null> {
    return (await this.kv.get(key)) ?? null;
  }
  async put(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.kv.put(key, value, { expirationTtl: Math.max(60, ttlSeconds) });
  }
}
