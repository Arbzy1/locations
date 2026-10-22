import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { api } from "../../lib/brim/api";
import type { CatalogueVehicle } from "./VehicleCatalogue";

export { euroFromVes } from "../../lib/brim/estimate/vehicle-label";

export type VesSummary = {
  make: string;
  propulsion: CatalogueVehicle["propulsion"];
  year?: number;
  engineCc?: number;
  co2Gkm?: number;
  euroStatus?: string;
};

function figure(v: CatalogueVehicle): string {
  if (v.officialUnit === "mpg") return `${v.officialConsumption} mpg`;
  if (v.officialUnit === "mi/kWh") return `${v.officialConsumption} mi/kWh`;
  return `${v.officialConsumption} ${v.officialUnit}`;
}

function trimLine(v: CatalogueVehicle): string {
  return [v.derivative, v.transmission, figure(v), v.officialCycle].filter(Boolean).join(" · ");
}

export function RegLookup({
  onPick,
  onChangeCar,
  onVesOnly,
}: {
  onPick: (vehicle: CatalogueVehicle, vrm: string, ves: VesSummary) => void;
  onChangeCar: () => void;
  onVesOnly?: (ves: VesSummary, vrm: string) => void;
}) {
  const [vrm, setVrm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"single" | "few" | "none" | null>(null);
  const [ves, setVes] = useState<VesSummary | null>(null);
  const [candidates, setCandidates] = useState<CatalogueVehicle[]>([]);
  const [lookedUp, setLookedUp] = useState<string>("");

  async function lookup() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        outcome: "single" | "few" | "none";
        ves: VesSummary;
        candidates: CatalogueVehicle[];
      }>("/api/brim/vehicles/resolve", {
        method: "POST",
        body: JSON.stringify({ vrm }),
      });
      setOutcome(res.outcome);
      setVes(res.ves);
      setCandidates(res.candidates);
      setLookedUp(vrm);
      if (res.outcome === "single" && res.candidates[0]) {
        onPick(res.candidates[0], vrm, res.ves);
      } else if (res.outcome === "none") {
        onVesOnly?.(res.ves, vrm);
      }
    } catch (err) {
      setOutcome(null);
      setCandidates([]);
      const message = err instanceof Error ? err.message : "Could not look up that registration.";
      if (message === "not_found") setError("No vehicle found for that registration.");
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="vrm">UK registration</Label>
      <div className="flex gap-2">
        <Input title="UK registration"
          id="vrm"
          value={vrm}
          onChange={(ev) => setVrm(ev.target.value.toUpperCase())}
          placeholder="AB12 CDE"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          className="tabular-nums font-mono"
        />
        <Button title={busy ? "Looking up…" : "Lookup"} type="button" variant="outline" disabled={busy || vrm.trim().length < 5} onClick={() => void lookup()}>
          {busy ? "Looking up…" : "Lookup"}
        </Button>
      </div>
      <p className="text-xs text-text-muted">Optional. Make and model still work if you would rather not use a reg.</p>
      {error ? <p className="text-sm text-train">{error}</p> : null}
      {outcome === "single" && candidates[0] ? (
        <div className="rounded-lg border border-border p-3">
          <p className="text-sm">We think this is your car</p>
          <p className="mt-1 text-sm">
            {candidates[0].make} {candidates[0].model}
          </p>
          <p className="tabular-nums font-mono text-xs text-text-muted">{trimLine(candidates[0])}</p>
          <Button title="Change" type="button" variant="outline" size="sm" className="mt-2" onClick={onChangeCar}>
            Change
          </Button>
        </div>
      ) : null}
      {outcome === "few" ? (
        <div className="space-y-1">
          <p className="text-sm">Which one is yours?</p>
          {candidates.map((vehicle) => (
            <Button variant="ghost" title="Pick this vehicle"
              key={vehicle.id}
              type="button"
              className="h-auto text-text flex min-h-11 w-full flex-col items-start justify-center rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-bg"
              onClick={() => ves && onPick(vehicle, lookedUp, ves)}
            >
              <span>
                {vehicle.make} {vehicle.model}
              </span>
              <span className="tabular-nums font-mono text-xs text-text-muted">{trimLine(vehicle)}</span>
            </Button>
          ))}
        </div>
      ) : null}
      {outcome === "none" ? (
        <p className="text-sm text-text-muted">
          We could not match a brochure figure. Pick make and model, or type mpg. Year and Euro
          status from the reg are still filled in.
        </p>
      ) : null}
    </div>
  );
}
