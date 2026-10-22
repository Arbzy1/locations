import {
  and,
  desc,
  eq,
  gte,
  lte,
  brimCalibrations as calibrations,
  brimFillUps as fillUps,
  brimJourneys as journeys,
  brimRouteCache as routeCache,
  brimSavedPlaces as savedPlaces,
  brimSettings as ownerSettings,
  brimTariffs as tariffs,
  brimVehicles as vehicles,
} from "@locations/db";
import type {
  CalibrationRow,
  FillUpRow,
  JourneyRow,
  OwnerSettingsRow,
  SavedPlaceRow,
  TariffRow,
  VehicleRow,
} from "./rows";
import { withRls } from "./with-rls";
import type { BrimDb } from "./types";

function iso(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return new Date().toISOString();
}

function optString(value: string | null | undefined): string | undefined {
  return value ? value : undefined;
}

function optNumber(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : value;
}

function optBool(value: boolean | null | undefined): boolean | undefined {
  return value === null || value === undefined ? undefined : value;
}

function asKind(value: string): VehicleRow["kind"] {
  if (value === "van" || value === "motorcycle") return value;
  return "car";
}

function asPropulsion(value: string): VehicleRow["propulsion"] {
  if (
    value === "diesel" ||
    value === "hybrid" ||
    value === "phev" ||
    value === "bev"
  ) {
    return value;
  }
  return "petrol";
}

function asEuroSource(value: string | null | undefined): VehicleRow["euro_status_source"] {
  if (value === "dvla" || value === "derived") return value;
  return undefined;
}

function asTariffKind(value: string): TariffRow["kind"] {
  return value === "public" ? "public" : "home";
}

export function fromVehicle(row: typeof vehicles.$inferSelect): VehicleRow {
  const mapped: VehicleRow = {
    id: row.id,
    tenant: row.tenant,
    kind: asKind(row.kind),
    propulsion: asPropulsion(row.propulsion),
    created_at: iso(row.createdAt),
  };
  const nickname = optString(row.nickname);
  if (nickname) mapped.nickname = nickname;
  const make = optString(row.make);
  if (make) mapped.make = make;
  const model = optString(row.model);
  if (model) mapped.model = model;
  const derivative = optString(row.derivative);
  if (derivative) mapped.derivative = derivative;
  const transmission = optString(row.transmission);
  if (transmission) mapped.transmission = transmission;
  const year = optNumber(row.year);
  if (year !== undefined) mapped.year = year;
  const engineCc = optNumber(row.engineCc);
  if (engineCc !== undefined) mapped.engine_cc = engineCc;
  const co2 = optNumber(row.co2Gkm);
  if (co2 !== undefined) mapped.co2_gkm = co2;
  const euro = optString(row.euroStatus);
  if (euro) mapped.euro_status = euro;
  const euroSource = asEuroSource(row.euroStatusSource);
  if (euroSource) mapped.euro_status_source = euroSource;
  const official = optNumber(row.officialConsumption);
  if (official !== undefined) mapped.official_consumption = official;
  const officialUnit = optString(row.officialUnit);
  if (officialUnit) mapped.official_unit = officialUnit;
  const officialCycle = optString(row.officialCycle);
  if (officialCycle) mapped.official_cycle = officialCycle;
  const tank = optNumber(row.tankLitres);
  if (tank !== undefined) mapped.tank_litres = tank;
  const battery = optNumber(row.batteryKwhUsable);
  if (battery !== undefined) mapped.battery_kwh_usable = battery;
  const heatPump = optBool(row.hasHeatPump);
  if (heatPump !== undefined) mapped.has_heat_pump = heatPump;
  const vca = optString(row.vcaMatchId);
  if (vca) mapped.vca_match_id = vca;
  const vrmHash = optString(row.vrmHash);
  if (vrmHash) mapped.vrm_hash = vrmHash;
  const vrmEncrypted = optString(row.vrmEncrypted);
  if (vrmEncrypted) mapped.vrm_encrypted = vrmEncrypted;
  return mapped;
}

