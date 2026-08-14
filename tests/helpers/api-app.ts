import { vi } from "vitest";
import type { Env } from "@locations/api/env";
import { testEnv, testExecutionCtx } from "./env";

type App = {
  request: (
    path: string,
    init?: RequestInit,
    env?: Env,
    executionCtx?: ExecutionContext,
  ) => Promise<Response> | Response;
};

export function sessionUser(
  overrides: {
    id?: string;
    email?: string;
    name?: string;
    role?: string;
    emailVerified?: boolean;
  } = {},
) {
  return {
    user: {
      id: overrides.id ?? "user-a",
      email: overrides.email ?? "a@example.com",
      name: overrides.name ?? "User A",
      role: overrides.role ?? "user",
      emailVerified: overrides.emailVerified ?? false,
    },
  };
}

export function createServicesMock(overrides: Record<string, unknown> = {}) {
  return {
    getDb: vi.fn(() => ({})),
    configureGeoEndpoints: vi.fn(),
    getOverview: vi.fn(async () => ({ ok: true })),
    getDays: vi.fn(async () => []),
    getDay: vi.fn(),
    getHeatmap: vi.fn(async () => []),
    getAnalytics: vi.fn(async () => []),
    getRouteProgress: vi.fn(async () => ({})),
    resolveCoords: vi.fn(async () => ({ name: "Unknown", address: "" })),
    listSources: vi.fn(async () => []),
    getSourceById: vi.fn(async () => null),
    renameSource: vi.fn(async () => ({ error: "Source not found" as const })),
    removeSource: vi.fn(async () => ({ error: "Source not found" as const })),
    getImportStatus: vi.fn(async () => ({})),
    createImportJob: vi.fn(),
    ensureDataSource: vi.fn(),
    importSourceData: vi.fn(),
    updateImportJob: vi.fn(),
    getImportJob: vi.fn(),
    emailForTenant: vi.fn(async () => null),
    getSubscription: vi.fn(async () => null),
    getUserSettings: vi.fn(async () => ({ distanceUnit: "mi" })),
    searchTenant: vi.fn(async () => ({ places: [], days: [] })),
    upsertUserSettings: vi.fn(),
    upsertPlaceLabel: vi.fn(),
    listPlaceLabels: vi.fn(async () => []),
    listClusters: vi.fn(async () => ({ clusters: [], cursor: null })),
    getCluster: vi.fn(async () => null),
    listClusterVisits: vi.fn(async () => ({ visits: [], cursor: null })),
    getCorridorDetail: vi.fn(async () => null),
    getTripRange: vi.fn(async () => ({})),
    listNamedTrips: vi.fn(async () => []),
    upsertNamedTrip: vi.fn(async () => ({})),
    deleteNamedTrip: vi.fn(async () => ({ ok: true })),
    listChapters: vi.fn(async () => []),
    upsertChapter: vi.fn(async () => ({})),
    deleteChapter: vi.fn(async () => ({ ok: true })),
    listImportJobs: vi.fn(async () => []),
    staffTenantStats: vi.fn(async () => ({ visitCount: 0, sourceCount: 0, latestJobStatus: null, recentJobCount: 0 })),
    wipeTenantData: vi.fn(),
    ...overrides,
  };
}

export function requestApp(
  app: App,
  path: string,
  init?: RequestInit,
  env: Env = testEnv(),
) {
  return app.request(path, init, env, testExecutionCtx());
}
