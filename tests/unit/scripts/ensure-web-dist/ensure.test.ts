import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureWebDist, STUB_MARKER, stubHtml } from "../../../../scripts/ensure-web-dist.mjs";

describe("ensureWebDist", () => {
  it("writes a stub index.html when dist is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "locations-web-dist-"));
    try {
      const result = ensureWebDist(dir);
      expect(result.wrote).toBe(true);
      expect(result.path).toBe(join(dir, "index.html"));
      expect(stubHtml()).toContain(STUB_MARKER);
      expect(stubHtml()).toContain("http://localhost:5173");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves an existing production index.html alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "locations-web-dist-"));
    try {
      mkdirSync(dir, { recursive: true });
      const indexPath = join(dir, "index.html");
      writeFileSync(indexPath, "<html><body>built</body></html>", "utf8");
      const result = ensureWebDist(dir);
      expect(result.wrote).toBe(false);
      expect(result.path).toBe(indexPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
