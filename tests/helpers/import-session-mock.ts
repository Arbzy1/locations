import { vi } from "vitest";

/**
 * Mock for @locations/api/import-session: real validators, database helpers stubbed
 * (no job, nothing stored) so route tests run without Postgres.
 */
export async function createImportSessionMock() {
  const actual = await vi.importActual<typeof import("@locations/api/import-session")>("@locations/api/import-session");
  return {
    ...actual,
    existingImportDays: vi.fn(async () => null),
    startImportJob: vi.fn(async () => ({ status: 409 as const })),
    openImportJob: vi.fn(async () => null),
    appendImportRows: vi.fn(async () => undefined),
    finishImportJob: vi.fn(async () => undefined),
    aggregatesStale: vi.fn(async () => false),
    aggregateInputPage: vi.fn(async () => []),
    writeAggregates: vi.fn(async () => undefined),
  };
}
