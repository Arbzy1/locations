/**
 * Per-environment env file names.
 * local: .env / .dev.vars
 * staging: .env.staging / .dev.vars.staging
 * production: .env.production / .dev.vars.production
 */
export const ENV_NAMES = ["local", "staging", "production"];

/**
 * @typedef {"local" | "staging" | "production"} EnvName
 * @typedef {{ dest: string, example: string, label: string }} FileSpec
 * @typedef {{ env: FileSpec, devVars: FileSpec }} EnvFiles
 */

/** @param {string | undefined} raw @returns {EnvName} */
export function parseEnvName(raw) {
  if (!raw || raw === "local" || raw === "dev") return "local";
  if (raw === "staging" || raw === "production") return raw;
  throw new Error(`Unknown env "${raw}". Use local, staging, or production.`);
}

/**
 * @param {string[]} argv
 * @returns {{ name: EnvName | "all", rest: string[] }}
 */
export function takeEnvFlag(argv) {
  const rest = [...argv];
  let raw = process.env.LOCATIONS_ENV;
  const i = rest.indexOf("--env");
  if (i !== -1) {
    raw = rest[i + 1];
    rest.splice(i, 2);
  }
  if (raw === "all") return { name: "all", rest };
  return { name: parseEnvName(raw), rest };
}

/** @param {EnvName} name @returns {EnvFiles} */
export function filesFor(name) {
  if (name === "local") {
    return {
      env: { dest: ".env", example: ".env.example", label: ".env" },
      devVars: { dest: ".dev.vars", example: ".dev.vars.example", label: ".dev.vars" },
    };
  }
  return {
    env: {
      dest: `.env.${name}`,
      example: `.env.${name}.example`,
      label: `.env.${name}`,
    },
    devVars: {
      dest: `.dev.vars.${name}`,
      example: `.dev.vars.${name}.example`,
      label: `.dev.vars.${name}`,
    },
  };
}

/** @param {EnvName | "all"} name @returns {EnvName[]} */
export function expandEnvNames(name) {
  if (name === "all") return ["local", "staging", "production"];
  return [name];
}
