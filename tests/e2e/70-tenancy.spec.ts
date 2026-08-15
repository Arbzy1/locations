import { expect, test } from "@playwright/test";

test.describe("70 tenancy", () => {
  test("unauthenticated API is 401", async ({ request }) => {
    const res = await request.get("/api/overview");
    expect(res.status()).toBe(401);
  });
});
