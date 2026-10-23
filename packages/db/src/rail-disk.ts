import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadRailIndex, type RailCoverage, type RailIndex, type RailTile } from "./rail.js";

/**
 * Rail tiles from disk for the CLI import (the web app fetches the same files from
 * /assets/rail). Null when the tiles have not been built, so detection falls back to
 * speed checks only.
 */
export async function loadRailIndexFromDisk(
  dir: string,
  points: Iterable<readonly [number, number, ...number[]]>,
): Promise<RailIndex | null> {
  const indexPath = resolve(dir, "index.json");
  if (!existsSync(indexPath)) return null;
  const coverage = JSON.parse(readFileSync(indexPath, "utf-8")) as RailCoverage;
  return loadRailIndex(coverage, points, async (key) => {
    const file = resolve(dir, String(coverage.z), `${key}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as RailTile) : null;
  });
}
