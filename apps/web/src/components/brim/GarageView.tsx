import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { enterMotion } from "../../lib/motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Form, FormItem } from "../ui/form";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { toast } from "sonner";
import { api, asList } from "../../lib/brim/api";
import { euroFromVes } from "../../lib/brim/estimate/vehicle-label";
import { formatBrimConsumption, formatBrimMiles } from "../../lib/brim/units";
import { useSession } from "../../lib/auth";
import { useUnits } from "../../lib/units";
import { RegLookup, type VesSummary } from "./RegLookup";
import { VehicleCatalogue, type CatalogueVehicle } from "./VehicleCatalogue";

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong. Try again.";
}

type Vehicle = {
  id: string;
  nickname?: string;
  propulsion: string;
  kind?: string;
  year?: number;
  euro_status?: string;
  euro_status_source?: "dvla" | "derived";
  make?: string;
  model?: string;
  official_consumption?: number;
  official_unit?: string;
  official_cycle?: string;
  user_entered_consumption?: number;
  user_entered_unit?: string;
  tank_litres?: number;
  battery_kwh_usable?: number;
  has_heat_pump?: boolean;
  is_default?: boolean;
  vrm?: string;
};

type FillUp = {
  id: string;
  odometerMiles: number;
  quantity: number;
  unit: "litres" | "kwh";
  pricePence: number;
  brim: boolean;
  occurredAt: string;
  note?: string;
  stationId?: string;
  stationName?: string;
};

type NearbyFillStation = { id: string; name: string };

type Calibration = {
  sampleCount: number;
  value?: number;
  unit?: string;
  confidence: string;
};

type Tariff = {
  id: string;
  kind: "home" | "public";
  pence_per_kwh: number;
  is_default: boolean;
  offpeak_pence?: number;
  offpeak_window?: string;
  network?: string;
};

type ZoneComplianceRow = {
  id: string;
  name: string;
  kind: string;
  verdict: "not_charged" | "charged" | "restricted" | "unknown";
  euroStatusSource: string;
  derived: boolean;
  operatorUrl: string;
  chargePence?: number;
  cazClass?: string;
  caveat?: string;
};

function title(v: Vehicle): string {
  return v.nickname?.trim() || [v.make, v.model].filter(Boolean).join(" ").trim() || v.propulsion;
}

