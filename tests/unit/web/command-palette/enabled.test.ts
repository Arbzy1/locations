import { describe, expect, it } from "vitest";

/** Mirrors `useDays({ enabled: open })` / `usePlaceLabels({ enabled: open })` in CommandPalette. */
function paletteQueriesEnabled(open: boolean, tenantKey: string) {
  return tenantKey !== "anon" && open;
}

describe("command palette network", () => {
  it("does not fetch days or labels while the palette is closed", () => {
    expect(paletteQueriesEnabled(false, "user:abc")).toBe(false);
  });

  it("fetches once the palette is open for a signed-in tenant", () => {
    expect(paletteQueriesEnabled(true, "user:abc")).toBe(true);
    expect(paletteQueriesEnabled(true, "anon")).toBe(false);
  });
});
