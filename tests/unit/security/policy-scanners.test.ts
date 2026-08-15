import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TENANT_TABLES, tenantTablesFromSchema } from "@tests/helpers/tenant-tables";
import { walkSourceFiles } from "@tests/helpers/walk-source";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("policy scanners", () => {
  it("forbids sql.raw outside migrate.ts", () => {
    const files = walkSourceFiles(root, ["apps", "packages", "scripts"]);
    const hits: string[] = [];
    for (const file of files) {
      if (file.rel === "packages/db/src/migrate.ts") continue;
      if (file.rel.startsWith("packages/db/drizzle/")) continue;
      if (file.text.includes("sql.raw")) hits.push(file.rel);
    }
    expect(hits).toEqual([]);
  });

  it("forbids VITE_ under apps/", () => {
    const files = walkSourceFiles(root, ["apps"]);
    const hits = files.filter((f) => f.text.includes("VITE_")).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("keeps demo passwords and Stripe keys out of the web app", () => {
    const files = walkSourceFiles(root, ["apps/web"]);
    const hits: string[] = [];
    for (const file of files) {
      if (file.text.includes("DEMO_PASSWORD")) hits.push(`${file.rel}: DEMO_PASSWORD`);
      if (/sk_live_|sk_test_|whsec_/.test(file.text)) hits.push(`${file.rel}: stripe-looking secret`);
    }
    expect(hits).toEqual([]);
  });

  it("does not use a bare password input outside PasswordInput", () => {
    const files = walkSourceFiles(root, ["apps/web"]);
    const hits: string[] = [];
    for (const file of files) {
      if (file.rel.endsWith("PasswordInput.tsx")) continue;
      if (/<input\b[^>]*type=["']password["']/.test(file.text)) hits.push(file.rel);
    }
    expect(hits).toEqual([]);
  });

  it("does not use dangerouslySetInnerHTML", () => {
    const files = walkSourceFiles(root, ["apps", "packages"]);
    const hits = files.filter((f) => f.text.includes("dangerouslySetInnerHTML")).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("escapes Map popup HTML", () => {
    const map = readFileSync(join(root, "apps/web/src/components/Map.tsx"), "utf8");
    const popups = readFileSync(join(root, "apps/web/src/lib/mapPopups.ts"), "utf8");
    const lines = [...map.split("\n"), ...popups.split("\n")];
    const unsafe: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      if (/html:\s*string/.test(trimmed) || /html\?:/.test(trimmed)) continue;
      const mentionsHtml =
        trimmed.includes("innerHTML") ||
        trimmed.includes(".setHTML(") ||
        /(?:properties:\s*\{\s*)?html:\s*[`'"A-Za-z$]/.test(trimmed);
      if (!mentionsHtml) continue;
      const ok =
        trimmed.includes("escapeHtml(") ||
        trimmed.includes("visitPopupHtml(") ||
        trimmed.includes("activityPopupHtml(") ||
        trimmed.includes("connectorPopupHtml(") ||
        trimmed.includes("lookaroundLinksHtml(") ||
        trimmed.includes("el.innerHTML = html") ||
        trimmed.includes(".setHTML(html)") ||
        /innerHTML = `<div style="width:14px/.test(trimmed) ||
        /html: `\$\{c\.count\} trips`/.test(trimmed);
      if (!ok) unsafe.push(trimmed.slice(0, 160));
    }
    expect(unsafe).toEqual([]);
  });

  it("does not log coordinates, place names, Takeout paths, or email recipients", () => {
    const files = walkSourceFiles(root, ["apps", "packages", "scripts"]);
    const hits: string[] = [];
    const forbidden =
      /\b(lat|lon|place_name|chosenPath|Records\.json)\b|\bto\s*[:=]/;
    for (const file of files) {
      for (const line of file.text.split("\n")) {
        if (!/\bconsole\.(log|info|warn)\s*\(/.test(line)) continue;
        if (forbidden.test(line)) hits.push(`${file.rel}: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("enforces staging/production wrangler lock-downs", () => {
    const toml = readFileSync(join(root, "wrangler.toml"), "utf8");
    for (const envName of ["staging", "production"]) {
      const block = envBlock(toml, envName);
      expect(block, `missing [env.${envName}]`).toBeTruthy();
      expect(block).toMatch(/workers_dev\s*=\s*false/);
      expect(block).toMatch(/preview_urls\s*=\s*false/);
      expect(block).toMatch(/CSP_ENFORCE\s*=\s*"true"/);
    }
  });

  it("locks Better Auth verification, cookies, and role input", () => {
    const auth = readFileSync(join(root, "apps/api/src/auth.ts"), "utf8");
    expect(auth).toContain("requireEmailVerification: true");
    expect(auth).toContain("revokeSessionsOnPasswordReset: true");
    expect(auth).toContain("sendChangeEmailConfirmation");
    expect(auth).toContain('storeOTP: "hashed"');
    expect(auth).toMatch(/role:\s*\{[\s\S]*input:\s*false/);
    expect(auth).toContain("httpOnly: true");
    expect(auth).toContain('sameSite: "lax"');
  });
});

describe("tenant table catalog", () => {
  it("lists every schema table with a tenant column", () => {
    const schema = readFileSync(join(root, "packages/db/src/schema.ts"), "utf8");
    const fromSchema = tenantTablesFromSchema(schema);
    expect(fromSchema).toEqual([...TENANT_TABLES].sort());
  });
});

function envBlock(toml: string, envName: string): string {
  const start = toml.search(new RegExp(`\\[env\\.${envName}\\](?!\\.)`));
  if (start < 0) return "";
  const others = ["staging", "production"].filter((name) => name !== envName);
  let end = toml.length;
  for (const other of others) {
    const idx = toml.search(new RegExp(`\\[env\\.${other}\\](?!\\.)`));
    if (idx > start && idx < end) end = idx;
  }
  return toml.slice(start, end);
}
