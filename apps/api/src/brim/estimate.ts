import { z } from 'zod';
import { computeEstimate } from '@locations/brim/engine';
import {
  decodePolyline,
  findPlaceByLabel,
  gradeForPropulsion,
  hmrcAmapPence,
  isFixtureMode,
  isMapsShortUrl,
  loadFixture,
  parseLatLngString,
  parseMapsUrl,
  propulsionSchema,
  ukTaxYearStartUtc,
  vehicleProfileSchema,
  type PriceSource,
  type VehicleProfile,
} from '@locations/brim/shared';
import type { RoutePlace, RouteRequest } from '@locations/brim/routing';
import {
  KvCache,
  MemoryCache,
  cachePlaceKey,
  cachedRoute,
  chooseProvider,
  routeCacheKey,
} from '@locations/brim/routing';
import type { Context } from 'hono';
import { createLogger } from './logger';
import { NeonRouteCache } from './db/route-cache';
import { getDefaultTariff, getCalibration, getVehicle, ytdMiles } from './db/repo';
import { resolveEstimatePrice } from './prices';
import { attachCheapestFill } from './fill';
import { loadGridIntensity, resolveEstimateEvPrice, resolveForecastTemp } from './ev';
import { defaultDepartsAt, detectChargeHits, resolveRouteCharges } from './charges';
import type { BrimDb } from './db/types';
import type { VehicleRow } from './db/rows';
import { createDb, brimTenant, persistLive, type BrimContext } from "./context";
import type { Env } from "../env";

const placePinSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  label: z.string().optional(),
});
const placeInputSchema = z.union([z.string().min(1), placePinSchema]);

const estimateBodySchema = z.object({
  origin: placeInputSchema,
  destination: placeInputSchema,
  waypoints: z.array(placeInputSchema).optional(),
  departsAt: z.string().optional(),
  vehicleId: z.string().optional(),
  vehicleInline: vehicleProfileSchema.optional(),
  propulsion: propulsionSchema.optional(),
  stationId: z.string().optional(),
  priceStrategy: z.enum(['national-median', 'user-tariff', 'hardcoded-fallback', 'cheapest-on-route']).optional(),
  pricePence: z.number().optional(),
  chargingLocation: z.enum(['home', 'public']).optional(),
  network: z.string().optional(),
  chargingSpeed: z.enum(['ac', 'dc']).optional(),
  offpeakPence: z.number().optional(),
  offpeakWindow: z.string().optional(),
  startChargePercent: z.number().optional(),
  hasHeatPump: z.boolean().optional(),
  batteryKwhUsable: z.number().optional(),
  nowIso: z.string().optional(),
});

const isolateCache = new MemoryCache();
const log = createLogger();
let providerCalls = 0;

function cacheFor(env: Env, db: BrimDb) {
  if (persistLive(db)) return new NeonRouteCache(db);
  return isolateCache;
}

function vehicleFromRow(row: VehicleRow): VehicleProfile {
  const profile: {
    kind: VehicleRow['kind'];
    propulsion: VehicleRow['propulsion'];
    make?: string;
    model?: string;
    year?: number;
    officialConsumption?: number;
    officialUnit?: 'mpg' | 'l/100km' | 'mi/kWh' | 'kWh/100km';
    officialCycle?: 'WLTP' | 'NEDC';
    tankLitres?: number;
    batteryKwhUsable?: number;
    hasHeatPump?: boolean;
    euroStatus?: string;
    euroStatusSource?: 'dvla' | 'derived';
  } = { kind: row.kind, propulsion: row.propulsion };
  if (row.make) profile.make = row.make;
  if (row.model) profile.model = row.model;
  if (row.year !== undefined) profile.year = row.year;
  if (row.official_consumption !== undefined)
    profile.officialConsumption = row.official_consumption;
  if (
    row.official_unit === 'mpg' ||
    row.official_unit === 'l/100km' ||
    row.official_unit === 'mi/kWh' ||
    row.official_unit === 'kWh/100km'
  ) {
    profile.officialUnit = row.official_unit;
  }
  if (row.official_cycle === 'WLTP' || row.official_cycle === 'NEDC')
    profile.officialCycle = row.official_cycle;
  if (row.tank_litres !== undefined) profile.tankLitres = row.tank_litres;
  if (row.battery_kwh_usable !== undefined) profile.batteryKwhUsable = row.battery_kwh_usable;
  if (row.has_heat_pump !== undefined) profile.hasHeatPump = row.has_heat_pump;
  if (row.euro_status) profile.euroStatus = row.euro_status;
  if (row.euro_status_source) profile.euroStatusSource = row.euro_status_source;
  return profile;
}

