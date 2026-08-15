import { describe, expect, it } from "vitest";
import {
  COLOUR_MOODS,
  DEFAULT_MOOD_ID,
  getMood,
  isMoodId,
  moodStyleSheet,
  resolveMoodId,
  shuffleMoodId,
} from "@locations/web/lib/theme/moods";

describe("colour moods", () => {
  it("ships 30 unique ids with light and dark tokens", () => {
    expect(COLOUR_MOODS).toHaveLength(30);
    const ids = COLOUR_MOODS.map((mood) => mood.id);
    expect(new Set(ids).size).toBe(30);
    for (const mood of COLOUR_MOODS) {
      expect(mood.name.length).toBeGreaterThan(3);
      expect(mood.blurb.length).toBeGreaterThan(8);
      expect(mood.dark.bg).toMatch(/^#/);
      expect(mood.light.bg).toMatch(/^#/);
      expect(mood.dark.accent).toMatch(/^#/);
      expect(mood.light.accent).toMatch(/^#/);
      expect(mood.dark.visit).toMatch(/^#/);
      expect(mood.light.visit).toMatch(/^#/);
    }
  });

  it("keeps the default mood on the current GitHub-blue tokens", () => {
    const mood = getMood(DEFAULT_MOOD_ID);
    expect(mood.id).toBe("unsolicited-linkedin-advice");
    expect(mood.dark.bg).toBe("#0d1117");
    expect(mood.dark.accent).toBe("#58a6ff");
    expect(mood.dark.visit).toBe("#bc8cff");
    expect(mood.light.bg).toBe("#f6f8fa");
    expect(mood.light.accent).toBe("#0969da");
    expect(mood.light.visit).toBe("#8250df");
  });

  it("falls back to the default for unknown storage", () => {
    expect(resolveMoodId(null)).toBe(DEFAULT_MOOD_ID);
    expect(resolveMoodId("not-a-mood")).toBe(DEFAULT_MOOD_ID);
    expect(isMoodId("hotdog-stand-energy")).toBe(true);
    expect(isMoodId("not-a-mood")).toBe(false);
  });

  it("shuffles to a different valid mood", () => {
    const next = shuffleMoodId(DEFAULT_MOOD_ID);
    expect(next).not.toBe(DEFAULT_MOOD_ID);
    expect(isMoodId(next)).toBe(true);
  });

  it("emits dark and light CSS for every mood id", () => {
    const css = moodStyleSheet();
    for (const mood of COLOUR_MOODS) {
      expect(css).toContain(`[data-theme="dark"][data-mood="${mood.id}"]`);
      expect(css).toContain(`[data-theme="light"][data-mood="${mood.id}"]`);
    }
  });
});
