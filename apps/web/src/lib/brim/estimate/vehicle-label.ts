import type { CatalogueVehicle } from "../../../components/brim/VehicleCatalogue";
import type { Vehicle } from "./types";

export function euroFromVes(raw: string | undefined): string {
  if (!raw) return "";
  const n = raw.match(/(\d+)/);
  return n?.[1] ? `Euro ${n[1]}` : raw;
}

export function vehicleChipLabel(input: {
  vehicleId: string;
  selected?: Vehicle;
  catalogue: CatalogueVehicle | null;
  propulsion: string;
  vehicleKind: string;
}): string {
  if (input.vehicleId !== "inline" && input.selected) {
    return (
      input.selected.nickname ??
      [input.selected.make, input.selected.model].filter(Boolean).join(" ") ??
      input.selected.propulsion
    );
  }
  if (input.catalogue) return `${input.catalogue.make} ${input.catalogue.model}`;
  return `This trip: ${input.propulsion} ${input.vehicleKind}`;
}

export function savedPlaceChipLabel(kind: "home" | "work" | "favourite", label: string): string {
  if (kind === "home") return "Home";
  if (kind === "work") return "Work";
  const short = label.split(",")[0]?.trim();
  return short && short.length > 0 ? short : "Saved";
}

export function pinHudCopy(focus: "origin" | "destination" | number): string {
  if (focus === "origin") return "Tap the map to set From. Drag a pin to nudge.";
  if (focus === "destination") return "Tap the map to set To. Further taps replace To. Drag a pin to nudge.";
  return `Tap the map to set Stop ${focus + 1}. Drag a pin to nudge.`;
}