async function estimateFromBody(c: BrimContext, raw: unknown) {
  const db = createDb(c.env);
  const parsed = estimateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid_request', details: parsed.error.flatten() }, 400);
  }
  const body = parsed.data;
  const tenant = brimTenant(c);

  const saved = body.vehicleId ? await getVehicle(db, tenant, body.vehicleId) : undefined;
  let vehicleInline: VehicleProfile | undefined =
    body.vehicleInline ?? (saved ? vehicleFromRow(saved) : undefined);
  if (vehicleInline) {
    vehicleInline = {
      ...vehicleInline,
      ...(body.startChargePercent !== undefined ? { startChargePercent: body.startChargePercent } : {}),
      ...(body.hasHeatPump !== undefined ? { hasHeatPump: body.hasHeatPump } : {}),
      ...(body.batteryKwhUsable !== undefined ? { batteryKwhUsable: body.batteryKwhUsable } : {}),
    };
  }
  const propulsion = vehicleInline?.propulsion ?? body.propulsion ?? 'petrol';
  const storedCalib = body.vehicleId
    ? await getCalibration(db, tenant, body.vehicleId)
    : undefined;
  const calibration =
    storedCalib && storedCalib.sample_count > 0
      ? {
          value: storedCalib.calculated_value,
          unit: storedCalib.unit as 'l/100km' | 'kWh/100km' | 'mpg' | 'mi/kWh',
          sampleCount: storedCalib.sample_count,
          ...(storedCalib.stddev !== undefined ? { stddev: storedCalib.stddev } : {}),
        }
      : undefined;
  const hasProfile = Boolean(vehicleInline);
  const chosen = chooseProvider({
    fixtureMode: isFixtureMode(c.env.BRIM_FIXTURES),
    googleKey: c.env.GOOGLE_MAPS_API_KEY,
    osrmUrl: c.env.OSRM_BASE,
    spentUsd: Number(c.env.ROUTING_SPENT_USD ?? 0),
    ceilingUsd: Number(c.env.ROUTING_CEILING_USD ?? 50),
    hasVehicleProfile: hasProfile,
  });
  const origin = resolvePlace(body.origin);
  const destination = resolvePlace(body.destination);
  const waypoints = body.waypoints?.map(resolvePlace);
  const cache = cacheFor(c.env, db);
  const key = routeCacheKey({
    origin: cachePlaceKey(origin.route),
    dest: cachePlaceKey(destination.route),
    mode: chosen.mode,
    provider: chosen.provider.name,
    departureTime: body.departsAt,
    waypoints: waypoints?.map((w) => cachePlaceKey(w.route)).join(";"),
  });
  const ttl = chosen.mode === 'advanced' ? 6 * 3600 : 30 * 24 * 3600;
  const { value: route, hit } = await cachedRoute(cache, key, ttl, () => {
    providerCalls += 1;
    const req: RouteRequest = {
      origin: origin.route,
      destination: destination.route,
      mode: chosen.mode,
    };
    if (waypoints && waypoints.length > 0) req.waypoints = waypoints.map((w) => w.route);
    if (body.departsAt) req.departureTime = body.departsAt;
    return chosen.provider.computeRoute(req);
  });

  log.info({ branch: chosen.branch, mode: chosen.mode, budget: chosen.budgetAlert, cacheHit: hit });

  const unit =
    vehicleInline?.officialUnit === 'mi/kWh' || vehicleInline?.officialUnit === 'kWh/100km'
      ? vehicleInline.officialUnit
      : vehicleInline?.officialUnit === 'mpg'
        ? 'mpg'
        : 'l/100km';

  const nowIso = body.nowIso ?? body.departsAt ?? '1970-01-01T00:00:00Z';
  const departsAt = defaultDepartsAt(c.env, body.departsAt ?? body.nowIso);
  const tariff = body.vehicleId
    ? await getDefaultTariff(db, tenant, body.vehicleId)
    : undefined;
  const originCoords =
    origin.lat !== undefined && origin.lng !== undefined ? { lat: origin.lat, lng: origin.lng } : undefined;
  const electric = propulsion === 'bev' || propulsion === 'phev';
  const useTariff = body.priceStrategy === 'user-tariff' && (tariff || body.pricePence !== undefined);
  let pricePence = propulsion === 'bev' ? 7.5 : 140;
  let priceUnit: 'ppl' | 'p/kWh' = propulsion === 'bev' ? 'p/kWh' : 'ppl';
  let priceSource: PriceSource = useTariff ? 'user-tariff' : 'national-median';
  let priceObservedAt = nowIso;
  let pickedStationId: string | undefined;
  let priceReason: string | undefined;
  let priceWarning: { code: string; message: string; severity: 'info' | 'warning' | 'blocking' } | undefined;
  let charging: 'acHome' | 'dcRapid' | undefined;
  let liquidPricePence: number | undefined;
  let forecastTempC: number | undefined;
  let gridIntensityGPerKwh: number | undefined;
  let intensityReason: string | undefined;

  if (electric) {
    const evPrice = resolveEstimateEvPrice({
      ...(body.chargingLocation ? { chargingLocation: body.chargingLocation } : {}),
      ...(body.network ? { network: body.network } : {}),
      ...(body.chargingSpeed ? { chargingSpeed: body.chargingSpeed } : {}),
      ...(body.pricePence !== undefined ? { pricePence: body.pricePence } : {}),
      ...(body.offpeakPence !== undefined ? { offpeakPence: body.offpeakPence } : {}),
      ...(body.offpeakWindow ? { offpeakWindow: body.offpeakWindow } : {}),
      ...(tariff ? { tariff } : {}),
    });
    pricePence = evPrice.pence;
    priceUnit = 'p/kWh';
    priceSource = evPrice.source;
    priceObservedAt = evPrice.observedAt;
    priceReason = evPrice.reason;
    priceWarning = evPrice.warning;
    charging = evPrice.charging;
    const atIso = body.departsAt ?? nowIso;
    const intensity = await loadGridIntensity(c.env, db, atIso);
    gridIntensityGPerKwh = intensity.gPerKwh;
    intensityReason = intensity.reason;
    forecastTempC = await resolveForecastTemp({
      fixtureMode: isFixtureMode(c.env.BRIM_FIXTURES),
      ...(originCoords ? { origin: originCoords } : {}),
      atIso,
    });
    if (propulsion === 'phev') {
      const ice = await resolveEstimatePrice(c.env, db, {
        propulsion: 'petrol',
        ...(body.stationId ? { stationId: body.stationId } : {}),
        ...(originCoords ? { origin: originCoords } : {}),
      });
      if (ice) liquidPricePence = ice.pence;
    }
  } else if (useTariff || body.pricePence !== undefined) {
    pricePence = body.pricePence ?? tariff?.pence_per_kwh ?? 140;
    priceUnit = 'ppl';
    priceSource = useTariff ? 'user-tariff' : 'national-median';
  } else {
    const resolved = await resolveEstimatePrice(c.env, db, {
      propulsion,
      ...(body.stationId ? { stationId: body.stationId } : {}),
      ...(originCoords ? { origin: originCoords } : {}),
    });
    if (resolved) {
      pricePence = resolved.pence;
      priceUnit = 'ppl';
      priceSource =
        body.priceStrategy === 'cheapest-on-route' && resolved.stationId
          ? 'cheapest-on-route'
          : resolved.source;
      priceObservedAt = resolved.observedAt;
      pickedStationId = resolved.stationId;
      priceReason =
        priceSource === 'cheapest-on-route'
          ? `Used the ${gradeForPropulsion(propulsion)} price at the cheapest fill you picked on this route.`
          : resolved.reason;
      priceWarning = resolved.warning;
    }
  }

  const estimateFor = (
    distanceMeters: number,
    durationSeconds: number,
    charges: ReturnType<typeof resolveRouteCharges>['charges'],
    providerFuel?: number,
  ) =>
    computeEstimate({
      distanceMeters,
      durationSeconds,
      propulsion,
      vehicle: vehicleInline,
      calibration,
      official:
        vehicleInline?.officialConsumption !== undefined
          ? {
              value: vehicleInline.officialConsumption,
              unit,
              cycle: vehicleInline.officialCycle ?? 'WLTP',
            }
          : undefined,
      userEntered:
        body.vehicleInline?.userEnteredConsumption !== undefined
          ? {
              value: body.vehicleInline.userEnteredConsumption,
              unit: body.vehicleInline.userEnteredUnit ?? 'mpg',
            }
          : undefined,
      providerEstimate: providerFuel ? { litres: providerFuel } : undefined,
      roadComposition: route.roadComposition,
      pricePence,
      priceUnit,
      priceSource,
      priceObservedAt,
      ...(pickedStationId ? { stationId: pickedStationId } : {}),
      ...(charging ? { charging } : {}),
      ...(forecastTempC !== undefined ? { forecastTempC } : {}),
      ...(gridIntensityGPerKwh !== undefined ? { gridIntensityGPerKwh } : {}),
      ...(liquidPricePence !== undefined ? { liquidPricePence } : {}),
      charges,
    });

  const primaryResolved = resolveRouteCharges({
    hits: await detectChargeHits(c.env, db, route.encodedPolyline),
    ...(vehicleInline ? { vehicle: vehicleInline } : {}),
    departsAt,
    durationSeconds: route.durationSeconds,
  });

  const estimate = estimateFor(
    route.distanceMeters,
    route.durationSeconds,
    primaryResolved.charges,
    route.providerFuelLitres,
  );

  if (priceReason) estimate.reasons.push(priceReason);
  if (intensityReason) estimate.reasons.push(intensityReason);
  if (priceWarning) estimate.warnings.push(priceWarning);
  estimate.reasons.push(...primaryResolved.reasons);
  estimate.warnings.push(...primaryResolved.warnings);

  if (chosen.exceeded) {
    estimate.reasons.push(
      'Routing spend ceiling hit - used the free provider and widened the range.',
    );
  }

  const miles = route.distanceMeters / 1609.344;
  const ytd = await ytdMiles(db, tenant, ukTaxYearStartUtc(nowIso), nowIso);
  const hmrc = hmrcAmapPence(miles, ytd);
  const shape = decodePolyline(route.encodedPolyline);
  const start = route.start ?? shape[0];
  const end = route.end ?? shape[shape.length - 1];
  const alternatives = await Promise.all(
    (route.alternatives ?? []).map(async (alt) => {
      const altResolved = resolveRouteCharges({
        hits: await detectChargeHits(c.env, db, alt.encodedPolyline),
        ...(vehicleInline ? { vehicle: vehicleInline } : {}),
        departsAt,
        durationSeconds: alt.durationSeconds,
      });
      const priced = estimateFor(alt.distanceMeters, alt.durationSeconds, altResolved.charges);
      return {
        id: alt.id,
        label: alt.label,
        distanceMeters: alt.distanceMeters,
        durationSeconds: alt.durationSeconds,
        encodedPolyline: alt.encodedPolyline,
        costPence: priced.cost.totalPence.point,
      };
    }),
  );
  const waypointPins = (waypoints ?? [])
    .map((w) => pinFrom(w, undefined))
    .filter((p): p is { label: string; lat: number; lng: number } => Boolean(p));

  const payload: Record<string, unknown> = {
    ...estimate,
    encodedPolyline: route.encodedPolyline,
    origin: pinFrom(origin, start),
    destination: pinFrom(destination, end),
    alternatives,
    hmrc: {
      approvedPence: hmrc.approvedPence,
      deltaPence: estimate.cost.totalPence.point - hmrc.approvedPence,
      ytdMiles: ytd,
      bandMiles45: hmrc.bandMiles45,
      bandMiles25: hmrc.bandMiles25,
      crossedThreshold: hmrc.crossedThreshold,
    },
  };
  if (route.routeLabel) payload.routeLabel = route.routeLabel;
  if (route.durationTrafficSeconds !== undefined) {
    payload.durationTrafficSeconds = route.durationTrafficSeconds;
  }
  if (waypointPins.length > 0) payload.waypoints = waypointPins;
  const cheapestFill = await attachCheapestFill({
    env: c.env,
    db,
    propulsion,
    encodedPolyline: route.encodedPolyline,
    ...(originCoords ? { origin: originCoords } : {}),
    ...(vehicleInline ? { vehicle: vehicleInline } : {}),
    ...(estimate.consumption.unit === 'l/100km' ? { lPer100km: estimate.consumption.value } : {}),
  });
  if (cheapestFill) payload.cheapestFill = cheapestFill;
  return c.json(payload);
}

