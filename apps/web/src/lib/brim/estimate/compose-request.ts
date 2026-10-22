import type { CatalogueVehicle } from "../../../components/brim/VehicleCatalogue";
import type { EvNetworkRow, Place, Propulsion, VehicleKind, ViaDraft } from "./types";

export function tripPlace(label: string, pin: Place | null): string | { lat: number; lng: number; label: string } {
  if (!pin) return label;
  return { lat: pin.lat, lng: pin.lng, label };
}

export type InlineVehicleInput = {
  propulsion: Propulsion;
  vehicleKind: VehicleKind;
  vehicleYear: string;
  euroStatus: string;
  euroFromDvla: boolean;
  catalogue: CatalogueVehicle | null;
  mpg: string;
  miKwh: string;
  overrideMpg: string;
  overrideMiKwh: string;
  tank: string;
  battery: string;
  start: string;
  hasHeatPump: boolean;
};

export function composeVehicleInline(input: InlineVehicleInput): Record<string, unknown> {
  const useElectricFigure = input.propulsion === "bev" || (input.propulsion === "phev" && !input.catalogue);
  const overrideRaw = useElectricFigure
    ? input.catalogue
      ? input.overrideMiKwh
      : input.miKwh
    : input.catalogue
      ? input.overrideMpg
      : input.mpg;
  const overrideNum = Number(overrideRaw);
  const hasOverride = overrideRaw.trim() !== "" && Number.isFinite(overrideNum) && overrideNum > 0;

  const profile: Record<string, unknown> = {
    kind: input.vehicleKind,
    propulsion: input.propulsion,
  };
  const year = Number(input.vehicleYear);
  if (Number.isFinite(year) && year >= 1970) profile.year = year;
  if (input.euroStatus) {
    profile.euroStatus = input.euroStatus;
    profile.euroStatusSource = input.euroFromDvla ? "dvla" : "derived";
  }
  if (input.catalogue) {
    profile.make = input.catalogue.make;
    profile.model = input.catalogue.model;
    profile.vcaMatchId = input.catalogue.id;
    profile.officialConsumption = input.catalogue.officialConsumption;
    profile.officialUnit = input.catalogue.officialUnit;
    profile.officialCycle = input.catalogue.officialCycle;
    if (input.catalogue.derivative) profile.derivative = input.catalogue.derivative;
    if (input.catalogue.transmission) profile.transmission = input.catalogue.transmission;
    if (input.catalogue.engineCc !== undefined) profile.engineCc = input.catalogue.engineCc;
    if (input.catalogue.co2Gkm !== undefined) profile.co2Gkm = input.catalogue.co2Gkm;
  }
  if (hasOverride) {
    profile.userEnteredConsumption = overrideNum;
    profile.userEnteredUnit = useElectricFigure ? "mi/kWh" : "mpg";
  }
  if (input.propulsion !== "bev") {
    const tankLitres = Number(input.tank);
    if (Number.isFinite(tankLitres) && tankLitres > 0) profile.tankLitres = tankLitres;
  }
  if (input.propulsion === "bev" || input.propulsion === "phev") {
    const batteryKwh = Number(input.battery);
    const startPct = Number(input.start);
    if (Number.isFinite(batteryKwh) && batteryKwh > 0) profile.batteryKwhUsable = batteryKwh;
    if (Number.isFinite(startPct) && startPct > 0) profile.startChargePercent = startPct;
    profile.hasHeatPump = input.hasHeatPump;
  }
  return profile;
}

export type ComposeEstimateInput = {
  origin: string;
  originPin: Place | null;
  destination: string;
  destPin: Place | null;
  viaDrafts: ViaDraft[];
  departsAt: string;
  propulsion: Propulsion;
  vehicleId: string;
  stationId?: string | undefined;
  priceStrategy?: string | undefined;
  electricTrip: boolean;
  chargingLocation: "home" | "public";
  hasHeatPump: boolean;
  start: string;
  homePence: string;
  networkId: string;
  offpeakPence: string;
  offpeakWindow: string;
  evNetworks: EvNetworkRow[];
  vehicleInline: Record<string, unknown>;
};

export function composeEstimateRequest(input: ComposeEstimateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    origin: tripPlace(input.origin, input.originPin),
    destination: tripPlace(input.destination, input.destPin),
    departsAt: new Date(input.departsAt).toISOString(),
    propulsion: input.propulsion,
  };
  const vias = input.viaDrafts
    .filter((v) => v.pin || v.text.trim())
    .map((v) => tripPlace(v.text, v.pin));
  if (vias.length > 0) body.waypoints = vias;
  if (input.vehicleId === "inline") body.vehicleInline = input.vehicleInline;
  else body.vehicleId = input.vehicleId;
  if (input.stationId && input.propulsion !== "bev") body.stationId = input.stationId;
  if (input.priceStrategy && input.propulsion !== "bev") body.priceStrategy = input.priceStrategy;
  if (input.electricTrip) {
    body.chargingLocation = input.chargingLocation;
    body.hasHeatPump = input.hasHeatPump;
    const startPct = Number(input.start);
    if (Number.isFinite(startPct) && startPct > 0) body.startChargePercent = startPct;
    const pence = Number(input.homePence);
    if (input.chargingLocation === "public") {
      if (input.networkId) {
        body.network = input.networkId;
        const picked = input.evNetworks.find((n) => n.id === input.networkId);
        if (picked) body.chargingSpeed = picked.speed;
        if (Number.isFinite(pence) && pence > 0) body.pricePence = pence;
      }
    } else if (Number.isFinite(pence) && pence > 0) {
      body.priceStrategy = "user-tariff";
      body.pricePence = pence;
      const offpeak = Number(input.offpeakPence);
      if (Number.isFinite(offpeak) && offpeak > 0) body.offpeakPence = offpeak;
      if (input.offpeakWindow.trim()) body.offpeakWindow = input.offpeakWindow.trim();
    }
  }
  return body;
}
