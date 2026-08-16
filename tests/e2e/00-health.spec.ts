import { expect, test } from "@playwright/test";

test.describe("00 health", () => {
  test("health endpoint is public", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { ok?: boolean; worker?: string; db?: string; version?: string };
    expect(body.ok).toBe(true);
    expect(body.worker).toBe("ok");
    expect(typeof body.db).toBe("string");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
