import { UK_PLACES } from "../places.js";

export type FixtureName =
  | "health"
  | "uk-places"
  | "vca-vehicles"
  | "fuel-finder"
  | "carbon-intensity"
  | "dvla"
  | "maps-short";

function envFlag(explicit: string | undefined): string | undefined {
  if (explicit !== undefined) return explicit;
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.BRIM_FIXTURES;
}

async function loadNamed(name: FixtureName): Promise<unknown> {
  switch (name) {
    case "health":
      return {
        status: "ok",
        version: "0.0.0",
        commit: "fixture",
        fixtureMode: true,
      };
    case "uk-places":
      return UK_PLACES;
    case "vca-vehicles":
      return (await import("./vca-vehicles.js")).VCA_VEHICLE_FIXTURES;
    case "fuel-finder":
      return (await import("./fuel-finder.js")).FUEL_FINDER_FIXTURES;
    case "carbon-intensity":
      return (await import("./carbon-intensity.js")).CARBON_INTENSITY_FIXTURES;
    case "dvla":
      return (await import("./dvla.js")).DVLA_FIXTURES;
    case "maps-short":
      return (await import("./maps-short.js")).MAPS_SHORT_FIXTURES;
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown fixture: ${exhaustive}`);
    }
  }
}

export async function loadFixture<T>(
  name: FixtureName,
  fixtureFlag: string | undefined = undefined,
): Promise<T> {
  if (envFlag(fixtureFlag) !== "1") {
    throw new Error(
      "loadFixture() requires BRIM_FIXTURES=1. Recorded responses are only available in fixture mode.",
    );
  }
  return (await loadNamed(name)) as T;
}

export function isFixtureMode(flag: string | undefined = undefined): boolean {
  return envFlag(flag) === "1";
}
