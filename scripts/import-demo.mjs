import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  TENANT: "demo",
  DATA_PATH: "data/sample-location-history.json",
};

const result = spawnSync("npm", ["run", "import", "-w", "@locations/db"], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
