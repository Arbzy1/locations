import { expect, test } from "@playwright/test";

test.describe("00 health", () => {
  test("health endpoint is public", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual({ ok: true });
  });
});
