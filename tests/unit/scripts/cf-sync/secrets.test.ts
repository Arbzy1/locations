import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LOCAL_ONLY_KEYS,
  WORKER_SECRET_KEYS,
  deriveWorkerSecretKeys,
  parseSecretListOutput,
  parseWranglerPlaintextVarKeys,
  readEnvFile,
  secretBulkPayload,
} from "../../../../scripts/env-file.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const BINDING_KEYS = new Set(["ASSETS", "UPLOADS", "IMPORT_QUEUE"]);

function envTypeKeys() {
  const src = readFileSync(resolve(root, "apps/api/src/env.ts"), "utf8");
  const body = src.match(/export type Env = \{([\s\S]*?)\};/);
  if (!body) throw new Error("could not parse Env type");
  return [...body[1].matchAll(/^\s*([A-Z][A-Z0-9_]*)\??:/gm)].map((m) => m[1]);
}

describe("deriveWorkerSecretKeys", () => {
  it("drops wrangler vars and CLI-only keys, keeps map secrets", () => {
    expect(
      deriveWorkerSecretKeys({
        envExampleKeys: [
          "DATABASE_URL",
          "BETTER_AUTH_URL",
          "DATA_PATH",
          "MAP_STYLE_DARK_URL",
          "MAP_CUSTOM_TILE_HOSTS",
        ],
        wranglerVarKeys: ["BETTER_AUTH_URL", "DISABLE_SIGNUP"],
      }),
    ).toEqual(["DATABASE_URL", "MAP_CUSTOM_TILE_HOSTS", "MAP_STYLE_DARK_URL"]);
  });
});

describe("parseWranglerPlaintextVarKeys", () => {
  it("reads top-level and named-env vars", () => {
    const keys = parseWranglerPlaintextVarKeys(`
[vars]
BETTER_AUTH_URL = "http://localhost:8787"
DISABLE_SIGNUP = "false"

[[r2_buckets]]
binding = "UPLOADS"

[env.staging.vars]
BETTER_AUTH_URL = "https://staging.example"
GLOBE_ENABLED = "true"
`);
    expect([...keys].sort()).toEqual([
      "BETTER_AUTH_URL",
      "DISABLE_SIGNUP",
      "GLOBE_ENABLED",
    ]);
  });
});

describe("WORKER_SECRET_KEYS", () => {
  it("covers Env secrets and stays clear of wrangler vars", () => {
    const wranglerVars = parseWranglerPlaintextVarKeys(
      readFileSync(resolve(root, "wrangler.toml"), "utf8"),
    );
    const envKeys = envTypeKeys().filter((key) => !BINDING_KEYS.has(key));
    const secrets = new Set(WORKER_SECRET_KEYS);

    for (const key of envKeys) {
      if (wranglerVars.has(key)) {
        expect(secrets.has(key), `${key} is a wrangler var`).toBe(false);
        continue;
      }
      expect(secrets.has(key), `${key} missing from cf:sync`).toBe(true);
    }

    for (const key of LOCAL_ONLY_KEYS) {
      expect(secrets.has(key)).toBe(false);
    }

    expect(secrets.has("MAP_STYLE_DARK_URL")).toBe(true);
    expect(secrets.has("MAP_STYLE_LIGHT_URL")).toBe(true);
    expect(secrets.has("MAP_CUSTOM_TILE_HOSTS")).toBe(true);
  });

  it("picks up keys added to any .env*.example file", () => {
    const exampleKeys = [".env.example", ".env.staging.example", ".env.production.example"].flatMap(
      (file) => Object.keys(readEnvFile(resolve(root, file))),
    );
    const wranglerVars = parseWranglerPlaintextVarKeys(
      readFileSync(resolve(root, "wrangler.toml"), "utf8"),
    );
    expect(WORKER_SECRET_KEYS).toEqual(
      deriveWorkerSecretKeys({
        envExampleKeys: exampleKeys,
        wranglerVarKeys: wranglerVars,
      }),
    );
  });
});

describe("secretBulkPayload", () => {
  it("upserts filled secrets and nulls unmanaged remote keys", () => {
    const { payload, pruned } = secretBulkPayload({
      secrets: { DATABASE_URL: "postgres://n", MAP_STYLE_DARK_URL: "https://tiles" },
      remoteNames: ["DATABASE_URL", "LEGACY_SECRET", "MAP_STYLE_DARK_URL"],
      managedKeys: ["DATABASE_URL", "MAP_STYLE_DARK_URL", "RESEND_API_KEY"],
    });
    expect(payload).toEqual({
      DATABASE_URL: "postgres://n",
      MAP_STYLE_DARK_URL: "https://tiles",
      LEGACY_SECRET: null,
    });
    expect(pruned).toEqual(["LEGACY_SECRET"]);
  });

  it("does not delete managed keys that are blank locally", () => {
    const { payload, pruned } = secretBulkPayload({
      secrets: { DATABASE_URL: "postgres://n" },
      remoteNames: ["DATABASE_URL", "RESEND_API_KEY"],
      managedKeys: ["DATABASE_URL", "RESEND_API_KEY"],
    });
    expect(payload).toEqual({ DATABASE_URL: "postgres://n" });
    expect(pruned).toEqual([]);
  });
});

describe("parseSecretListOutput", () => {
  it("extracts names from wrangler JSON, ignoring npm noise", () => {
    const stdout = `npm warn unknown env config
[
  { "name": "DATABASE_URL", "type": "secret_text" },
  { "name": "BETTER_AUTH_SECRET", "type": "secret_text" }
]
`;
    expect(parseSecretListOutput(stdout)).toEqual([
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
    ]);
  });
});