function pinFrom(
  resolved: { label: string; lat?: number; lng?: number },
  fallback: { lat: number; lng: number } | undefined,
): { label: string; lat: number; lng: number } | undefined {
  const lat = resolved.lat ?? fallback?.lat;
  const lng = resolved.lng ?? fallback?.lng;
  if (lat === undefined || lng === undefined) return undefined;
  return { label: resolved.label, lat, lng };
}

function resolvePlace(input: z.infer<typeof placeInputSchema>): {
  route: RoutePlace;
  label: string;
  lat?: number;
  lng?: number;
} {
  if (typeof input !== 'string') {
    const label = input.label?.trim() || `${input.lat.toFixed(4)}, ${input.lng.toFixed(4)}`;
    const route: RoutePlace = input.label
      ? { lat: input.lat, lng: input.lng, label: input.label }
      : { lat: input.lat, lng: input.lng };
    return { route, label, lat: input.lat, lng: input.lng };
  }
  const named = findPlaceByLabel(input);
  if (named) {
    return {
      route: { lat: named.lat, lng: named.lng, label: named.label },
      label: named.label,
      lat: named.lat,
      lng: named.lng,
    };
  }
  const parsed = parseLatLngString(input);
  if (parsed) {
    return { route: parsed, label: input.trim(), lat: parsed.lat, lng: parsed.lng };
  }
  return { route: input, label: input };
}

