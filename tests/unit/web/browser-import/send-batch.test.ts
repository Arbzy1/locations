import { describe, expect, it } from "vitest";
import { ApiError, sendBatch } from "@locations/web/lib/import/browser-import";

const rows = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}` }));
type Batch = { visits: unknown[]; activities: unknown[] };
const size = (b: Batch) => b.visits.length + b.activities.length;

describe("sendBatch", () => {
  it("sends a batch once when the server accepts it", async () => {
    const sent: Batch[] = [];
    await sendBatch({ visits: rows(4, "v"), activities: rows(2, "a") }, async (b) => void sent.push(b));
    expect(sent).toHaveLength(1);
  });

  it("splits a batch the server cannot take and keeps every row in order", async () => {
    const batch = { visits: rows(5, "v"), activities: rows(3, "a") };
    const accepted: Batch[] = [];
    // The server chokes on anything over 2 rows.
    await sendBatch(batch, async (b) => {
      if (size(b) > 2) throw new ApiError("Request failed (503)", 503);
      accepted.push(b);
    });
    expect(accepted.flatMap((b) => b.visits)).toEqual(batch.visits);
    expect(accepted.flatMap((b) => b.activities)).toEqual(batch.activities);
    expect(Math.max(...accepted.map(size))).toBeLessThanOrEqual(2);
  });

  it("also splits on 413", async () => {
    let calls = 0;
    await sendBatch({ visits: rows(4, "v"), activities: [] }, async (b) => {
      calls += 1;
      if (size(b) > 2) throw new ApiError("Batch too large", 413);
    });
    expect(calls).toBe(3);
  });

  it("does not split when the server rejects the rows themselves", async () => {
    let calls = 0;
    const attempt = sendBatch({ visits: rows(4, "v"), activities: [] }, async () => {
      calls += 1;
      throw new ApiError("stay row invalid", 400);
    });
    await expect(attempt).rejects.toThrow("stay row invalid");
    expect(calls).toBe(1);
  });

  it("does not split on a network failure", async () => {
    let calls = 0;
    const attempt = sendBatch({ visits: rows(4, "v"), activities: [] }, async () => {
      calls += 1;
      throw new TypeError("Failed to fetch");
    });
    await expect(attempt).rejects.toThrow("Failed to fetch");
    expect(calls).toBe(1);
  });

  it("gives up after splitting to an eighth", async () => {
    let calls = 0;
    const attempt = sendBatch({ visits: rows(64, "v"), activities: [] }, async () => {
      calls += 1;
      throw new ApiError("Request failed (503)", 503);
    });
    await expect(attempt).rejects.toThrow("503");
    // One try at each size on the way down: 64, 32, 16, 8.
    expect(calls).toBe(4);
  });
});
