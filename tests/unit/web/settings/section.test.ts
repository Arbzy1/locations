import { describe, expect, it } from "vitest";
import {
  parseSettingsSection,
  settingsSectionSearch,
} from "@locations/web/lib/settings/settings-section";

describe("parseSettingsSection", () => {
  it("defaults to overview", () => {
    expect(parseSettingsSection(new URLSearchParams())).toBe("overview");
    expect(parseSettingsSection(new URLSearchParams("section=nope"))).toBe("overview");
  });

  it("reads section=", () => {
    expect(parseSettingsSection(new URLSearchParams("section=account"))).toBe("account");
    expect(parseSettingsSection(new URLSearchParams("section=data"))).toBe("data");
  });

  it("maps Stripe return query to billing", () => {
    expect(parseSettingsSection(new URLSearchParams("billing=success"))).toBe("billing");
    expect(parseSettingsSection(new URLSearchParams("section=account&billing=cancel"))).toBe(
      "billing",
    );
  });

  it("opens data for #timeline-upload", () => {
    expect(parseSettingsSection(new URLSearchParams(), "#timeline-upload")).toBe("data");
  });
});

describe("settingsSectionSearch", () => {
  it("omits section for overview and drops billing flags", () => {
    const out = settingsSectionSearch("overview", "section=account&billing=success");
    expect(out.get("section")).toBeNull();
    expect(out.get("billing")).toBeNull();
  });

  it("sets section for other panes", () => {
    expect(settingsSectionSearch("billing").get("section")).toBe("billing");
  });
});
