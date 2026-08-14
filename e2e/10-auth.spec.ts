import { expect, test } from "@playwright/test";

test.describe("10 auth", () => {
  test("login page loads with demo and signup", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /try the demo/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole("link", { name: /create account/i })).toBeVisible();
  });

  test("signup page loads", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
  });
});
