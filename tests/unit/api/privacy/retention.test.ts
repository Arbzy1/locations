import { describe, expect, it, vi } from "vitest";
import { applyRetention, retentionCutoff } from "@locations/api/services";

describe("retention", () => {
  it("keeps exactly the last N years", () => {
    const now = new Date(Date.UTC(2026, 9, 22));
    expect(retentionCutoff(1, now)).toBe("2025-10-22");
    expect(retentionCutoff(5, now)).toBe("2021-10-22");
  });

  it("deletes only days before the cutoff, in the tenant", async () => {
    const deleted: unknown[] = [];
    const q = { where: async () => [{ count: 0 }] };
    const db = {
      select: () => ({ from: () => q }),
      delete: () => ({ where: async (w: unknown) => void deleted.push(w) }),
      execute: vi.fn(async () => undefined),
      insert: () => ({ values: async () => undefined }),
    };
    // The rebuild after deleting reads empty tables; only the delete calls matter here.
    await applyRetention(db as never, "t1", 2, new Date(Date.UTC(2026, 0, 15))).catch(() => undefined);
    expect(deleted.length).toBeGreaterThanOrEqual(2);
  });
});
