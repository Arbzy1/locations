import { test } from "@playwright/test";

test.describe("30 import", () => {
  test.skip("zip/json import requires a signed-in account", async () => {
    // Covered by API unit tests; live Takeout files stay out of git.
  });
});
