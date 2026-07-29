import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("health endpoint is public", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual({ ok: true });
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /try the demo/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
