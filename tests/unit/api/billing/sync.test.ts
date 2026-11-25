import { describe, expect, it } from "vitest";
import { syncSubscriptionFromStripe } from "@locations/api/billing";
import { testEnv } from "@tests/helpers/env";

function recordingSubDb() {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  };
  return { db: db as never, inserted };
}

describe("syncSubscriptionFromStripe graceUntil policy", () => {
  const periodEndUnix = Math.floor(Date.UTC(2026, 5, 1, 0, 0, 0) / 1000);
  const env = testEnv({ GRACE_DAYS: "3" });

  it("sets graceUntil only on past_due and unpaid", async () => {
    for (const status of ["past_due", "unpaid"] as const) {
      const { db, inserted } = recordingSubDb();
      await syncSubscriptionFromStripe(
        db,
        env,
        {
          id: "sub_1",
          customer: "cus_1",
          status,
          items: { data: [{ current_period_end: periodEndUnix, price: { id: "price_m" } }] },
        } as never,
        "user-a",
      );
      expect(inserted[0]?.status).toBe(status);
      expect((inserted[0]?.graceUntil as Date | null)?.toISOString()).toBe("2026-06-04T00:00:00.000Z");
    }
  });

  it("leaves graceUntil null on canceled, active, trialing, paused, and none", async () => {
    for (const status of ["canceled", "active", "trialing", "paused", "incomplete_expired"] as const) {
      const { db, inserted } = recordingSubDb();
      await syncSubscriptionFromStripe(
        db,
        env,
        {
          id: "sub_1",
          customer: "cus_1",
          status,
          items: { data: [{ current_period_end: periodEndUnix, price: { id: "price_m" } }] },
        } as never,
        "user-a",
      );
      expect(inserted[0]?.graceUntil, `status=${status}`).toBeNull();
    }
  });
});
