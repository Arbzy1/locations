import { z } from "zod";
import { computeEstimate } from "@locations/brim/engine";
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
  type ChargeHit,
  type FuelGrade,
  type PriceSource,
  type VehicleProfile,
  type Warning,
} from "@locations/brim/shared";
import {
  chooseGeocoder,
  chooseProvider,
  MemoryCache,
  ROUTE_COST_USD,
  RoutingError,
  cachePlaceKey,
  cachedRoute,
  routeCacheKey,
  type Geocoder,
  type RoutePlace,
  type RouteRequest,
  type RoutingProvider,
} from "@locations/brim/routing";
import { osrmRoot } from "../osrm-base";
import { createLogger } from "./logger";
import { NeonRouteCache } from "./db/route-cache";
import {
  addRoutingSpendUsd,
  getCalibration,
  getDefaultTariff,
  getRoutingSpendUsd,
  getVehicle,
  ytdMiles,
} from "./db/repo";
import { resolveEstimatePrice } from "./prices";
import { attachCheapestFill } from "./fill";
import { loadGridIntensity, resolveEstimateEvPrice, resolveForecastTemp } from "./ev";
import { defaultDepartsAt, detectChargeHits, resolveRouteCharges } from "./charges";
import type { BrimDb } from "./db/types";
import type { VehicleRow } from "./db/rows";
import { brimTenant, persistLive, requestBrimDb, type BrimContext } from "./context";
import type { Env } from "../env";

const placePinSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  label: z.string().optional(),
});
const placeInputSchema = z.union([z.string().min(1), placePinSchema]);
const fuelGradeSchema = z.enum(["E10", "E5", "B7", "SDV", "LPG"]);

const sharedEstimateOptionsSchema = z.object({
  departsAt: z.string().optional(),
  roundTrip: z.boolean().optional(),
  passengers: z.number().int().min(0).max(8).optional(),
  vehicleId: z.string().optional(),
  vehicleInline: vehicleProfileSchema.optional(),
  propulsion: propulsionSchema.optional(),
  fuelGrade: fuelGradeSchema.optional(),
  stationId: z.string().optional(),
  priceStrategy: z
    .enum(["national-median", "user-tariff", "hardcoded-fallback", "cheapest-on-route"])
    .optional(),
  pricePence: z.number().optional(),
  chargingLocation: z.enum(["home", "public"]).optional(),
  network: z.string().optional(),
  chargingSpeed: z.enum(["ac", "dc"]).optional(),
  offpeakPence: z.number().optional(),
  offpeakWindow: z.string().optional(),
  startChargePercent: z.number().min(0).max(100).optional(),
  hasHeatPump: z.boolean().optional(),
  batteryKwhUsable: z.number().optional(),
  nowIso: z.string().optional(),
});

const estimateBodySchema = sharedEstimateOptionsSchema.extend({
  origin: placeInputSchema,
  destination: placeInputSchema,
  waypoints: z.array(placeInputSchema).optional(),
});

const mapsUrlBodySchema = sharedEstimateOptionsSchema.extend({
  url: z.string().min(1),
});

const ALLOWED_MAPS_REDIRECT_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "www.google.com",
  "maps.google.com",
  "google.com",
  "www.google.co.uk",
  "maps.google.co.uk",
]);

const isolateCache = new MemoryCache();
const log = createLogger();
let providerCalls = 0;

/**
 * Run the routing call and, for Google, add its estimated cost to the month's total.
 * Cache hits never reach here, so only billable requests are counted.
 */
async function computeAndRecord(db: BrimDb, provider: RoutingProvider, req: RouteRequest) {
  const route = await provider.computeRoute(req);
  if (provider.name === "google") {
    await addRoutingSpendUsd(db, ROUTE_COST_USD[req.mode]).catch(() => {
      log.info({ kind: "routing_spend", ok: false });
    });
  }
  return route;
}

function cacheFor(db: BrimDb) {
  if (persistLive(db)) return new NeonRouteCache(db);
  return isolateCache;
}

