import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_VERSION, APP_VERSION_LABEL } from "@locations/api/version";

const rootPkg = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../package.json"), "utf8"),
) as { version: string };

describe("worker version", () => {
  it("matches the root package.json version", () => {
    expect(APP_VERSION).toBe(rootPkg.version.replace(/^v/i, ""));
    expect(APP_VERSION_LABEL).toBe(`v${APP_VERSION}`);
  });
});
