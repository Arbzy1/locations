import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { AddressField } from "../brim/AddressField";
import { api, asList } from "../../lib/brim/api";
import { fadeMotion, reducedEnterMotion } from "../../lib/motion";
import { journeyCostPath } from "../../lib/nav/paths";
import { useSession } from "../../lib/auth";

type Place = { id: string; kind: "home" | "work" | "favourite"; label: string; lat: number; lng: number };
type Vehicle = {
  id: string;
  nickname?: string;
  make?: string;
  model?: string;
  propulsion: string;
  is_default?: boolean;
};
type Summary = { miles: number; actualPence: number; approvedPence: number; crossedThreshold: boolean };
type Calibration = { sampleCount: number; confidence: string };

type Props = {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
};

function vehicleLabel(v: Vehicle): string {
  return v.nickname?.trim() || [v.make, v.model].filter(Boolean).join(" ").trim() || v.propulsion;
}

/** Journey cost defaults: home/work/favourite trip shortcuts, default car, and HMRC tax-year tally. */
export default function SettingsJourneyCost({ onMessage, onError }: Props) {
  const reduce = useReducedMotion();
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === "demo";
  const [loading, setLoading] = useState(true);
  const [home, setHome] = useState<Place | null>(null);
  const [work, setWork] = useState<Place | null>(null);
  const [favourites, setFavourites] = useState<Place[]>([]);
  const [homeText, setHomeText] = useState("");
  const [workText, setWorkText] = useState("");
  const [favText, setFavText] = useState("");
  const [editingFavId, setEditingFavId] = useState<string | null>(null);
  const [editingFavLabel, setEditingFavLabel] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [defaultVehicleId, setDefaultVehicleId] = useState<string>("none");
  const [calibLine, setCalibLine] = useState<string | null>(null);
  const [hmrc, setHmrc] = useState<Summary | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [placesRes, vehiclesRes, settingsRes] = await Promise.all([
        api<{ places: Place[] }>("/api/brim/saved-places"),
        api<{ vehicles: Vehicle[] }>("/api/brim/vehicles"),
        api<{ defaultVehicleId: string | null }>("/api/brim/settings").catch(() => ({
          defaultVehicleId: null,
        })),
      ]);
      const places = asList(placesRes.places);
      const nextHome = places.find((p) => p.kind === "home") ?? null;
      const nextWork = places.find((p) => p.kind === "work") ?? null;
      const nextFavs = places.filter((p) => p.kind === "favourite");
      setHome(nextHome);
      setWork(nextWork);
      setFavourites(nextFavs);
      setHomeText(nextHome?.label ?? "");
      setWorkText(nextWork?.label ?? "");

      const cars = asList(vehiclesRes.vehicles);
      setVehicles(cars);
      const defCar =
        cars.find((v) => v.id === settingsRes.defaultVehicleId) ??
        cars.find((v) => v.is_default);
      setDefaultVehicleId(defCar ? defCar.id : "none");

      if (defCar) {
        const cal = await api<Calibration>(`/api/brim/vehicles/${defCar.id}/calibration`).catch(
          () => null,
        );
        if (cal?.confidence === "calibrated") {
          setCalibLine(`Based on your last ${cal.sampleCount} brim-to-brim intervals.`);
        } else if (cal?.confidence === "building") {
          setCalibLine(`${cal.sampleCount} brim-to-brim intervals so far. Need 3.`);
        } else {
          setCalibLine("No brim fill-ups on the default car yet.");
        }
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

  async function changeDefaultCar(nextId: string) {
    onError("");
    setDefaultVehicleId(nextId);
    try {
      await api("/api/brim/settings", {
        method: "PATCH",
        body: JSON.stringify({ defaultVehicleId: nextId === "none" ? null : nextId }),
      });
      onMessage(nextId === "none" ? "Default car cleared." : "Default car updated.");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update default car.");
    }
  }

  async function savePlace(
    kind: "home" | "work" | "favourite",
    place: { label: string; lat: number; lng: number },
  ) {
    onError("");
    try {
      await api("/api/brim/saved-places", {
        method: "POST",
        body: JSON.stringify({ kind, label: place.label, lat: place.lat, lng: place.lng }),
      });
      if (kind === "favourite") setFavText("");
      onMessage(
        kind === "home" ? "Home saved." : kind === "work" ? "Work saved." : "Favourite place saved.",
      );
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "favourite_limit") {
        onError("You can save up to 20 favourite places.");
      } else {
        onError(msg || "Could not save that place.");
      }
    }
  }

  async function clearSavedPlace(place: Place | null, label: string) {
    if (!place) return;
    onError("");
    try {
      await api(`/api/brim/saved-places/${place.id}`, { method: "DELETE" });
      onMessage(`${label} removed.`);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : `Could not remove ${label.toLowerCase()}.`);
    }
  }

  async function saveFavouriteRename(id: string) {
    const trimmed = editingFavLabel.trim();
    if (!trimmed) return;
    onError("");
    try {
      await api(`/api/brim/saved-places/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ label: trimmed }),
      });
      setEditingFavId(null);
      setEditingFavLabel("");
      onMessage("Favourite place renamed.");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not rename that place.");
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
          Defaults for fuel, charging, and clean-air estimates. Home, work, and favourites become
          one-tap trip ends.
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
                <div className="space-y-1.5 text-sm">
                  <Label htmlFor="journey-cost-default-car">Default car</Label>
                  {vehicles.length > 0 ? (
                    <Select
                      value={defaultVehicleId}
                      onValueChange={(next) => void changeDefaultCar(next)}
                      disabled={isDemo}
                    >
                      <SelectTrigger
                        id="journey-cost-default-car"
                        title="Choose default car for trip estimates"
                      >
                        <SelectValue placeholder="No default car" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No default car</SelectItem>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {vehicleLabel(v)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-text-muted">No saved cars yet. Add one in the garage.</p>
                  )}
                  {calibLine ? <p className="text-text-muted">{calibLine}</p> : null}
                </div>

                {hmrc ? (
                  <p className="font-mono text-sm tabular-nums text-text-muted">
                    This tax year: {hmrc.miles.toFixed(0)} miles, actual £
                    {(hmrc.actualPence / 100).toFixed(2)}, HMRC would allow £
                    {(hmrc.approvedPence / 100).toFixed(2)}
                    {hmrc.crossedThreshold ? " (past 10,000 miles)." : "."}
                  </p>
                ) : null}

                <fieldset disabled={isDemo} className="flex flex-col gap-4 disabled:opacity-60">
                  <div>
                    <AddressField
                      id="journey-cost-home"
                      label="Home"
                      value={homeText}
                      committed={Boolean(home)}
                      onChange={setHomeText}
                      onSelect={(place) => {
                        setHomeText(place.label);
                        void savePlace("home", place);
                      }}
                      onClear={() => {
                        setHomeText("");
                        void clearSavedPlace(home, "Home");
                      }}
                    />
                    {home ? (
                      <p className="mt-1 text-xs text-text-muted">Saved as {home.label}</p>
                    ) : null}
                  </div>

                  <div>
                    <AddressField
                      id="journey-cost-work"
                      label="Work"
                      value={workText}
                      committed={Boolean(work)}
                      onChange={setWorkText}
                      onSelect={(place) => {
                        setWorkText(place.label);
                        void savePlace("work", place);
                      }}
                      onClear={() => {
                        setWorkText("");
                        void clearSavedPlace(work, "Work");
                      }}
                    />
                    {work ? (
                      <p className="mt-1 text-xs text-text-muted">Saved as {work.label}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="text-sm font-medium text-text">Favourite places</p>
                    {favourites.length > 0 ? (
                      <ul className="grid gap-2">
                        {favourites.map((fav) => (
                          <li
                            key={fav.id}
                            className="flex flex-col gap-2 rounded-lg border border-border bg-bg/40 p-2.5 sm:flex-row sm:items-center sm:justify-between"
                          >
                            {editingFavId === fav.id ? (
                              <div className="flex flex-1 flex-wrap items-center gap-2">
                                <Input
                                  title="Favourite place label"
                                  value={editingFavLabel}
                                  onChange={(e) => setEditingFavLabel(e.target.value)}
                                  className="min-w-[12rem] flex-1"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  title="Save new name"
                                  onClick={() => void saveFavouriteRename(fav.id)}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  title="Cancel renaming"
                                  onClick={() => {
                                    setEditingFavId(null);
                                    setEditingFavLabel("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <>
                                <span className="min-w-0 flex-1 truncate text-sm text-text">
                                  {fav.label}
                                </span>
                                <div className="flex shrink-0 gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    title={`Rename ${fav.label}`}
                                    onClick={() => {
                                      setEditingFavId(fav.id);
                                      setEditingFavLabel(fav.label);
                                    }}
                                  >
                                    Rename
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    title={`Remove ${fav.label}`}
                                    onClick={() => void clearSavedPlace(fav, "Favourite place")}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-text-muted">
                        No favourite places saved yet. Add regular stops below.
                      </p>
                    )}
                    <AddressField
                      id="journey-cost-favourite"
                      label="Add a favourite place"
                      value={favText}
                      onChange={setFavText}
                      onSelect={(place) => {
                        void savePlace("favourite", place);
                      }}
                      onClear={() => setFavText("")}
                    />
                  </div>
                </fieldset>

                {isDemo ? (
                  <p className="text-xs text-text-muted">
                    The demo account cannot change defaults or save places.
                  </p>
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
