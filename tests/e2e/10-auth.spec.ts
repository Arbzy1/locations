import { expect, test } from "@playwright/test";

test.describe("10 auth", () => {
  test("home is the landing page with demo and sign in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /try the demo/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: /^sign in$/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /continue with google/i })).toHaveCount(0);
  });

  test("login page loads with demo and signup", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /try the demo/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole("link", { name: /create account/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toHaveCount(0);
  });

  test("signup page loads", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
  });
});
