import { expect, test } from "@playwright/test";

test.describe("40 explorer", () => {
  test("catalog place directory requires sign in", async ({ page }) => {
    await page.goto("/places");
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
  });

  test.skip("directory -> place -> day after login", async () => {
    // Needs a signed-in tenant with Timeline data. Health + login cover the public path.
  });
});
