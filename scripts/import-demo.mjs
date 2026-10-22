import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  TENANT: "demo",
  DATA_PATH: "data/sample-location-history.json",
};

// `npm run db:import-demo -- --env production` targets that env's DATABASE_URL.
const envIdx = process.argv.indexOf("--env");
const envName = envIdx === -1 ? null : process.argv[envIdx + 1];
if (envName !== null && !["local", "staging", "production"].includes(envName)) {
  console.error(`Unknown env "${envName}". Use local, staging, or production.`);
  process.exit(1);
}

const result = spawnSync(
  "npm",
  ["run", "import", "-w", "@locations/db", "--", "--source", "demo", ...(envName ? ["--env", envName] : [])],
  {
    cwd: root,
    env,
    stdio: "inherit",
    shell: true,
  },
);

process.exit(result.status ?? 1);
