import type { FormEvent, ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../ui/accordion";
import { Button } from "../../ui/button";
import { Form, FormItem } from "../../ui/form";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { AddressField } from "../AddressField";
import type { FocusStop, Health, MapBias, Place, ViaDraft } from "../../../lib/brim/estimate/types";

function StopBadge({ label }: { label: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-border text-xs">
      {label}
    </span>
  );
}

export function TripComposer({
  collapsed,
  onExpand,
  health,
  stale,
  maps,
  setMaps,
  mapsInvalid,
  onMapsSubmit,
  origin,
  destination,
  originPin,
  destPin,
  viaDrafts,
  focusStop,
  pinArmed,
  onArmPin,
  onFocusStop,
  onOriginChange,
  onOriginSelect,
  onOriginClear,
  onDestinationChange,
  onDestinationSelect,
  onDestinationClear,
  onViaChange,
  onViaSelect,
  onViaClear,
  onRemoveVia,
  onAddStop,
  departsAt,
  setDepartsAt,
  onNow,
  loading,
  onSubmit,
  geoError,
  originDescribedBy,
  destDescribedBy,
  tripInvalid,
  originShortcuts,
  destShortcuts,
  viaShortcuts,
  vehicleLabel,
  onOpenVehicle,
  bias,
}: {
  collapsed: boolean;
  onExpand: () => void;
  health: Health | null;
  stale: boolean;
  maps: string;
  setMaps: (value: string) => void;
  mapsInvalid: boolean;
  onMapsSubmit: () => void;
  origin: string;
  destination: string;
  originPin: Place | null;
  destPin: Place | null;
  viaDrafts: ViaDraft[];
  focusStop: FocusStop;
  pinArmed: boolean;
  onArmPin: (stop: FocusStop) => void;
  onFocusStop: (stop: FocusStop) => void;
  onOriginChange: (text: string) => void;
  onOriginSelect: (place: Place) => void;
  onOriginClear: () => void;
  onDestinationChange: (text: string) => void;
  onDestinationSelect: (place: Place) => void;
  onDestinationClear: () => void;
  onViaChange: (index: number, text: string) => void;
  onViaSelect: (index: number, place: Place) => void;
  onViaClear: (index: number) => void;
  onRemoveVia: (index: number) => void;
  onAddStop: () => void;
  departsAt: string;
  setDepartsAt: (value: string) => void;
  onNow: () => void;
  loading: boolean;
  onSubmit: (e: FormEvent) => void;
  geoError: string | null;
  originDescribedBy: string;
  destDescribedBy: string;
  tripInvalid: boolean;
  originShortcuts: ReactNode;
  destShortcuts: ReactNode;
  viaShortcuts: (index: number) => ReactNode;
  vehicleLabel: string;
  onOpenVehicle: () => void;
  bias?: MapBias;
}) {
  const originArmed = pinArmed && focusStop === "origin";
  const destArmed = pinArmed && focusStop === "destination";

  if (collapsed) {
    return (
      <>
        <p className="mb-1 text-text-muted">True journey cost</p>
        {stale ? (
          <p className="mb-3 text-sm text-train">Last estimate on this device. Edit the trip or move a pin to refresh.</p>
        ) : null}
        <div className="mb-3 flex gap-2">
          <div className="flex flex-col items-center" aria-hidden>
            <StopBadge label="A" />
            <div className="my-1 w-px flex-1 bg-border" />
            <StopBadge label="B" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="truncate text-sm">{origin || "From"}</p>
            <p className="truncate text-sm">{destination || "To"}</p>
          </div>
        </div>
        <Button title="Choose the car for this trip" type="button" variant="outline" className="mb-2 w-full justify-start" onClick={onOpenVehicle}>
          {vehicleLabel}
        </Button>
        <Button title="Edit trip" type="button" className="w-full" onClick={onExpand}>
          Edit trip
        </Button>
      </>
    );
  }

  return (
    <>
      <p className="mb-1 text-text-muted">True journey cost</p>
      <h1 className="font-display mb-4 text-2xl">Add your car and we will stop guessing.</h1>
      {health ? (
        <p className="tabular-nums font-mono mb-3 text-xs text-text-muted">
          API {health.status}
          {health.fixtureMode ? " · fixtures" : ""}
        </p>
      ) : (
        <p className="mb-3 text-sm text-train">
          Could not reach the journey cost service. Refresh to try again.
        </p>
      )}
      {stale ? (
        <p className="mb-3 text-sm text-train">
          Showing the last estimate stored on this device. Move a pin or tap Estimate to refresh.
        </p>
      ) : null}

      <Form onSubmit={onSubmit}>
        <div className="mb-3 flex gap-2">
          <div className="flex flex-col items-center pt-7" aria-hidden>
            <StopBadge label="A" />
            <div className="my-1 w-px flex-1 bg-border" />
            {viaDrafts.map((via, index) => (
              <div key={via.id} className="flex flex-col items-center">
                <StopBadge label={String(index + 1)} />
                <div className="my-1 w-px flex-1 bg-border" />
              </div>
            ))}
            <StopBadge label="B" />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={
                originArmed
                  ? "mb-3 rounded-lg ring-2 ring-accent ring-offset-2 ring-offset-card"
                  : "mb-3"
              }
            >
              <AddressField
                id="origin"
                label="From"
                value={origin}
                onChange={onOriginChange}
                onSelect={onOriginSelect}
                onClear={onOriginClear}
                onFocusField={() => onFocusStop("origin")}
                committed={Boolean(originPin)}
                shortcuts={originShortcuts}
                invalid={tripInvalid}
                {...(originDescribedBy ? { describedBy: originDescribedBy } : {})}
                {...(bias ? { bias } : {})}
              />
              <Button title="Pin"
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                aria-pressed={originArmed}
                onClick={() => onArmPin("origin")}
              >
                Pin
              </Button>
            </div>
            {viaDrafts.map((via, index) => {
              const armed = pinArmed && focusStop === index;
              return (
                <div
                  key={via.id}
                  className={armed ? "mb-3 rounded-lg ring-2 ring-accent ring-offset-2 ring-offset-card" : "mb-3"}
                >
                  <AddressField
                    id={`via-${via.id}`}
                    label={`Stop ${index + 1}`}
                    value={via.text}
                    onChange={(text) => onViaChange(index, text)}
                    onSelect={(place) => onViaSelect(index, place)}
                    onClear={() => onViaClear(index)}
                    onFocusField={() => onFocusStop(index)}
                    committed={Boolean(via.pin)}
                    shortcuts={viaShortcuts(index)}
                    {...(bias ? { bias } : {})}
                  />
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button title="Pin"
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={armed}
                      onClick={() => onArmPin(index)}
                    >
                      Pin
                    </Button>
                    <Button title="Remove stop" type="button" variant="outline" size="sm" onClick={() => onRemoveVia(index)}>
                      Remove stop
                    </Button>
                  </div>
                </div>
              );
            })}
            <div
              className={
                destArmed ? "rounded-lg ring-2 ring-accent ring-offset-2 ring-offset-card" : undefined
              }
            >
              <AddressField
                id="destination"
                label="To"
                value={destination}
                onChange={onDestinationChange}
                onSelect={onDestinationSelect}
                onClear={onDestinationClear}
                onFocusField={() => onFocusStop("destination")}
                committed={Boolean(destPin)}
                shortcuts={destShortcuts}
                invalid={tripInvalid}
                {...(destDescribedBy ? { describedBy: destDescribedBy } : {})}
                {...(bias ? { bias } : {})}
              />
              <Button title="Pin"
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                aria-pressed={destArmed}
                onClick={() => onArmPin("destination")}
              >
                Pin
              </Button>
            </div>
            {geoError ? (
              <p id="geo-error" className="mt-1 text-xs text-train" role="alert">
                {geoError}
              </p>
            ) : null}
          </div>
        </div>
        <Button title="Add stop" type="button" variant="outline" size="sm" onClick={onAddStop}>
          Add stop
        </Button>
        <FormItem>
          <Label htmlFor="leave">Leave</Label>
          <div className="flex gap-1">
            <Input title="Leave"
              id="leave"
              type="datetime-local"
              enterKeyHint="next"
              value={departsAt}
              onChange={(ev) => setDepartsAt(ev.target.value)}
            />
            <Button title="Now" type="button" variant="outline" size="sm" onClick={onNow}>
              Now
            </Button>
          </div>
        </FormItem>
        <Button title={loading ? "Working out the number…" : "Estimate"} type="submit">{loading ? "Working out the number…" : "Estimate"}</Button>
      </Form>
      <Accordion type="single" collapsible className="mt-3">
        <AccordionItem value="maps">
          <AccordionTrigger>Have a Maps link?</AccordionTrigger>
          <AccordionContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onMapsSubmit();
              }}
            >
              <FormItem>
                <Label htmlFor="maps">Paste a Maps link</Label>
                <Input title="Paste a Maps link"
                  id="maps"
                  value={maps}
                  onChange={(ev) => setMaps(ev.target.value)}
                  inputMode="url"
                  enterKeyHint="go"
                  autoComplete="off"
                  aria-invalid={mapsInvalid ? true : undefined}
                  aria-describedby={mapsInvalid ? "maps-error maps-help" : "maps-help"}
                />
                <p id="maps-help" className="text-xs text-text-muted">
                  A Google, Apple, or Bing Maps directions link. If it cannot be read, type the places
                  above.
                </p>
              </FormItem>
              <Button title="Estimate from link" type="submit" variant="outline">
                Estimate from link
              </Button>
            </form>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Button title="Choose the car for this trip" type="button" variant="outline" className="mt-3 w-full justify-start" onClick={onOpenVehicle}>
        {vehicleLabel}
      </Button>
    </>
  );
}
