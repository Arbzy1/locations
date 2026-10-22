import { describe, expect, it, vi } from "vitest";
import {
  FUEL_FINDER_PAGE_SIZE,
  parseAccessToken,
  pullFuelFinder,
  unwrapFuelFinderList,
} from "\@locations/brim/shared/fuel-finder/pull.js";

describe("parseAccessToken", () => {
  it("reads the nested Fuel Finder envelope", () => {
    expect(parseAccessToken({ success: true, data: { access_token: "tok" } })).toBe("tok");
  });
});

describe("unwrapFuelFinderList", () => {
  it("accepts a bare array or a data envelope", () => {
    expect(unwrapFuelFinderList([{ node_id: "a" }])).toHaveLength(1);
    expect(unwrapFuelFinderList({ data: [{ node_id: "a" }] })).toHaveLength(1);
  });
});

describe("pullFuelFinder", () => {
  it("reuses one token and pages sequentially", async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("generate_access_token")) {
        return new Response(JSON.stringify({ data: { access_token: "tok" } }), { status: 200 });
      }
      const batch = Number(new URL(url).searchParams.get("batch-number"));
      const kind = url.includes("fuel-prices") ? "prices" : "pfs";
      if (batch === 1) {
        return new Response(JSON.stringify(Array.from({ length: FUEL_FINDER_PAGE_SIZE }, (_, i) => ({ id: `${kind}-${i}` }))), {
          status: 200,
        });
      }
      return new Response(JSON.stringify([{ id: `${kind}-last` }]), { status: 200 });
    };
    const sleep = vi.fn(async () => undefined);
    const result = await pullFuelFinder({
      fetch: fetchFn,
      sleep,
      clientId: "id",
      clientSecret: "secret",
    });
    expect(calls[0]).toContain("POST");
    expect(calls.some((c) => c.includes("Bearer") || c.includes("secret"))).toBe(false);
    expect(result.pfs).toHaveLength(FUEL_FINDER_PAGE_SIZE + 1);
    expect(result.prices).toHaveLength(FUEL_FINDER_PAGE_SIZE + 1);
    expect(sleep.mock.calls.length).toBeGreaterThanOrEqual(4);
    const tokenPosts = calls.filter((c) => c.startsWith("POST"));
    expect(tokenPosts).toHaveLength(1);
  });
});
