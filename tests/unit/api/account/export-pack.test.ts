import { unzipSync, strFromU8 } from "fflate";
import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import {
  buildExportReadmeHtml,
  buildGdprPackZip,
  escapeHtml,
  rowsToJsonl,
} from "@locations/api/export-pack";
import {
  getAccountExportPayload,
  listActivityExportPage,
  listVisitExportPage,
} from "@locations/api/services";
import { decodeVrmKey, encryptVrm } from "@locations/api/brim/vrm-crypto";
import { TENANT_TABLES } from "@tests/helpers/tenant-tables";

const account = {
  tenant: "user-a",
  exportedAt: "2026-08-15T00:00:00.000Z",
  overview: {
    total_visits: 2,
    total_activities: 1,
    date_range: ["2024-01-01", "2024-01-02"] as [string, string],
    days_with_data: 2,
    unique_places: 1,
  },
  sources: [{ id: "s1", label: "personal@example.com", visitCount: 2, activityCount: 1 }],
  settings: { distanceUnit: "mi" },
  labels: [],
  namedTrips: [{ id: "t1", name: "Summer Trip", start: "2024-07-01", end: "2024-07-05" }],
  lifeChapters: [{ id: "c1", name: "London", start: "2023-01-01", end: "2024-12-31" }],
  timelineOverrides: [{ kind: "visit", itemStart: "2024-01-01T10:00:00Z", note: "Lunch", mode: null }],
  subscription: {
    status: "active",
    currentPeriodEnd: "2026-09-01T00:00:00.000Z",
    graceUntil: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  journeyCost: {
    vehicles: [{ id: "v1", kind: "car", propulsion: "petrol", vrm: "AB12CDE" }],
    tariffs: [],
    calibrations: [],
    fillUps: [],
    journeys: [],
    savedPlaces: [],
    settings: null,
  },
};

function makeRecordingExportDb(vrmEncrypted: string) {
  const selectedTables = new Set<string>();

  function chain(rows: unknown[]): unknown {
    const promise = Promise.resolve(rows);
    const builder: Record<string, unknown> = {
      from(table: PgTable) {
        const name = getTableName(table);
        selectedTables.add(name);
        return chain(rowsForTable(name));
      },
      where() {
        return builder;
      },
      groupBy() {
        return builder;
      },
      orderBy() {
        return builder;
      },
      limit() {
        return builder;
      },
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    };
    return builder;
  }

  function rowsForTable(name: string): unknown[] {
    if (name === "subscriptions") {
      return [
        {
          tenant: "user-a",
          stripeCustomerId: "cus_secret",
          stripeSubscriptionId: "sub_secret",
          priceId: "price_secret",
          status: "active",
          currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
          graceUntil: null,
          updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      ];
    }
    if (name === "brim_vehicles") {
      return [
        {
          id: "veh-1",
          tenant: "user-a",
          nickname: "Family Car",
          kind: "car",
          propulsion: "petrol",
          make: "Ford",
          model: "Focus",
          derivative: null,
          transmission: "manual",
          year: 2021,
          engineCc: 1500,
          co2Gkm: 120,
          euroStatus: "Euro 6",
          euroStatusSource: "dvla",
          officialConsumption: 48,
          officialUnit: "mpg",
          officialCycle: "WLTP",
          tankLitres: 52,
          batteryKwhUsable: null,
          hasHeatPump: null,
          vcaMatchId: null,
          vrmEncrypted,
          vrmHash: "raw-hmac-hash-do-not-export",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ];
    }
    if (name === "export_jobs") {
      return [
        {
          id: "exp-1",
          tenant: "user-a",
          userId: "user-a",
          status: "ready",
          error: null,
          visitCount: 2,
          activityCount: 1,
          r2Key: "exports/user-a/exp-1.zip",
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      ];
    }
    if (name === "named_trips") {
      return [
        {
          id: "trip-1",
          tenant: "user-a",
          name: "Scotland",
          start: "2025-05-01",
          end: "2025-05-05",
          dates: ["2025-05-01"],
          createdAt: new Date("2025-05-06T00:00:00.000Z"),
          updatedAt: new Date("2025-05-06T00:00:00.000Z"),
        },
      ];
    }
    if (name === "life_chapters") {
      return [
        {
          id: "chap-1",
          tenant: "user-a",
          name: "Uni",
          start: "2022-09-01",
          end: "2025-06-30",
          createdAt: new Date("2025-07-01T00:00:00.000Z"),
          updatedAt: new Date("2025-07-01T00:00:00.000Z"),
        },
      ];
    }
    if (name === "timeline_overrides") {
      return [
        {
          kind: "activity",
          itemStart: "2025-05-01T09:00:00Z",
          note: "Scenic train",
          mode: "train",
          updatedAt: new Date("2025-05-02T00:00:00.000Z"),
        },
      ];
    }
    return [];
  }

  const db = {
    select: vi.fn(() => chain([])),
  };

  return { db: db as never, selectedTables };
}

describe("export pack helpers", () => {
  it("escapes HTML in labels", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("writes jsonl lines", () => {
    expect(rowsToJsonl([{ id: 1 }, { id: 2 }])).toBe('{"id":1}\n{"id":2}\n');
    expect(rowsToJsonl([])).toBe("");
  });

  it("builds an HTML summary without coordinates or map keys", () => {
    const html = buildExportReadmeHtml({
      ...account,
      sources: [{ id: "s1", label: "<Home>", visitCount: 1, activityCount: 0 }],
    });
    expect(html).toContain("&lt;Home&gt;");
    expect(html).not.toContain("<Home>");
    expect(html).not.toContain("leaflet");
    expect(html).not.toContain("maptiler");
    expect(html).not.toContain("51.5");
    expect(html).toContain("no map tiles");
  });

  it("zips account json, jsonl files, journey-cost json, and readme", () => {
    const zip = buildGdprPackZip({
      account,
      visits: [{ id: 1, lat: 51.5, lon: -0.1 }],
      activities: [{ id: 9, mode: "walking" }],
    });
    const unzipped = unzipSync(zip);
    const names = Object.keys(unzipped);
    expect(names.sort()).toEqual([
      "README.html",
      "account.json",
      "activities.jsonl",
      "journey-cost.json",
      "overrides.jsonl",
      "visits.jsonl",
    ]);
    const parsedJourneyCost = JSON.parse(strFromU8(unzipped["journey-cost.json"]));
    expect(parsedJourneyCost.vehicles[0].vrm).toBe("AB12CDE");
    expect(strFromU8(unzipped["overrides.jsonl"])).toContain("Lunch");
  });

  it("queries all 20 TENANT_TABLES, decrypts VRM when key is provided, and strips secrets", async () => {
    const rawKey = Buffer.alloc(32, 7).toString("base64url");
    const keyBytes = decodeVrmKey(rawKey)!;
    const packedVrm = await encryptVrm(keyBytes, "YK21ABC");
    const { db, selectedTables } = makeRecordingExportDb(packedVrm);

    const payload = await getAccountExportPayload(db, "user-a", { vrmEncryptionKey: rawKey });
    await listVisitExportPage(db, "user-a", 0);
    await listActivityExportPage(db, "user-a", 0);

    const missing = TENANT_TABLES.filter((t) => !selectedTables.has(t));
    expect(missing).toEqual([]);

    expect(payload.namedTrips).toHaveLength(1);
    expect(payload.lifeChapters).toHaveLength(1);
    expect(payload.timelineOverrides).toHaveLength(1);
    expect(payload.subscription).toEqual({
      status: "active",
      currentPeriodEnd: "2026-09-01T00:00:00.000Z",
      graceUntil: null,
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(payload.journeyCost.vehicles[0]?.vrm).toBe("YK21ABC");

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("cus_secret");
    expect(serialized).not.toContain("sub_secret");
    expect(serialized).not.toContain("price_secret");
    expect(serialized).not.toContain("raw-hmac-hash-do-not-export");
    expect(serialized).not.toContain(packedVrm);
    expect(serialized).not.toContain("exports/user-a/exp-1.zip");

    const withoutKey = await getAccountExportPayload(db, "user-a");
    expect(withoutKey.journeyCost.vehicles[0]?.vrm).toBeNull();
  });
});
