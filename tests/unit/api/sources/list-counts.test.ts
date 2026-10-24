import { describe, expect, it } from "vitest";
import { activities, dataSources, visits } from "@locations/db";
import { listSources } from "@locations/api/services";

function listDb(opts: {
  sources: { id: string; label: string; color: string | null; createdAt: Date; updatedAt: Date }[];
  visitCounts: { sourceId: string; n: number }[];
  activityCounts: { sourceId: string; n: number }[];
}) {
  const chain = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    q.where = () => q;
    q.groupBy = () => q;
    q.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject);
    return q;
  };
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === dataSources) return chain(opts.sources);
        if (table === visits) return chain(opts.visitCounts);
        if (table === activities) return chain(opts.activityCounts);
        return chain([]);
      },
    }),
  } as never;
}

describe("listSources", () => {
  it("joins grouped visit and activity counts instead of per-source queries", async () => {
    const created = new Date("2024-01-02T00:00:00Z");
    const earlier = new Date("2024-01-01T00:00:00Z");
    const rows = await listSources(
      listDb({
        sources: [
          { id: "b", label: "Second", color: null, createdAt: created, updatedAt: created },
          { id: "a", label: "First", color: "visit", createdAt: earlier, updatedAt: earlier },
        ],
        visitCounts: [
          { sourceId: "a", n: 3 },
          { sourceId: "b", n: 1 },
        ],
        activityCounts: [{ sourceId: "a", n: 2 }],
      }),
      "t1" as never,
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({ label: "First", visitCount: 3, activityCount: 2, color: "visit" });
    expect(rows[1]).toMatchObject({ label: "Second", visitCount: 1, activityCount: 0, color: null });
  });
});
