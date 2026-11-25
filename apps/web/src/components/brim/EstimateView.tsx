import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { arrivalCopy, findPlaceByLabel } from "@locations/brim/shared";
import { PumpReadout } from "./PumpReadout";
import { fadeMotion, enterMotion, revealMotion, staggerChildren } from "../../lib/motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { Form, FormItem } from "../ui/form";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { toast } from "sonner";
import { api, asList } from "../../lib/brim/api";
import { reversePlace } from "../../lib/brim/places-client";
import {
  composeEstimateRequest,
  composeVehicleInline,
} from "../../lib/brim/estimate/compose-request";
import { formatEstimateMoney } from "../../lib/brim/estimate/readout";
import {
  euroFromVes,
  savedPlaceChipLabel,
  vehicleChipLabel,
} from "../../lib/brim/estimate/vehicle-label";
import {
  formatBrimConsumption,
  formatBrimDetourKm,
  formatBrimDistance,
  formatBrimDuration,
} from "../../lib/brim/units";
import type { VesSummary } from "./RegLookup";
import { type CatalogueVehicle } from "./VehicleCatalogue";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useSession } from "../../lib/auth";
import { useUnits } from "../../lib/units";
import { readLastEstimate, writeLastEstimate } from "../../lib/brim/estimate/last-estimate";
import { FuelPlay, type FuelPlayReport } from "./estimate/FuelPlay";
import { PinHud } from "./estimate/PinHud";
import { TripComposer } from "./estimate/TripComposer";
import { seedFuelPlay, type PlayFuelSuccess } from "@locations/brim/engine/what-if";
import type {
  EvNetworkRow,
  FocusStop,
  FuelGrade,
  Health,
  MapBias,
  Place,
  Propulsion,
  SavedPlace,
  Vehicle,
  VehicleKind,
  ViaDraft,
} from "../../lib/brim/estimate/types";

const RouteMap = lazy(() => import("./RouteMap"));
const VehicleSheet = lazy(() =>
  import("./estimate/VehicleSheet").then((mod) => ({ default: mod.VehicleSheet })),
);

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

type Tariff = {
  id: string;
  kind?: "home" | "public";
  pence_per_kwh: number;
  is_default: boolean;
  offpeak_pence?: number;
  offpeak_window?: string;
  network?: string;
};

type ChargeLine = {
  id: string;
  kind: "toll" | "zone_charge" | "restriction";
  name: string;
  pence: number;
  operatorUrl?: string;
  note?: string;
};

type EnergyShape = {
  litres?: { point: number; low?: number; high?: number };
  kwh?: { battery: number; grid: number; low?: number; high?: number };
  arrivalStateOfCharge?: {
    percent: number;
    verdict: "comfortable" | "tight" | "insufficient";
    shortfallKwh?: number;
  };
};

type EstimateAlternative = {
  id: string;
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  durationTrafficSeconds?: number;
  encodedPolyline: string;
  costPence: number;
  totalPence?: { point: number; low: number; high: number };
  energyPence?: { point: number; low?: number; high?: number };
  chargesPence?: number;
  charges?: ChargeLine[];
  co2Kg?: number;
  energy?: EnergyShape;
};

type Estimate = {
  cost: {
    totalPence: { point: number; low: number; high: number };
    energyPence: { point: number; low?: number; high?: number };
    chargesPence: number;
  };
  consumption: { label: string; display: string; value?: number; unit?: string };
  reasons: string[];
  warnings: Array<{ code?: string; message: string; severity?: "info" | "warning" | "blocking" }>;
  energy: EnergyShape;
  co2Kg?: number;
  hmrc?: {
    approvedPence: number;
    deltaPence?: number;
    ytdMiles: number;
    passengerPence?: number;
    crossedThreshold: boolean;
  };
  distanceMeters: number;
  durationSeconds: number;
  charges: ChargeLine[];
  encodedPolyline?: string;
  origin?: Place;
  destination?: Place;
  waypoints?: Place[];
  roundTrip?: boolean;
  routeLabel?: string;
  durationTrafficSeconds?: number;
  price?: {
    pence: number;
    unit: "ppl" | "p/kWh";
    source: string;
    stationId?: string;
    observedAt: string;
  };
  cheapestFill?: {
    litresToFill: number;
    baseline: { source: string; label: string };
    stations: Array<{
      stationId: string;
      name: string;
      lat: number;
      lng: number;
      pence: number;
      observedAt: string;
      detourKm: number;
      savingPence: number;
      brand?: string;
      openingHours?: string;
    }>;
  };
  alternatives?: EstimateAlternative[];
};

type ZoneOverlayRow = {
  id: string;
  name: string;
  kind?: string;
  geojson: unknown;
};

const toLocalDatetimeInput = (date: Date): string => {
  const copy = new Date(date.getTime());
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 16);
};

const nowLocal = () => toLocalDatetimeInput(new Date());

function formatRouteLabel(raw: string | undefined): string | null {
  if (!raw) return null;
  if (raw === "DEFAULT_ROUTE") return "Fastest route";
  if (raw === "DEFAULT_ROUTE_ALTERNATE") return "Alternative route";
  if (raw === "FUEL_EFFICIENT") return "Fuel-efficient route";
  return raw;
}

function priceSourceLabel(source: string): string {
  if (source === "national-median") return "National median";
  if (source === "home-area-median") return "Near your start";
  if (source === "cheapest-on-route") return "Cheapest fill on this route";
  if (source === "user-picked-station") return "Selected forecourt";
  if (source === "hardcoded-fallback") return "Price data unavailable";
  if (source === "user-tariff") return "Your tariff";
  if (source === "network-table") return "Public network table";
  return source;
}

