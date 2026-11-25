import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { applyRetention, retentionCutoff } from "@locations/api/services";

describe("retention", () => {
  it("keeps exactly the last N years", () => {
    const now = new Date(Date.UTC(2026, 9, 22));
    expect(retentionCutoff(1, now)).toBe("2025-10-22");
    expect(retentionCutoff(5, now)).toBe("2021-10-22");
  });

  it("deletes visits, activities, day_stats, and timeline_overrides before the cutoff", async () => {
    const deletedTables: string[] = [];
    const q = { where: async () => [{ count: 0 }] };
    const db = {
      select: () => ({ from: () => q }),
      delete: (table: PgTable) => {
        deletedTables.push(getTableName(table));
        return { where: async () => undefined };
      },
      execute: vi.fn(async () => ({ rows: [{ n: 0 }] })),
      insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
    };
    await applyRetention(db as never, "t1", 2, new Date(Date.UTC(2026, 0, 15)));
    expect(deletedTables).toEqual(
      expect.arrayContaining(["visits", "activities", "day_stats", "timeline_overrides"]),
    );
  });
});