function asConsumptionUnit(
  raw: string | undefined,
): "mpg" | "l/100km" | "mi/kWh" | "kWh/100km" | undefined {
  if (raw === "mpg" || raw === "l/100km" || raw === "mi/kWh" || raw === "kWh/100km") {
    return raw;
  }
  return undefined;
}

function vehicleFromRow(row: VehicleRow): VehicleProfile {
  const profile: VehicleProfile = { kind: row.kind, propulsion: row.propulsion };
  if (row.make) profile.make = row.make;
  if (row.model) profile.model = row.model;
  if (row.year !== undefined) profile.year = row.year;
  const parsedUnit = asConsumptionUnit(row.official_unit);
  if (row.official_cycle === "USER" && row.official_consumption !== undefined) {
    profile.userEnteredConsumption = row.official_consumption;
    if (parsedUnit) profile.userEnteredUnit = parsedUnit;
  } else {
    if (row.official_consumption !== undefined) {
      profile.officialConsumption = row.official_consumption;
    }
    if (parsedUnit) profile.officialUnit = parsedUnit;
    if (row.official_cycle === "WLTP" || row.official_cycle === "NEDC") {
      profile.officialCycle = row.official_cycle;
    }
  }
  if (row.tank_litres !== undefined) profile.tankLitres = row.tank_litres;
  if (row.battery_kwh_usable !== undefined) profile.batteryKwhUsable = row.battery_kwh_usable;
  if (row.has_heat_pump !== undefined) profile.hasHeatPump = row.has_heat_pump;
  if (row.euro_status) profile.euroStatus = row.euro_status;
  if (row.euro_status_source) profile.euroStatusSource = row.euro_status_source;
  return profile;
}

type ResolvedPlace = {
  route: RoutePlace;
  label: string;
  lat?: number;
  lng?: number;
};

async function geocodePlaceForOsrm(geo: Geocoder, place: ResolvedPlace): Promise<ResolvedPlace | null> {
  if (typeof place.route !== "string") return place;
  const suggestions = await geo.autocomplete(place.route);
  const first = suggestions[0];
  if (first && first.lat !== undefined && first.lng !== undefined) {
    return {
      route: { lat: first.lat, lng: first.lng, label: place.label },
      label: place.label,
      lat: first.lat,
      lng: first.lng,
    };
  }
  if (first?.placeId) {
    const resolved = await geo.resolve(first.placeId);
    if (resolved) {
      return {
        route: { lat: resolved.lat, lng: resolved.lng, label: place.label },
        label: place.label,
        lat: resolved.lat,
        lng: resolved.lng,
      };
    }
  }
  return null;
}

function expandHitsForRoundTrip(hits: ChargeHit[]): ChargeHit[] {
  const out: ChargeHit[] = [];
  for (const hit of hits) {
    if (hit.relation === "near") {
      out.push(hit);
      continue;
    }
    const entry = hit.entryFraction ?? 0;
    const exit = hit.exitFraction ?? entry;
    out.push({
      ...hit,
      entryFraction: entry * 0.5,
      exitFraction: exit * 0.5,
    });
    out.push({
      ...hit,
      entryFraction: 0.5 + (1 - exit) * 0.5,
      exitFraction: 0.5 + (1 - entry) * 0.5,
    });
  }
  return out;
}

