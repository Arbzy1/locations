import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { filterHiddenSearchPlaces } from "@locations/api/services";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start, `${name} missing`).toBeGreaterThan(-1);
  const next = source.slice(start + 10).search(/\nexport async function /);
  return next === -1 ? source.slice(start) : source.slice(start, start + 10 + next);
}

describe("hide-place is discovery only", () => {
  it("omits hidden keys from search results", () => {
    const hidden = new Set(["Home"]);
    const places = [{ cluster: "Home" }, { cluster: "Park" }, { cluster: null }];
    expect(filterHiddenSearchPlaces(places, hidden)).toEqual([{ cluster: "Park" }, { cluster: null }]);
  });

  it("filters heatmap and search, not Day View or cluster visits", () => {
    const services = readFileSync(join(root, "apps/api/src/services.ts"), "utf8");
    const catalog = readFileSync(join(root, "apps/api/src/catalog.ts"), "utf8");
    const heatmap = fnBody(services, "getHeatmap");
    const search = fnBody(services, "searchTenant");
    const day = fnBody(services, "getDay");
    const cluster = fnBody(catalog, "getCluster");
    const visits = fnBody(catalog, "listClusterVisits");
    expect(heatmap).toContain("hiddenPlaceKeySet");
    expect(heatmap).toContain(".filter(");
    expect(search).toContain("filterHiddenSearchPlaces");
    expect(day).not.toContain("hiddenPlaceKeySet");
    expect(visits).not.toContain("hiddenPlaceKeySet");
    expect(cluster).toContain("hidden: hidden.has(cluster)");
    expect(cluster).not.toMatch(/\.filter\(\s*\(.*hidden/);
  });
});
