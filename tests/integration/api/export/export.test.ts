import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";

const getSession = vi.fn();

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: {
      getSession: (...args: unknown[]) => getSession(...args),
    },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock: factory } = await import("@tests/helpers/api-app");
  return factory();
});

import { app } from "@locations/api/index";
import { getExportRows } from "@locations/api/services";

const env = testEnv();
const request = (path: string) => requestApp(app, path, {}, env);

const stay = {
  start: "2024-01-01T22:00:00Z",
  end: "2024-01-02T07:00:00Z",
  date: "2024-01-01",
  lat: 51.501234,
  lon: -0.141234,
  durationMinutes: 540,
  semanticType: "Home",
  placeKey: "g:home",
  cluster: "51.5°N 0.0°W",
};

describe("GET /api/export/:format", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(getExportRows).mockReset();
    vi.mocked(getExportRows).mockResolvedValue({ visits: [stay], journeys: [] } as never);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/export/csv");
    expect(res.status).toBe(401);
    expect(getExportRows).not.toHaveBeenCalled();
  });

  it("exports the session tenant's stays as CSV", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/export/csv?tenant=user-b");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    expect(await res.text()).toContain("2024-01-01,2024-01-01T22:00:00Z");
    expect(getExportRows).toHaveBeenCalledWith(expect.anything(), "user-a", {
      from: undefined,
      to: undefined,
      journeys: false,
    });
  });

  it("asks for journeys for GPX and GeoJSON", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const gpx = await request("/api/export/gpx?from=2024-01-01&to=2024-01-31");
    expect(gpx.status).toBe(200);
    expect(await gpx.text()).toContain("<gpx");
    const geo = await request("/api/export/geojson?from=2024-01-01&to=2024-01-31");
    expect(((await geo.json()) as { type: string }).type).toBe("FeatureCollection");
    expect(vi.mocked(getExportRows).mock.calls[0]?.[2]).toMatchObject({ journeys: true });
  });

  it("blurs home when asked", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const text = await (await request("/api/export/csv?blur_home=1")).text();
    expect(text).toContain("51.5,-0.14");
    expect(text).not.toContain("51.501234");
    expect(text).not.toContain("g:home");
  });

  it("lets the demo export its sample data", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    expect((await request("/api/export/csv")).status).toBe(200);
    expect(vi.mocked(getExportRows).mock.calls[0]?.[1]).toBe("demo");
  });

  it("rejects unknown formats and bad ranges", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    expect((await request("/api/export/kml")).status).toBe(400);
    vi.mocked(getExportRows).mockResolvedValueOnce({ error: "Choose a date range for GPX or GeoJSON" } as never);
    expect((await request("/api/export/gpx")).status).toBe(400);
  });
});
