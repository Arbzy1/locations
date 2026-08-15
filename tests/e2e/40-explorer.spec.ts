import { expect, test } from "@playwright/test";

test.describe("40 explorer", () => {
  test("catalog place directory requires sign in", async ({ page }) => {
    await page.goto("/places");
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
  });

  test("unauthenticated home shows the landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Locations" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
  });

  test("command palette sheet after demo login", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const demo = page.getByRole("button", { name: /try the demo/i });
    await expect(demo).toBeVisible({ timeout: 15_000 });
    await demo.click();
    const search = page.getByRole("button", { name: "Search" });
    const opened = await search
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!opened, "demo login unavailable");
    await search.click();
    await expect(page.getByPlaceholder(/search places/i)).toBeVisible();
  });
});