export function GarageView() {
  const reduce = useReducedMotion();
  const { unit } = useUnits();
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === "demo";

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [fills, setFills] = useState<FillUp[]>([]);
  const [calib, setCalib] = useState<Calibration | null>(null);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [compliance, setCompliance] = useState<ZoneComplianceRow[]>([]);
  const [deleteCarOpen, setDeleteCarOpen] = useState(false);

  // Selected car metadata state
  const [hasHeatPump, setHasHeatPump] = useState(false);
  const [nickname, setNickname] = useState("");
  const [kind, setKind] = useState("car");
  const [year, setYear] = useState("");
  const [euroStatus, setEuroStatus] = useState("");
  const [tank, setTank] = useState("");
  const [battery, setBattery] = useState("");
  const [manualEconomy, setManualEconomy] = useState("");
  const [manualEconomyUnit, setManualEconomyUnit] = useState<"mpg" | "l/100km" | "mi/kWh" | "kWh/100km">("mpg");
  const [plateOpen, setPlateOpen] = useState(false);

  // Tariff editor state
  const [tariffKind, setTariffKind] = useState<"home" | "public">("home");
  const [tariffPence, setTariffPence] = useState("7.5");
  const [tariffOffpeakOpen, setTariffOffpeakOpen] = useState(false);
  const [tariffOffpeakPence, setTariffOffpeakPence] = useState("");
  const [tariffOffpeakWindow, setTariffOffpeakWindow] = useState("");
  const [tariffNetwork, setTariffNetwork] = useState("");
  const [editingTariffId, setEditingTariffId] = useState<string | null>(null);

  // Fill-up create & edit state
  const [odo, setOdo] = useState("");
  const [qty, setQty] = useState("");
  const [fillUnit, setFillUnit] = useState<"litres" | "kwh">("litres");
  const [price, setPrice] = useState("");
  const [brim, setBrim] = useState(true);
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [fillError, setFillError] = useState<{ field: "odo" | "qty"; message: string } | null>(null);
  const [fillStationId, setFillStationId] = useState("none");
  const [homeStations, setHomeStations] = useState<NearbyFillStation[]>([]);
  const [editingFillId, setEditingFillId] = useState<string | null>(null);
  const [editFillOdo, setEditFillOdo] = useState("");
  const [editFillQty, setEditFillQty] = useState("");
  const [editFillPrice, setEditFillPrice] = useState("");
  const [editFillNote, setEditFillNote] = useState("");
  const [editFillBrim, setEditFillBrim] = useState(true);

  // Add car (catalogue / reg / manual) state
  const [catalogue, setCatalogue] = useState<CatalogueVehicle | null>(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [pendingVrm, setPendingVrm] = useState<string | undefined>();
  const [pendingVes, setPendingVes] = useState<VesSummary | undefined>();
  const [manualNick, setManualNick] = useState("");
  const [manualKind, setManualKind] = useState<"car" | "van" | "motorcycle">("car");
  const [manualPropulsion, setManualPropulsion] = useState<"petrol" | "diesel" | "hybrid" | "phev" | "bev">("petrol");
  const [manualMake, setManualMake] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [manualYear, setManualYear] = useState("");
  const [manualEuro, setManualEuro] = useState("");
  const [manualCons, setManualCons] = useState("");
  const [manualTank, setManualTank] = useState("");
  const [manualBatt, setManualBatt] = useState("");
  const [manualVrm, setManualVrm] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ vehicles: Vehicle[] }>("/api/brim/vehicles");
      const cars = asList(res.vehicles);
      setVehicles(cars);
      setSelected((cur) => {
        if (cur && cars.some((c) => c.id === cur)) return cur;
        return cars.find((v) => v.is_default)?.id ?? cars[0]?.id ?? null;
      });
    } catch {
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const vehicle = vehicles.find((v) => v.id === selected);

  useEffect(() => {
    setPlateOpen(false);
    setEditingTariffId(null);
    setEditingFillId(null);
  }, [selected]);

  const reloadTariffs = useCallback(async (vehicleId: string) => {
    try {
      const r = await api<{ tariffs: Tariff[] }>(`/api/brim/vehicles/${vehicleId}/tariffs`);
      const list = asList(r.tariffs);
      setTariffs(list);
    } catch {
      setTariffs([]);
    }
  }, []);

  const reloadCompliance = useCallback(async (vehicleId: string) => {
    try {
      const r = await api<{ zones: ZoneComplianceRow[] }>(
        `/api/brim/vehicles/${vehicleId}/compliance`,
      );
      setCompliance(asList(r.zones));
    } catch {
      setCompliance([]);
    }
  }, []);

  useEffect(() => {
    if (!vehicle) {
      setFills([]);
      setCalib(null);
      setTariffs([]);
      setCompliance([]);
      return;
    }
    setNickname(vehicle.nickname ?? "");
    setKind(vehicle.kind ?? "car");
    setYear(vehicle.year !== undefined ? String(vehicle.year) : "");
    setEuroStatus(vehicle.euro_status ?? "");
    setTank(vehicle.tank_litres !== undefined ? String(vehicle.tank_litres) : "");
    setBattery(vehicle.battery_kwh_usable !== undefined ? String(vehicle.battery_kwh_usable) : "");
    setHasHeatPump(vehicle.has_heat_pump === true);
    setFillUnit(vehicle.propulsion === "bev" ? "kwh" : "litres");

    const defaultConsUnit =
      vehicle.propulsion === "bev"
        ? unit === "km"
          ? "kWh/100km"
          : "mi/kWh"
        : unit === "km"
          ? "l/100km"
          : "mpg";
    if (vehicle.user_entered_consumption !== undefined) {
      setManualEconomy(String(vehicle.user_entered_consumption));
      setManualEconomyUnit(
        (vehicle.user_entered_unit as "mpg" | "l/100km" | "mi/kWh" | "kWh/100km" | undefined) ??
          defaultConsUnit,
      );
    } else {
      setManualEconomy("");
      setManualEconomyUnit(defaultConsUnit);
    }

    void api<{ fillUps: FillUp[] }>(`/api/brim/vehicles/${vehicle.id}/fill-ups`)
      .then((r) => setFills(asList(r.fillUps)))
      .catch(() => setFills([]));
    void api<Calibration>(`/api/brim/vehicles/${vehicle.id}/calibration`)
      .then(setCalib)
      .catch(() => setCalib(null));
    void reloadCompliance(vehicle.id);
    if (vehicle.propulsion === "bev" || vehicle.propulsion === "phev") {
      void reloadTariffs(vehicle.id);
    } else {
      setTariffs([]);
    }
  }, [vehicle, unit, reloadCompliance, reloadTariffs]);

  useEffect(() => {
    if (!vehicle || vehicle.propulsion === "bev") {
      setHomeStations([]);
      setFillStationId("none");
      return;
    }
    const grade = vehicle.propulsion === "diesel" ? "B7" : "E10";
    void api<{ places: Array<{ kind: string; lat: number; lng: number }> }>("/api/brim/saved-places")
      .then(async (r) => {
        const home = asList(r.places).find((p) => p.kind === "home");
        if (!home) {
          setHomeStations([]);
          return;
        }
        const near = await api<{ stations: NearbyFillStation[] }>(
          `/api/brim/stations/near?lat=${home.lat}&lng=${home.lng}&grade=${grade}`,
        );
        setHomeStations(asList(near.stations));
      })
      .catch(() => setHomeStations([]));
  }, [vehicle]);

  async function saveMeta() {
    if (!vehicle || isDemo) return;
    try {
      const trimmedEuro = euroStatus.trim();
      const prevEuro = vehicle.euro_status?.trim() ?? "";
      const euroChanged = trimmedEuro.toLowerCase() !== prevEuro.toLowerCase();

      const consNum = Number(manualEconomy);
      const hasCons = manualEconomy.trim() !== "" && Number.isFinite(consNum) && consNum > 0;

      const payload: Record<string, unknown> = {
        nickname: nickname.trim() ? nickname.trim() : null,
        kind,
        year: year.trim() ? Number(year) : null,
        euroStatus: trimmedEuro ? trimmedEuro : null,
        ...(trimmedEuro && euroChanged ? { euroStatusSource: "derived" } : {}),
        tankLitres: tank.trim() ? Number(tank) : null,
        batteryKwhUsable: battery.trim() ? Number(battery) : null,
        userEnteredConsumption: hasCons ? consNum : null,
        ...(hasCons ? { userEnteredUnit: manualEconomyUnit } : {}),
        hasHeatPump,
      };

      await api(`/api/brim/vehicles/${vehicle.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast("Car details saved.");
      await refresh();
      await reloadCompliance(vehicle.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitTariff(e: FormEvent) {
    e.preventDefault();
    if (!vehicle || isDemo) return;
    const pence = Number(tariffPence);
    if (!Number.isFinite(pence) || pence <= 0) {
      toast.error("Enter a valid p/kWh rate.");
      return;
    }
    const offpeak = Number(tariffOffpeakPence);
    const hasOffpeak =
      tariffKind === "home" &&
      tariffOffpeakOpen &&
      tariffOffpeakPence.trim() !== "" &&
      Number.isFinite(offpeak) &&
      offpeak > 0;

    const payload: Record<string, unknown> = {
      kind: tariffKind,
      pencePerKwh: pence,
      offpeakPence: hasOffpeak ? offpeak : null,
      offpeakWindow:
        tariffKind === "home" && tariffOffpeakOpen && tariffOffpeakWindow.trim()
          ? tariffOffpeakWindow.trim()
          : null,
      network: tariffKind === "public" && tariffNetwork.trim() ? tariffNetwork.trim() : null,
      isDefault: tariffs.length === 0 ? true : undefined,
    };

    try {
      if (editingTariffId) {
        await api(`/api/brim/vehicles/${vehicle.id}/tariffs/${editingTariffId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast("Tariff updated.");
      } else {
        await api(`/api/brim/vehicles/${vehicle.id}/tariffs`, {
          method: "POST",
          body: JSON.stringify({ ...payload, isDefault: true }),
        });
        toast("Tariff saved.");
      }
      setEditingTariffId(null);
      setTariffOffpeakPence("");
      setTariffOffpeakWindow("");
      setTariffNetwork("");
      await reloadTariffs(vehicle.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function makeDefaultTariff(tariffId: string) {
    if (!vehicle || isDemo) return;
    try {
      await api(`/api/brim/vehicles/${vehicle.id}/tariffs/${tariffId}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      });
      toast("Default tariff updated.");
      await reloadTariffs(vehicle.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function removeTariff(tariffId: string) {
    if (!vehicle || isDemo) return;
    try {
      await api(`/api/brim/vehicles/${vehicle.id}/tariffs/${tariffId}`, {
        method: "DELETE",
      });
      if (editingTariffId === tariffId) setEditingTariffId(null);
      toast("Tariff removed.");
      await reloadTariffs(vehicle.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function setDefault() {
    if (!vehicle || isDemo) return;
    try {
      await api("/api/brim/settings", {
        method: "PATCH",
        body: JSON.stringify({ defaultVehicleId: vehicle.id }),
      });
      toast("This is now the default car.");
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function confirmRemoveCar() {
    if (!vehicle || isDemo) return;
    setDeleteCarOpen(false);
    try {
      await api(`/api/brim/vehicles/${vehicle.id}`, { method: "DELETE" });
      setSelected(null);
      toast("Car deleted.");
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function logFill(e: FormEvent) {
    e.preventDefault();
    if (!vehicle || isDemo) return;
    const pounds = Number(price);
    const when = occurredAt.trim() ? new Date(occurredAt) : undefined;
    const chosenUnit =
      vehicle.propulsion === "bev"
        ? "kwh"
        : vehicle.propulsion === "phev"
          ? fillUnit
          : "litres";
    try {
      await api("/api/brim/fill-ups", {
        method: "POST",
        body: JSON.stringify({
          vehicleId: vehicle.id,
          odometerMiles: Number(odo),
          quantity: Number(qty),
          unit: chosenUnit,
          price: Number.isFinite(pounds) && price.trim() !== "" ? Math.round(pounds * 100) : 0,
          brim,
          note: note.trim() || undefined,
          ...(when && Number.isFinite(when.getTime()) ? { occurredAt: when.toISOString() } : {}),
          ...(chosenUnit === "litres" && fillStationId !== "none" ? { stationId: fillStationId } : {}),
        }),
      });
      setOdo("");
      setQty("");
      setPrice("");
      setNote("");
      setOccurredAt("");
      setFillStationId("none");
      setFillError(null);
      toast(chosenUnit === "kwh" ? "Charge stored." : "Fill-up stored.");
      const fillsRes = await api<{ fillUps: FillUp[] }>(`/api/brim/vehicles/${vehicle.id}/fill-ups`);
      setFills(asList(fillsRes.fillUps));
      setCalib(await api<Calibration>(`/api/brim/vehicles/${vehicle.id}/calibration`));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "odometer_rollback") {
        const text = "Odometer must increase in chronological order with your other entries.";
        setFillError({ field: "odo", message: text });
        toast(text);
      } else if (message === "unit_mismatch") {
        const text = "That quantity unit does not match this car.";
        setFillError({ field: "qty", message: text });
        toast(text);
      } else if (message === "unknown_station") {
        toast("That station is not in the price feed.");
      } else toast.error(message || "Could not log this entry.");
    }
  }

  async function saveEditedFill(fillId: string) {
    if (!vehicle || isDemo) return;
    const pounds = Number(editFillPrice);
    try {
      await api(`/api/brim/fill-ups/${fillId}`, {
        method: "PATCH",
        body: JSON.stringify({
          odometerMiles: Number(editFillOdo),
          quantity: Number(editFillQty),
          price: Number.isFinite(pounds) && editFillPrice.trim() !== "" ? Math.round(pounds * 100) : 0,
          brim: editFillBrim,
          note: editFillNote.trim() ? editFillNote.trim() : null,
        }),
      });
      setEditingFillId(null);
      toast("Entry updated.");
      const fillsRes = await api<{ fillUps: FillUp[] }>(`/api/brim/vehicles/${vehicle.id}/fill-ups`);
      setFills(asList(fillsRes.fillUps));
      setCalib(await api<Calibration>(`/api/brim/vehicles/${vehicle.id}/calibration`));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "odometer_rollback") {
        toast.error("Odometer must stay ordered chronologically across your entries.");
      } else {
        toast.error(message || "Could not update entry.");
      }
    }
  }

  async function removeFill(id: string) {
    if (!vehicle || isDemo) return;
    try {
      await api(`/api/brim/fill-ups/${id}`, { method: "DELETE" });
      toast("Entry deleted.");
      const fillsRes = await api<{ fillUps: FillUp[] }>(`/api/brim/vehicles/${vehicle.id}/fill-ups`);
      setFills(asList(fillsRes.fillUps));
      setCalib(await api<Calibration>(`/api/brim/vehicles/${vehicle.id}/calibration`));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function addFromCatalogue(
    picked: CatalogueVehicle,
    vrm?: string,
    ves?: VesSummary,
  ) {
    if (isDemo) return;
    try {
      const euro = euroFromVes(ves?.euroStatus);
      const res = await api<{ id: string; vrmStored?: boolean }>("/api/brim/vehicles", {
        method: "POST",
        body: JSON.stringify({
          nickname: `${picked.make} ${picked.model}`,
          kind: "car",
          propulsion: picked.propulsion,
          make: picked.make,
          model: picked.model,
          ...(picked.derivative ? { derivative: picked.derivative } : {}),
          ...(picked.transmission ? { transmission: picked.transmission } : {}),
          ...(picked.engineCc !== undefined ? { engineCc: picked.engineCc } : {}),
          ...(picked.co2Gkm !== undefined ? { co2Gkm: picked.co2Gkm } : {}),
          officialConsumption: picked.officialConsumption,
          officialUnit: picked.officialUnit,
          officialCycle: picked.officialCycle,
          vcaMatchId: picked.id,
          ...(ves?.year !== undefined ? { year: ves.year } : {}),
          ...(euro ? { euroStatus: euro, euroStatusSource: ves?.euroStatus ? "dvla" : "derived" } : {}),
          ...(vrm ? { vrm } : {}),
        }),
      });
      setCatalogue(null);
      setPendingVrm(undefined);
      setPendingVes(undefined);
      if (vrm && res.vrmStored === false) {
        toast("Car saved. Registration plate was not stored because VRM encryption is not configured.");
      } else {
        toast("Car saved.");
      }
      await refresh();
      setSelected(res.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function addManualCar(e: FormEvent) {
    e.preventDefault();
    if (isDemo) return;
    try {
      const consNum = Number(manualCons);
      const hasCons = manualCons.trim() !== "" && Number.isFinite(consNum) && consNum > 0;
      const defaultUnit =
        manualPropulsion === "bev"
          ? unit === "km"
            ? "kWh/100km"
            : "mi/kWh"
          : unit === "km"
            ? "l/100km"
            : "mpg";
      const fallbackNick =
        manualNick.trim() ||
        [manualMake.trim(), manualModel.trim()].filter(Boolean).join(" ") ||
        `${manualPropulsion} ${manualKind}`;
      const vrmClean = manualVrm.trim();
      const res = await api<{ id: string; vrmStored?: boolean }>("/api/brim/vehicles", {
        method: "POST",
        body: JSON.stringify({
          nickname: fallbackNick,
          kind: manualKind,
          propulsion: manualPropulsion,
          ...(manualMake.trim() ? { make: manualMake.trim() } : {}),
          ...(manualModel.trim() ? { model: manualModel.trim() } : {}),
          ...(manualYear.trim() ? { year: Number(manualYear) } : {}),
          ...(manualEuro ? { euroStatus: manualEuro, euroStatusSource: "derived" } : {}),
          ...(hasCons ? { userEnteredConsumption: consNum, userEnteredUnit: defaultUnit } : {}),
          ...(manualPropulsion !== "bev" && manualTank.trim()
            ? { tankLitres: Number(manualTank) }
            : {}),
          ...((manualPropulsion === "bev" || manualPropulsion === "phev") && manualBatt.trim()
            ? { batteryKwhUsable: Number(manualBatt) }
            : {}),
          ...(vrmClean ? { vrm: vrmClean } : {}),
        }),
      });
      setManualNick("");
      setManualMake("");
      setManualModel("");
      setManualYear("");
      setManualEuro("");
      setManualCons("");
      setManualTank("");
      setManualBatt("");
      setManualVrm("");
      if (vrmClean && res.vrmStored === false) {
        toast("Vehicle saved. Registration plate was not stored because VRM encryption is not configured.");
      } else {
        toast("Vehicle saved.");
      }
      await refresh();
      setSelected(res.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "invalid_vrm") {
        toast.error("Enter a valid UK registration format, or leave it blank.");
      } else {
        toast.error(errorMessage(err));
      }
    }
  }

  const electric = vehicle?.propulsion === "bev" || vehicle?.propulsion === "phev";
  const bev = vehicle?.propulsion === "bev";
  const phev = vehicle?.propulsion === "phev";

  const addCar = (
    <fieldset disabled={isDemo} className="grid gap-4 disabled:opacity-60">
      <RegLookup
        onPick={(vehicleHit, vrm, ves) => {
          setPendingVrm(vrm);
          setPendingVes(ves);
          setCatalogue(vehicleHit);
        }}
        onChangeCar={() => setCatalogueOpen(true)}
        onVesOnly={(ves, vrm) => {
          setPendingVrm(vrm);
          setPendingVes(ves);
          if (ves.make) setManualMake(ves.make);
          if (ves.year !== undefined) setManualYear(String(ves.year));
          setManualPropulsion(ves.propulsion);
          const euro = euroFromVes(ves.euroStatus);
          if (euro) setManualEuro(euro);
          setManualVrm(vrm);
        }}
      />
      <VehicleCatalogue
        selected={catalogue}
        onSelect={(next) => {
          setCatalogue(next);
          if (next) void addFromCatalogue(next, pendingVrm, pendingVes);
        }}
        open={catalogueOpen}
        onOpenChange={setCatalogueOpen}
      />
      {catalogue && pendingVrm ? (
        <Button
          title="Add this car to your garage"
          type="button"
          onClick={() => void addFromCatalogue(catalogue, pendingVrm, pendingVes)}
        >
          Add this car
        </Button>
      ) : null}

      <Accordion type="single" collapsible>
        <AccordionItem value="manual">
          <AccordionTrigger title="Add a car, van, or motorcycle manually">
            Or enter a car, van, or motorcycle manually
          </AccordionTrigger>
          <AccordionContent>
            <Form onSubmit={(e) => void addManualCar(e)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormItem>
                  <Label htmlFor="man-nick">Nickname</Label>
                  <Input
                    id="man-nick"
                    title="Vehicle nickname"
                    value={manualNick}
                    onChange={(e) => setManualNick(e.target.value)}
                    placeholder="Weekend bike, Work van..."
                  />
                </FormItem>
                <FormItem>
                  <Label>Vehicle class</Label>
                  <Select
                    value={manualKind}
                    onValueChange={(v) => setManualKind(v as "car" | "van" | "motorcycle")}
                  >
                    <SelectTrigger title="Vehicle class">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="car">Car</SelectItem>
                      <SelectItem value="van">Van</SelectItem>
                      <SelectItem value="motorcycle">Motorcycle</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
                <FormItem>
                  <Label>Propulsion</Label>
                  <Select
                    value={manualPropulsion}
                    onValueChange={(v) =>
                      setManualPropulsion(v as "petrol" | "diesel" | "hybrid" | "phev" | "bev")
                    }
                  >
                    <SelectTrigger title="Fuel or propulsion">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="petrol">Petrol</SelectItem>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="phev">Plug-in hybrid</SelectItem>
                      <SelectItem value="bev">Electric</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
                <FormItem>
                  <Label>Euro standard</Label>
                  <Select
                    value={manualEuro || "unknown"}
                    onValueChange={(v) => setManualEuro(v === "unknown" ? "" : v)}
                  >
                    <SelectTrigger title="Euro emissions standard">
                      <SelectValue placeholder="Unknown" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">Unknown</SelectItem>
                      <SelectItem value="Euro 3">Euro 3</SelectItem>
                      <SelectItem value="Euro 4">Euro 4</SelectItem>
                      <SelectItem value="Euro 5">Euro 5</SelectItem>
                      <SelectItem value="Euro 6">Euro 6</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
                <FormItem>
                  <Label htmlFor="man-make">Make (optional)</Label>
                  <Input
                    id="man-make"
                    title="Vehicle make"
                    value={manualMake}
                    onChange={(e) => setManualMake(e.target.value)}
                    placeholder="Ford, Triumph..."
                  />
                </FormItem>
                <FormItem>
                  <Label htmlFor="man-model">Model (optional)</Label>
                  <Input
                    id="man-model"
                    title="Vehicle model"
                    value={manualModel}
                    onChange={(e) => setManualModel(e.target.value)}
                    placeholder="Transit, Tiger 900..."
                  />
                </FormItem>
                <FormItem>
                  <Label htmlFor="man-year">Year (optional)</Label>
                  <Input
                    id="man-year"
                    title="Year of first registration"
                    inputMode="numeric"
                    className="tabular-nums font-mono"
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value)}
                    placeholder="2021"
                  />
                </FormItem>
                <FormItem>
                  <Label htmlFor="man-cons">
                    {manualPropulsion === "bev"
                      ? unit === "km"
                        ? "Consumption (kWh/100km)"
                        : "Efficiency (mi/kWh)"
                      : unit === "km"
                        ? "Consumption (L/100km)"
                        : "Economy (mpg)"}
                  </Label>
                  <Input
                    id="man-cons"
                    title="Real-world economy or efficiency"
                    inputMode="decimal"
                    className="tabular-nums font-mono"
                    value={manualCons}
                    onChange={(e) => setManualCons(e.target.value)}
                    placeholder="Optional"
                  />
                </FormItem>
                {manualPropulsion !== "bev" ? (
                  <FormItem>
                    <Label htmlFor="man-tank">Tank litres (optional)</Label>
                    <Input
                      id="man-tank"
                      title="Fuel tank size in litres"
                      inputMode="decimal"
                      className="tabular-nums font-mono"
                      value={manualTank}
                      onChange={(e) => setManualTank(e.target.value)}
                    />
                  </FormItem>
                ) : null}
                {manualPropulsion === "bev" || manualPropulsion === "phev" ? (
                  <FormItem>
                    <Label htmlFor="man-batt">Usable battery kWh (optional)</Label>
                    <Input
                      id="man-batt"
                      title="Usable battery capacity in kWh"
                      inputMode="decimal"
                      className="tabular-nums font-mono"
                      value={manualBatt}
                      onChange={(e) => setManualBatt(e.target.value)}
                    />
                  </FormItem>
                ) : null}
                <FormItem>
                  <Label htmlFor="man-vrm">UK registration (optional)</Label>
                  <Input
                    id="man-vrm"
                    title="UK registration plate"
                    className="tabular-nums font-mono"
                    value={manualVrm}
                    onChange={(e) => setManualVrm(e.target.value.toUpperCase())}
                    placeholder="AB12 CDE"
                  />
                </FormItem>
              </div>
              <Button title="Save manual vehicle" type="submit" className="mt-3">
                Save vehicle
              </Button>
            </Form>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      {isDemo ? (
        <p className="text-xs text-text-muted">The demo account cannot save vehicles.</p>
      ) : null}
    </fieldset>
  );

  const calibratedDisplay =
    calib?.value !== undefined && calib.unit
      ? formatBrimConsumption(calib.value, calib.unit, unit)
      : "";

  const compliantCount = compliance.filter((z) => z.verdict === "not_charged").length;
  const chargedOrRestrictedCount = compliance.filter(
    (z) => z.verdict === "charged" || z.verdict === "restricted",
  ).length;

  return (
    <main className="mx-auto w-[min(720px,calc(100%-1.5rem))] py-6">
      <h1 className="font-display mb-2 text-3xl md:text-4xl">Garage</h1>
      <p className="mb-6 text-text-muted">
        Your saved vehicles, tariffs, clean-air compliance, and the fill-ups that calibrate brochure
        figures.
      </p>
      {loading ? (
        <Card aria-busy="true">
          <Skeleton className="mb-3 h-10 w-40" />
          <Skeleton className="h-24 w-full" />
        </Card>
      ) : vehicles.length === 0 ? (
        <Card>
          <p className="mb-4">Add your car and we will stop guessing.</p>
          {addCar}
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <p className="mb-3 text-sm text-text-muted">Add another vehicle</p>
            {addCar}
          </Card>
          <ul className="mb-6 grid gap-2">
            {vehicles.map((v) => (
              <li key={v.id}>
                <Button
                  title={`Show ${title(v)}`}
                  type="button"
                  variant={v.id === selected ? "default" : "outline"}
                  className="h-auto min-h-11 w-full justify-start whitespace-normal text-left"
                  onClick={() => setSelected(v.id)}
                >
                  {title(v)}
                  {v.is_default ? " (default)" : ""}
                </Button>
              </li>
            ))}
          </ul>
          <AnimatePresence mode="wait" initial={false}>
            {vehicle ? (
              <motion.div
                key={vehicle.id}
                className="grid gap-4"
                {...(reduce ? { initial: false as const } : enterMotion)}
              >
                <Card>
                  <Form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveMeta();
                    }}
                  >
                    <fieldset disabled={isDemo} className="grid gap-3 disabled:opacity-60">
                      <FormItem>
                        <Label htmlFor="nick">Nickname</Label>
                        <Input
                          title="Nickname"
                          id="nick"
                          enterKeyHint="next"
                          value={nickname}
                          onChange={(ev) => setNickname(ev.target.value)}
                        />
                      </FormItem>
                      {vehicle.vrm ? (
                        <FormItem>
                          <p className="text-sm">Registration</p>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums font-mono text-sm">
                              {plateOpen ? vehicle.vrm : "Hidden"}
                            </span>
                            <Button
                              title={plateOpen ? "Hide registration" : "Show registration"}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setPlateOpen((open) => !open)}
                            >
                              {plateOpen ? "Hide registration" : "Show registration"}
                            </Button>
                          </div>
                        </FormItem>
                      ) : null}
                      <FormItem>
                        <Label>Vehicle class</Label>
                        <Select value={kind} onValueChange={setKind}>
                          <SelectTrigger title="Vehicle class">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="car">Car</SelectItem>
                            <SelectItem value="van">Van</SelectItem>
                            <SelectItem value="motorcycle">Motorcycle</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="details">
                          <AccordionTrigger title="Edit year, Euro standard, economy, and capacities">
                            More details
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="grid gap-3">
                              <FormItem>
                                <Label htmlFor="year">Year of first registration</Label>
                                <Input
                                  title="Year of first registration"
                                  id="year"
                                  className="tabular-nums font-mono"
                                  inputMode="numeric"
                                  enterKeyHint="next"
                                  value={year}
                                  onChange={(ev) => setYear(ev.target.value)}
                                  placeholder="Leave blank to clear"
                                />
                              </FormItem>
                              <FormItem>
                                <Label htmlFor="euro">
                                  Euro standard
                                  {vehicle.euro_status_source === "dvla" ? " (from DVLA)" : ""}
                                </Label>
                                <Input
                                  title="Euro standard"
                                  id="euro"
                                  value={euroStatus}
                                  onChange={(ev) => setEuroStatus(ev.target.value)}
                                  placeholder="Euro 6"
                                />
                              </FormItem>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <FormItem>
                                  <Label htmlFor="man-override">
                                    Manual consumption override (optional)
                                  </Label>
                                  <Input
                                    id="man-override"
                                    title="Manual consumption figure"
                                    className="tabular-nums font-mono"
                                    inputMode="decimal"
                                    value={manualEconomy}
                                    onChange={(ev) => setManualEconomy(ev.target.value)}
                                    placeholder="Leave blank for brochure/calibration"
                                  />
                                </FormItem>
                                <FormItem>
                                  <Label>Consumption unit</Label>
                                  <Select
                                    value={manualEconomyUnit}
                                    onValueChange={(v) =>
                                      setManualEconomyUnit(
                                        v as "mpg" | "l/100km" | "mi/kWh" | "kWh/100km",
                                      )
                                    }
                                  >
                                    <SelectTrigger title="Manual consumption unit">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {bev ? (
                                        <>
                                          <SelectItem value="mi/kWh">mi/kWh</SelectItem>
                                          <SelectItem value="kWh/100km">kWh/100km</SelectItem>
                                        </>
                                      ) : phev ? (
                                        <>
                                          <SelectItem value="mpg">mpg</SelectItem>
                                          <SelectItem value="l/100km">L/100km</SelectItem>
                                          <SelectItem value="mi/kWh">mi/kWh</SelectItem>
                                          <SelectItem value="kWh/100km">kWh/100km</SelectItem>
                                        </>
                                      ) : (
                                        <>
                                          <SelectItem value="mpg">mpg</SelectItem>
                                          <SelectItem value="l/100km">L/100km</SelectItem>
                                        </>
                                      )}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              </div>
                              {electric ? (
                                <>
                                  <FormItem>
                                    <Label htmlFor="batt">Usable battery kWh</Label>
                                    <Input
                                      title="Usable battery kWh"
                                      id="batt"
                                      className="tabular-nums font-mono"
                                      inputMode="decimal"
                                      enterKeyHint="next"
                                      value={battery}
                                      onChange={(ev) => setBattery(ev.target.value)}
                                    />
                                  </FormItem>
                                  <FormItem>
                                    <label className="flex min-h-11 items-center gap-2 text-sm">
                                      <Switch
                                        title="Car has a heat pump"
                                        checked={hasHeatPump}
                                        onCheckedChange={setHasHeatPump}
                                      />
                                      Heat pump
                                    </label>
                                  </FormItem>
                                </>
                              ) : null}
                              {!bev ? (
                                <FormItem>
                                  <Label htmlFor="tank">Tank litres</Label>
                                  <Input
                                    title="Tank litres"
                                    id="tank"
                                    className="tabular-nums font-mono"
                                    inputMode="decimal"
                                    enterKeyHint="done"
                                    value={tank}
                                    onChange={(ev) => setTank(ev.target.value)}
                                  />
                                </FormItem>
                              ) : null}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button title="Save vehicle details" type="submit">
                          Save details
                        </Button>
                        <Button
                          title="Make this your default vehicle"
                          type="button"
                          variant="outline"
                          onClick={() => void setDefault()}
                        >
                          Make default
                        </Button>
                        <Button
                          title="Delete this vehicle"
                          type="button"
                          variant="destructive"
                          onClick={() => setDeleteCarOpen(true)}
                        >
                          Delete car
                        </Button>
                      </div>
                    </fieldset>
                  </Form>
                  {calib ? (
                    <p className="tabular-nums font-mono mt-4 text-sm text-text-muted">
                      {calib.confidence === "calibrated"
                        ? `Based on your last ${calib.sampleCount} brim-to-brim intervals${calibratedDisplay ? `, ${calibratedDisplay}` : ""}.`
                        : calib.confidence === "building"
                          ? `${calib.sampleCount} brim-to-brim interval${calib.sampleCount === 1 ? "" : "s"} so far. Need 3 for a personal figure.`
                          : bev
                            ? "No full charges yet."
                            : "No brim fill-ups yet."}
                    </p>
                  ) : null}
                </Card>

                {electric ? (
                  <Card>
                    <h2 className="mb-1 text-lg">Charging tariffs</h2>
                    <p className="mb-3 text-sm text-text-muted">
                      Manage home (single-rate or off-peak overnight) and public network tariffs for
                      this car.
                    </p>
                    {tariffs.length > 0 ? (
                      <ul className="mb-4 grid gap-2">
                        {tariffs.map((t) => (
                          <li
                            key={t.id}
                            className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium capitalize">{t.kind}</span>
                                {t.network ? (
                                  <span className="text-text-muted">· {t.network}</span>
                                ) : null}
                                {t.is_default ? <Badge>Default</Badge> : null}
                              </div>
                              <p className="tabular-nums font-mono mt-0.5 text-text-muted">
                                {t.pence_per_kwh} p/kWh
                                {t.offpeak_pence !== undefined
                                  ? ` · off-peak ${t.offpeak_pence} p/kWh${t.offpeak_window ? ` (${t.offpeak_window})` : ""}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {!t.is_default ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isDemo}
                                  title="Use this tariff by default"
                                  onClick={() => void makeDefaultTariff(t.id)}
                                >
                                  Make default
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isDemo}
                                title="Edit this tariff"
                                onClick={() => {
                                  setEditingTariffId(t.id);
                                  setTariffKind(t.kind);
                                  setTariffPence(String(t.pence_per_kwh));
                                  setTariffOffpeakOpen(t.offpeak_pence !== undefined);
                                  setTariffOffpeakPence(
                                    t.offpeak_pence !== undefined ? String(t.offpeak_pence) : "",
                                  );
                                  setTariffOffpeakWindow(t.offpeak_window ?? "");
                                  setTariffNetwork(t.network ?? "");
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isDemo}
                                title="Delete this tariff"
                                onClick={() => void removeTariff(t.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <Form onSubmit={(e) => void submitTariff(e)}>
                      <fieldset disabled={isDemo} className="grid gap-3 disabled:opacity-60">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <FormItem>
                            <Label>Tariff kind</Label>
                            <Select
                              value={tariffKind}
                              onValueChange={(v) => setTariffKind(v as "home" | "public")}
                            >
                              <SelectTrigger title="Home or public charging tariff">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="home">Home</SelectItem>
                                <SelectItem value="public">Public network</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                          <FormItem>
                            <Label htmlFor="t-pence">
                              {tariffKind === "home" ? "Standard / peak p/kWh" : "Public p/kWh"}
                            </Label>
                            <Input
                              id="t-pence"
                              title="Rate in pence per kWh"
                              className="tabular-nums font-mono"
                              inputMode="decimal"
                              value={tariffPence}
                              onChange={(e) => setTariffPence(e.target.value)}
                              required
                            />
                          </FormItem>
                        </div>
                        {tariffKind === "home" ? (
                          <>
                            <label className="flex min-h-11 items-center gap-2 text-sm">
                              <Switch
                                title="Include off-peak overnight window"
                                checked={tariffOffpeakOpen}
                                onCheckedChange={setTariffOffpeakOpen}
                              />
                              Has off-peak overnight rate
                            </label>
                            {tariffOffpeakOpen ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <FormItem>
                                  <Label htmlFor="t-offpeak">Off-peak p/kWh</Label>
                                  <Input
                                    id="t-offpeak"
                                    title="Off-peak rate in pence per kWh"
                                    className="tabular-nums font-mono"
                                    inputMode="decimal"
                                    value={tariffOffpeakPence}
                                    onChange={(e) => setTariffOffpeakPence(e.target.value)}
                                  />
                                </FormItem>
                                <FormItem>
                                  <Label htmlFor="t-window">Off-peak window</Label>
                                  <Input
                                    id="t-window"
                                    title="Off-peak hours window"
                                    value={tariffOffpeakWindow}
                                    onChange={(e) => setTariffOffpeakWindow(e.target.value)}
                                    placeholder="00:30-05:30"
                                  />
                                </FormItem>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <FormItem>
                            <Label htmlFor="t-net">Network name (optional)</Label>
                            <Input
                              id="t-net"
                              title="Public charging network name"
                              value={tariffNetwork}
                              onChange={(e) => setTariffNetwork(e.target.value)}
                              placeholder="Tesla Supercharger, Ionity..."
                            />
                          </FormItem>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="submit"
                            title={editingTariffId ? "Update tariff" : "Add tariff"}
                          >
                            {editingTariffId ? "Update tariff" : "Save tariff"}
                          </Button>
                          {editingTariffId ? (
                            <Button
                              type="button"
                              variant="outline"
                              title="Cancel editing tariff"
                              onClick={() => setEditingTariffId(null)}
                            >
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                      </fieldset>
                    </Form>
                  </Card>
                ) : null}

                {compliance.length > 0 ? (
                  <Card>
                    <Accordion type="single" collapsible>
                      <AccordionItem value="compliance" className="border-0">
                        <AccordionTrigger title="View UK clean-air and low-emission zone compliance">
                          <div className="text-left">
                            <p className="text-base font-medium">UK clean-air zone compliance</p>
                            <p className="text-xs font-normal text-text-muted">
                              {compliantCount} compliant · {chargedOrRestrictedCount} charged or
                              restricted across {compliance.length} UK schemes
                            </p>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          {compliance[0]?.caveat ? (
                            <p className="mb-3 text-xs text-train">{compliance[0].caveat}</p>
                          ) : null}
                          <ul className="grid gap-2 text-sm">
                            {compliance.map((z) => (
                              <li
                                key={z.id}
                                className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2"
                              >
                                <div>
                                  <span>{z.name}</span>
                                  {z.cazClass ? (
                                    <span className="ml-1.5 text-xs text-text-muted">
                                      (Class {z.cazClass})
                                    </span>
                                  ) : null}
                                </div>
                                {z.verdict === "not_charged" ? (
                                  <Badge className="border-walk/40 bg-walk/10 text-walk">
                                    No charge
                                  </Badge>
                                ) : z.verdict === "restricted" ? (
                                  <Badge className="border-destructive/40 bg-destructive/10 text-destructive">
                                    Penalty / restricted
                                  </Badge>
                                ) : z.verdict === "charged" ? (
                                  <Badge className="border-train/40 bg-train/10 text-train">
                                    {z.chargePence !== undefined
                                      ? `£${(z.chargePence / 100).toFixed(2)}/day`
                                      : "Daily charge"}
                                  </Badge>
                                ) : (
                                  <Badge>Check operator</Badge>
                                )}
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </Card>
                ) : null}

                <Card>
                  <h2 className="mb-3 text-lg">
                    {bev ? "Log a charge" : phev ? "Log a fill-up or charge" : "Log a fill-up"}
                  </h2>
                  <p className="mb-3 text-sm text-text-muted">
                    Odometer, quantity, {bev ? "full" : "brim"}. Historical receipts can be added in
                    any order when you set the date.
                  </p>
                  <Form onSubmit={(e) => void logFill(e)}>
                    <fieldset disabled={isDemo} className="grid gap-3 disabled:opacity-60">
                      <FormItem>
                        <Label htmlFor="odo">Odometer miles</Label>
                        <Input
                          title="Odometer miles"
                          id="odo"
                          className="tabular-nums font-mono"
                          inputMode="decimal"
                          enterKeyHint="next"
                          value={odo}
                          onChange={(ev) => setOdo(ev.target.value)}
                          required
                          aria-invalid={fillError?.field === "odo" || undefined}
                          aria-describedby={fillError?.field === "odo" ? "fill-error" : undefined}
                        />
                      </FormItem>
                      {phev ? (
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
                        <Label htmlFor="qty">
                          {bev || (phev && fillUnit === "kwh") ? "kWh" : "Litres"}
                        </Label>
                        <Input
                          title={
                            bev || (phev && fillUnit === "kwh") ? "kWh added" : "Litres added"
                          }
                          id="qty"
                          className="tabular-nums font-mono"
                          inputMode="decimal"
                          enterKeyHint="next"
                          value={qty}
                          onChange={(ev) => setQty(ev.target.value)}
                          required
                          aria-invalid={fillError?.field === "qty" || undefined}
                          aria-describedby={fillError?.field === "qty" ? "fill-error" : undefined}
                        />
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="gbp">Price £</Label>
                        <Input
                          title="Price £"
                          id="gbp"
                          className="tabular-nums font-mono"
                          inputMode="decimal"
                          enterKeyHint="next"
                          value={price}
                          onChange={(ev) => setPrice(ev.target.value)}
                        />
                      </FormItem>
                      <FormItem>
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <Switch
                            title={
                              bev || (phev && fillUnit === "kwh")
                                ? "Charged to full"
                                : "Filled to brim"
                            }
                            checked={brim}
                            onCheckedChange={setBrim}
                          />
                          {bev || (phev && fillUnit === "kwh")
                            ? "Charged to full"
                            : "Filled to brim"}
                        </label>
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="when">When</Label>
                        <Input
                          title="Date and time of fill-up or charge"
                          id="when"
                          type="datetime-local"
                          value={occurredAt}
                          onChange={(ev) => setOccurredAt(ev.target.value)}
                        />
                      </FormItem>
                      <FormItem>
                        <Label htmlFor="note">Note</Label>
                        <Input
                          title="Optional note"
                          id="note"
                          value={note}
                          onChange={(ev) => setNote(ev.target.value)}
                        />
                      </FormItem>
                      {!bev && (!phev || fillUnit === "litres") && homeStations.length > 0 ? (
                        <FormItem>
                          <Label>Station (optional)</Label>
                          <Select value={fillStationId} onValueChange={setFillStationId}>
                            <SelectTrigger title="Station (optional)">
                              <SelectValue placeholder="Skip" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Skip</SelectItem>
                              {homeStations.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      ) : null}
                      <Button
                        title={
                          bev || (phev && fillUnit === "kwh") ? "Store charge" : "Store fill-up"
                        }
                        type="submit"
                        className="mt-2"
                      >
                        {bev || (phev && fillUnit === "kwh") ? "Store charge" : "Store fill-up"}
                      </Button>
                      {fillError ? (
                        <p id="fill-error" className="mt-2 text-sm text-train" role="alert">
                          {fillError.message}
                        </p>
                      ) : null}
                    </fieldset>
                  </Form>
                  <ul className="mt-4 grid gap-2">
                    {fills.map((f) => (
                      <li
                        key={f.id}
                        className="flex flex-col gap-2 border-t border-border pt-2.5 text-sm"
                      >
                        {editingFillId === f.id ? (
                          <div className="grid gap-2 sm:grid-cols-4">
                            <Input
                              title="Odometer miles"
                              value={editFillOdo}
                              onChange={(e) => setEditFillOdo(e.target.value)}
                              inputMode="decimal"
                              className="tabular-nums font-mono"
                              placeholder="Odometer mi"
                            />
                            <Input
                              title="Quantity"
                              value={editFillQty}
                              onChange={(e) => setEditFillQty(e.target.value)}
                              inputMode="decimal"
                              className="tabular-nums font-mono"
                              placeholder={f.unit}
                            />
                            <Input
                              title="Price £"
                              value={editFillPrice}
                              onChange={(e) => setEditFillPrice(e.target.value)}
                              inputMode="decimal"
                              className="tabular-nums font-mono"
                              placeholder="£"
                            />
                            <Input
                              title="Note"
                              value={editFillNote}
                              onChange={(e) => setEditFillNote(e.target.value)}
                              placeholder="Note"
                            />
                            <label className="flex min-h-11 items-center gap-2 text-xs sm:col-span-2">
                              <Switch
                                title="Brim or full charge"
                                checked={editFillBrim}
                                onCheckedChange={setEditFillBrim}
                              />
                              {f.unit === "kwh" ? "Full charge" : "Filled to brim"}
                            </label>
                            <div className="flex gap-1.5 sm:col-span-2 sm:justify-end">
                              <Button
                                type="button"
                                size="sm"
                                title="Save edited entry"
                                onClick={() => void saveEditedFill(f.id)}
                              >
                                Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                title="Cancel editing entry"
                                onClick={() => setEditingFillId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <span className="tabular-nums font-mono text-text-muted">
                                {f.occurredAt.slice(0, 10)} · {formatBrimMiles(f.odometerMiles, unit, 0)} ·{" "}
                                {f.quantity} {f.unit}
                                {f.brim ? (f.unit === "kwh" ? " · full" : " · brim") : ""}
                                {f.stationName ? ` · ${f.stationName}` : ""}
                                {f.pricePence > 0 ? ` · £${(f.pricePence / 100).toFixed(2)}` : ""}
                              </span>
                              {f.note ? (
                                <p className="mt-0.5 text-xs text-text">{f.note}</p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <Button
                                title="Edit entry"
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isDemo}
                                onClick={() => {
                                  setEditingFillId(f.id);
                                  setEditFillOdo(String(f.odometerMiles));
                                  setEditFillQty(String(f.quantity));
                                  setEditFillPrice(
                                    f.pricePence > 0 ? (f.pricePence / 100).toFixed(2) : "",
                                  );
                                  setEditFillNote(f.note ?? "");
                                  setEditFillBrim(f.brim);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                title="Delete entry"
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isDemo}
                                onClick={() => void removeFill(f.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      )}

      <AlertDialog open={deleteCarOpen} onOpenChange={setDeleteCarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {vehicle ? title(vehicle) : "this car"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the vehicle, its saved charging tariffs, and all logged
              fill-ups from your garage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel title="Keep vehicle">Cancel</AlertDialogCancel>
            <AlertDialogAction title="Confirm deleting vehicle" onClick={() => void confirmRemoveCar()}>
              Delete car
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
