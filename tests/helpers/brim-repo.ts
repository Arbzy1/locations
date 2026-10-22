/**
 * In-memory stand-in for apps/api/src/brim/db/repo.ts in integration tests.
 * Same function names and tenant checks, no Postgres. Use with:
 *   vi.mock("@locations/api/brim/db/repo", () => import("@tests/helpers/brim-repo"));
 */
import type {
  CalibrationRow,
  FillUpRow,
  JourneyRow,
  OwnerSettingsRow,
  SavedPlaceRow,
  TariffRow,
  VehicleRow,
} from "@locations/api/brim/db/rows";

type MemoryShape = {
  vehicles: Map<string, VehicleRow>;
  tariffs: Map<string, TariffRow>;
  journeys: Map<string, JourneyRow>;
  fillUps: Map<string, FillUpRow>;
  calibrations: Map<string, CalibrationRow>;
  settings: Map<string, OwnerSettingsRow>;
  places: Map<string, SavedPlaceRow>;
  routeCache: Map<string, { value: string; expiresAt: number }>;
};

function empty(): MemoryShape {
  return {
    vehicles: new Map(),
    tariffs: new Map(),
    journeys: new Map(),
    fillUps: new Map(),
    calibrations: new Map(),
    settings: new Map(),
    places: new Map(),
    routeCache: new Map(),
  };
}

let memory = empty();

export function resetBrimMemory(): void {
  memory = empty();
}

export function brimMemory(): MemoryShape {
  return memory;
}

export async function listVehicles(_db: unknown, ownerId: string): Promise<VehicleRow[]> {
  return [...memory.vehicles.values()].filter((v) => v.tenant === ownerId);
}

export async function getVehicle(
  _db: unknown,
  ownerId: string,
  id: string,
): Promise<VehicleRow | undefined> {
  const row = memory.vehicles.get(id);
  return row?.tenant === ownerId ? row : undefined;
}

export async function saveVehicle(_db: unknown, row: VehicleRow): Promise<VehicleRow> {
  memory.vehicles.set(row.id, row);
  return row;
}

export async function deleteVehicle(_db: unknown, ownerId: string, id: string): Promise<boolean> {
  const existing = await getVehicle(_db, ownerId, id);
  if (!existing) return false;
  memory.vehicles.delete(id);
  for (const [tid, t] of memory.tariffs) {
    if (t.vehicle_id === id) memory.tariffs.delete(tid);
  }
  for (const [fid, f] of memory.fillUps) {
    if (f.vehicle_id === id) memory.fillUps.delete(fid);
  }
  for (const [cid, c] of memory.calibrations) {
    if (c.vehicle_id === id) memory.calibrations.delete(cid);
  }
  for (const s of memory.settings.values()) {
    if (s.default_vehicle_id === id) delete s.default_vehicle_id;
  }
  return true;
}

export async function listTariffs(
  _db: unknown,
  ownerId: string,
  vehicleId: string,
): Promise<TariffRow[]> {
  if (!(await getVehicle(_db, ownerId, vehicleId))) return [];
  return [...memory.tariffs.values()].filter((t) => t.vehicle_id === vehicleId);
}

export async function saveTariff(
  _db: unknown,
  ownerId: string,
  row: TariffRow,
): Promise<TariffRow | undefined> {
  if (!(await getVehicle(_db, ownerId, row.vehicle_id))) return undefined;
  if (row.is_default) {
    for (const t of memory.tariffs.values()) {
      if (t.vehicle_id === row.vehicle_id) t.is_default = false;
    }
  }
  memory.tariffs.set(row.id, row);
  return row;
}

export async function getDefaultTariff(
  _db: unknown,
  ownerId: string,
  vehicleId: string,
): Promise<TariffRow | undefined> {
  const all = await listTariffs(_db, ownerId, vehicleId);
  return all.find((t) => t.is_default) ?? all[0];
}