export async function handleEstimate(c: BrimContext) {
  return estimateFromBody(c, await c.req.json());
}

function canonicalMapsUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

async function expandMapsShortUrl(env: Env, raw: string): Promise<string | null> {
  if (isFixtureMode(env.BRIM_FIXTURES)) {
    const table = loadFixture<{ redirects: Record<string, string> }>('maps-short', env.BRIM_FIXTURES);
    const key = canonicalMapsUrl(raw);
    return table.redirects[key] ?? table.redirects[raw.trim()] ?? null;
  }
  try {
    const res = await fetch(raw.trim(), { method: 'GET', redirect: 'follow' });
    return res.url || null;
  } catch {
    return null;
  }
}

export async function handleFromMapsUrl(c: BrimContext) {
  const body = z.object({ url: z.string() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  let parsed = parseMapsUrl(body.data.url);
  if (!parsed.ok && isMapsShortUrl(body.data.url)) {
    const expanded = await expandMapsShortUrl(c.env, body.data.url);
    if (expanded) parsed = parseMapsUrl(expanded);
  }
  if (!parsed.ok) return c.json({ error: 'invalid_maps_url', reason: parsed.reason }, 400);
  return estimateFromBody(c, {
    origin: parsed.origin,
    destination: parsed.destination,
    waypoints: parsed.waypoints,
  });
}

export function cacheStats() {
  return { providerCalls };
}