async function estimateFromBody(
  c: BrimContext,
  raw: unknown,
  extraWarnings: Warning[] = [],
) {
  const db = requestBrimDb(c);
  const parsed = estimateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);
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
  const propulsion = vehicleInline?.propulsion ?? body.propulsion ?? "petrol";
  const storedCalib = body.vehicleId
    ? await getCalibration(db, tenant, body.vehicleId)
    : undefined;
  const calibration =
    storedCalib && storedCalib.sample_count > 0
      ? {
          value: storedCalib.calculated_value,
          unit: storedCalib.unit as "l/100km" | "kWh/100km" | "mpg" | "mi/kWh",
          sampleCount: storedCalib.sample_count,
          ...(storedCalib.stddev !== undefined ? { stddev: storedCalib.stddev } : {}),
        }
      : undefined;
  const hasProfile = Boolean(vehicleInline);
  const fixtureMode = isFixtureMode(c.env.BRIM_FIXTURES);
  const ceilingUsd = Number(c.env.ROUTING_CEILING_USD ?? 50);
  const paidRouting = Boolean(c.env.GOOGLE_MAPS_API_KEY) && !fixtureMode;
  const recordedUsd = paidRouting ? await getRoutingSpendUsd(db).catch(() => ceilingUsd) : 0;
  const chosen = chooseProvider({
    fixtureMode,
    googleKey: c.env.GOOGLE_MAPS_API_KEY,
    osrmUrl: osrmRoot(c.env.OSRM_BASE),
    spentUsd: Math.max(Number(c.env.ROUTING_SPENT_USD ?? 0), recordedUsd),
    ceilingUsd,
    hasVehicleProfile: hasProfile,
  });

  let origin = resolvePlace(body.origin);
  let destination = resolvePlace(body.destination);
  let waypoints = body.waypoints?.map(resolvePlace);
  const cache = cacheFor(db);

  if (chosen.provider.name === "osrm") {
    const geo = chooseGeocoder({
      fixtureMode: false,
      geocodeBase: c.env.GEOCODE_BASE,
      cache,
    });
    try {
      const resolvedOrigin = await geocodePlaceForOsrm(geo, origin);
      if (!resolvedOrigin) {
        const message = `Could not find UK coordinates for "${origin.label}".`;
        return c.json({ error: "geocode_failed", message, reason: message }, 400);
      }
      origin = resolvedOrigin;

      const resolvedDest = await geocodePlaceForOsrm(geo, destination);
      if (!resolvedDest) {
        const message = `Could not find UK coordinates for "${destination.label}".`;
        return c.json({ error: "geocode_failed", message, reason: message }, 400);
      }
      destination = resolvedDest;

      if (waypoints && waypoints.length > 0) {
        const resolvedVias: ResolvedPlace[] = [];
        for (const wp of waypoints) {
          const hit = await geocodePlaceForOsrm(geo, wp);
          if (!hit) {
            const message = `Could not find UK coordinates for "${wp.label}".`;
            return c.json({ error: "geocode_failed", message, reason: message }, 400);
          }
          resolvedVias.push(hit);
        }
        waypoints = resolvedVias;
      }
    } catch (err) {
      if (err instanceof RoutingError && err.code === "invalid-request") {
        return c.json({ error: "geocode_failed", message: err.message, reason: err.message }, 400);
      }
      const message = "Address lookup service is temporarily unavailable.";
      return c.json({ error: "routing_unavailable", message, reason: message }, 502);
    }
  }

  const key = routeCacheKey({
    origin: cachePlaceKey(origin.route),
    dest: cachePlaceKey(destination.route),
    mode: chosen.mode,
    provider: chosen.provider.name,
    departureTime: body.departsAt,
    waypoints: waypoints?.map((w) => cachePlaceKey(w.route)).join(";"),
  });
  const ttl = chosen.mode === "advanced" ? 6 * 3600 : 30 * 24 * 3600;

  let route: Awaited<ReturnType<RoutingProvider["computeRoute"]>>;
  let hit = false;
  try {
    const cached = await cachedRoute(cache, key, ttl, () => {
      providerCalls += 1;
      const req: RouteRequest = {
        origin: origin.route,
        destination: destination.route,
        mode: chosen.mode,
      };
      if (waypoints && waypoints.length > 0) req.waypoints = waypoints.map((w) => w.route);
      if (body.departsAt) req.departureTime = body.departsAt;
      return computeAndRecord(db, chosen.provider, req);
    });
    route = cached.value;
    hit = cached.hit;
  } catch (err) {
    if (err instanceof RoutingError) {
      if (err.code === "invalid-request") {
        return c.json({ error: "invalid_route", message: err.message, reason: err.message }, 400);
      }
      return c.json({ error: "routing_unavailable", message: err.message, reason: err.message }, 502);
    }
    const message = "Routing provider failed to respond.";
    return c.json({ error: "routing_unavailable", message, reason: message }, 502);
  }

  log.info({ branch: chosen.branch, mode: chosen.mode, budget: chosen.budgetAlert, cacheHit: hit });

  const shape = decodePolyline(route.encodedPolyline);
  const start = route.start ?? shape[0];
  const end = route.end ?? shape[shape.length - 1];
  const resolvedOriginCoords =
    origin.lat !== undefined && origin.lng !== undefined
      ? { lat: origin.lat, lng: origin.lng }
      : start;

  const officialUnit =
    vehicleInline?.officialUnit === "mi/kWh" || vehicleInline?.officialUnit === "kWh/100km"
      ? vehicleInline.officialUnit
      : vehicleInline?.officialUnit === "mpg"
        ? "mpg"
        : "l/100km";

  const realNowIso = body.nowIso ?? new Date().toISOString();
  const tripDepartsAt = defaultDepartsAt(c.env, body.departsAt ?? body.nowIso);
  const roundTrip = body.roundTrip === true;
  const legFactor = roundTrip ? 2 : 1;

  const tariff = body.vehicleId
    ? await getDefaultTariff(db, tenant, body.vehicleId)
    : undefined;
  const electric = propulsion === "bev" || propulsion === "phev";
  const useTariff = body.priceStrategy === "user-tariff" && (tariff || body.pricePence !== undefined);
  const fuelGrade: FuelGrade | undefined = body.fuelGrade;
  let pricePence = propulsion === "bev" ? 7.5 : 140;
  let priceUnit: "ppl" | "p/kWh" = propulsion === "bev" ? "p/kWh" : "ppl";
  let priceSource: PriceSource = useTariff ? "user-tariff" : "national-median";
  let priceObservedAt = realNowIso;
  let pickedStationId: string | undefined;
  let priceReason: string | undefined;
  let priceWarning: Warning | undefined;
  let charging: "acHome" | "dcRapid" | undefined;
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
    priceUnit = "p/kWh";
    priceSource = evPrice.source;
    priceObservedAt = evPrice.observedAt;
    priceReason = evPrice.reason;
    priceWarning = evPrice.warning;
    charging = evPrice.charging;
    const intensity = await loadGridIntensity(c.env, db, tripDepartsAt);
    gridIntensityGPerKwh = intensity.gPerKwh;
    intensityReason = intensity.reason;
    forecastTempC = await resolveForecastTemp({
      fixtureMode,
      ...(resolvedOriginCoords ? { origin: resolvedOriginCoords } : {}),
      atIso: tripDepartsAt,
    });
    if (propulsion === "phev") {
      const ice = await resolveEstimatePrice(c.env, db, {
        propulsion: "petrol",
        ...(fuelGrade ? { fuelGrade } : {}),
        ...(body.stationId ? { stationId: body.stationId } : {}),
        ...(resolvedOriginCoords ? { origin: resolvedOriginCoords } : {}),
      });
      if (ice) liquidPricePence = ice.pence;
    }
  } else if (useTariff || body.pricePence !== undefined) {
    pricePence = body.pricePence ?? tariff?.pence_per_kwh ?? 140;
    priceUnit = "ppl";
    priceSource = useTariff ? "user-tariff" : "national-median";
  } else {
    const resolved = await resolveEstimatePrice(c.env, db, {
      propulsion,
      ...(fuelGrade ? { fuelGrade } : {}),
      ...(body.stationId ? { stationId: body.stationId } : {}),
      ...(resolvedOriginCoords ? { origin: resolvedOriginCoords } : {}),
    });
    if (resolved) {
      pricePence = resolved.pence;
      priceUnit = "ppl";
      priceSource =
        body.priceStrategy === "cheapest-on-route" && resolved.stationId
          ? "cheapest-on-route"
          : resolved.source;
      priceObservedAt = resolved.observedAt;
      pickedStationId = resolved.stationId;
      const effectiveGrade = fuelGrade ?? gradeForPropulsion(propulsion);
      priceReason =
        priceSource === "cheapest-on-route"
          ? `Used the ${effectiveGrade} price at the cheapest fill you picked on this route.`
          : resolved.reason;
      priceWarning = resolved.warning;
    }
  }

  const defaultUserUnit =
    propulsion === "bev" ? "mi/kWh" : "mpg";
  const estimateFor = (
    distanceMeters: number,
    durationSeconds: number,
    charges: ReturnType<typeof resolveRouteCharges>["charges"],
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
              unit: officialUnit,
              cycle: vehicleInline.officialCycle ?? "WLTP",
            }
          : undefined,
      userEntered:
        vehicleInline?.userEnteredConsumption !== undefined
          ? {
              value: vehicleInline.userEnteredConsumption,
              unit: vehicleInline.userEnteredUnit ?? defaultUserUnit,
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

  const rawPrimaryHits = await detectChargeHits(c.env, db, route.encodedPolyline);
  const effectiveDuration = route.durationSeconds * legFactor;
  const effectiveDistance = route.distanceMeters * legFactor;
  const primaryResolved = resolveRouteCharges({
    hits: roundTrip ? expandHitsForRoundTrip(rawPrimaryHits) : rawPrimaryHits,
    ...(vehicleInline ? { vehicle: vehicleInline } : {}),
    departsAt: tripDepartsAt,
    durationSeconds: effectiveDuration,
  });

  const estimate = estimateFor(
    effectiveDistance,
    effectiveDuration,
    primaryResolved.charges,
    route.providerFuelLitres !== undefined ? route.providerFuelLitres * legFactor : undefined,
  );

  if (roundTrip) {
    estimate.reasons.push("Doubled distance, driving time, and return crossings for a round trip.");
  }
  if (priceReason) estimate.reasons.push(priceReason);
  if (intensityReason) estimate.reasons.push(intensityReason);
  if (priceWarning) estimate.warnings.push(priceWarning);
  for (const w of extraWarnings) estimate.warnings.push(w);
  estimate.reasons.push(...primaryResolved.reasons);
  estimate.warnings.push(...primaryResolved.warnings);

  if (chosen.exceeded) {
    estimate.reasons.push(
      "Routing spend ceiling hit - used the free provider and widened the range.",
    );
  }

  const miles = effectiveDistance / 1609.344;
  const ytd = await ytdMiles(
    db,
    tenant,
    ukTaxYearStartUtc(realNowIso),
    realNowIso,
    vehicleInline?.kind,
  );
  const hmrc = hmrcAmapPence(miles, ytd, {
    kind: vehicleInline?.kind,
    passengers: body.passengers,
  });

  const alternatives = await Promise.all(
    (route.alternatives ?? []).map(async (alt) => {
      const rawAltHits = await detectChargeHits(c.env, db, alt.encodedPolyline);
      const altDuration = alt.durationSeconds * legFactor;
      const altDistance = alt.distanceMeters * legFactor;
      const altResolved = resolveRouteCharges({
        hits: roundTrip ? expandHitsForRoundTrip(rawAltHits) : rawAltHits,
        ...(vehicleInline ? { vehicle: vehicleInline } : {}),
        departsAt: tripDepartsAt,
        durationSeconds: altDuration,
      });
      const priced = estimateFor(altDistance, altDuration, altResolved.charges);
      return {
        id: alt.id,
        label: alt.label,
        distanceMeters: altDistance,
        durationSeconds: altDuration,
        ...(alt.durationTrafficSeconds !== undefined
          ? { durationTrafficSeconds: alt.durationTrafficSeconds * legFactor }
          : {}),
        encodedPolyline: alt.encodedPolyline,
        costPence: priced.cost.totalPence.point,
        totalPence: priced.cost.totalPence,
        energyPence: priced.cost.energyPence,
        chargesPence: priced.cost.chargesPence,
        charges: altResolved.charges,
        co2Kg: priced.co2Kg,
        energy: priced.energy,
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
      ...(hmrc.motorcycleMiles !== undefined ? { motorcycleMiles: hmrc.motorcycleMiles } : {}),
      ...(hmrc.passengerPence !== undefined ? { passengerPence: hmrc.passengerPence } : {}),
      crossedThreshold: hmrc.crossedThreshold,
    },
  };
  if (roundTrip) payload.roundTrip = true;
  if (route.routeLabel) payload.routeLabel = route.routeLabel;
  if (route.durationTrafficSeconds !== undefined) {
    payload.durationTrafficSeconds = route.durationTrafficSeconds * legFactor;
  }
  if (waypointPins.length > 0) payload.waypoints = waypointPins;
  const cheapestFill = await attachCheapestFill({
    env: c.env,
    db,
    propulsion,
    ...(fuelGrade ? { fuelGrade } : {}),
    encodedPolyline: route.encodedPolyline,
    ...(resolvedOriginCoords ? { origin: resolvedOriginCoords } : {}),
    ...(vehicleInline ? { vehicle: vehicleInline } : {}),
    ...(estimate.consumption.unit === "l/100km" ? { lPer100km: estimate.consumption.value } : {}),
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

function resolvePlace(input: z.infer<typeof placeInputSchema>): ResolvedPlace {
  if (typeof input !== "string") {
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
  return raw.trim().replace(/\/+$/, "");
}

function isAllowedMapsRedirectUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  return ALLOWED_MAPS_REDIRECT_HOSTS.has(url.hostname.toLowerCase());
}

export async function expandMapsShortUrl(
  env: Env,
  raw: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (isFixtureMode(env.BRIM_FIXTURES)) {
    const table = await loadFixture<{ redirects: Record<string, string> }>(
      "maps-short",
      env.BRIM_FIXTURES,
    );
    const key = canonicalMapsUrl(raw);
    return table.redirects[key] ?? table.redirects[raw.trim()] ?? null;
  }
  let current: URL;
  try {
    current = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!isAllowedMapsRedirectUrl(current)) return null;

  try {
    for (let hop = 0; hop < 3; hop++) {
      const res = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        const next = new URL(location, current);
        if (!isAllowedMapsRedirectUrl(next)) return null;
        current = next;
        if (parseMapsUrl(current.toString()).ok) {
          return current.toString();
        }
        continue;
      }
      return parseMapsUrl(current.toString()).ok ? current.toString() : null;
    }
    return parseMapsUrl(current.toString()).ok ? current.toString() : null;
  } catch {
    return null;
  }
}

export async function handleFromMapsUrl(c: BrimContext) {
  const body = mapsUrlBodySchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "invalid_request" }, 400);
  const { url, ...options } = body.data;
  let parsed = parseMapsUrl(url);
  if (!parsed.ok && isMapsShortUrl(url)) {
    const expanded = await expandMapsShortUrl(c.env, url);
    if (expanded) parsed = parseMapsUrl(expanded);
  }
  if (!parsed.ok) return c.json({ error: "invalid_maps_url", reason: parsed.reason }, 400);

  const extraWarnings: Warning[] = [];
  if (
    parsed.travelMode === "walk" ||
    parsed.travelMode === "bike" ||
    parsed.travelMode === "transit"
  ) {
    extraWarnings.push({
      code: "non-driving-maps-url",
      message: `That Maps link was set to ${parsed.travelMode} directions; estimated as a driving journey instead.`,
      severity: "info",
    });
  }

  return estimateFromBody(
    c,
    {
      ...options,
      origin: parsed.origin,
      destination: parsed.destination,
      ...(parsed.waypoints.length > 0 ? { waypoints: parsed.waypoints } : {}),
    },
    extraWarnings,
  );
}

export function cacheStats() {
  return { providerCalls };
}
