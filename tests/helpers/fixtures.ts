import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const timelineDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "timeline");

export function loadTimelineFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(timelineDir, name), "utf8")) as unknown;
}
