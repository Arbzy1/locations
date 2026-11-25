import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SettingsNav from "@locations/web/components/settings/SettingsNav";
import { planStatusCopy } from "@locations/web/components/settings/SettingsBilling";

describe("planStatusCopy", () => {
  it("describes active, trial, grace, and unentitled states clearly", () => {
    expect(planStatusCopy("active", true)).toBe("Your plan is active.");
    expect(planStatusCopy("trialing", true)).toBe("You are on a free trial.");
    expect(planStatusCopy("past_due", true)).toBe("Your last payment did not go through.");
    expect(planStatusCopy("unpaid", false)).toBe("Your last payment did not go through.");
    expect(planStatusCopy("paused", false)).toBe("Your plan is paused.");
    expect(planStatusCopy("canceled", false)).toBe("Your plan has ended.");
    expect(planStatusCopy("none", true)).toBe("You can import without a plan on this account.");
    expect(planStatusCopy("none", false)).toBe("You do not have a plan yet.");
  });
});

describe("SettingsNav demo restriction", () => {
  it("shows only Display section when isDemo is true", () => {
    const demoHtml = renderToStaticMarkup(
      React.createElement(SettingsNav, {
        section: "display",
        onSelect: () => {},
        orientation: "rail",
        isDemo: true,
      }),
    );
    expect(demoHtml).toContain("Display");
    expect(demoHtml).not.toContain("Account");
    expect(demoHtml).not.toContain("Billing");
    expect(demoHtml).not.toContain("Privacy");
    expect(demoHtml).not.toContain("Timeline");
  });

  it("shows all sections for regular accounts", () => {
    const fullHtml = renderToStaticMarkup(
      React.createElement(SettingsNav, {
        section: "overview",
        onSelect: () => {},
        orientation: "rail",
        isDemo: false,
      }),
    );
    expect(fullHtml).toContain("Overview");
    expect(fullHtml).toContain("Account");
    expect(fullHtml).toContain("Billing");
    expect(fullHtml).toContain("Display");
    expect(fullHtml).toContain("Timeline");
    expect(fullHtml).toContain("Privacy");
  });
});
