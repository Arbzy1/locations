import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(__dirname, "../../..");

export const ENV_NAMES = ["local", "staging", "production"] as const;
export type EnvName = (typeof ENV_NAMES)[number];

export function parseEnvName(raw: string | undefined): EnvName {
  if (!raw || raw === "local" || raw === "dev") return "local";
  if (raw === "staging" || raw === "production") return raw;
  throw new Error(`Unknown env "${raw}". Use local, staging, or production.`);
}

export function filesFor(name: EnvName) {
  if (name === "local") {
    return { envFile: ".env", devVarsFile: ".dev.vars" };
  }
  return { envFile: `.env.${name}`, devVarsFile: `.dev.vars.${name}` };
}

/** Strip `--env <name>` from argv. Default is LOCATIONS_ENV or local. */
export function takeEnvName(argv = process.argv.slice(2)): { name: EnvName; argv: string[] } {
  const rest = [...argv];
  let raw: string | undefined = process.env.LOCATIONS_ENV;
  const i = rest.indexOf("--env");
  if (i !== -1) {
    raw = rest[i + 1];
    rest.splice(i, 2);
  }
  return { name: parseEnvName(raw), argv: rest };
}

export function loadEnvFiles(name?: EnvName): EnvName {
  const resolved = name ?? takeEnvName().name;
  const files = filesFor(resolved);
  config({ path: resolve(repoRoot, files.envFile) });
  config({ path: resolve(repoRoot, files.devVarsFile) });
  return resolved;
}
