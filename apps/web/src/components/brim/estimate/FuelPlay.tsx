import { useEffect, useMemo, useRef, useState } from "react";
import {
  playFuelFromText,
  type FuelPlaySeed,
  type PlayField,
  type PlayFuelSuccess,
} from "@locations/brim/engine/what-if";
import { Button } from "../../ui/button";
import { FormItem } from "../../ui/form";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

export type FuelPlayReport = { result: PlayFuelSuccess | null; engaged: boolean };

function money(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function onePlace(value: number): string {
  return String(Number(value.toFixed(1)));
}

function formatHours(hours: number): string {
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function rangeValue(text: string, min: number, max: number, fallback: number): number {
  const value = Number(text);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function FuelPlay({
  routeMeters,
  seed,
  seedKey,
  chargesPence,
  propulsion,
  priceNote,
  onReport,
}: {
  routeMeters: number;
  seed: FuelPlaySeed;
  seedKey: string;
  chargesPence: number;
  propulsion: "petrol" | "diesel";
  priceNote?: string | undefined;
  onReport: (report: FuelPlayReport) => void;
}) {
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const touched = useRef({ mpg: false, price: false, speed: false, miles: false });
  const [mpgText, setMpgText] = useState(seed.mpg);
  const [priceText, setPriceText] = useState(seed.price);
  const [speedText, setSpeedText] = useState(seed.speed);
  const [referenceMph, setReferenceMph] = useState(seed.referenceMph);
  const [saveText, setSaveText] = useState("");
  const [milesText, setMilesText] = useState("");
  const [useMiles, setUseMiles] = useState(seed.miles <= 0);
  const [engaged, setEngaged] = useState(false);
  const lastGood = useRef<PlayFuelSuccess | null>(null);

  useEffect(() => {
    const next = seedRef.current;
    if (!touched.current.mpg) setMpgText(next.mpg);
    if (!touched.current.price) setPriceText(next.price);
    if (!touched.current.speed) setSpeedText(next.speed);
    if (!touched.current.mpg && !touched.current.speed) setReferenceMph(next.referenceMph);
    if (!touched.current.miles) {
      setUseMiles(next.miles <= 0);
      setMilesText("");
    }
  }, [seedKey]);

  const outcome = useMemo(
    () =>
      playFuelFromText({
        routeMeters: routeMeters > 0 ? routeMeters : null,
        milesText: useMiles ? milesText : null,
        mpgText,
        priceText,
        speedText,
        referenceMph,
        chargesPence,
        propulsion,
        saveText,
      }),
    [routeMeters, useMiles, milesText, mpgText, priceText, speedText, referenceMph, chargesPence, propulsion, saveText],
  );

  if (outcome.ok) lastGood.current = outcome;
  const shown = outcome.ok ? outcome : outcome.pending ? lastGood.current : null;

  useEffect(() => {
    const result = outcome.ok ? outcome : outcome.pending ? lastGood.current : null;
    onReport({ result, engaged });
  }, [outcome, engaged, onReport]);

  function mark(field: "mpg" | "price" | "speed" | "miles") {
    touched.current[field] = true;
    setEngaged(true);
  }

  function editMpg(value: string) {
    mark("mpg");
    setMpgText(value);
    const speed = Number(speedText);
    if (Number.isFinite(speed) && speed >= 20 && speed <= 80) setReferenceMph(speed);
  }

  function resetToEstimate() {
    const next = seedRef.current;
    touched.current = { mpg: false, price: false, speed: false, miles: false };
    setEngaged(false);
    setMpgText(next.mpg);
    setPriceText(next.price);
    setSpeedText(next.speed);
    setReferenceMph(next.referenceMph);
    setSaveText("");
    setMilesText("");
    setUseMiles(next.miles <= 0);
  }

  const rawIssues = !outcome.ok && !outcome.pending ? outcome.issues : [];
  const issues =
    engaged || touched.current.miles
      ? rawIssues
      : rawIssues.filter(
          (issue) => !(issue.field === "miles" && issue.message === "Enter the miles for this drive."),
        );
  const saveIssue = outcome.ok && outcome.save && !outcome.save.ok ? outcome.save.message : null;
  const issueList = saveIssue ? [...issues, { field: "save" as PlayField, message: saveIssue }] : issues;
  const invalid = (field: PlayField) => issueList.some((issue) => issue.field === field);
  const fuelName = propulsion === "diesel" ? "diesel" : "petrol";

  return (
    <section className="mt-3 border-t border-border pt-3" aria-label="Play with this drive">
      <h2 className="font-display text-base">Play with this drive</h2>
      <p className="mt-1 text-sm text-text-muted">
        Type the pump price, mpg, or a steady speed. Litres, cost, time, and CO2 update straight away. Tolls and
        clean-air charges stay as estimated.
      </p>
      <p className="mt-1 text-sm text-text-muted">
        The mpg is the economy at the speed on its label. Slower steady driving uses less fuel. Stops are not included.
      </p>
      {priceNote ? <p className="mt-2 text-sm text-train">{priceNote}</p> : null}

      <div className="mt-3 grid gap-3">
        <FormItem>
          <Label htmlFor="play-price">Pump price (p per litre)</Label>
          <Input
            id="play-price"
            title="Pump price in pence per litre"
            value={priceText}
            onChange={(event) => {
              mark("price");
              setPriceText(event.target.value);
            }}
            inputMode="decimal"
            enterKeyHint="next"
            aria-invalid={invalid("price")}
            className="tabular-nums font-mono"
          />
        </FormItem>
        <FormItem>
          <Label htmlFor="play-mpg">mpg at {onePlace(referenceMph)} mph</Label>
          <Input
            id="play-mpg"
            title="Fuel economy in miles per gallon"
            value={mpgText}
            onChange={(event) => editMpg(event.target.value)}
            inputMode="decimal"
            enterKeyHint="next"
            aria-invalid={invalid("mpg")}
            className="tabular-nums font-mono"
          />
          <input
            type="range"
            title="Set mpg with the slider"
            min={10}
            max={80}
            step={0.5}
            value={rangeValue(mpgText, 10, 80, 40)}
            aria-label="mpg slider"
            onChange={(event) => editMpg(event.target.value)}
            className="h-11 w-full cursor-pointer"
            style={{ accentColor: "var(--accent)" }}
          />
        </FormItem>
        <FormItem>
          <Label htmlFor="play-speed">Steady speed (mph)</Label>
          <Input
            id="play-speed"
            title="Steady speed in miles per hour"
            value={speedText}
            onChange={(event) => {
              mark("speed");
              setSpeedText(event.target.value);
            }}
            inputMode="decimal"
            enterKeyHint="next"
            aria-invalid={invalid("speed")}
            className="tabular-nums font-mono"
          />
          <input
            type="range"
            title="Set steady speed with the slider"
            min={20}
            max={80}
            step={1}
            value={rangeValue(speedText, 20, 80, 60)}
            aria-label="Speed slider"
            onChange={(event) => {
              mark("speed");
              setSpeedText(event.target.value);
            }}
            className="h-11 w-full cursor-pointer"
            style={{ accentColor: "var(--accent)" }}
          />
        </FormItem>
        {useMiles ? (
          <FormItem>
            <Label htmlFor="play-miles">Miles</Label>
            <Input
              id="play-miles"
              title="Miles for this drive"
              value={milesText}
              onChange={(event) => {
                mark("miles");
                setMilesText(event.target.value);
              }}
              inputMode="decimal"
              enterKeyHint="done"
              aria-invalid={invalid("miles")}
              className="tabular-nums font-mono"
            />
          </FormItem>
        ) : (
          <p className="tabular-nums font-mono text-sm text-text-muted">
            {seed.miles > 0 ? `${onePlace(seed.miles)} miles on the route` : "No route miles yet"}
          </p>
        )}
        <FormItem>
          <Label htmlFor="play-save">Litres to save (optional)</Label>
          <Input
            id="play-save"
            title="Litres of fuel to save on this drive"
            value={saveText}
            onChange={(event) => {
              setEngaged(true);
              setSaveText(event.target.value);
            }}
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="Optional"
            aria-invalid={invalid("save")}
            className="tabular-nums font-mono"
          />
        </FormItem>
      </div>

      {issueList.length > 0 ? (
        <ul role="alert" className="mt-3 space-y-1 text-sm text-train">
          {issueList.map((issue) => (
            <li key={`${issue.field}:${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      {shown ? (
        <div className="mt-3 space-y-1 text-sm">
          <p className="tabular-nums font-mono">
            {shown.miles.toFixed(1)} miles · {shown.litres.toFixed(2)} L of {fuelName} · {shown.effectiveMpg.toFixed(1)} mpg
            at this speed
          </p>
          <p className="tabular-nums font-mono">
            {formatHours(shown.hours)} · {shown.co2Kg.toFixed(1)} kg CO₂
          </p>
          <p className="tabular-nums font-mono">
            Fuel {money(shown.fuelPence)}
            {shown.chargesPence > 0 ? ` · charges ${money(shown.chargesPence)}` : ""} · total {money(shown.totalPence)}
          </p>
          {Math.abs(shown.versusReference.litresDelta) >= 0.005 ? (
            <p className="tabular-nums font-mono text-text-muted">
              {shown.versusReference.litresDelta < 0
                ? `${Math.abs(shown.versusReference.litresDelta).toFixed(2)} L less than at ${onePlace(shown.referenceMph)} mph (${money(Math.abs(shown.versusReference.penceDelta))} less).`
                : `${shown.versusReference.litresDelta.toFixed(2)} L more than at ${onePlace(shown.referenceMph)} mph (${money(shown.versusReference.penceDelta)} more).`}
            </p>
          ) : null}
          {shown.save?.ok ? (
            <p className="text-text-muted">
              {shown.save.savedLitres === 0
                ? "Saving 0 L keeps this speed and mpg."
                : `A steady ${onePlace(shown.save.speedMph)} mph uses ${shown.save.savedLitres.toFixed(2)} L less (${money(shown.save.savedPence)}). At ${onePlace(shown.speedMph)} mph you would need ${onePlace(shown.save.mpgNeeded)} mpg.`}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          title={useMiles ? "Use the route miles" : "Type miles instead of the route"}
          onClick={() => {
            mark("miles");
            setUseMiles((current) => !current);
          }}
        >
          {useMiles ? "Use the route miles" : "Type miles"}
        </Button>
        <Button type="button" variant="outline" title="Reset price, mpg, and speed to this estimate" onClick={resetToEstimate}>
          Reset to this estimate
        </Button>
      </div>
    </section>
  );
}
