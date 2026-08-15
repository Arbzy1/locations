import { expect, test } from "@playwright/test";

test.describe("21 marketing", () => {
  test("pricing page is public", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
  });

  test("status page is public", async ({ page }) => {
    await page.goto("/status");
    await expect(page.getByRole("heading", { name: "Status" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Worker")).toBeVisible();
  });

  test("changelog page is public", async ({ page }) => {
    await page.goto("/changelog");
    await expect(page.getByRole("heading", { name: "Changelog" })).toBeVisible({ timeout: 15_000 });
  });
});
