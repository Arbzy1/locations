import { useEffect, useMemo, useState } from "react";
import { useInvalidateLocationQueries, usePublicConfig } from "../../hooks/useApi";
import { useSession } from "../../lib/auth";
import { useUnits } from "../../lib/units";
import { isValidIanaTimeZone, type DistanceUnit } from "../../utils/format";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { EjectField } from "../ui/eject-field";
import { Switch } from "../ui/switch";
import ColourMoodCatalog from "./ColourMoodCatalog";

type Props = {
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
};

const FALLBACK_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export default function SettingsDisplay({ onError, onMessage }: Props) {
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === "demo";
  const { unit, timezone, monthlyRecapEnabled, mapTileDarkUrl, mapTileLightUrl } = useUnits();
  const { data: publicConfig } = usePublicConfig();
  const invalidate = useInvalidateLocationQueries();
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(unit);
  const [tz, setTz] = useState(timezone ?? "");
  const [recapEnabled, setRecapEnabled] = useState(monthlyRecapEnabled);
  const [tileDark, setTileDark] = useState(mapTileDarkUrl ?? "");
  const [tileLight, setTileLight] = useState(mapTileLightUrl ?? "");
  const [saving, setSaving] = useState(false);

  const supportedTimeZones = useMemo(() => {
    if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
      try {
        const zones = Intl.supportedValuesOf("timeZone");
        return zones.includes("UTC") ? zones : ["UTC", ...zones];
      } catch {
        return FALLBACK_TIMEZONES;
      }
    }
    return FALLBACK_TIMEZONES;
  }, []);

  useEffect(() => {
    setDistanceUnit(unit);
    setTz(timezone ?? "");
    setRecapEnabled(monthlyRecapEnabled);
    setTileDark(mapTileDarkUrl ?? "");
    setTileLight(mapTileLightUrl ?? "");
  }, [unit, timezone, monthlyRecapEnabled, mapTileDarkUrl, mapTileLightUrl]);

  const useBrowserTimezone = () => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) {
        setTz(detected);
        onError("");
      }
    } catch {
      onError("Could not read timezone from this browser.");
    }
  };

  const savePrefs = async (includeTiles: boolean) => {
    if (isDemo) return;
    onError("");
    const trimmedTz = tz.trim();
    if (trimmedTz && !isValidIanaTimeZone(trimmedTz)) {
      onError("Enter a valid IANA timezone such as Europe/London or UTC.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distanceUnit,
          timezone: trimmedTz || null,
          monthlyRecapEnabled: recapEnabled,
          ...(includeTiles && publicConfig?.customTiles
            ? {
                mapTileDarkUrl: tileDark.trim() || null,
                mapTileLightUrl: tileLight.trim() || null,
              }
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
    } finally {
      setSaving(false);
    }
  };

  const resetCustomTiles = async () => {
    if (isDemo) return;
    onError("");
    setSaving(true);
    try {
      const res = await fetch("/api/account/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapTileDarkUrl: null,
          mapTileLightUrl: null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        onError(body.error || "Could not reset custom map tiles");
        return;
      }
      setTileDark("");
      setTileLight("");
      invalidate();
      onMessage("Custom map tiles reset to defaults.");
    } finally {
      setSaving(false);
    }
  };

  const hasCustomTiles = Boolean(
    tileDark.trim() || tileLight.trim() || mapTileDarkUrl || mapTileLightUrl,
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ColourMoodCatalog />
      <Card>
        <CardTitle className="text-base">Units and timezone</CardTitle>
        <p className="mt-1 mb-4 text-sm text-text-muted">Used on maps, Insights, and day views.</p>
        {isDemo && (
          <p className="mb-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
            Demo mode: theme and all 30 colour moods apply immediately in this browser. Sign up for
            your own account to save distance units, timezone, and email preferences.
          </p>
        )}
        <EjectField label="Distance unit" htmlFor="unit" className="mb-3">
          <select
            id="unit"
            title="Miles or kilometres"
            value={distanceUnit}
            onChange={(e) => setDistanceUnit(e.target.value as DistanceUnit)}
            className="h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text"
          >
            <option value="mi">Miles</option>
            <option value="km">Kilometres</option>
          </select>
        </EjectField>
        {!isDemo && (
          <>
            <EjectField label="Timezone (IANA)" htmlFor="tz" className="mb-2">
              <Input
                id="tz"
                list="iana-timezones"
                title="IANA timezone such as Europe/London"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
              />
            </EjectField>
            <datalist id="iana-timezones">
              {supportedTimeZones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <div className="mb-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                title="Use the timezone reported by this browser"
                onClick={useBrowserTimezone}
              >
                Use browser timezone
              </Button>
            </div>
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
            <Button
              type="button"
              title="Save display preferences"
              disabled={saving}
              onClick={() => void savePrefs(false)}
            >
              {saving ? "Saving…" : "Save preferences"}
            </Button>
          </>
        )}
      </Card>

      {publicConfig?.customTiles && !isDemo && (
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
          <EjectField label="Dark raster URL" htmlFor="tile-dark" className="mb-3">
            <Input
              id="tile-dark"
              title="Custom dark basemap tile URL"
              value={tileDark}
              onChange={(e) => setTileDark(e.target.value)}
            />
          </EjectField>
          <EjectField label="Light raster URL" htmlFor="tile-light" className="mb-4">
            <Input
              id="tile-light"
              title="Custom light basemap tile URL"
              value={tileLight}
              onChange={(e) => setTileLight(e.target.value)}
            />
          </EjectField>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              title="Save custom map tiles"
              disabled={saving}
              onClick={() => void savePrefs(true)}
            >
              {saving ? "Saving…" : "Save map tiles"}
            </Button>
            {hasCustomTiles && (
              <Button
                type="button"
                variant="outline"
                title="Clear custom tile URLs and restore default basemap"
                disabled={saving}
                onClick={() => void resetCustomTiles()}
              >
                Reset custom tiles
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
