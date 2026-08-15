import { useEffect, useState } from "react";
import { useInvalidateLocationQueries, usePublicConfig } from "../hooks/useApi";
import { useUnits } from "../lib/units";
import type { DistanceUnit } from "../utils/format";
import { Button } from "./ui/button";
import { Card, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

type Props = {
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
};

export default function SettingsDisplay({ onError, onMessage }: Props) {
  const { unit, timezone, monthlyRecapEnabled, mapTileDarkUrl, mapTileLightUrl } = useUnits();
  const { data: publicConfig } = usePublicConfig();
  const invalidate = useInvalidateLocationQueries();
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(unit);
  const [tz, setTz] = useState(timezone ?? "");
  const [recapEnabled, setRecapEnabled] = useState(monthlyRecapEnabled);
  const [tileDark, setTileDark] = useState(mapTileDarkUrl ?? "");
  const [tileLight, setTileLight] = useState(mapTileLightUrl ?? "");

  useEffect(() => {
    setDistanceUnit(unit);
    setTz(timezone ?? "");
    setRecapEnabled(monthlyRecapEnabled);
    setTileDark(mapTileDarkUrl ?? "");
    setTileLight(mapTileLightUrl ?? "");
  }, [unit, timezone, monthlyRecapEnabled, mapTileDarkUrl, mapTileLightUrl]);

  const savePrefs = async (includeTiles: boolean) => {
    onError("");
    const res = await fetch("/api/account/settings", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        distanceUnit,
        timezone: tz || null,
        monthlyRecapEnabled: recapEnabled,
        ...(includeTiles && publicConfig?.customTiles
          ? { mapTileDarkUrl: tileDark, mapTileLightUrl: tileLight }
          : {}),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      onError(body.error || "Could not save preferences");
      return;
    }
    invalidate();
    onMessage(includeTiles ? "Map tiles saved." : "Display preferences saved.");
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardTitle className="text-base">Units and timezone</CardTitle>
        <p className="mt-1 mb-4 text-sm text-text-muted">Used on maps, Insights, and day views.</p>
        <Label htmlFor="unit">Distance unit</Label>
        <select
          id="unit"
          title="Miles or kilometres"
          value={distanceUnit}
          onChange={(e) => setDistanceUnit(e.target.value as DistanceUnit)}
          className="mb-3 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text"
        >
          <option value="mi">Miles</option>
          <option value="km">Kilometres</option>
        </select>
        <Label htmlFor="tz">Timezone (IANA)</Label>
        <Input
          id="tz"
          title="IANA timezone such as Europe/London"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          placeholder="Europe/London"
          className="mb-4"
        />
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="monthly-recap">Monthly recap email</Label>
            <p className="text-xs text-text-muted">
              Opt in to a counts-only recap after each month. No place names or coordinates.
            </p>
          </div>
          <Switch
            id="monthly-recap"
            title="Enable monthly recap email"
            checked={recapEnabled}
            onCheckedChange={setRecapEnabled}
          />
        </div>
        <Button type="button" title="Save display preferences" onClick={() => void savePrefs(false)}>
          Save preferences
        </Button>
      </Card>

      {publicConfig?.customTiles && (
        <Card>
          <CardTitle className="text-base">Custom map tiles</CardTitle>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            HTTPS XYZ templates with {"{z}"}, {"{x}"}, and {"{y}"}. Hosts must be on this
            environment allowlist
            {publicConfig.customTileHosts?.length
              ? `: ${publicConfig.customTileHosts.join(", ")}`
              : ""}
            . Used for Auto basemap when no vector style is configured.
          </p>
          <Label htmlFor="tile-dark">Dark raster URL</Label>
          <Input
            id="tile-dark"
            title="Custom dark basemap tile URL"
            value={tileDark}
            onChange={(e) => setTileDark(e.target.value)}
            placeholder="https://tiles.example.com/{z}/{x}/{y}.png"
            className="mb-3"
          />
          <Label htmlFor="tile-light">Light raster URL</Label>
          <Input
            id="tile-light"
            title="Custom light basemap tile URL"
            value={tileLight}
            onChange={(e) => setTileLight(e.target.value)}
            placeholder="https://tiles.example.com/{z}/{x}/{y}.png"
            className="mb-4"
          />
          <Button type="button" title="Save custom map tiles" onClick={() => void savePrefs(true)}>
            Save map tiles
          </Button>
        </Card>
      )}
    </div>
  );
}
