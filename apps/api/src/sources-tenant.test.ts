import { describe, expect, it, vi } from "vitest";
import { getSourceById, renameSource, removeSource } from "./services";

/** Minimal Drizzle-like chain that returns configured rows from limit(). */
function mockDb(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => rows),
        })),
      })),
    })),
  } as unknown as Parameters<typeof getSourceById>[0];
}

describe("source tenant isolation (app-level; no Postgres RLS)", () => {
  it("getSourceById returns null when no row matches tenant+id", async () => {
    const result = await getSourceById(mockDb([]), "user-a", "src-owned-by-b");
    expect(result).toBeNull();
  });

  it("renameSource refuses when the source is not visible to the tenant", async () => {
    const result = await renameSource(mockDb([]), "user-a", "src-owned-by-b", "Hijack");
    expect(result).toEqual({ error: "Source not found" });
  });

  it("removeSource refuses when the source is not visible to the tenant", async () => {
    const result = await removeSource(mockDb([]), "user-a", "src-owned-by-b");
    expect(result).toEqual({ error: "Source not found" });
  });
});