export async function listJourneys(_db: unknown, ownerId: string): Promise<JourneyRow[]> {
  return [...memory.journeys.values()]
    .filter((j) => j.tenant === ownerId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function getJourney(
  _db: unknown,
  ownerId: string,
  id: string,
): Promise<JourneyRow | undefined> {
  const row = memory.journeys.get(id);
  return row?.tenant === ownerId ? row : undefined;
}

export async function saveJourney(_db: unknown, row: JourneyRow): Promise<JourneyRow> {
  memory.journeys.set(row.id, row);
  return row;
}

export async function deleteJourney(_db: unknown, ownerId: string, id: string): Promise<boolean> {
  const existing = await getJourney(_db, ownerId, id);
  if (!existing) return false;
  memory.journeys.delete(id);
  return true;
}

export async function ytdMiles(
  _db: unknown,
  ownerId: string,
  taxYearStartIso: string,
  nowIso: string,
): Promise<number> {
  return (await listJourneys(_db, ownerId))
    .filter((j) => j.created_at >= taxYearStartIso && j.created_at <= nowIso)
    .reduce((sum, j) => sum + j.distance_meters / 1609.344, 0);
}

export async function listFillUps(
  _db: unknown,
  ownerId: string,
  vehicleId: string,
): Promise<FillUpRow[]> {
  if (!(await getVehicle(_db, ownerId, vehicleId))) return [];
  return [...memory.fillUps.values()]
    .filter((f) => f.vehicle_id === vehicleId)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
}

export async function getFillUp(
  _db: unknown,
  ownerId: string,
  id: string,
): Promise<FillUpRow | undefined> {
  const row = memory.fillUps.get(id);
  if (!row) return undefined;
  if (!(await getVehicle(_db, ownerId, row.vehicle_id))) return undefined;
  return row;
}

export async function saveFillUp(
  _db: unknown,
  ownerId: string,
  row: FillUpRow,
): Promise<FillUpRow | undefined> {
  if (!(await getVehicle(_db, ownerId, row.vehicle_id))) return undefined;
  memory.fillUps.set(row.id, row);
  return row;
}

export async function deleteFillUp(_db: unknown, ownerId: string, id: string): Promise<boolean> {
  const existing = await getFillUp(_db, ownerId, id);
  if (!existing) return false;
  memory.fillUps.delete(id);
  return true;
}

export async function getCalibration(
  _db: unknown,
  ownerId: string,
  vehicleId: string,
): Promise<CalibrationRow | undefined> {
  if (!(await getVehicle(_db, ownerId, vehicleId))) return undefined;
  return [...memory.calibrations.values()].find((c) => c.vehicle_id === vehicleId);
}

export async function saveCalibration(
  _db: unknown,
  ownerId: string,
  row: CalibrationRow,
): Promise<CalibrationRow | undefined> {
  if (!(await getVehicle(_db, ownerId, row.vehicle_id))) return undefined;
  for (const [id, c] of memory.calibrations) {
    if (c.vehicle_id === row.vehicle_id) memory.calibrations.delete(id);
  }
  memory.calibrations.set(row.id, row);
  return row;
}

export async function getSettings(
  _db: unknown,
  ownerId: string,
): Promise<OwnerSettingsRow | undefined> {
  return memory.settings.get(ownerId);
}

export async function saveSettings(_db: unknown, row: OwnerSettingsRow): Promise<OwnerSettingsRow> {
  memory.settings.set(row.tenant, row);
  return row;
}

export async function listPlaces(_db: unknown, ownerId: string): Promise<SavedPlaceRow[]> {
  return [...memory.places.values()].filter((p) => p.tenant === ownerId);
}

export async function getPlace(
  _db: unknown,
  ownerId: string,
  id: string,
): Promise<SavedPlaceRow | undefined> {
  const row = memory.places.get(id);
  return row?.tenant === ownerId ? row : undefined;
}

export async function savePlace(_db: unknown, row: SavedPlaceRow): Promise<SavedPlaceRow> {
  if (row.kind === "home" || row.kind === "work") {
    for (const [id, p] of memory.places) {
      if (p.tenant === row.tenant && p.kind === row.kind && p.id !== row.id) {
        memory.places.delete(id);
      }
    }
  }
  memory.places.set(row.id, row);
  return row;
}

export async function deletePlace(_db: unknown, ownerId: string, id: string): Promise<boolean> {
  const existing = await getPlace(_db, ownerId, id);
  if (!existing) return false;
  memory.places.delete(id);
  return true;
}

export async function routeCacheGet(_db: unknown, key: string): Promise<string | null> {
  const hit = memory.routeCache.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.value;
}

export async function routeCachePut(_db: unknown, key: string, value: string, ttlSeconds: number): Promise<void> {
  memory.routeCache.set(key, { value, expiresAt: Date.now() + Math.max(60, ttlSeconds) * 1000 });
}
