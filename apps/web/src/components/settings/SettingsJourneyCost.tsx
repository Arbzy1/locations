import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { AddressField } from "../brim/AddressField";
import { api, asList } from "../../lib/brim/api";
import { fadeMotion, reducedEnterMotion } from "../../lib/motion";
import { journeyCostPath } from "../../lib/nav/paths";
import { useSession } from "../../lib/auth";

type Place = { id: string; kind: "home" | "work" | "favourite"; label: string; lat: number; lng: number };
type Vehicle = { id: string; nickname?: string; make?: string; model?: string; is_default?: boolean };
type Summary = { miles: number; actualPence: number; approvedPence: number; crossedThreshold: boolean };
type Calibration = { sampleCount: number; confidence: string };

type Props = {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
};

/** Journey cost defaults: home/work for trip shortcuts, default car, and the HMRC tax-year tally. */
export default function SettingsJourneyCost({ onMessage, onError }: Props) {
  const reduce = useReducedMotion();
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === "demo";
  const [loading, setLoading] = useState(true);
  const [home, setHome] = useState<Place | null>(null);
  const [work, setWork] = useState<Place | null>(null);
  const [homeText, setHomeText] = useState("");
  const [workText, setWorkText] = useState("");
  const [defaultCar, setDefaultCar] = useState("None");
  const [calibLine, setCalibLine] = useState<string | null>(null);
  const [hmrc, setHmrc] = useState<Summary | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const places = asList((await api<{ places: Place[] }>("/api/brim/saved-places")).places);
      const nextHome = places.find((p) => p.kind === "home") ?? null;
      const nextWork = places.find((p) => p.kind === "work") ?? null;
      setHome(nextHome);
      setWork(nextWork);
      setHomeText(nextHome?.label ?? "");
      setWorkText(nextWork?.label ?? "");
      const cars = asList((await api<{ vehicles: Vehicle[] }>("/api/brim/vehicles")).vehicles);
      const def = cars.find((v) => v.is_default) ?? cars[0];
      setDefaultCar(def ? def.nickname || [def.make, def.model].filter(Boolean).join(" ") || "Saved car" : "None");
      if (def) {
        const cal = await api<Calibration>(`/api/brim/vehicles/${def.id}/calibration`).catch(() => null);
        if (cal?.confidence === "calibrated") setCalibLine(`Based on your last ${cal.sampleCount} brim-to-brim intervals.`);
        else if (cal?.confidence === "building") setCalibLine(`${cal.sampleCount} brim-to-brim intervals so far. Need 3.`);
        else setCalibLine("No brim fill-ups on the default car yet.");
      } else {
        setCalibLine(null);
      }
      setHmrc(await api<Summary>("/api/brim/journeys/summary").catch(() => null));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load journey cost settings.");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function savePlace(kind: "home" | "work", place: { label: string; lat: number; lng: number }) {
    onError("");
    try {
      await api("/api/brim/saved-places", {
        method: "POST",
        body: JSON.stringify({ kind, label: place.label, lat: place.lat, lng: place.lng }),
      });
      onMessage(kind === "home" ? "Home saved." : "Work saved.");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save that place.");
    }
  }

  async function exportJourneys() {
    onError("");
    const res = await fetch("/api/brim/journeys/export", { credentials: "include" });
    if (!res.ok) {
      onError("Could not download your journeys.");
      return;
    }
    const href = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = href;
    link.download = `journey-cost-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(href);
    onMessage("Journey export started.");
  }

  const swap = reduce ? reducedEnterMotion : fadeMotion;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Journey cost</CardTitle>
        <p className="mt-1 text-sm text-text-muted">
          Defaults for fuel, charging, and clean-air estimates. Home and work become one-tap trip
          ends.
        </p>
        <div className="relative mt-4 min-h-40">
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.div key="skeleton" {...swap} aria-busy="true">
                <Skeleton className="mb-3 h-10 w-40" />
                <Skeleton className="h-24 w-full" />
              </motion.div>
            ) : (
              <motion.div key="loaded" {...swap} className="flex flex-col gap-4">
                <div className="text-sm">
                  <p>
                    Default car: <span className="text-text">{defaultCar}</span>
                  </p>
                  {calibLine ? <p className="mt-1 text-text-muted">{calibLine}</p> : null}
                </div>
                {hmrc ? (
                  <p className="font-mono text-sm tabular-nums text-text-muted">
                    This tax year: {hmrc.miles.toFixed(0)} miles, actual £{(hmrc.actualPence / 100).toFixed(2)},
                    HMRC would allow £{(hmrc.approvedPence / 100).toFixed(2)}
                    {hmrc.crossedThreshold ? " (past 10,000 miles)." : "."}
                  </p>
                ) : null}
                <fieldset disabled={isDemo} className="flex flex-col gap-3 disabled:opacity-60">
                  <div>
                    <AddressField
                      id="journey-cost-home"
                      label="Home"
                      value={homeText}
                      onChange={setHomeText}
                      onSelect={(place) => {
                        setHomeText(place.label);
                        void savePlace("home", place);
                      }}
                    />
                    {home ? <p className="mt-1 text-xs text-text-muted">Saved as {home.label}</p> : null}
                  </div>
                  <div>
                    <AddressField
                      id="journey-cost-work"
                      label="Work"
                      value={workText}
                      onChange={setWorkText}
                      onSelect={(place) => {
                        setWorkText(place.label);
                        void savePlace("work", place);
                      }}
                    />
                    {work ? <p className="mt-1 text-xs text-text-muted">Saved as {work.label}</p> : null}
                  </div>
                </fieldset>
                {isDemo ? (
                  <p className="text-xs text-text-muted">The demo account cannot save places.</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" title="Manage saved cars and fill-ups">
                    <Link to={journeyCostPath("garage")}>Open garage</Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    title="Download saved journeys as CSV"
                    onClick={() => void exportJourneys()}
                  >
                    Export journeys
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </div>
  );
}
