import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isBlankSecret, parseEnvValues, upsertEnvKey } from "./env-file.mjs";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tmpFile(name: string, contents: string) {
  const dir = mkdtempSync(join(tmpdir(), "locations-env-"));
  tmpDirs.push(dir);
  const filePath = join(dir, name);
  writeFileSync(filePath, contents, "utf8");
  return filePath;
}

describe("isBlankSecret", () => {
  it("treats placeholders as blank so generate will rewrite them", () => {
    expect(isBlankSecret("")).toBe(true);
    expect(isBlankSecret("generate-a-long-random-string")).toBe(true);
    expect(isBlankSecret("dev-secret-change-me-to-a-long-random-string")).toBe(true);
    expect(
      isBlankSecret(
        "postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require",
      ),
    ).toBe(true);
    expect(isBlankSecret("Locations <noreply@example.com>")).toBe(true);
    expect(isBlankSecret("a".repeat(64))).toBe(false);
  });
});

describe("parseEnvValues", () => {
  it("reads keys with CRLF", () => {
    expect(parseEnvValues("FOO=bar\r\nBAZ=qux\r\n")).toEqual({ FOO: "bar", BAZ: "qux" });
  });
});

describe("upsertEnvKey", () => {
  it("replaces a placeholder BETTER_AUTH_SECRET and drops duplicate keys", () => {
    const filePath = tmpFile(
      ".env",
      "DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require\r\nBETTER_AUTH_SECRET=generate-a-long-random-string\r\nBETTER_AUTH_SECRET=generate-a-long-random-string\r\n",
    );
    expect(upsertEnvKey(filePath, "BETTER_AUTH_SECRET", "abc123")).toBe("updated");
    const body = readFileSync(filePath, "utf8");
    expect(body).toContain("BETTER_AUTH_SECRET=abc123");
    expect(body).not.toContain("generate-a-long-random-string");
    expect(body).toContain("DATABASE_URL=");
    expect(body.match(/BETTER_AUTH_SECRET=/g)?.length).toBe(1);
  });

  it("appends the key when missing", () => {
    const filePath = tmpFile(".env", "FOO=bar\n");
    expect(upsertEnvKey(filePath, "BETTER_AUTH_SECRET", "abc123")).toBe("updated");
    expect(readFileSync(filePath, "utf8")).toMatch(/BETTER_AUTH_SECRET=abc123\n?$/);
  });
});
