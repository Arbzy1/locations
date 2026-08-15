import { describe, expect, it } from "vitest";
import {
  classifyTestFile,
  meter,
  percentile,
  renderMarkdown,
  summarize,
} from "../../../../scripts/test-report-render.mjs";

const fakePayload = {
  success: false,
  numTotalTestSuites: 2,
  numPassedTestSuites: 1,
  numFailedTestSuites: 1,
  numTotalTests: 3,
  numPassedTests: 2,
  numFailedTests: 1,
  numPendingTests: 0,
  numTodoTests: 0,
  startTime: 1_700_000_000_000,
  testResults: [
    {
      name: "tests/unit/api/email/templates.test.ts",
      assertionResults: [
        {
          ancestorTitles: ["sendEmail"],
          fullName: "sendEmail skips without a key",
          title: "skips without a key",
          status: "passed",
          duration: 2.5,
          failureMessages: [],
        },
        {
          ancestorTitles: ["sendEmail"],
          fullName: "sendEmail posts to Resend",
          title: "posts to Resend",
          status: "passed",
          duration: 8,
          failureMessages: [],
        },
      ],
    },
    {
      name: "tests/integration/api/billing/webhook.test.ts",
      assertionResults: [
        {
          ancestorTitles: ["stripe webhook"],
          fullName: "stripe webhook rejects invalid signature",
          title: "rejects invalid signature",
          status: "failed",
          duration: 12,
          failureMessages: ["Error: expected 400"],
        },
      ],
    },
  ],
};

describe("classifyTestFile", () => {
  it("classifies unit api email paths", () => {
    expect(classifyTestFile("tests/unit/api/email/templates.test.ts")).toEqual({
      kind: "unit",
      layer: "api",
      domain: "email",
      file: "tests/unit/api/email/templates.test.ts",
    });
  });

  it("classifies integration billing paths", () => {
    expect(classifyTestFile("tests/integration/api/billing/webhook.test.ts")).toEqual({
      kind: "integration",
      layer: "api",
      domain: "billing",
      file: "tests/integration/api/billing/webhook.test.ts",
    });
  });

  it("treats security folders as the security kind", () => {
    expect(classifyTestFile("tests/unit/security/cors.test.ts")).toMatchObject({
      kind: "security",
      domain: "security",
    });
    expect(classifyTestFile("tests/integration/api/security/route-matrix.test.ts")).toMatchObject({
      kind: "security",
      layer: "api",
      domain: "security",
    });
  });
});

describe("meter and percentile", () => {
  it("renders a full bar at 100%", () => {
    expect(meter(1, 10)).toBe("██████████");
  });

  it("picks p95 from a sorted list", () => {
    expect(percentile([1, 2, 3, 4, 20], 95)).toBe(20);
  });
});

describe("summarize + renderMarkdown", () => {
  it("groups domains and writes mermaid plus failure details", () => {
    const summary = summarize(fakePayload);
    expect(summary.tests).toBe(3);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.byKind.unit.tests).toBe(2);
    expect(summary.byKind.integration.failed).toBe(1);
    expect(summary.vendor.billing.tests).toBe(1);
    expect(summary.vendor.email.passed).toBe(2);

    const md = renderMarkdown(summary, { generated: "2026-08-15T00:00:00.000Z", ok: false });
    expect(md).toContain("# Test report");
    expect(md).toContain("**FAIL**");
    expect(md).toContain("pie");
    expect(md).toContain("xychart-beta");
    expect(md).toContain("flowchart");
    expect(md).toContain("`email`");
    expect(md).toContain("`billing`");
    expect(md).toContain("<details>");
    expect(md).toContain("rejects invalid signature");
    expect(md).not.toContain("\u2014");
  });

  it("uses a full pass-rate bar when every test passed", () => {
    const allPass = structuredClone(fakePayload);
    allPass.success = true;
    allPass.numFailedTests = 0;
    allPass.numPassedTests = 3;
    allPass.testResults[1].assertionResults[0].status = "passed";
    allPass.testResults[1].assertionResults[0].failureMessages = [];
    const summary = summarize(allPass);
    const md = renderMarkdown(summary, { ok: true });
    expect(summary.failed).toBe(0);
    expect(md).toContain("**PASS**");
    expect(md).toContain(meter(1));
    expect(md).toContain("Every assertion in this JSON run passed.");
  });
});
