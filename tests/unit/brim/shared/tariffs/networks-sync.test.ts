import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EV_NETWORK_TABLE } from "@locations/brim/shared/tariffs/table.js";

const networksJsonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../data/brim/tariffs/networks.json",
);

describe("EV network table sync", () => {
  it("keeps EV_NETWORK_TABLE and data/brim/tariffs/networks.json in exact sync with major UK networks", () => {
    const parsed = JSON.parse(readFileSync(networksJsonPath, "utf8")) as typeof EV_NETWORK_TABLE;
    expect(parsed).toEqual(EV_NETWORK_TABLE);
    for (const requiredId of [
      "gridserve",
      "fastned",
      "mfg-ev-power",
      "chargeplace-scotland",
      "mer",
      "instavolt",
      "ionity",
      "osprey",
    ]) {
      expect(EV_NETWORK_TABLE.networks.some((n) => n.id === requiredId), requiredId).toBe(true);
    }
  });
});
