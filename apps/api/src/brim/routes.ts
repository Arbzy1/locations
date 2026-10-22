import type { Hono, MiddlewareHandler } from "hono";
import { isFixtureMode } from "@locations/brim/shared";
import type { Env } from "../env";
import { rateLimit } from "../rate-limit";
import { cacheStats, handleEstimate, handleFromMapsUrl } from "./estimate";
import { handlePlaceResolve, handlePlaceReverse, handlePlaces } from "./places";
import {
  createTariffHandler,
  createVehicleHandler,
  deleteVehicleHandler,
  listTariffsHandler,
  listVehiclesHandler,
  patchVehicleHandler,
} from "./vehicles";
import { handleVehiclesResolve } from "./vehicles-resolve";
import {
  getCatalogueHandler,
  listCatalogueHandler,
  listMakesHandler,
  listModelsHandler,
} from "./catalogue";
import {
  createFillUpHandler,
  deleteFillUpHandler,
  getCalibrationHandler,
  listFillUpsHandler,
} from "./fill-ups";
import { createPlaceHandler, deletePlaceHandler, listPlacesHandler, patchPlaceHandler } from "./places-saved";
import { getSettingsHandler, patchSettingsHandler } from "./settings";
import {
  deleteJourneyHandler,
  exportJourneysHandler,
  getJourneyHandler,
  journeySummaryHandler,
  listJourneysHandler,
  saveJourneyHandler,
} from "./journeys";
import { handleMetaPrices, handleStationsNear, handleStationsNearRoute } from "./stations";
import { handleMetaEvTariffs } from "./ev";
import { handleChargesForRoute, handleVehicleCompliance, handleZones } from "./charges";

type Variables = {
  user: { id: string; email: string; name: string; role: string } | null;
  tenant: string;
};

type BrimApp = Hono<{ Bindings: Env; Variables: Variables }>;
type BrimMiddleware = MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;

/** The demo tenant is shared by every visitor, so it can estimate but never save. */
const blockDemoWrites: BrimMiddleware = async (c, next) => {
  if (c.get("user")?.role === "demo") {
    return c.json({ error: "Demo accounts cannot save vehicles, places, or journeys" }, 403);
  }
  return next();
};

/** Per-tenant limit for routes that call paid routing, geocoding, or DVLA providers. */
function limitPerTenant(bucket: string, limit: number): BrimMiddleware {
  return async (c, next) => {
    const limited = rateLimit({ key: `brim:${bucket}:${c.get("tenant")}`, limit, windowMs: 60_000 });
    if (!limited.ok) {
      c.header("Retry-After", String(limited.retryAfterSec));
      return c.json({ error: "Too many requests. Try again later." }, 429);
    }
    return next();
  };
}

/**
 * Journey cost routes. Mounted after the `/api/*` session middleware, so every
 * handler has `user` and `tenant` set from the session.
 */
export function registerBrimRoutes(app: BrimApp) {
  const estimateLimit = limitPerTenant("estimate", 60);
  const placesLimit = limitPerTenant("places", 120);
  const lookupLimit = limitPerTenant("lookup", 20);

  app.get("/api/brim/status", (c) => {
    const fixtureMode = isFixtureMode(c.env.BRIM_FIXTURES);
    return c.json({
      status: "ok",
      fixtureMode,
      provider: fixtureMode ? "fixture" : "live",
      cache: cacheStats(),
    });
  });

  app.get("/api/brim/places", placesLimit, handlePlaces);
  app.post("/api/brim/places/resolve", placesLimit, handlePlaceResolve);
  app.post("/api/brim/places/reverse", placesLimit, handlePlaceReverse);
  app.post("/api/brim/estimate", estimateLimit, handleEstimate);
  app.post("/api/brim/estimate/from-maps-url", estimateLimit, handleFromMapsUrl);
  app.get("/api/brim/stations/near", handleStationsNear);
  app.get("/api/brim/stations/near-route", handleStationsNearRoute);
  app.post("/api/brim/stations/near-route", handleStationsNearRoute);
  app.get("/api/brim/meta/prices", handleMetaPrices);
  app.get("/api/brim/meta/ev-tariffs", handleMetaEvTariffs);
  app.get("/api/brim/zones", handleZones);
  app.get("/api/brim/charges/for-route", handleChargesForRoute);
  app.post("/api/brim/charges/for-route", handleChargesForRoute);

  app.get("/api/brim/vehicles/catalogue/makes", listMakesHandler);
  app.get("/api/brim/vehicles/catalogue/models", listModelsHandler);
  app.get("/api/brim/vehicles/catalogue", listCatalogueHandler);
  app.get("/api/brim/vehicles/catalogue/:id", getCatalogueHandler);
  app.post("/api/brim/vehicles/resolve", lookupLimit, handleVehiclesResolve);
  app.get("/api/brim/vehicles", listVehiclesHandler);
  app.post("/api/brim/vehicles", blockDemoWrites, createVehicleHandler);
  app.patch("/api/brim/vehicles/:id", blockDemoWrites, patchVehicleHandler);
  app.delete("/api/brim/vehicles/:id", blockDemoWrites, deleteVehicleHandler);
  app.get("/api/brim/vehicles/:id/compliance", handleVehicleCompliance);
  app.get("/api/brim/vehicles/:id/tariffs", listTariffsHandler);
  app.post("/api/brim/vehicles/:id/tariffs", blockDemoWrites, createTariffHandler);
  app.get("/api/brim/vehicles/:id/fill-ups", listFillUpsHandler);
  app.get("/api/brim/vehicles/:id/calibration", getCalibrationHandler);

  app.get("/api/brim/settings", getSettingsHandler);
  app.patch("/api/brim/settings", blockDemoWrites, patchSettingsHandler);
  app.get("/api/brim/saved-places", listPlacesHandler);
  app.post("/api/brim/saved-places", blockDemoWrites, createPlaceHandler);
  app.patch("/api/brim/saved-places/:id", blockDemoWrites, patchPlaceHandler);
  app.delete("/api/brim/saved-places/:id", blockDemoWrites, deletePlaceHandler);

  app.post("/api/brim/fill-ups", blockDemoWrites, createFillUpHandler);
  app.delete("/api/brim/fill-ups/:id", blockDemoWrites, deleteFillUpHandler);

  app.post("/api/brim/journeys", blockDemoWrites, saveJourneyHandler);
  app.get("/api/brim/journeys", listJourneysHandler);
  app.get("/api/brim/journeys/export", exportJourneysHandler);
  app.get("/api/brim/journeys/summary", journeySummaryHandler);
  app.get("/api/brim/journeys/:id", getJourneyHandler);
  app.delete("/api/brim/journeys/:id", blockDemoWrites, deleteJourneyHandler);
}