function formatObservedAt(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "updated just now";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "updated just now";
  if (min < 60) return `updated ${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 36) return `updated ${hr} h ago`;
  return `updated ${Math.round(hr / 24)} d ago`;
}

type NearbyStation = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  brand?: string;
  pence?: number;
};

export function EstimateView() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const isDemo = (session?.user as { role?: string } | undefined)?.role === "demo";
  const { unit } = useUnits();
  const reduce = useReducedMotion();
  const { isDesktop: wide, isTablet } = useBreakpoint();

  const [health, setHealth] = useState<Health | null>(null);
  const [origin, setOrigin] = useState("Crawley");
  const [destination, setDestination] = useState("London");
  const [originPin, setOriginPin] = useState<Place | null>(() => findPlaceByLabel("Crawley") ?? null);
  const [destPin, setDestPin] = useState<Place | null>(() => findPlaceByLabel("London") ?? null);
  const [viaDrafts, setViaDrafts] = useState<ViaDraft[]>([]);
  const [focusStop, setFocusStop] = useState<FocusStop>("origin");
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>();
  const [propulsion, setPropulsion] = useState<Propulsion>("petrol");
  const [fuelGrade, setFuelGrade] = useState<FuelGrade>("E10");
  const [roundTrip, setRoundTrip] = useState(false);
  const [passengers, setPassengers] = useState("0");
  const [vehicleKind, setVehicleKind] = useState<VehicleKind>("car");
  const [vehicleYear, setVehicleYear] = useState("");
  const [euroStatus, setEuroStatus] = useState("");
  const [euroFromDvla, setEuroFromDvla] = useState(false);
  const [catalogue, setCatalogue] = useState<CatalogueVehicle | null>(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [resolvedVrm, setResolvedVrm] = useState<string | undefined>();
  const [mpg, setMpg] = useState("40");
  const [tank, setTank] = useState("55");
  const [miKwh, setMiKwh] = useState("3.8");
  const [overrideMpg, setOverrideMpg] = useState("");
  const [overrideMiKwh, setOverrideMiKwh] = useState("");
  const [battery, setBattery] = useState("64");
  const [start, setStart] = useState("80");
  const [departsAt, setDepartsAt] = useState(nowLocal);
  const [maps, setMaps] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<"maps" | "trip" | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [estimateRevealCount, setEstimateRevealCount] = useState(0);
  const savedTimer = useRef(0);
  const restoredForUser = useRef<string | null>(null);
  const [savedLabel, setSavedLabel] = useState<"vehicle" | "journey" | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("inline");
  const [homePence, setHomePence] = useState("7.5");
  const [publicPence, setPublicPence] = useState("65");
  const [offpeakPence, setOffpeakPence] = useState("");
  const [offpeakWindow, setOffpeakWindow] = useState("");
  const [chargingLocation, setChargingLocation] = useState<"home" | "public">("home");
  const [networkId, setNetworkId] = useState("");
  const [evNetworks, setEvNetworks] = useState<EvNetworkRow[]>([]);
  const [nationalMedians, setNationalMedians] = useState<Record<string, number>>({});
  const [zoneOverlays, setZoneOverlays] = useState<ZoneOverlayRow[]>([]);
  const [hasHeatPump, setHasHeatPump] = useState(false);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [fillOpen, setFillOpen] = useState(false);
  const [fillOdo, setFillOdo] = useState("");
  const [fillQty, setFillQty] = useState("");
  const [fillUnit, setFillUnit] = useState<"litres" | "kwh">("litres");
  const [fillPrice, setFillPrice] = useState("");
  const [fillBrim, setFillBrim] = useState(true);
  const [fillWhen, setFillWhen] = useState("");
  const [fillStationId, setFillStationId] = useState("none");
  const [stale, setStale] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [carOpen, setCarOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(true);
  const [pinArmed, setPinArmed] = useState(true);
  const [recents, setRecents] = useState<Place[]>([]);
  const [mapBias, setMapBias] = useState<MapBias | undefined>();
  const [resultOpen, setResultOpen] = useState(false);
  const [showAllForecourts, setShowAllForecourts] = useState(false);
  const [play, setPlay] = useState<PlayFuelSuccess | null>(null);
  const [playEngaged, setPlayEngaged] = useState(false);
  const [externalPriceOverride, setExternalPriceOverride] = useState<number | undefined>();
  const [externalPriceSeq, setExternalPriceSeq] = useState(0);
  const onPlayReport = useCallback((report: FuelPlayReport) => {
    setPlay(report.result);
    setPlayEngaged(report.engaged);
  }, []);
  const [stationId, setStationId] = useState<string | undefined>();
  const [priceStrategy, setPriceStrategy] = useState<string | undefined>();
  const [nearbyStations, setNearbyStations] = useState<NearbyStation[]>([]);
  const estimateTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(estimateTimer.current), []);

  const garage = asList(vehicles);
  const selectedVehicle = garage.find((v) => v.id === vehicleId);
  const effectivePropulsion: Propulsion =
    vehicleId !== "inline" && selectedVehicle
      ? ((selectedVehicle.propulsion as Propulsion) || propulsion)
      : propulsion;
  const savedElectric =
    selectedVehicle?.propulsion === "bev" || selectedVehicle?.propulsion === "phev";
  const savedBev = selectedVehicle?.propulsion === "bev";
  const savedPhev = selectedVehicle?.propulsion === "phev";
  const electricTrip =
    effectivePropulsion === "bev" || effectivePropulsion === "phev" || savedElectric;

  // Keep fuelGrade compatible whenever effectivePropulsion changes between diesel and petrol/hybrid/phev
  useEffect(() => {
    if (effectivePropulsion === "diesel") {
      setFuelGrade((cur) => (cur === "B7" || cur === "SDV" ? cur : "B7"));
    } else if (effectivePropulsion !== "bev") {
      setFuelGrade((cur) => (cur === "E10" || cur === "E5" || cur === "LPG" ? cur : "E10"));
    }
  }, [effectivePropulsion]);

  useEffect(() => {
    if (!electricTrip) return;
    setPlay(null);
    setPlayEngaged(false);
  }, [electricTrip]);

  const fillStations = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const s of nearbyStations ?? []) {
      byId.set(s.id, { id: s.id, name: s.brand ? `${s.brand} · ${s.name}` : s.name });
    }
    for (const s of estimate?.cheapestFill?.stations ?? []) {
      byId.set(s.stationId, {
        id: s.stationId,
        name: s.brand ? `${s.brand} · ${s.name}` : s.name,
      });
    }
    return [...byId.values()];
  }, [nearbyStations, estimate?.cheapestFill]);

  useEffect(() => {
    if (!fillOpen) return;
    setFillUnit(savedBev ? "kwh" : "litres");
    setFillStationId(stationId && fillStations.some((s) => s.id === stationId) ? stationId : "none");
  }, [fillOpen, savedBev, stationId, fillStations]);

  const selectSavedOrInlineVehicle = useCallback(
    (nextId: string) => {
      setVehicleId(nextId);
      if (nextId !== "inline") {
        const match = garage.find((v) => v.id === nextId);
        if (match?.propulsion) {
          setPropulsion(match.propulsion as Propulsion);
        }
      }
    },
    [garage],
  );

  const tripRef = useRef({
    origin,
    originPin,
    destination,
    destPin,
    viaDrafts,
    departsAt,
    roundTrip,
    passengers,
    effectivePropulsion,
    fuelGrade,
    vehicleId,
    savedElectric,
    electricTrip,
    homePence,
    publicPence,
    offpeakPence,
    offpeakWindow,
    chargingLocation,
    networkId,
    hasHeatPump,
    start,
    stationId,
    priceStrategy,
  });
  const runMapsRef = useRef<(url: string) => Promise<void>>(async () => undefined);
  useLayoutEffect(() => {
    tripRef.current = {
      origin,
      originPin,
      destination,
      destPin,
      viaDrafts,
      departsAt,
      roundTrip,
      passengers,
      effectivePropulsion,
      fuelGrade,
      vehicleId,
      savedElectric,
      electricTrip,
      homePence,
      publicPence,
      offpeakPence,
      offpeakWindow,
      chargingLocation,
      networkId,
      hasHeatPump,
      start,
      stationId,
      priceStrategy,
    };
  });

  useEffect(() => {
    if (!savedElectric || vehicleId === "inline") return;
    void api<{ tariffs: Tariff[] }>(`/api/brim/vehicles/${vehicleId}/tariffs`)
      .then((r) => {
        const tariffs = asList(r.tariffs);
        const home =
          tariffs.find((t) => t.kind !== "public" && t.is_default) ??
          tariffs.find((t) => t.kind !== "public");
        if (home) {
          setHomePence(String(home.pence_per_kwh));
          setOffpeakPence(home.offpeak_pence !== undefined ? String(home.offpeak_pence) : "");
          setOffpeakWindow(home.offpeak_window ?? "");
        }
        const pub = tariffs.find((t) => t.kind === "public");
        if (pub) {
          setPublicPence(String(pub.pence_per_kwh));
        }
      })
      .catch(() => undefined);
    setHasHeatPump(selectedVehicle?.has_heat_pump === true);
  }, [savedElectric, vehicleId, selectedVehicle?.has_heat_pump]);

  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  useEffect(() => {
    void api<{ networks: EvNetworkRow[] }>("/api/brim/meta/ev-tariffs")
      .then((r) => setEvNetworks(asList(r.networks)))
      .catch(() => setEvNetworks([]));

    void api<{
      medians?: Record<string, { pence?: number }>;
      prices?: Record<string, { pence?: number }>;
    }>("/api/brim/meta/prices")
      .then((r) => {
        const src = r.medians ?? r.prices ?? {};
        const next: Record<string, number> = {};
        for (const [g, val] of Object.entries(src)) {
          if (val && typeof val.pence === "number" && Number.isFinite(val.pence)) {
            next[g] = val.pence;
          }
        }
        setNationalMedians(next);
      })
      .catch(() => undefined);

    void api<{
      zones?: Array<{ id: string; name: string; kind?: string; geometry?: unknown }>;
      tolls?: Array<{ id: string; name: string; kind?: string; geometry?: unknown }>;
    }>("/api/brim/zones?geometry=1")
      .then((r) => {
        const overlays: ZoneOverlayRow[] = [];
        for (const z of asList(r.zones)) {
          if (z.geometry) overlays.push({ id: z.id, name: z.name, kind: z.kind, geojson: z.geometry });
        }
        for (const t of asList(r.tolls)) {
          if (t.geometry) overlays.push({ id: t.id, name: t.name, kind: "toll", geojson: t.geometry });
        }
        setZoneOverlays(overlays);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!originPin || effectivePropulsion === "bev") {
      setNearbyStations([]);
      return;
    }
    void api<{
      stations: Array<{
        id: string;
        lat: number;
        lng: number;
        name: string;
        brand?: string;
        pence?: number;
      }>;
    }>(`/api/brim/stations/near?lat=${originPin.lat}&lng=${originPin.lng}&grade=${fuelGrade}`)
      .then((r) => setNearbyStations(asList(r.stations)))
      .catch(() => setNearbyStations([]));
  }, [originPin, effectivePropulsion, fuelGrade]);

  // Restore last estimate once userId resolves, unless URL already specifies ?journey= or ?url=
  useEffect(() => {
    if (!userId || restoredForUser.current === userId) return;
    restoredForUser.current = userId;
    const params = new URLSearchParams(window.location.search);
    if (params.get("journey") || params.get("url") || params.get("text")) return;
    const parsed = readLastEstimate<Estimate>(userId);
    if (!parsed) return;
    setEstimate(parsed);
    setStale(true);
    if (parsed.origin) {
      setOrigin(parsed.origin.label);
      setOriginPin(parsed.origin);
    }
    if (parsed.destination) {
      setDestination(parsed.destination.label);
      setDestPin(parsed.destination);
    }
    if (parsed.waypoints) {
      setViaDrafts(
        parsed.waypoints.map((w) => ({ id: `${w.lat},${w.lng}`, text: w.label, pin: w })),
      );
    }
    if (parsed.roundTrip) setRoundTrip(true);
    setSelectedRouteId(parsed.alternatives?.[0]?.id);
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setComposerOpen(false);
    }
  }, [userId]);

  useEffect(() => {
    void api<Health>("/api/brim/status")
      .then(setHealth)
      .catch(() => setHealth(null));
    void api<{ vehicles: Vehicle[] }>("/api/brim/vehicles")
      .then((r) => {
        const cars = asList(r.vehicles);
        setVehicles(cars);
        if (new URLSearchParams(window.location.search).get("journey")) return;
        const def = cars.find((v) => v.is_default) ?? cars[0];
        if (def) {
          setVehicleId(def.id);
          if (def.propulsion) setPropulsion(def.propulsion as Propulsion);
        }
      })
      .catch(() => undefined);
    void api<{ places: SavedPlace[] }>("/api/brim/saved-places")
      .then((r) => setPlaces(asList(r.places)))
      .catch(() => undefined);

    const params = new URLSearchParams(window.location.search);
    const shared = params.get("url") ?? params.get("text");
    if (shared) {
      setMaps(shared);
      void runMapsRef.current(shared);
    }
    const journeyId = params.get("journey");
    if (journeyId) {
      void api<{
        origin: string;
        destination: string;
        vehicleId?: string;
        originPin?: Place;
        destinationPin?: Place;
        waypoints?: Place[];
        departsAt?: string;
        roundTrip?: boolean;
        estimate?: Estimate;
      }>(`/api/brim/journeys/${journeyId}`)
        .then((j) => {
          setOrigin(j.originPin?.label ?? j.origin);
          setDestination(j.destinationPin?.label ?? j.destination);
          if (j.originPin) setOriginPin(j.originPin);
          if (j.destinationPin) setDestPin(j.destinationPin);
          if (j.waypoints && j.waypoints.length > 0) {
            setViaDrafts(
              j.waypoints.map((w) => ({ id: `${w.lat},${w.lng}`, text: w.label, pin: w })),
            );
          }
          if (j.departsAt) {
            const ms = Date.parse(j.departsAt);
            if (Number.isFinite(ms)) setDepartsAt(toLocalDatetimeInput(new Date(ms)));
          }
          setRoundTrip(Boolean(j.roundTrip));
          if (j.vehicleId) setVehicleId(j.vehicleId);
          if (j.estimate) {
            setEstimate(j.estimate);
            setStale(true);
            setSelectedRouteId(j.estimate.alternatives?.[0]?.id);
          }
        })
        .catch(() => undefined);
    }
  }, []);

  function applyEstimate(json: Estimate, collapse = false) {
    setEstimate(json);
    setEstimateRevealCount((c) => c + 1);
    setStale(false);
    setShowAllForecourts(false);
    writeLastEstimate(userId, json);
    if (json.origin) {
      setOrigin(json.origin.label);
      setOriginPin(json.origin);
    }
    if (json.destination) {
      setDestination(json.destination.label);
      setDestPin(json.destination);
    }
    if (json.waypoints) {
      setViaDrafts(
        json.waypoints.map((w) => ({ id: `${w.lat},${w.lng}`, text: w.label, pin: w })),
      );
    }
    setSelectedRouteId(json.alternatives?.[0]?.id);
    if (collapse) setComposerOpen(false);
  }

  async function runEstimate(body: unknown, collapse = false) {
    setLoading(true);
    setError(null);
    setErrorSource(null);
    try {
      applyEstimate(
        await api<Estimate>("/api/brim/estimate", { method: "POST", body: JSON.stringify(body) }),
        collapse,
      );
    } catch (err) {
      setErrorSource("trip");
      setError(
        err instanceof Error ? err.message : "Could not estimate. Check the places and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function vehicleInline() {
    return composeVehicleInline({
      propulsion: effectivePropulsion,
      vehicleKind,
      vehicleYear,
      euroStatus,
      euroFromDvla,
      catalogue,
      mpg,
      miKwh,
      overrideMpg,
      overrideMiKwh,
      tank,
      battery,
      start,
      hasHeatPump,
    });
  }

  function buildEstimateBody() {
    const trip = tripRef.current;
    const pax = Number(trip.passengers);
    return composeEstimateRequest({
      origin: trip.origin,
      originPin: trip.originPin,
      destination: trip.destination,
      destPin: trip.destPin,
      viaDrafts: trip.viaDrafts,
      departsAt: trip.departsAt,
      roundTrip: trip.roundTrip,
      passengers: Number.isFinite(pax) && pax > 0 ? pax : undefined,
      propulsion: trip.effectivePropulsion,
      fuelGrade: trip.fuelGrade,
      vehicleId: trip.vehicleId,
      stationId: trip.stationId,
      priceStrategy: trip.priceStrategy,
      electricTrip: trip.electricTrip,
      chargingLocation: trip.chargingLocation,
      hasHeatPump: trip.hasHeatPump,
      start: trip.start,
      homePence: trip.homePence,
      publicPence: trip.publicPence,
      networkId: trip.networkId,
      offpeakPence: trip.offpeakPence,
      offpeakWindow: trip.offpeakWindow,
      evNetworks,
      vehicleInline: vehicleInline(),
    });
  }

  async function runMaps(url: string) {
    setLoading(true);
    setError(null);
    setErrorSource(null);
    try {
      const base = buildEstimateBody();
      delete base.origin;
      delete base.destination;
      delete base.waypoints;
      applyEstimate(
        await api<Estimate>("/api/brim/estimate/from-maps-url", {
          method: "POST",
          body: JSON.stringify({ ...base, url }),
        }),
        true,
      );
    } catch (err) {
      setErrorSource("maps");
      setError(
        err instanceof Error
          ? `${err.message}. Type the places instead.`
          : "That Maps link could not be read. Type the places instead.",
      );
    } finally {
      setLoading(false);
    }
  }
  useLayoutEffect(() => {
    runMapsRef.current = runMaps;
  });

  function rememberPlace(place: Place) {
    setRecents((prev) => {
      const next = [
        place,
        ...prev.filter(
          (p) => p.label !== place.label && (p.lat !== place.lat || p.lng !== place.lng),
        ),
      ];
      return next.slice(0, 5);
    });
  }

  function armPin(stop: FocusStop) {
    setFocusStop(stop);
    setPinArmed(true);
    setTripOpen(false);
  }

  async function namePin(lat: number, lng: number): Promise<Place> {
    try {
      const place = await reversePlace(lat, lng);
      setGeoError(null);
      return place;
    } catch {
      setGeoError("Could not name that street - type the address.");
      return { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng };
    }
  }

  function onMapClick(pin: { lat: number; lng: number }) {
    if (!pinArmed) return;
    void namePin(pin.lat, pin.lng).then((place) => {
      rememberPlace(place);
      if (focusStop === "origin" || !originPin) {
        setOriginPin(place);
        setOrigin(place.label);
        setFocusStop("destination");
        setPinArmed(true);
      } else if (typeof focusStop === "number") {
        setViaDrafts((drafts) =>
          drafts.map((d, i) => (i === focusStop ? { ...d, text: place.label, pin: place } : d)),
        );
      } else {
        setDestPin(place);
        setDestination(place.label);
      }
      scheduleEstimate();
    });
  }

  function onOriginDrag(pin: { lat: number; lng: number }) {
    void namePin(pin.lat, pin.lng).then((place) => {
      rememberPlace(place);
      setOriginPin(place);
      setOrigin(place.label);
      scheduleEstimate();
    });
  }

  function onDestinationDrag(pin: { lat: number; lng: number }) {
    void namePin(pin.lat, pin.lng).then((place) => {
      rememberPlace(place);
      setDestPin(place);
      setDestination(place.label);
      scheduleEstimate();
    });
  }

  function onWaypointDrag(index: number, pin: { lat: number; lng: number }) {
    void namePin(pin.lat, pin.lng).then((place) => {
      rememberPlace(place);
      setViaDrafts((drafts) =>
        drafts.map((d, i) => (i === index ? { ...d, text: place.label, pin: place } : d)),
      );
      scheduleEstimate();
    });
  }

  function useMyLocation() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("This browser cannot share a location - type a place or tap the map.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void namePin(pos.coords.latitude, pos.coords.longitude).then((place) => {
          rememberPlace(place);
          setOriginPin(place);
          setOrigin(place.label);
          setFocusStop("destination");
          setPinArmed(true);
          scheduleEstimate();
        });
      },
      () => {
        setGeoError("Location was blocked - type a place or tap the map.");
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  function scheduleEstimate() {
    setStale(true);
    window.clearTimeout(estimateTimer.current);
    estimateTimer.current = window.setTimeout(() => {
      const trip = tripRef.current;
      if (!trip.origin.trim() || !trip.destination.trim()) return;
      void runEstimate(buildEstimateBody());
    }, 400);
  }

  function applyAlternative(id: string) {
    if (!estimate?.alternatives) return;
    const alt = estimate.alternatives.find((a) => a.id === id);
    if (!alt) return;
    setSelectedRouteId(id);
    setEstimate({
      ...estimate,
      encodedPolyline: alt.encodedPolyline,
      distanceMeters: alt.distanceMeters,
      durationSeconds: alt.durationSeconds,
      ...(alt.durationTrafficSeconds !== undefined
        ? { durationTrafficSeconds: alt.durationTrafficSeconds }
        : {}),
      routeLabel: alt.label,
      cost: {
        totalPence: alt.totalPence ?? {
          ...estimate.cost.totalPence,
          point: alt.costPence,
        },
        energyPence: alt.energyPence ?? estimate.cost.energyPence,
        chargesPence: alt.chargesPence ?? estimate.cost.chargesPence,
      },
      ...(alt.charges ? { charges: alt.charges } : {}),
      ...(alt.co2Kg !== undefined ? { co2Kg: alt.co2Kg } : {}),
      ...(alt.energy ? { energy: alt.energy } : {}),
    });
  }

  function pickForecourt(
    pickedId: string,
    strategy: string | undefined,
    observedPence?: number,
  ) {
    setStationId(pickedId);
    setPriceStrategy(strategy);
    tripRef.current = { ...tripRef.current, stationId: pickedId, priceStrategy: strategy };
    if (observedPence !== undefined && Number.isFinite(observedPence)) {
      setExternalPriceOverride(observedPence);
      setExternalPriceSeq((seq) => seq + 1);
    }
    scheduleEstimate();
  }

  function onPickCar(next: CatalogueVehicle | null) {
    setCatalogue(next);
    if (next) setPropulsion(next.propulsion);
    setOverrideMpg("");
    setOverrideMiKwh("");
  }

  function applyVes(ves: VesSummary, vrm: string) {
    setResolvedVrm(vrm);
    if (ves.year !== undefined) setVehicleYear(String(ves.year));
    const euro = euroFromVes(ves.euroStatus);
    if (euro) {
      setEuroStatus(euro);
      setEuroFromDvla(true);
    }
    setPropulsion(ves.propulsion);
  }

  function onPickFromReg(vehicle: CatalogueVehicle, vrm: string, ves: VesSummary) {
    onPickCar(vehicle);
    applyVes(ves, vrm);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runEstimate(buildEstimateBody(), true);
  }

  function flashSaved(kind: "vehicle" | "journey") {
    window.clearTimeout(savedTimer.current);
    setSavedLabel(kind);
    savedTimer.current = window.setTimeout(() => setSavedLabel(null), 1200);
  }

  async function saveVehicle() {
    if (isDemo) return;
    try {
      const created = await api<{ vrmStored?: boolean }>("/api/brim/vehicles", {
        method: "POST",
        body: JSON.stringify({
          nickname: catalogue ? `${catalogue.make} ${catalogue.model}` : `${effectivePropulsion} ${vehicleKind}`,
          ...vehicleInline(),
          ...(resolvedVrm ? { vrm: resolvedVrm } : {}),
        }),
      });
      const list = await api<{ vehicles: Vehicle[] }>("/api/brim/vehicles");
      setVehicles(asList(list.vehicles));
      flashSaved("vehicle");
      if (resolvedVrm && created.vrmStored === false) {
        toast("Car saved to your garage (registration plate not stored: encryption key unset).");
      } else {
        toast("Car saved to your garage.");
      }
    } catch (err) {
      toast.error(errorMessage(err, "Could not save this car."));
    }
  }

  async function saveJourney() {
    if (!estimate || isDemo) return;
    try {
      const departsMs = Date.parse(departsAt);
      const departsIso = Number.isFinite(departsMs)
        ? new Date(departsMs).toISOString()
        : new Date().toISOString();
      await api("/api/brim/journeys", {
        method: "POST",
        body: JSON.stringify({
          origin,
          destination,
          vehicleId: vehicleId === "inline" ? undefined : vehicleId,
          ...(estimate.encodedPolyline ? { polyline: estimate.encodedPolyline } : {}),
          estimate,
          departsAt: departsIso,
        }),
      });
      flashSaved("journey");
      toast("Journey stored as a snapshot.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save this journey."));
    }
  }

  const money = estimate ? formatEstimateMoney(estimate.cost.totalPence) : { pounds: 0, band: "" };
  const fuelName = effectivePropulsion === "diesel" ? "diesel" : "petrol";
  const playOk = !electricTrip && play ? play : null;
  const pounds = playOk ? playOk.totalPence / 100 : money.pounds;
  const band = playOk
    ? playEngaged
      ? playOk.chargesPence > 0
        ? `£${(playOk.fuelPence / 100).toFixed(2)} ${fuelName} + £${(playOk.chargesPence / 100).toFixed(2)} charges`
        : `£${(playOk.fuelPence / 100).toFixed(2)} of ${fuelName}`
      : money.band
    : money.band;
  const hmrc = useMemo(() => {
    if (!estimate?.hmrc) return null;
    const allow = `HMRC would allow £${(estimate.hmrc.approvedPence / 100).toFixed(2)} (${estimate.hmrc.ytdMiles.toFixed(0)} miles this tax year).`;
    if (estimate.hmrc.deltaPence === undefined) return allow;
    const abs = (Math.abs(estimate.hmrc.deltaPence) / 100).toFixed(2);
    const delta =
      estimate.hmrc.deltaPence > 0
        ? `This trip is £${abs} over the allowance.`
        : estimate.hmrc.deltaPence < 0
          ? `This trip is £${abs} under the allowance.`
          : "This trip is in line with the allowance.";
    return `${allow} ${delta}`;
  }, [estimate]);

  const viaPins = viaDrafts.map((v) => v.pin).filter((p): p is Place => Boolean(p));
  const mapOverlays = useMemo(() => {
    const byId = new Map<string, NearbyStation>();
    for (const s of nearbyStations ?? []) byId.set(s.id, s);
    for (const s of estimate?.cheapestFill?.stations ?? []) {
      byId.set(s.stationId, {
        id: s.stationId,
        lat: s.lat,
        lng: s.lng,
        name: s.name,
        pence: s.pence,
        ...(s.brand ? { brand: s.brand } : {}),
      });
    }
    const stations = [...byId.values()];
    if (stations.length === 0 && zoneOverlays.length === 0) return undefined;
    return {
      ...(stations.length > 0
        ? {
            stations: stations.map((s) => ({
              id: s.id,
              lat: s.lat,
              lng: s.lng,
              label: s.brand ? `${s.brand} · ${s.name}` : s.name,
            })),
          }
        : {}),
      ...(stationId ? { selectedStationId: stationId } : {}),
      ...(zoneOverlays.length > 0 ? { zones: zoneOverlays } : {}),
    };
  }, [nearbyStations, estimate?.cheapestFill, stationId, zoneOverlays]);

  const mapProps = {
    onMapClick,
    onOriginDrag,
    onDestinationDrag,
    onWaypointDrag,
    onSelectAlternative: applyAlternative,
    reduceMotion: Boolean(reduce),
    ...(originPin ? { origin: originPin } : {}),
    ...(destPin ? { destination: destPin } : {}),
    ...(viaPins.length > 0 ? { waypoints: viaPins } : {}),
    ...(estimate?.encodedPolyline ? { encodedPolyline: estimate.encodedPolyline } : {}),
    ...(estimate?.alternatives
      ? {
          alternatives: estimate.alternatives.map((a) => ({
            id: a.id,
            encodedPolyline: a.encodedPolyline,
          })),
        }
      : {}),
    ...(selectedRouteId ? { selectedRouteId } : {}),
    onSelectStation: (id: string) => {
      const fromCheapest = estimate?.cheapestFill?.stations.find((s) => s.stationId === id);
      const fromNearby = nearbyStations.find((s) => s.id === id);
      pickForecourt(id, undefined, fromCheapest?.pence ?? fromNearby?.pence);
    },
    ...(mapOverlays ? { overlays: mapOverlays } : {}),
    pinArmed,
    onViewChange: (center: { lat: number; lng: number }) => setMapBias(center),
  };

  const originDescribedBy = [
    geoError ? "geo-error" : "",
    errorSource === "trip" && error ? "trip-error" : "",
  ]
    .filter((id) => id.length > 0)
    .join(" ");
  const destDescribedBy = errorSource === "trip" && error ? "trip-error" : "";
  const bias = mapBias ?? (originPin ? { lat: originPin.lat, lng: originPin.lng } : undefined);
  const carLabel = vehicleChipLabel({
    vehicleId,
    ...(selectedVehicle ? { selected: selectedVehicle } : {}),
    catalogue,
    propulsion: effectivePropulsion,
    vehicleKind,
  });

  function applySaved(stop: FocusStop, place: Place) {
    rememberPlace(place);
    if (stop === "origin") {
      setOrigin(place.label);
      setOriginPin(place);
      setFocusStop("destination");
      setPinArmed(true);
    } else if (typeof stop === "number") {
      setViaDrafts((drafts) =>
        drafts.map((d, i) => (i === stop ? { ...d, text: place.label, pin: place } : d)),
      );
    } else {
      setDestination(place.label);
      setDestPin(place);
    }
    scheduleEstimate();
  }

  function shortcutButtons(stop: FocusStop) {
    const chips: ReactNode[] = [];
    if (stop === "origin") {
      chips.push(
        <Button
          title="Use my current location"
          key="loc"
          type="button"
          variant="outline"
          size="sm"
          onClick={useMyLocation}
        >
          My location
        </Button>,
      );
    }
    for (const p of places) {
      chips.push(
        <Button
          title={`Use ${p.label}`}
          key={`${stop}-${p.id}`}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applySaved(stop, { label: p.label, lat: p.lat, lng: p.lng })}
        >
          {savedPlaceChipLabel(p.kind, p.label)}
        </Button>,
      );
    }
    for (const p of recents) {
      if (places.some((s) => s.label === p.label)) continue;
      if (stop === "origin" && originPin?.label === p.label) continue;
      if (stop === "destination" && destPin?.label === p.label) continue;
      chips.push(
        <Button
          title={`Use ${p.label}`}
          key={`${stop}-recent-${p.label}`}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applySaved(stop, p)}
        >
          {p.label.split(",")[0] ?? p.label}
        </Button>,
      );
    }
    return chips;
  }

  const composer = (
    <TripComposer
      collapsed={Boolean(wide && estimate && !composerOpen)}
      onExpand={() => setComposerOpen(true)}
      health={health}
      stale={stale}
      maps={maps}
      setMaps={setMaps}
      mapsInvalid={errorSource === "maps" && Boolean(error)}
      onMapsSubmit={() => void runMaps(maps)}
      origin={origin}
      destination={destination}
      originPin={originPin}
      destPin={destPin}
      viaDrafts={viaDrafts}
      focusStop={focusStop}
      pinArmed={pinArmed}
      onArmPin={armPin}
      onFocusStop={(stop) => setFocusStop(stop)}
      onOriginChange={(text) => {
        setOrigin(text);
        if (originPin && text !== originPin.label) setOriginPin(null);
      }}
      onOriginSelect={(place) => {
        rememberPlace(place);
        setOrigin(place.label);
        setOriginPin(place);
        setFocusStop("destination");
        setPinArmed(true);
        scheduleEstimate();
      }}
      onOriginClear={() => {
        setOrigin("");
        setOriginPin(null);
      }}
      onDestinationChange={(text) => {
        setDestination(text);
        if (destPin && text !== destPin.label) setDestPin(null);
      }}
      onDestinationSelect={(place) => {
        rememberPlace(place);
        setDestination(place.label);
        setDestPin(place);
        scheduleEstimate();
      }}
      onDestinationClear={() => {
        setDestination("");
        setDestPin(null);
      }}
      onViaChange={(index, text) =>
        setViaDrafts((drafts) =>
          drafts.map((d, i) =>
            i === index ? { ...d, text, pin: d.pin && text === d.pin.label ? d.pin : null } : d,
          ),
        )
      }
      onViaSelect={(index, place) => {
        rememberPlace(place);
        setViaDrafts((drafts) =>
          drafts.map((d, i) => (i === index ? { ...d, text: place.label, pin: place } : d)),
        );
        scheduleEstimate();
      }}
      onViaClear={(index) =>
        setViaDrafts((drafts) =>
          drafts.map((d, i) => (i === index ? { ...d, text: "", pin: null } : d)),
        )
      }
      onRemoveVia={(index) => {
        setViaDrafts((drafts) => drafts.filter((_, i) => i !== index));
        setFocusStop("destination");
        scheduleEstimate();
      }}
      onAddStop={() => {
        setViaDrafts((drafts) => [...drafts, { id: crypto.randomUUID(), text: "", pin: null }]);
        armPin(viaDrafts.length);
      }}
      departsAt={departsAt}
      setDepartsAt={(next) => {
        setDepartsAt(next);
        tripRef.current = { ...tripRef.current, departsAt: next };
        scheduleEstimate();
      }}
      onNow={() => {
        const now = nowLocal();
        setDepartsAt(now);
        tripRef.current = { ...tripRef.current, departsAt: now };
        scheduleEstimate();
      }}
      roundTrip={roundTrip}
      onRoundTripChange={(checked) => {
        setRoundTrip(checked);
        tripRef.current = { ...tripRef.current, roundTrip: checked };
        scheduleEstimate();
      }}
      passengers={passengers}
      onPassengersChange={(next) => {
        setPassengers(next);
        tripRef.current = { ...tripRef.current, passengers: next };
        scheduleEstimate();
      }}
      propulsion={effectivePropulsion}
      fuelGrade={fuelGrade}
      onFuelGradeChange={(next) => {
        setFuelGrade(next);
        setStationId(undefined);
        tripRef.current = { ...tripRef.current, fuelGrade: next, stationId: undefined };
        scheduleEstimate();
      }}
      loading={loading}
      onSubmit={onSubmit}
      geoError={geoError}
      originDescribedBy={originDescribedBy}
      destDescribedBy={destDescribedBy}
      tripInvalid={errorSource === "trip" && Boolean(error)}
      originShortcuts={shortcutButtons("origin")}
      destShortcuts={shortcutButtons("destination")}
      viaShortcuts={(index) => shortcutButtons(index)}
      vehicleLabel={carLabel}
      onOpenVehicle={() => setCarOpen(true)}
      {...(bias ? { bias } : {})}
    />
  );

  const fallbackPumpPrice =
    nationalMedians[fuelGrade] ?? (effectivePropulsion === "diesel" ? 145 : 140);

  const fuelSeed = useMemo(
    () =>
      seedFuelPlay({
        distanceMeters: estimate?.distanceMeters ?? 0,
        durationSeconds: estimate?.durationSeconds ?? 0,
        consumptionDisplay: estimate?.consumption.display,
        consumptionValue: estimate?.consumption.value,
        consumptionUnit: estimate?.consumption.unit,
        pricePence: estimate?.price?.pence,
        priceUnit: estimate?.price?.unit,
        fallbackMpg: Number(mpg) > 0 ? Number(mpg) : 40,
        fallbackPricePence: fallbackPumpPrice,
      }),
    [
      estimate?.distanceMeters,
      estimate?.durationSeconds,
      estimate?.consumption.display,
      estimate?.consumption.value,
      estimate?.consumption.unit,
      estimate?.price?.pence,
      estimate?.price?.unit,
      mpg,
      fallbackPumpPrice,
    ],
  );
  const fuelSeedKey = `${fuelSeed.mpg}|${fuelSeed.price}|${fuelSeed.speed}|${fuelSeed.referenceMph}|${estimate?.distanceMeters ?? 0}`;
  const showFuelPlay = !electricTrip && (wide || Boolean(estimate) || Boolean(error));
  const playSlot = showFuelPlay ? (
    <FuelPlay
      routeMeters={estimate?.distanceMeters ?? 0}
      seed={fuelSeed}
      seedKey={fuelSeedKey}
      chargesPence={estimate?.cost.chargesPence ?? 0}
      propulsion={effectivePropulsion === "diesel" ? "diesel" : "petrol"}
      externalPriceOverride={externalPriceOverride}
      externalPriceSeq={externalPriceSeq}
      {...(estimate?.price?.source === "hardcoded-fallback"
        ? {
            priceNote: `Live pump prices are not connected, so this starts at ${fallbackPumpPrice.toFixed(0)} p per litre. Type the price on the sign.`,
          }
        : {})}
      onReport={onPlayReport}
    />
  ) : null;

  const shouldStagger = Boolean(estimate) && estimateRevealCount <= 1 && !reduce;
  const showResultDetail = wide || resultOpen;
  const rankedStations = estimate?.cheapestFill?.stations ?? [];
  const visibleStations = showAllForecourts
    ? rankedStations.slice(0, 5)
    : rankedStations.slice(0, 3);
  const routeLabelFriendly = formatRouteLabel(estimate?.routeLabel);

  const result: ReactNode = estimate ? (
    <motion.section
      key="result"
      aria-live="polite"
      variants={staggerChildren}
      initial={shouldStagger ? "initial" : false}
      animate="animate"
      exit={reduce ? fadeMotion.exit : enterMotion.exit}
      transition={enterMotion.transition}
      className={
        wide
          ? "cq relative rounded-lg border border-border bg-surface p-4"
          : "cq relative bg-surface p-3"
      }
    >
      {loading ? <div className="absolute inset-0 z-10 bg-bg/40" aria-busy="true" /> : null}
      <motion.div variants={revealMotion}>
        <PumpReadout value={pounds} fractionDigits={playOk ? 2 : 0} />
      </motion.div>
      <motion.p variants={revealMotion} className="tabular-nums font-mono mt-2 text-text-muted">
        {band}
      </motion.p>

      <motion.div variants={revealMotion} className="mt-2 space-y-1 text-sm">
        <p className="tabular-nums font-mono text-text">
          {formatBrimDistance(estimate.distanceMeters, unit)}
          {" · "}
          {formatBrimDuration(estimate.durationTrafficSeconds ?? estimate.durationSeconds)}
          {estimate.durationTrafficSeconds !== undefined &&
          Math.abs(estimate.durationTrafficSeconds - estimate.durationSeconds) >= 60
            ? ` (with traffic, vs ${formatBrimDuration(estimate.durationSeconds)} typical)`
            : ""}
          {estimate.roundTrip ? " · Return" : ""}
        </p>
        {routeLabelFriendly ? (
          <p className="text-xs text-text-muted">{routeLabelFriendly}</p>
        ) : null}
        {estimate.energy.kwh || estimate.energy.litres ? (
          <p className="tabular-nums font-mono text-xs text-text-muted">
            {estimate.energy.kwh
              ? `${estimate.energy.kwh.battery.toFixed(1)} kWh battery (${estimate.energy.kwh.grid.toFixed(1)} kWh from grid)`
              : ""}
            {estimate.energy.kwh && estimate.energy.litres ? " + " : ""}
            {estimate.energy.litres
              ? `${estimate.energy.litres.point.toFixed(1)} L ${fuelName}`
              : ""}
          </p>
        ) : null}
      </motion.div>

      {estimate.alternatives && estimate.alternatives.length > 1 ? (
        <div className="mt-3 space-y-1.5" role="group" aria-label="Route alternatives">
          <p className="text-xs font-medium text-text-muted">Routes</p>
          <div className="grid gap-1.5">
            {estimate.alternatives.map((alt) => {
              const isSelected = (selectedRouteId ?? estimate.alternatives?.[0]?.id) === alt.id;
              const altPence = alt.totalPence?.point ?? alt.costPence;
              return (
                <Button
                  key={alt.id}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  title={`Select ${alt.label}`}
                  aria-pressed={isSelected}
                  onClick={() => applyAlternative(alt.id)}
                  className="h-auto min-h-11 w-full justify-between px-3 py-2 text-left"
                >
                  <span className="min-w-0 truncate text-xs">
                    <span className="block truncate font-medium">{alt.label}</span>
                    <span className="tabular-nums font-mono opacity-80">
                      {formatBrimDistance(alt.distanceMeters, unit)} ·{" "}
                      {formatBrimDuration(alt.durationTrafficSeconds ?? alt.durationSeconds)}
                    </span>
                  </span>
                  <span className="tabular-nums font-mono ml-2 shrink-0 text-sm font-semibold">
                    £{(altPence / 100).toFixed(2)}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      {playSlot}

      {estimate.warnings.map((w) => {
        const sev = w.severity ?? "warning";
        const cls =
          sev === "blocking"
            ? "mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-sm text-destructive"
            : sev === "info"
              ? "mt-2 text-sm text-text-muted"
              : "mt-2 text-sm text-train";
        return (
          <p key={`${w.code ?? ""}:${w.message}`} className={cls}>
            {w.message}
          </p>
        );
      })}

      {wide ? null : (
        <Button
          title={resultOpen ? "Hide breakdown" : "Show cost breakdown"}
          type="button"
          variant="outline"
          className="mt-3 w-full"
          aria-expanded={resultOpen}
          onClick={() => setResultOpen((open) => !open)}
        >
          {resultOpen ? "Hide breakdown" : "Breakdown"}
        </Button>
      )}
      {showResultDetail ? (
        <>
          {estimate.price ? (
            <p
              className={
                estimate.price.source === "hardcoded-fallback"
                  ? "mt-2 text-sm text-train"
                  : "mt-2 text-sm text-text-muted"
              }
            >
              <span className="tabular-nums font-mono">
                {estimate.price.pence.toFixed(1)} {estimate.price.unit}
              </span>
              {" · "}
              {priceSourceLabel(estimate.price.source)}
              {estimate.price.source !== "hardcoded-fallback"
                ? ` · ${formatObservedAt(estimate.price.observedAt)}`
                : null}
            </p>
          ) : null}
          {visibleStations.length > 0 && estimate.cheapestFill ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-text-muted">Cheapest corridor forecourts</p>
              {visibleStations.map((st) => {
                const activeStation = stationId === st.stationId;
                return (
                  <Button
                    key={st.stationId}
                    variant={activeStation ? "default" : "ghost"}
                    title={`Use price at ${st.name}`}
                    type="button"
                    className="h-auto min-h-11 w-full flex-col items-stretch rounded-lg border border-border p-3 text-left"
                    onClick={() => pickForecourt(st.stationId, "cheapest-on-route", st.pence)}
                  >
                    <p className="text-sm font-medium" title={st.name}>
                      {st.brand ? `${st.brand} · ${st.name}` : st.name}
                    </p>
                    <p className="tabular-nums font-mono text-sm">
                      {st.pence.toFixed(1)} ppl · {formatObservedAt(st.observedAt)}
                    </p>
                    <p className="tabular-nums font-mono mt-1 text-xs opacity-80">
                      {formatBrimDetourKm(st.detourKm, unit)} assumed detour · save £
                      {(st.savingPence / 100).toFixed(2)} vs {estimate.cheapestFill?.baseline.label}
                    </p>
                    {st.openingHours ? (
                      <p className="mt-1 text-xs opacity-80">{st.openingHours}</p>
                    ) : null}
                  </Button>
                );
              })}
              {rankedStations.length > 3 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title={showAllForecourts ? "Show fewer forecourts" : "Show more forecourts"}
                  onClick={() => setShowAllForecourts((v) => !v)}
                >
                  {showAllForecourts
                    ? "Show top 3"
                    : `Show ${Math.min(5, rankedStations.length)} forecourts`}
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge className="border-walk/40 bg-walk/10 text-walk">
              {estimate.consumption.label}
            </Badge>
            <span className="tabular-nums font-mono text-sm">
              {formatBrimConsumption(
                estimate.consumption.value,
                estimate.consumption.unit,
                unit,
                estimate.consumption.display,
              )}
            </span>
          </div>
          {estimate.energy.arrivalStateOfCharge ? (
            <p className="mt-2 text-sm">{arrivalCopy(estimate.energy.arrivalStateOfCharge)}</p>
          ) : null}
          {typeof estimate.co2Kg === "number" ? (
            <p className="tabular-nums font-mono mt-2 text-sm text-text-muted">
              About {estimate.co2Kg.toFixed(1)} kg CO₂
            </p>
          ) : null}
          {hmrc ? (
            <p className="tabular-nums font-mono mt-2 text-sm text-text-muted">{hmrc}</p>
          ) : null}
          <div>
            <Accordion type="single" collapsible className="mt-2">
              <AccordionItem value="reasons">
                <AccordionTrigger title="Show calculation assumptions and adjustments">
                  How we got there
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="list-disc space-y-1 pl-4">
                    {estimate.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          {estimate.charges.length > 0 ? (
            <ul className="mt-3 grid gap-2 text-sm">
              {estimate.charges.map((charge) => (
                <li
                  key={charge.id}
                  className="cq-stack flex flex-wrap items-baseline justify-between gap-2"
                  title={charge.name}
                >
                  <span>
                    {charge.name}
                    {charge.kind === "restriction" ? (
                      <span className="block text-train">
                        {charge.note ?? "Your vehicle cannot enter this zone."}
                      </span>
                    ) : null}
                  </span>
                  {charge.kind === "restriction" ? (
                    <span className="text-text-muted">No charge</span>
                  ) : (
                    <span className="tabular-nums font-mono">
                      £{(charge.pence / 100).toFixed(2)}
                    </span>
                  )}
                  {charge.operatorUrl ? (
                    <a
                      href={charge.operatorUrl}
                      className="basis-full text-sm underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Check with the operator
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-sm text-text-muted">
            This is an estimate. You remain responsible for paying or staying out. Cars, vans and
            motorcycles only; HGV, bus and taxi classes are not modelled.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {stale ? (
              <Button
                title="Re-run live estimate for this journey"
                type="button"
                onClick={() => void runEstimate(buildEstimateBody())}
              >
                Refresh live estimate
              </Button>
            ) : null}
            <Button
              title={
                isDemo
                  ? "Demo account cannot save cars"
                  : savedLabel === "vehicle"
                    ? "Saved"
                    : "Save this car"
              }
              type="button"
              variant="outline"
              disabled={isDemo}
              onClick={() => void saveVehicle()}
            >
              {savedLabel === "vehicle" ? "Saved" : "Save this car"}
            </Button>
            <Button
              title={
                isDemo
                  ? "Demo account cannot save journeys"
                  : savedLabel === "journey"
                    ? "Saved"
                    : "Save journey"
              }
              type="button"
              variant="outline"
              disabled={isDemo}
              onClick={() => void saveJourney()}
            >
              {savedLabel === "journey" ? "Saved" : "Save journey"}
            </Button>
            {vehicleId !== "inline" ? (
              <Button
                title={
                  isDemo
                    ? "Demo account cannot log fill-ups"
                    : savedBev
                      ? "Log a charge"
                      : "Log a fill-up"
                }
                type="button"
                variant="outline"
                disabled={isDemo}
                onClick={() => setFillOpen(true)}
              >
                {savedBev ? "Log a charge" : "Log a fill-up"}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </motion.section>
  ) : null;

  const resultSlot = (
    <div className={wide ? "relative min-h-[7rem]" : "relative min-h-[4.5rem]"}>
      <AnimatePresence initial={false}>
        {loading && !estimate ? (
          <motion.div key="skeleton" {...fadeMotion} aria-busy="true">
            <Card {...(wide ? {} : { className: "border-0 p-0" })}>
              <Skeleton className="mb-3 h-16 w-48" />
              <Skeleton className="h-4 w-24" />
            </Card>
          </motion.div>
        ) : null}
        {result}
      </AnimatePresence>
    </div>
  );

  const errorLine = error ? (
    <p
      id={errorSource === "maps" ? "maps-error" : "trip-error"}
      className={wide ? "mb-2 text-train" : "px-3 pt-2 text-train"}
      role="alert"
    >
      {error}
    </p>
  ) : null;

  return (
    <main className="relative mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <Suspense
            fallback={
              <div className="h-full min-h-40" aria-busy="true">
                <Skeleton className="h-full w-full" />
              </div>
            }
          >
            <RouteMap {...mapProps} />
          </Suspense>
        </div>

        {pinArmed ? <PinHud focusStop={focusStop} onCancel={() => setPinArmed(false)} /> : null}

        {wide ? (
          <aside className="absolute left-3 top-3 z-10 max-h-[calc(100%-1.5rem)] w-[min(22rem,calc(100%-1.5rem))] overflow-y-auto">
            <Card>{composer}</Card>
          </aside>
        ) : null}

        {wide ? (
          <div className="absolute right-3 top-3 z-10 max-h-[calc(100%-1.5rem)] w-[min(21rem,calc(100%-1.5rem))] overflow-y-auto">
            {errorLine}
            {resultSlot}
            {estimate ? null : playSlot}
          </div>
        ) : null}
      </div>

      {wide ? null : (
        <>
          {error || loading || estimate || showFuelPlay ? (
            <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-border bg-surface">
              {errorLine}
              {resultSlot}
              {estimate ? null : playSlot}
            </div>
          ) : null}
          <div className="shrink-0 border-t border-border bg-surface px-3 pb-3 pt-2">
            <div className="grid grid-cols-3 gap-1">
              <Button
                title="Set where the trip starts"
                type="button"
                variant="outline"
                className="min-w-0 flex-col items-stretch py-1"
                onClick={() => {
                  setFocusStop("origin");
                  setComposerOpen(true);
                  setTripOpen(true);
                }}
              >
                <span className="text-xs text-text-muted">From</span>
                <span className="truncate text-sm">{origin || "Set"}</span>
              </Button>
              <Button
                title="Set where the trip ends"
                type="button"
                variant="outline"
                className="min-w-0 flex-col items-stretch py-1"
                onClick={() => {
                  setFocusStop("destination");
                  setComposerOpen(true);
                  setTripOpen(true);
                }}
              >
                <span className="text-xs text-text-muted">To</span>
                <span className="truncate text-sm">{destination || "Set"}</span>
              </Button>
              <Button
                title="Choose the car for this trip"
                type="button"
                variant="outline"
                className="min-w-0 flex-col items-stretch py-1"
                onClick={() => setCarOpen(true)}
              >
                <span className="text-xs text-text-muted">Car</span>
                <span className="truncate text-sm">{carLabel}</span>
              </Button>
            </div>
          </div>
          <Sheet open={tripOpen} onOpenChange={setTripOpen}>
            <SheetContent
              side={isTablet ? "left" : "bottom"}
              title="Edit trip"
              className="overflow-y-auto safe-pb"
            >
              <SheetTitle className="font-display mb-3 text-xl">Edit trip</SheetTitle>
              {composer}
            </SheetContent>
          </Sheet>
        </>
      )}

      {carOpen ? (
        <Suspense fallback={null}>
          <VehicleSheet
            open={carOpen}
            onOpenChange={setCarOpen}
            wide={wide}
            tablet={isTablet}
            garage={garage}
            vehicleId={vehicleId}
            setVehicleId={selectSavedOrInlineVehicle}
            electricTrip={electricTrip}
            chargingLocation={chargingLocation}
            setChargingLocation={setChargingLocation}
            networkId={networkId}
            setNetworkId={setNetworkId}
            evNetworks={evNetworks}
            homePence={homePence}
            setHomePence={setHomePence}
            publicPence={publicPence}
            setPublicPence={setPublicPence}
            offpeakPence={offpeakPence}
            setOffpeakPence={setOffpeakPence}
            offpeakWindow={offpeakWindow}
            setOffpeakWindow={setOffpeakWindow}
            hasHeatPump={hasHeatPump}
            setHasHeatPump={setHasHeatPump}
            catalogue={catalogue}
            catalogueOpen={catalogueOpen}
            setCatalogueOpen={setCatalogueOpen}
            onPickCar={onPickCar}
            onPickFromReg={onPickFromReg}
            applyVes={applyVes}
            propulsion={propulsion}
            setPropulsion={setPropulsion}
            vehicleKind={vehicleKind}
            setVehicleKind={setVehicleKind}
            vehicleYear={vehicleYear}
            setVehicleYear={setVehicleYear}
            euroStatus={euroStatus}
            setEuroStatus={setEuroStatus}
            setEuroFromDvla={setEuroFromDvla}
            mpg={mpg}
            setMpg={setMpg}
            overrideMpg={overrideMpg}
            setOverrideMpg={setOverrideMpg}
            miKwh={miKwh}
            setMiKwh={setMiKwh}
            overrideMiKwh={overrideMiKwh}
            setOverrideMiKwh={setOverrideMiKwh}
            tank={tank}
            setTank={setTank}
            battery={battery}
            setBattery={setBattery}
            start={start}
            setStart={setStart}
            onUseCar={() => {
              setCarOpen(false);
              scheduleEstimate();
            }}
          />
        </Suspense>
      ) : null}

      <Dialog open={fillOpen} onOpenChange={setFillOpen}>
        <DialogContent title={savedBev ? "Log a charge" : "Log a fill-up"}>
          <DialogHeader>
            <DialogTitle>{savedBev ? "Log a charge" : "Log a fill-up"}</DialogTitle>
            <DialogDescription>
              Odometer, quantity, {savedBev ? "full" : "brim"}. Used to correct the brochure figure.
            </DialogDescription>
          </DialogHeader>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              if (isDemo) return;
              const poundsVal = Number(fillPrice);
              const when = fillWhen.trim() ? new Date(fillWhen) : undefined;
              const unitVal = savedBev ? "kwh" : savedPhev ? fillUnit : "litres";
              void api("/api/brim/fill-ups", {
                method: "POST",
                body: JSON.stringify({
                  vehicleId,
                  odometerMiles: Number(fillOdo),
                  quantity: Number(fillQty),
                  unit: unitVal,
                  price:
                    Number.isFinite(poundsVal) && fillPrice.trim() !== ""
                      ? Math.round(poundsVal * 100)
                      : 0,
                  brim: fillBrim,
                  ...(when && Number.isFinite(when.getTime())
                    ? { occurredAt: when.toISOString() }
                    : {}),
                  ...(unitVal === "litres" && fillStationId !== "none"
                    ? { stationId: fillStationId }
                    : {}),
                }),
              })
                .then(async () => {
                  setFillOpen(false);
                  setFillOdo("");
                  setFillQty("");
                  setFillPrice("");
                  setFillWhen("");
                  const cal = await api<{ confidence: string }>(
                    `/api/brim/vehicles/${vehicleId}/calibration`,
                  ).catch(() => null);
                  toast(
                    cal?.confidence === "calibrated"
                      ? "Stored. Estimates will now use your fill-ups."
                      : "Stored.",
                  );
                  void runEstimate(buildEstimateBody());
                })
                .catch((err: unknown) => {
                  const message = err instanceof Error ? err.message : "";
                  if (message === "odometer_rollback") {
                    toast("Odometer must increase in chronological order.");
                    return;
                  }
                  if (message === "unit_mismatch") {
                    toast("That quantity unit does not match this car.");
                    return;
                  }
                  if (message === "unknown_station") {
                    toast("That station is not in the price feed.");
                    return;
                  }
                  toast.error(message || "Could not log this entry.");
                });
            }}
          >
            <FormItem>
              <Label htmlFor="est-odo">Odometer miles</Label>
              <Input
                title="Odometer miles"
                id="est-odo"
                className="tabular-nums font-mono"
                inputMode="decimal"
                enterKeyHint="next"
                value={fillOdo}
                onChange={(ev) => setFillOdo(ev.target.value)}
                required
              />
            </FormItem>
            {savedPhev ? (
              <FormItem>
                <Label>Entry type</Label>
                <Select
                  value={fillUnit}
                  onValueChange={(v) => setFillUnit(v as "litres" | "kwh")}
                >
                  <SelectTrigger title="Choose fuel litres or battery kWh">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="litres">Petrol fill-up (litres)</SelectItem>
                    <SelectItem value="kwh">Battery charge (kWh)</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            ) : null}
            <FormItem>
              <Label htmlFor="est-qty">
                {savedBev || (savedPhev && fillUnit === "kwh") ? "kWh" : "Litres"}
              </Label>
              <Input
                title={
                  savedBev || (savedPhev && fillUnit === "kwh") ? "kWh added" : "Litres added"
                }
                id="est-qty"
                className="tabular-nums font-mono"
                inputMode="decimal"
                enterKeyHint="next"
                value={fillQty}
                onChange={(ev) => setFillQty(ev.target.value)}
                required
              />
            </FormItem>
            <FormItem>
              <Label htmlFor="est-gbp">Price £</Label>
              <Input
                title="Price £"
                id="est-gbp"
                className="tabular-nums font-mono"
                inputMode="decimal"
                enterKeyHint="next"
                value={fillPrice}
                onChange={(ev) => setFillPrice(ev.target.value)}
              />
            </FormItem>
            <FormItem>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Switch
                  title={
                    savedBev || (savedPhev && fillUnit === "kwh")
                      ? "Charged to full"
                      : "Filled to brim"
                  }
                  checked={fillBrim}
                  onCheckedChange={setFillBrim}
                />
                {savedBev || (savedPhev && fillUnit === "kwh")
                  ? "Charged to full"
                  : "Filled to brim"}
              </label>
            </FormItem>
            <FormItem>
              <Label htmlFor="est-when">When</Label>
              <Input
                title="When"
                id="est-when"
                type="datetime-local"
                enterKeyHint="done"
                value={fillWhen}
                onChange={(ev) => setFillWhen(ev.target.value)}
              />
            </FormItem>
            {!savedBev && (!savedPhev || fillUnit === "litres") && fillStations.length > 0 ? (
              <FormItem>
                <Label>Station (optional)</Label>
                <Select value={fillStationId} onValueChange={setFillStationId}>
                  <SelectTrigger title="Station (optional)">
                    <SelectValue placeholder="Skip" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Skip</SelectItem>
                    {fillStations.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            ) : null}
            <Button
              title={savedBev || (savedPhev && fillUnit === "kwh") ? "Store charge" : "Store fill-up"}
              type="submit"
              className="mt-2"
            >
              {savedBev || (savedPhev && fillUnit === "kwh") ? "Store charge" : "Store fill-up"}
            </Button>
          </Form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
