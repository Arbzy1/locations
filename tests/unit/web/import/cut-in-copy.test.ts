import { describe, expect, it } from "vitest";
import { importCutInCopy, shouldFireImportCutIn } from "@locations/web/lib/import-cut-in";

describe("importCutInCopy", () => {
  it("uses Timeline wording and visit counts", () => {
    expect(importCutInCopy({ visitCount: 12, activityCount: 4 })).toEqual({
      eyebrow: "TIMELINE",
      headline: "IMPORT READY!",
      meta: "12 visits · 4 activities",
      status: "Imported 12 visits, 4 activities.",
    });
  });

  it("treats missing counts as zero", () => {
    expect(importCutInCopy({}).status).toBe("Imported 0 visits, 0 activities.");
  });
});

describe("shouldFireImportCutIn", () => {
  it("does not treat a lone ready snapshot as a first-paint fire when prev is the same ready job", () => {
    const ready = { id: "job-1", status: "ready" };
    expect(shouldFireImportCutIn(ready, ready)).toBe(false);
  });

  it("fires when a job moves from processing to ready", () => {
    expect(
      shouldFireImportCutIn({ id: "job-1", status: "processing" }, { id: "job-1", status: "ready" }),
    ).toBe(true);
  });

  it("fires when a job moves from pending to ready", () => {
    expect(
      shouldFireImportCutIn({ id: "job-1", status: "pending" }, { id: "job-1", status: "ready" }),
    ).toBe(true);
  });

  it("fires for a new ready job id after another job was seen", () => {
    expect(
      shouldFireImportCutIn({ id: "job-1", status: "ready" }, { id: "job-2", status: "ready" }),
    ).toBe(true);
  });

  it("does not fire while still processing", () => {
    expect(
      shouldFireImportCutIn(
        { id: "job-1", status: "pending" },
        { id: "job-1", status: "processing" },
      ),
    ).toBe(false);
  });
});