function vehicleValues(row: VehicleRow) {
  return {
    id: row.id,
    tenant: row.tenant,
    nickname: row.nickname ?? null,
    kind: row.kind,
    propulsion: row.propulsion,
    make: row.make ?? null,
    model: row.model ?? null,
    derivative: row.derivative ?? null,
    transmission: row.transmission ?? null,
    year: row.year ?? null,
    engineCc: row.engine_cc ?? null,
    co2Gkm: row.co2_gkm ?? null,
    euroStatus: row.euro_status ?? null,
    euroStatusSource: row.euro_status_source ?? null,
    officialConsumption: row.official_consumption ?? null,
    officialUnit: row.official_unit ?? null,
    officialCycle: row.official_cycle ?? null,
    tankLitres: row.tank_litres ?? null,
    batteryKwhUsable: row.battery_kwh_usable ?? null,
    hasHeatPump: row.has_heat_pump ?? null,
    vcaMatchId: row.vca_match_id ?? null,
    vrmHash: row.vrm_hash ?? null,
    vrmEncrypted: row.vrm_encrypted ?? null,
    createdAt: new Date(row.created_at),
  };
}

export function fromTariff(row: typeof tariffs.$inferSelect): TariffRow {
  const mapped: TariffRow = {
    id: row.id,
    vehicle_id: row.vehicleId,
    kind: asTariffKind(row.kind),
    pence_per_kwh: row.pencePerKwh,
    is_default: row.isDefault,
  };
  const offpeak = optNumber(row.offpeakPence);
  if (offpeak !== undefined) mapped.offpeak_pence = offpeak;
  const window = optString(row.offpeakWindow);
  if (window) mapped.offpeak_window = window;
  const network = optString(row.network);
  if (network) mapped.network = network;
  return mapped;
}

function tariffValues(row: TariffRow) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    kind: row.kind,
    pencePerKwh: row.pence_per_kwh,
    offpeakPence: row.offpeak_pence ?? null,
    offpeakWindow: row.offpeak_window ?? null,
    network: row.network ?? null,
    isDefault: row.is_default,
  };
}

export function fromJourney(row: typeof journeys.$inferSelect): JourneyRow {
  const mapped: JourneyRow = {
    id: row.id,
    tenant: row.tenant,
    origin_label: row.originLabel,
    dest_label: row.destLabel,
    distance_meters: row.distanceMeters,
    duration_seconds: row.durationSeconds,
    estimate_json: row.estimateJson,
    charges_json: row.chargesJson,
    is_saved: row.isSaved,
    created_at: iso(row.createdAt),
  };
  const vehicleId = optString(row.vehicleId);
  if (vehicleId) mapped.vehicle_id = vehicleId;
  const polyline = optString(row.polyline);
  if (polyline) mapped.polyline = polyline;
  if (row.departsAt) mapped.departs_at = iso(row.departsAt);
  return mapped;
}

function journeyValues(row: JourneyRow) {
  return {
    id: row.id,
    tenant: row.tenant,
    vehicleId: row.vehicle_id ?? null,
    originLabel: row.origin_label,
    destLabel: row.dest_label,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    polyline: row.polyline ?? null,
    departsAt: row.departs_at ? new Date(row.departs_at) : null,
    estimateJson: row.estimate_json,
    chargesJson: row.charges_json,
    isSaved: row.is_saved,
    createdAt: new Date(row.created_at),
  };
}

export function fromFillUp(row: typeof fillUps.$inferSelect): FillUpRow {
  const mapped: FillUpRow = {
    id: row.id,
    vehicle_id: row.vehicleId,
    odometer_miles: row.odometerMiles,
    quantity: row.quantity,
    unit: row.unit === "kwh" ? "kwh" : "litres",
    price_pence: row.pricePence,
    filled_to_brim: row.filledToBrim,
    occurred_at: iso(row.occurredAt),
  };
  const note = optString(row.note);
  if (note) mapped.note = note;
  const stationId = optString(row.stationId);
  if (stationId) mapped.station_id = stationId;
  return mapped;
}

function fillUpValues(row: FillUpRow) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    odometerMiles: row.odometer_miles,
    quantity: row.quantity,
    unit: row.unit,
    pricePence: row.price_pence,
    filledToBrim: row.filled_to_brim,
    occurredAt: new Date(row.occurred_at),
    note: row.note ?? null,
    stationId: row.station_id ?? null,
  };
}

export function fromCalibration(row: typeof calibrations.$inferSelect): CalibrationRow {
  const mapped: CalibrationRow = {
    id: row.id,
    vehicle_id: row.vehicleId,
    calculated_value: row.calculatedValue,
    unit: row.unit,
    sample_count: row.sampleCount,
    last_computed_at: iso(row.lastComputedAt),
  };
  const stddev = optNumber(row.stddev);
  if (stddev !== undefined) mapped.stddev = stddev;
  return mapped;
}

export function fromSettings(row: typeof ownerSettings.$inferSelect): OwnerSettingsRow {
  const mapped: OwnerSettingsRow = {
    tenant: row.tenant,
    updated_at: iso(row.updatedAt),
  };
  const vehicleId = optString(row.defaultVehicleId);
  if (vehicleId) mapped.default_vehicle_id = vehicleId;
  return mapped;
}

