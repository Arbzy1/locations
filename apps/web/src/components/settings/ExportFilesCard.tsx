import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";
import { EjectField } from "../ui/eject-field";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";

const FORMATS = [
  { id: "gpx", label: "GPX", title: "Download stays and journeys as GPX for mapping and fitness apps", needsRange: true },
  { id: "geojson", label: "GeoJSON", title: "Download stays and journeys as GeoJSON for GIS tools", needsRange: true },
  { id: "csv", label: "Stays CSV", title: "Download every stay as a spreadsheet", needsRange: false },
] as const;

/** Year-long cap the API enforces for files with journey lines. */
const MAX_RANGE_DAYS = 366;

function exportHref(format: string, from: string, to: string, blur: boolean) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (blur) params.set("blur_home", "1");
  const qs = params.toString();
  return `/api/export/${format}${qs ? `?${qs}` : ""}`;
}

/** GPX / GeoJSON / CSV downloads, with an option to hide where you live. */
export default function ExportFilesCard() {
  const thisYear = new Date().getFullYear();
  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to, setTo] = useState(`${thisYear}-12-31`);
  const [blur, setBlur] = useState(true);
  const spanDays = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0;
  const rangeOk = Boolean(from && to && spanDays >= 1 && spanDays <= MAX_RANGE_DAYS);

  return (
    <Card>
      <CardTitle className="text-base">Map files</CardTitle>
      <p className="mt-1 mb-4 text-sm text-text-muted">
        Take your history to other apps. GPX and GeoJSON include journey lines and cover up to a
        year; the stays CSV covers the dates you pick, or clear them for everything.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <EjectField label="From" htmlFor="export-from">
          <input
            id="export-from"
            type="date"
            title="First day to export"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-11 w-full rounded-lg border border-border bg-bg px-2 text-sm text-text"
          />
        </EjectField>
        <EjectField label="To" htmlFor="export-to">
          <input
            id="export-to"
            type="date"
            title="Last day to export"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-11 w-full rounded-lg border border-border bg-bg px-2 text-sm text-text"
          />
        </EjectField>
      </div>
      <div className="mt-3 flex min-h-11 items-center gap-3">
        <Switch
          id="export-blur-home"
          checked={blur}
          onCheckedChange={setBlur}
          title="Blur the area around your home in exported files"
        />
        <Label htmlFor="export-blur-home" className="text-sm text-text">
          Blur home (about 1 km)
        </Label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {FORMATS.map((f) => {
          const disabled = f.needsRange && !rangeOk;
          return disabled ? (
            <Button key={f.id} type="button" variant="outline" disabled title={`${f.label} needs a range of up to a year`}>
              <Download size={14} />
              {f.label}
            </Button>
          ) : (
            <Button key={f.id} variant="outline" asChild title={f.title}>
              <a href={exportHref(f.id, from, to, blur)} download>
                <Download size={14} />
                {f.label}
              </a>
            </Button>
          );
        })}
      </div>
      {!rangeOk && (
        <p className="mt-2 text-xs text-text-muted">Pick a range of up to a year for GPX and GeoJSON.</p>
      )}
    </Card>
  );
}
