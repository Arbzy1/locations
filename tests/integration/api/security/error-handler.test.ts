import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";

const getSession = vi.fn();

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: (...args: unknown[]) => getSession(...args) },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock: factory } = await import("@tests/helpers/api-app");
  return factory();
});

import { app } from "@locations/api/index";
import { getExportRows, getHeatmap, getOnThisDay, loadDayRows } from "@locations/api/services";

const env = testEnv();
const request = (path: string, init?: RequestInit) => requestApp(app, path, init, env);

// Made-up values standing in for what a Postgres error can carry.
const SECRET = "params: 12.345678, -98.765432, Mill Lane";

describe("unhandled API errors", () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getHeatmap).mockReset();
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it("returns a generic 500 with a request id", async () => {
    vi.mocked(getHeatmap).mockRejectedValue(new Error(SECRET));
    const res = await request("/api/heatmap");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; requestId: string };
    expect(body.error).toMatch(/something went wrong/i);
    expect(body.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("Mill Lane");
    expect(JSON.stringify(body)).not.toContain("12.345678");
  });

  it("logs the route and error class, never the message", async () => {
    vi.mocked(getHeatmap).mockRejectedValue(new TypeError(SECRET));
    await request("/api/heatmap?from=2024-01-01");
    const lines = logged.mock.calls.map((call) => String(call[0]));
    const line = lines.find((l) => l.includes("api_error"));
    expect(line).toBeDefined();
    const entry = JSON.parse(line!) as Record<string, unknown>;
    expect(entry).toMatchObject({ kind: "api_error", ok: false, method: "GET", route: "/api/heatmap", error: "TypeError" });
    expect(lines.join("\n")).not.toContain("Mill Lane");
    expect(lines.join("\n")).not.toContain("12.345678");
    expect(lines.join("\n")).not.toContain("2024-01-01");
  });

  it("keeps the no-store header on error responses", async () => {
    vi.mocked(getHeatmap).mockRejectedValue(new Error("boom"));
    const res = await request("/api/heatmap");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});

describe("date validation on read routes", () => {
  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getHeatmap).mockReset();
    vi.mocked(loadDayRows).mockReset();
    vi.mocked(getOnThisDay).mockReset();
    vi.mocked(getExportRows).mockReset();
  });

  it("rejects a malformed day", async () => {
    const res = await request("/api/day/not-a-date");
    expect(res.status).toBe(400);
    expect(loadDayRows).not.toHaveBeenCalled();
  });

  it("rejects malformed heatmap dates", async () => {
    const res = await request("/api/heatmap?from=2024-1-1");
    expect(res.status).toBe(400);
    expect(getHeatmap).not.toHaveBeenCalled();
  });

  it("rejects a malformed on-this-day date", async () => {
    const res = await request("/api/on-this-day?date=today");
    expect(res.status).toBe(400);
    expect(getOnThisDay).not.toHaveBeenCalled();
  });

  it("keeps odd characters out of the export filename", async () => {
    vi.mocked(getExportRows).mockResolvedValue({ visits: [], activities: [] } as never);
    const res = await request(`/api/export/csv?from=${encodeURIComponent('x".csv\r\nX-Evil: 1')}&to=2024-02-01`);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toBe('attachment; filename="locations-2024-02-01-stays.csv"');
  });
});