export function fromPlace(row: typeof savedPlaces.$inferSelect): SavedPlaceRow {
  return {
    id: row.id,
    tenant: row.tenant,
    kind: row.kind === "work" ? "work" : row.kind === "favourite" ? "favourite" : "home",
    label: row.label,
    lat: row.lat,
    lng: row.lng,
    created_at: iso(row.createdAt),
  };
}

export async function listVehicles(db: BrimDb, ownerId: string): Promise<VehicleRow[]> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const rows = await tx.select().from(vehicles).where(eq(vehicles.tenant, ownerId));
    return rows.map(fromVehicle);
  });
}

export async function getVehicle(
  db: BrimDb,
  ownerId: string,
  id: string,
): Promise<VehicleRow | undefined> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const rows = await tx
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.tenant, ownerId)));
    const row = rows[0];
    return row ? fromVehicle(row) : undefined;
  });
}

export async function saveVehicle(db: BrimDb, row: VehicleRow): Promise<VehicleRow> {
  const values = vehicleValues(row);
  await withRls(db, { tenant: row.tenant }, async (tx) => {
    await tx
      .insert(vehicles)
      .values(values)
      .onConflictDoUpdate({
        target: vehicles.id,
        set: {
          nickname: values.nickname,
          kind: values.kind,
          propulsion: values.propulsion,
          make: values.make,
          model: values.model,
          derivative: values.derivative,
          transmission: values.transmission,
          year: values.year,
          engineCc: values.engineCc,
          co2Gkm: values.co2Gkm,
          euroStatus: values.euroStatus,
          euroStatusSource: values.euroStatusSource,
          officialConsumption: values.officialConsumption,
          officialUnit: values.officialUnit,
          officialCycle: values.officialCycle,
          tankLitres: values.tankLitres,
          batteryKwhUsable: values.batteryKwhUsable,
          hasHeatPump: values.hasHeatPump,
          vcaMatchId: values.vcaMatchId,
          vrmHash: values.vrmHash,
          vrmEncrypted: values.vrmEncrypted,
        },
      });
  });
  return row;
}

export async function deleteVehicle(db: BrimDb, ownerId: string, id: string): Promise<boolean> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const deleted = await tx
      .delete(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.tenant, ownerId)))
      .returning({ id: vehicles.id });
    return deleted.length > 0;
  });
}

export async function listTariffs(
  db: BrimDb,
  ownerId: string,
  vehicleId: string,
): Promise<TariffRow[]> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const owned = await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.tenant, ownerId)));
    if (!owned[0]) return [];
    const rows = await tx.select().from(tariffs).where(and(eq(tariffs.tenant, ownerId), eq(tariffs.vehicleId, vehicleId)));
    return rows.map(fromTariff);
  });
}

export async function saveTariff(
  db: BrimDb,
  ownerId: string,
  row: TariffRow,
): Promise<TariffRow | undefined> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const owned = await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.id, row.vehicle_id), eq(vehicles.tenant, ownerId)));
    if (!owned[0]) return undefined;
    if (row.is_default) {
      await tx.update(tariffs).set({ isDefault: false }).where(and(eq(tariffs.tenant, ownerId), eq(tariffs.vehicleId, row.vehicle_id)));
    }
    const values = { ...tariffValues(row), tenant: ownerId };
    await tx
      .insert(tariffs)
      .values(values)
      .onConflictDoUpdate({
        target: tariffs.id,
        set: {
          kind: values.kind,
          pencePerKwh: values.pencePerKwh,
          offpeakPence: values.offpeakPence,
          offpeakWindow: values.offpeakWindow,
          network: values.network,
          isDefault: values.isDefault,
        },
      });
    return row;
  });
}

export async function listJourneys(db: BrimDb, ownerId: string): Promise<JourneyRow[]> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const rows = await tx
      .select()
      .from(journeys)
      .where(eq(journeys.tenant, ownerId))
      .orderBy(desc(journeys.createdAt));
    return rows.map(fromJourney);
  });
}

export async function getJourney(
  db: BrimDb,
  ownerId: string,
  id: string,
): Promise<JourneyRow | undefined> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const rows = await tx
      .select()
      .from(journeys)
      .where(and(eq(journeys.id, id), eq(journeys.tenant, ownerId)));
    const row = rows[0];
    return row ? fromJourney(row) : undefined;
  });
}

