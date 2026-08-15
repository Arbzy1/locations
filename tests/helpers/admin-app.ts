import { vi } from "vitest";
import { sessionUser } from "./api-app";

export { sessionUser };

export function createAdminOpsMock(overrides: Record<string, unknown> = {}) {
  return {
    getOpsOverview: vi.fn(async () => ({
      worker: "ok",
      db: true,
      flags: { signupDisabled: false, landingEnabled: true, globeEnabled: true, demoTour: true },
      users: { total: 1, byRole: { admin: 1 } },
      stuckImportCount: 0,
      entitledCount: 1,
      lapsedCount: 0,
      sampledAccounts: 1,
    })),
    listOpsUsers: vi.fn(async () => ({ users: [], cursor: null, limit: 25 })),
    getOpsUserCard: vi.fn(async () => ({
      id: "user-a",
      email: "a@example.com",
      name: "User A",
      role: "user",
      emailVerified: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      visitCount: 0,
      sourceCount: 0,
      sessionCount: 0,
      billingStatus: "none",
      recapOptIn: false,
      latestImport: null,
      latestExport: null,
    })),
    setOpsUserRole: vi.fn(async () => ({ ok: true as const })),
    revokeOpsUserSessions: vi.fn(async () => ({ ok: true as const, revoked: 1 })),
    verifyOpsUser: vi.fn(async () => ({ ok: true as const })),
    wipeOpsUser: vi.fn(async () => ({ ok: true as const })),
    getOpsBilling: vi.fn(async () => ({ histogram: {}, pastDue: [], cursor: null })),
    getOpsImports: vi.fn(async () => ({ jobs: [], stuckCount: 0, cursor: null })),
    getOpsExports: vi.fn(async () => ({ jobs: [], byStatus: {}, cursor: null })),
    getOpsEmail: vi.fn(async () => ({ kinds: [], lastRecap: null })),
    getOpsMaps: vi.fn(() => ({
      commercialTiles: false,
      osrmConfigured: false,
      geocodeConfigured: false,
      customHostsAllowlist: false,
    })),
    getOpsDemo: vi.fn(async () => ({ exists: false })),
    getOpsAnalytics: vi.fn(async () => ({
      byRole: {},
      importsReady: 0,
      importsError: 0,
      recapOptIn: 0,
    })),
    listOpsAudit: vi.fn(async () => ({ entries: [], cursor: null })),
    getOpsDiagnostics: vi.fn(async () => ({
      worker: true,
      db: true,
      flagsLoaded: true,
      stripeConfigured: false,
      resendConfigured: false,
      r2Configured: true,
      queueConfigured: false,
    })),
    patchOpsFlags: vi.fn(async () => ({ ok: true as const })),
    writeOpsAudit: vi.fn(async () => undefined),
    listToggleFlags: vi.fn(async () => ({
      flags: { signupDisabled: false, landingEnabled: true, globeEnabled: true, demoTour: true },
      overlay: {
        signup_disabled: null,
        landing_enabled: null,
        globe_enabled: null,
        demo_tour: null,
      },
      source: {
        signup_disabled: "env",
        landing_enabled: "env",
        globe_enabled: "env",
        demo_tour: "env",
      },
    })),
    ...overrides,
  };
}
