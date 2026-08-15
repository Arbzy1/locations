import { expect, test } from "@playwright/test";

test.describe("20 legal", () => {
  test("privacy page", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /privacy/i })).toBeVisible();
  });

  test("terms page", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /terms/i })).toBeVisible();
  });
});