export async function saveJourney(db: BrimDb, row: JourneyRow): Promise<JourneyRow> {
  const values = journeyValues(row);
  await withRls(db, { tenant: row.tenant }, async (tx) => {
    await tx
      .insert(journeys)
      .values(values)
      .onConflictDoUpdate({
        target: journeys.id,
        set: {
          vehicleId: values.vehicleId,
          originLabel: values.originLabel,
          destLabel: values.destLabel,
          distanceMeters: values.distanceMeters,
          durationSeconds: values.durationSeconds,
          polyline: values.polyline,
          departsAt: values.departsAt,
          estimateJson: values.estimateJson,
          chargesJson: values.chargesJson,
          isSaved: values.isSaved,
        },
      });
  });
  return row;
}

export async function deleteJourney(db: BrimDb, ownerId: string, id: string): Promise<boolean> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const deleted = await tx
      .delete(journeys)
      .where(and(eq(journeys.id, id), eq(journeys.tenant, ownerId)))
      .returning({ id: journeys.id });
    return deleted.length > 0;
  });
}

export async function listFillUps(
  db: BrimDb,
  ownerId: string,
  vehicleId: string,
): Promise<FillUpRow[]> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const owned = await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.tenant, ownerId)));
    if (!owned[0]) return [];
    const rows = await tx
      .select()
      .from(fillUps)
      .where(and(eq(fillUps.tenant, ownerId), eq(fillUps.vehicleId, vehicleId)))
      .orderBy(desc(fillUps.occurredAt));
    return rows.map(fromFillUp);
  });
}

export async function getFillUp(
  db: BrimDb,
  ownerId: string,
  id: string,
): Promise<FillUpRow | undefined> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const rows = await tx.select().from(fillUps).where(and(eq(fillUps.tenant, ownerId), eq(fillUps.id, id)));
    const row = rows[0];
    if (!row) return undefined;
    const owned = await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.id, row.vehicleId), eq(vehicles.tenant, ownerId)));
    return owned[0] ? fromFillUp(row) : undefined;
  });
}

export async function saveFillUp(
  db: BrimDb,
  ownerId: string,
  row: FillUpRow,
): Promise<FillUpRow | undefined> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const owned = await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.id, row.vehicle_id), eq(vehicles.tenant, ownerId)));
    if (!owned[0]) return undefined;
    const values = { ...fillUpValues(row), tenant: ownerId };
    await tx
      .insert(fillUps)
      .values(values)
      .onConflictDoUpdate({
        target: fillUps.id,
        set: {
          odometerMiles: values.odometerMiles,
          quantity: values.quantity,
          unit: values.unit,
          pricePence: values.pricePence,
          filledToBrim: values.filledToBrim,
          occurredAt: values.occurredAt,
          note: values.note,
          stationId: values.stationId,
        },
      });
    return row;
  });
}

export async function deleteFillUp(db: BrimDb, ownerId: string, id: string): Promise<boolean> {
  const existing = await getFillUp(db, ownerId, id);
  if (!existing) return false;
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const deleted = await tx.delete(fillUps).where(and(eq(fillUps.tenant, ownerId), eq(fillUps.id, id))).returning({ id: fillUps.id });
    return deleted.length > 0;
  });
}

export async function getCalibration(
  db: BrimDb,
  ownerId: string,
  vehicleId: string,
): Promise<CalibrationRow | undefined> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const owned = await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.tenant, ownerId)));
    if (!owned[0]) return undefined;
    const rows = await tx.select().from(calibrations).where(and(eq(calibrations.tenant, ownerId), eq(calibrations.vehicleId, vehicleId)));
    const row = rows[0];
    return row ? fromCalibration(row) : undefined;
  });
}

export async function saveCalibration(
  db: BrimDb,
  ownerId: string,
  row: CalibrationRow,
): Promise<CalibrationRow | undefined> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const owned = await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.id, row.vehicle_id), eq(vehicles.tenant, ownerId)));
    if (!owned[0]) return undefined;
    await tx.delete(calibrations).where(and(eq(calibrations.tenant, ownerId), eq(calibrations.vehicleId, row.vehicle_id)));
    await tx.insert(calibrations).values({
      id: row.id,
      tenant: ownerId,
      vehicleId: row.vehicle_id,
      calculatedValue: row.calculated_value,
      unit: row.unit,
      sampleCount: row.sample_count,
      stddev: row.stddev ?? null,
      lastComputedAt: new Date(row.last_computed_at),
    });
    return row;
  });
}

