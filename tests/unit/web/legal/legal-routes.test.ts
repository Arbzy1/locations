import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { legalConfig } from "@locations/web/config/legal";
import { ThemeProvider } from "@locations/web/lib/theme";
import { Policy } from "@locations/web/components/legal/LegalRoutes";
import { parsePolicyDocument } from "@locations/web/components/legal/policyParser";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");
const legalDocsDir = path.join(repoRoot, "docs/legal");

const LEGAL_DOC_FILES = [
  "privacy.md",
  "terms.md",
  "cookies.md",
  "dpa.md",
  "accessibility.md",
  "impressum.md",
  "subprocessors.md",
] as const;

describe("Policy markdown parser and rendering", () => {
  it("separates ## headings from body paragraphs even without a blank line", () => {
    const sample = [
      "# Sample Policy",
      "",
      "## Section One",
      "Body text immediately after heading with https://example.com/docs.",
      "",
      "## Section Two",
      "- First bullet item",
      "- Second bullet with https://ico.org.uk/make-a-complaint/.",
    ].join("\n");

    const parsed = parsePolicyDocument(sample);
    expect(parsed.title).toBe("Sample Policy");
    expect(parsed.blocks).toEqual([
      { kind: "heading", text: "Section One" },
      {
        kind: "paragraph",
        text: "Body text immediately after heading with https://example.com/docs.",
      },
      { kind: "heading", text: "Section Two" },
      {
        kind: "list",
        items: [
          "First bullet item",
          "Second bullet with https://ico.org.uk/make-a-complaint/.",
        ],
      },
    ]);
  });

  it("renders real legal markdown files without merging body paragraphs into <h2> tags", () => {
    for (const filename of LEGAL_DOC_FILES) {
      const markdown = readFileSync(path.join(legalDocsDir, filename), "utf8");
      const html = renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            MemoryRouter,
            null,
            React.createElement(Policy, { source: markdown }),
          ),
        ),
      );

      const h2Matches = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1]);
      expect(h2Matches.length).toBeGreaterThan(1);
      for (const headingHtml of h2Matches) {
        expect(headingHtml.length).toBeLessThan(80);
        expect(headingHtml).not.toContain("\n");
      }
    }

    const privacyMarkdown = readFileSync(path.join(legalDocsDir, "privacy.md"), "utf8");
    const privacyHtml = renderToStaticMarkup(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(Policy, { source: privacyMarkdown, inventory: "data" }),
        ),
      ),
    );
    expect(privacyHtml).toContain('href="https://ico.org.uk/make-a-complaint/"');
  });
});

describe("legalConfig and legal markdown disclosures", () => {
  it("contains no TODO placeholders and includes OpenFreeMap and updated date", () => {
    const serialized = JSON.stringify(legalConfig);
    expect(serialized).not.toMatch(/TODO/i);
    expect(legalConfig.updated).toBe("24 November 2026");
    const mapVendor = legalConfig.vendors.find((v) =>
      v.name.toLowerCase().includes("map"),
    );
    expect(mapVendor?.purpose).toContain("OpenFreeMap");
  });

  it("keeps docs/legal/*.md free of TODO placeholders and em/en dashes", () => {
    for (const filename of LEGAL_DOC_FILES) {
      const content = readFileSync(path.join(legalDocsDir, filename), "utf8");
      expect(content, `${filename} should not contain TODO`).not.toMatch(/\bTODO\b/i);
      expect(content, `${filename} should not contain em/en dashes`).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
