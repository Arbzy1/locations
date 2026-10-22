import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { enterMotion } from "../../lib/motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
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
import { euroFromVes, RegLookup, type VesSummary } from "./RegLookup";
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
  make?: string;
  model?: string;
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
  unit: string;
  pricePence: number;
  brim: boolean;
  occurredAt: string;
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
  pence_per_kwh: number;
  is_default: boolean;
  offpeak_pence?: number;
  offpeak_window?: string;
};

function title(v: Vehicle) {
  return v.nickname ?? [v.make, v.model].filter(Boolean).join(" ") ?? v.propulsion;
}

export function GarageView() {
  const reduce = useReducedMotion();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [fills, setFills] = useState<FillUp[]>([]);
  const [calib, setCalib] = useState<Calibration | null>(null);
  const [homePence, setHomePence] = useState("7.5");
  const [offpeakPence, setOffpeakPence] = useState("");
  const [offpeakWindow, setOffpeakWindow] = useState("");
  const [hasHeatPump, setHasHeatPump] = useState(false);
  const [nickname, setNickname] = useState("");
  const [kind, setKind] = useState("car");
  const [year, setYear] = useState("");
  const [euroStatus, setEuroStatus] = useState("");
  const [tank, setTank] = useState("");
  const [battery, setBattery] = useState("");
  const [odo, setOdo] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [brim, setBrim] = useState(true);
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [fillError, setFillError] = useState<{ field: "odo" | "qty"; message: string } | null>(null);
  const [fillStationId, setFillStationId] = useState("none");
  const [homeStations, setHomeStations] = useState<NearbyFillStation[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueVehicle | null>(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [pendingVrm, setPendingVrm] = useState<string | undefined>();
  const [pendingVes, setPendingVes] = useState<VesSummary | undefined>();
  const [plateOpen, setPlateOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ vehicles: Vehicle[] }>("/api/brim/vehicles");
      const cars = asList(res.vehicles);
      setVehicles(cars);
      setSelected((cur) => cur ?? cars.find((v) => v.is_default)?.id ?? cars[0]?.id ?? null);
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
  }, [selected]);

  useEffect(() => {
    if (!vehicle) {
      setFills([]);
      setCalib(null);
      return;
    }
    setNickname(vehicle.nickname ?? "");
    setKind(vehicle.kind ?? "car");
    setYear(vehicle.year !== undefined ? String(vehicle.year) : "");
    setEuroStatus(vehicle.euro_status ?? "");
    setTank(vehicle.tank_litres !== undefined ? String(vehicle.tank_litres) : "");
    setBattery(vehicle.battery_kwh_usable !== undefined ? String(vehicle.battery_kwh_usable) : "");
    setHasHeatPump(vehicle.has_heat_pump === true);
    void api<{ fillUps: FillUp[] }>(`/api/brim/vehicles/${vehicle.id}/fill-ups`)
      .then((r) => setFills(r.fillUps))
      .catch(() => setFills([]));
    void api<Calibration>(`/api/brim/vehicles/${vehicle.id}/calibration`)
      .then(setCalib)
      .catch(() => setCalib(null));
    if (vehicle.propulsion === "bev" || vehicle.propulsion === "phev") {
      void api<{ tariffs: Tariff[] }>(`/api/brim/vehicles/${vehicle.id}/tariffs`)
        .then((r) => {
          const home = r.tariffs.find((t) => t.is_default) ?? r.tariffs[0];
          if (home) {
            setHomePence(String(home.pence_per_kwh));
            setOffpeakPence(home.offpeak_pence !== undefined ? String(home.offpeak_pence) : "");
            setOffpeakWindow(home.offpeak_window ?? "");
          }
        })
        .catch(() => undefined);
    }
  }, [vehicle]);

  useEffect(() => {
    if (!vehicle || vehicle.propulsion === "bev") {
      setHomeStations([]);
      setFillStationId("none");
      return;
    }
    const grade = vehicle.propulsion === "diesel" ? "B7" : "E10";
    void api<{ places: Array<{ kind: string; lat: number; lng: number }> }>("/api/brim/saved-places")
      .then(async (r) => {
        const home = r.places.find((p) => p.kind === "home");
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
    if (!vehicle) return;
    try {
      await api(`/api/brim/vehicles/${vehicle.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nickname: nickname || undefined,
          kind,
          year: year ? Number(year) : undefined,
          euroStatus: euroStatus || undefined,
          euroStatusSource: euroStatus ? "derived" : undefined,
          tankLitres: tank ? Number(tank) : undefined,
          batteryKwhUsable: battery ? Number(battery) : undefined,
          hasHeatPump,
        }),
      });
      if (vehicle.propulsion === "bev" || vehicle.propulsion === "phev") {
        const pence = Number(homePence);
        if (Number.isFinite(pence) && pence > 0) {
          const payload: Record<string, unknown> = { kind: "home", pencePerKwh: pence, isDefault: true };
          const offpeak = Number(offpeakPence);
          if (Number.isFinite(offpeak) && offpeak > 0) payload.offpeakPence = offpeak;
          if (offpeakWindow.trim()) payload.offpeakWindow = offpeakWindow.trim();
          await api(`/api/brim/vehicles/${vehicle.id}/tariffs`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
      }
      toast("Saved.");
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function setDefault() {
    if (!vehicle) return;
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

  async function removeCar() {
    if (!vehicle) return;
    if (!confirm("Delete this car and its fill-ups permanently?")) return;
    await api(`/api/brim/vehicles/${vehicle.id}`, { method: "DELETE" });
    setSelected(null);
    toast("Car deleted.");
    await refresh();
  }

  async function logFill(e: FormEvent) {
    e.preventDefault();
    if (!vehicle) return;
    const pounds = Number(price);
    const when = occurredAt.trim() ? new Date(occurredAt) : undefined;
    try {
      await api("/api/brim/fill-ups", {
        method: "POST",
        body: JSON.stringify({
          vehicleId: vehicle.id,
          odometerMiles: Number(odo),
          quantity: Number(qty),
          unit: vehicle.propulsion === "bev" ? "kwh" : "litres",
          price: Number.isFinite(pounds) ? Math.round(pounds * 100) : 0,
          brim,
          note: note || undefined,
          ...(when && Number.isFinite(when.getTime()) ? { occurredAt: when.toISOString() } : {}),
          ...(vehicle.propulsion !== "bev" && fillStationId !== "none" ? { stationId: fillStationId } : {}),
        }),
      });
      setOdo("");
      setQty("");
      setPrice("");
      setNote("");
      setOccurredAt("");
      setFillStationId("none");
      setFillError(null);
      toast("Fill-up stored.");
      const fillsRes = await api<{ fillUps: FillUp[] }>(`/api/brim/vehicles/${vehicle.id}/fill-ups`);
      setFills(fillsRes.fillUps);
      setCalib(await api<Calibration>(`/api/brim/vehicles/${vehicle.id}/calibration`));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "odometer_rollback") {
        const text = "Odometer must be higher than the last fill-up.";
        setFillError({ field: "odo", message: text });
        toast(text);
      } else if (message === "unit_mismatch") {
        const text = "That quantity unit does not match this car.";
        setFillError({ field: "qty", message: text });
        toast(text);
      } else if (message === "unknown_station") {
        toast("That station is not in the price feed.");
      } else toast.error(message || "Could not log this fill-up.");
    }
  }

  async function removeFill(id: string) {
    if (!vehicle) return;
    try {
      await api(`/api/brim/fill-ups/${id}`, { method: "DELETE" });
      toast("Fill-up deleted.");
      const fillsRes = await api<{ fillUps: FillUp[] }>(`/api/brim/vehicles/${vehicle.id}/fill-ups`);
      setFills(fillsRes.fillUps);
      setCalib(await api<Calibration>(`/api/brim/vehicles/${vehicle.id}/calibration`));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function addFromCatalogue(vehicle: CatalogueVehicle, vrm?: string, ves?: VesSummary) {
    try {
      const euro = euroFromVes(ves?.euroStatus);
      await api("/api/brim/vehicles", {
        method: "POST",
        body: JSON.stringify({
          nickname: `${vehicle.make} ${vehicle.model}`,
          kind: "car",
          propulsion: vehicle.propulsion,
          make: vehicle.make,
          model: vehicle.model,
          ...(vehicle.derivative ? { derivative: vehicle.derivative } : {}),
          ...(vehicle.transmission ? { transmission: vehicle.transmission } : {}),
          ...(vehicle.engineCc !== undefined ? { engineCc: vehicle.engineCc } : {}),
          ...(vehicle.co2Gkm !== undefined ? { co2Gkm: vehicle.co2Gkm } : {}),
          officialConsumption: vehicle.officialConsumption,
          officialUnit: vehicle.officialUnit,
          officialCycle: vehicle.officialCycle,
          vcaMatchId: vehicle.id,
          ...(ves?.year !== undefined ? { year: ves.year } : {}),
          ...(euro ? { euroStatus: euro, euroStatusSource: ves?.euroStatus ? "dvla" : "derived" } : {}),
          ...(vrm ? { vrm } : {}),
        }),
      });
      setCatalogue(null);
      setPendingVrm(undefined);
      setPendingVes(undefined);
      toast("Car saved.");
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const electric = vehicle?.propulsion === "bev" || vehicle?.propulsion === "phev";
  const bev = vehicle?.propulsion === "bev";
  const addCar = (
    <div className="grid gap-4">
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
        <Button title="Add this car" type="button" onClick={() => void addFromCatalogue(catalogue, pendingVrm, pendingVes)}>
          Add this car
        </Button>
      ) : null}
    </div>
  );

  return (
    <main className="mx-auto w-[min(720px,calc(100%-1.5rem))] py-6">
      <h1 className="font-display mb-2 text-3xl md:text-4xl">Garage</h1>
      <p className="mb-6 text-text-muted">Your saved cars, and the fill-ups that correct the brochure figures.</p>
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
            <p className="mb-3 text-sm text-text-muted">Add another car</p>
            {addCar}
          </Card>
          <ul className="mb-6 grid gap-2">
            {vehicles.map((v) => (
              <li key={v.id}>
                <Button title={`Show ${title(v)}`}
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
                    <FormItem>
                      <Label htmlFor="nick">Nickname</Label>
                      <Input title="Nickname"
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
                          <Button title={plateOpen ? "Hide registration" : "Show registration"}
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
                        <AccordionTrigger>More details</AccordionTrigger>
                        <AccordionContent>
                    <FormItem>
                      <Label htmlFor="year">Year of first registration</Label>
                      <Input title="Year of first registration"
                        id="year"
                        className="tabular-nums font-mono"
                        inputMode="numeric"
                        enterKeyHint="next"
                        value={year}
                        onChange={(ev) => setYear(ev.target.value)}
                      />
                    </FormItem>
                    <FormItem>
                      <Label htmlFor="euro">Euro standard</Label>
                      <Input title="Euro standard" id="euro" value={euroStatus} onChange={(ev) => setEuroStatus(ev.target.value)} placeholder="Euro 6" />
                    </FormItem>
                    {electric ? (
                      <>
                        <FormItem>
                          <Label htmlFor="batt">Usable battery kWh</Label>
                          <Input title="Usable battery kWh"
                            id="batt"
                            className="tabular-nums font-mono"
                            inputMode="decimal"
                            enterKeyHint="next"
                            value={battery}
                            onChange={(ev) => setBattery(ev.target.value)}
                          />
                        </FormItem>
                        <FormItem>
                          <Label htmlFor="tariff">Home p/kWh</Label>
                          <Input title="Home p/kWh"
                            id="tariff"
                            className="tabular-nums font-mono"
                            inputMode="decimal"
                            enterKeyHint="next"
                            value={homePence}
                            onChange={(ev) => setHomePence(ev.target.value)}
                          />
                        </FormItem>
                        <FormItem>
                          <Label htmlFor="offpeak">Off-peak p/kWh</Label>
                          <Input title="Off-peak p/kWh"
                            id="offpeak"
                            className="tabular-nums font-mono"
                            inputMode="decimal"
                            enterKeyHint="next"
                            value={offpeakPence}
                            onChange={(ev) => setOffpeakPence(ev.target.value)}
                          />
                        </FormItem>
                        <FormItem>
                          <Label htmlFor="offpeak-window">Off-peak window</Label>
                          <Input title="Off-peak window" id="offpeak-window" value={offpeakWindow} onChange={(ev) => setOffpeakWindow(ev.target.value)} placeholder="00:30-05:30" />
                        </FormItem>
                        <FormItem>
                          <label className="flex min-h-11 items-center gap-2 text-sm">
                            <Switch title="Car has a heat pump" checked={hasHeatPump} onCheckedChange={setHasHeatPump} />
                            Heat pump
                          </label>
                        </FormItem>
                      </>
                    ) : (
                      <FormItem>
                        <Label htmlFor="tank">Tank litres</Label>
                        <Input title="Tank litres"
                          id="tank"
                          className="tabular-nums font-mono"
                          inputMode="decimal"
                          enterKeyHint="done"
                          value={tank}
                          onChange={(ev) => setTank(ev.target.value)}
                        />
                      </FormItem>
                    )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button title="Save details" type="submit">Save details</Button>
                      <Button title="Make default" type="button" variant="outline" onClick={() => void setDefault()}>
                        Make default
                      </Button>
                      <Button title="Delete car" type="button" variant="destructive" onClick={() => void removeCar()}>
                        Delete car
                      </Button>
                    </div>
                  </Form>
                  {calib ? (
                    <p className="tabular-nums font-mono mt-4 text-sm text-text-muted">
                      {calib.confidence === "calibrated"
                        ? `Based on your last ${calib.sampleCount} brim-to-brim intervals${calib.value !== undefined ? `, ${calib.value.toFixed(1)} ${calib.unit}` : ""}.`
                        : calib.confidence === "building"
                          ? `${calib.sampleCount} brim-to-brim interval${calib.sampleCount === 1 ? "" : "s"} so far. Need 3 for a personal figure.`
                          : bev
                            ? "No full charges yet."
                            : "No brim fill-ups yet."}
                    </p>
                  ) : null}
                </Card>
                <Card>
                  <h2 className="mb-3 text-lg">{bev ? "Log a charge" : "Log a fill-up"}</h2>
                  <p className="mb-3 text-sm text-text-muted">
                    Odometer, quantity, {bev ? "full" : "brim"}. Under fifteen seconds.
                  </p>
                  <Form onSubmit={(e) => void logFill(e)}>
                    <FormItem>
                      <Label htmlFor="odo">Odometer miles</Label>
                      <Input title="Odometer miles"
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
                    <FormItem>
                      <Label htmlFor="qty">{bev ? "kWh" : "Litres"}</Label>
                      <Input title={bev ? "kWh added" : "Litres added"}
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
                      <Input title="Price £"
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
                        <Switch title={bev ? "Charged to full" : "Filled to brim"} checked={brim} onCheckedChange={setBrim} />
                        {bev ? "Charged to full" : "Filled to brim"}
                      </label>
                    </FormItem>
                    <FormItem>
                      <Label htmlFor="when">When</Label>
                      <Input title="When"
                        id="when"
                        type="datetime-local"
                        value={occurredAt}
                        onChange={(ev) => setOccurredAt(ev.target.value)}
                      />
                    </FormItem>
                    <FormItem>
                      <Label htmlFor="note">Note</Label>
                      <Input title="Note" id="note" value={note} onChange={(ev) => setNote(ev.target.value)} />
                    </FormItem>
                    {!bev && homeStations.length > 0 ? (
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
                    <Button title={bev ? "Store charge" : "Store fill-up"} type="submit" className="mt-2">
                      {bev ? "Store charge" : "Store fill-up"}
                    </Button>
                    {fillError ? (
                      <p id="fill-error" className="mt-2 text-sm text-train" role="alert">
                        {fillError.message}
                      </p>
                    ) : null}
                  </Form>
                  <ul className="mt-4 grid gap-2">
                    {fills.map((f) => (
                      <li key={f.id} className="flex flex-col gap-2 border-t border-border pt-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="tabular-nums font-mono text-text-muted">
                          {f.occurredAt.slice(0, 10)} · {f.odometerMiles.toFixed(0)} mi · {f.quantity} {f.unit}
                          {f.brim ? (bev ? " · full" : " · brim") : ""}
                          {f.stationName ? ` · ${f.stationName}` : ""}
                          {f.pricePence > 0 ? ` · £${(f.pricePence / 100).toFixed(2)}` : ""}
                        </span>
                        <Button title="Delete" type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void removeFill(f.id)}>
                          Delete
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      )}
    </main>
  );
}