export async function getSettings(
  db: BrimDb,
  ownerId: string,
): Promise<OwnerSettingsRow | undefined> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const rows = await tx.select().from(ownerSettings).where(eq(ownerSettings.tenant, ownerId));
    const row = rows[0];
    return row ? fromSettings(row) : undefined;
  });
}

export async function saveSettings(
  db: BrimDb,
  row: OwnerSettingsRow,
): Promise<OwnerSettingsRow> {
  await withRls(db, { tenant: row.tenant }, async (tx) => {
    await tx
      .insert(ownerSettings)
      .values({
        tenant: row.tenant,
        defaultVehicleId: row.default_vehicle_id ?? null,
        updatedAt: new Date(row.updated_at),
      })
      .onConflictDoUpdate({
        target: ownerSettings.tenant,
        set: {
          defaultVehicleId: row.default_vehicle_id ?? null,
          updatedAt: new Date(row.updated_at),
        },
      });
  });
  return row;
}

export async function listPlaces(db: BrimDb, ownerId: string): Promise<SavedPlaceRow[]> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const rows = await tx.select().from(savedPlaces).where(eq(savedPlaces.tenant, ownerId));
    return rows.map(fromPlace);
  });
}

export async function getPlace(
  db: BrimDb,
  ownerId: string,
  id: string,
): Promise<SavedPlaceRow | undefined> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const rows = await tx
      .select()
      .from(savedPlaces)
      .where(and(eq(savedPlaces.id, id), eq(savedPlaces.tenant, ownerId)));
    const row = rows[0];
    return row ? fromPlace(row) : undefined;
  });
}

export async function savePlace(db: BrimDb, row: SavedPlaceRow): Promise<SavedPlaceRow> {
  await withRls(db, { tenant: row.tenant }, async (tx) => {
    if (row.kind === "home" || row.kind === "work") {
      await tx
        .delete(savedPlaces)
        .where(
          and(
            eq(savedPlaces.tenant, row.tenant),
            eq(savedPlaces.kind, row.kind),
          ),
        );
    }
    await tx
      .insert(savedPlaces)
      .values({
        id: row.id,
        tenant: row.tenant,
        kind: row.kind,
        label: row.label,
        lat: row.lat,
        lng: row.lng,
        createdAt: new Date(row.created_at),
      })
      .onConflictDoUpdate({
        target: savedPlaces.id,
        set: {
          kind: row.kind,
          label: row.label,
          lat: row.lat,
          lng: row.lng,
        },
      });
  });
  return row;
}

export async function deletePlace(db: BrimDb, ownerId: string, id: string): Promise<boolean> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const deleted = await tx
      .delete(savedPlaces)
      .where(and(eq(savedPlaces.id, id), eq(savedPlaces.tenant, ownerId)))
      .returning({ id: savedPlaces.id });
    return deleted.length > 0;
  });
}

export async function ytdMiles(
  db: BrimDb,
  ownerId: string,
  taxYearStartIso: string,
  nowIso: string,
): Promise<number> {
  return withRls(db, { tenant: ownerId }, async (tx) => {
    const rows = await tx
      .select({ distanceMeters: journeys.distanceMeters })
      .from(journeys)
      .where(
        and(
          eq(journeys.tenant, ownerId),
          gte(journeys.createdAt, new Date(taxYearStartIso)),
          lte(journeys.createdAt, new Date(nowIso)),
        ),
      );
    return rows.reduce((sum, row) => sum + row.distanceMeters / 1609.344, 0);
  });
}

export async function routeCacheGet(db: BrimDb, key: string): Promise<string | null> {
  return withRls(db, { shared: true }, async (tx) => {
    const rows = await tx.select().from(routeCache).where(eq(routeCache.cacheKey, key));
    const row = rows[0];
    if (!row || row.expiresAt.getTime() <= Date.now()) return null;
    return JSON.stringify(row.responseJson);
  });
}

export async function routeCachePut(
  db: BrimDb,
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.max(60, ttlSeconds) * 1000);
  const provider = key.split("|")[0] || "route";
  const responseJson = JSON.parse(value) as unknown;
  await withRls(db, { shared: true }, async (tx) => {
    await tx
      .insert(routeCache)
      .values({ cacheKey: key, provider, responseJson, expiresAt })
      .onConflictDoUpdate({
        target: routeCache.cacheKey,
        set: { provider, responseJson, expiresAt },
      });
  });
}

export async function getDefaultTariff(
  db: BrimDb,
  ownerId: string,
  vehicleId: string,
): Promise<TariffRow | undefined> {
  const all = await listTariffs(db, ownerId, vehicleId);
  return all.find((t) => t.is_default) ?? all[0];
}
