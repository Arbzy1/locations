import type { CatalogueVehicle } from './types.js';
import { vcaToCatalogue } from './normalise.js';
import type { VcaVehicle } from './types.js';

export const CATALOGUE_LIMIT = 20;
export const CATALOGUE_TRIM_LIMIT = 80;
export const MIN_QUERY = 2;

/** Shown first in the make browser; names match VCA spelling when present. */
export const UK_COMMON_MAKES = [
  'Ford',
  'Vauxhall',
  'Volkswagen',
  'BMW',
  'Mercedes-Benz',
  'Audi',
  'Toyota',
  'Nissan',
  'Kia',
  'Hyundai',
  'Peugeot',
  'MINI',
  'Skoda',
  'Honda',
  'MG',
  'Tesla',
] as const;

export type CatalogueFacet = { name: string; count: number };
export type CatalogueGroup = { make: string; model: string; vehicles: CatalogueVehicle[] };

function haystack(v: VcaVehicle): string {
  return `${v.make} ${v.model} ${v.derivative ?? ''} ${v.fuel} ${v.transmission ?? ''}`.toLowerCase();
}

function score(v: VcaVehicle, needle: string): number {
  const make = v.make.toLowerCase();
  const model = v.model.toLowerCase();
  if (make.startsWith(needle)) return 0;
  if (model.startsWith(needle)) return 1;
  if (`${make} ${model}`.startsWith(needle)) return 2;
  if (haystack(v).includes(needle)) return 3;
  return 99;
}

function countBy(
  vehicles: readonly VcaVehicle[],
  key: (v: VcaVehicle) => string,
): CatalogueFacet[] {
  const map = new Map<string, number>();
  for (const v of vehicles) {
    const name = key(v);
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, count]) => ({ name, count }));
}

export function sortVcaMakes(facets: readonly CatalogueFacet[]): CatalogueFacet[] {
  const pin = new Map(UK_COMMON_MAKES.map((name, i) => [name.toLowerCase(), i]));
  return [...facets].sort((a, b) => {
    const pa = pin.get(a.name.toLowerCase());
    const pb = pin.get(b.name.toLowerCase());
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function listVcaMakes(vehicles: readonly VcaVehicle[]): CatalogueFacet[] {
  return sortVcaMakes(countBy(vehicles, (v) => v.make));
}

export function listVcaModels(vehicles: readonly VcaVehicle[], make: string): CatalogueFacet[] {
  const needle = make.trim().toLowerCase();
  if (!needle) return [];
  return countBy(
    vehicles.filter((v) => v.make.toLowerCase() === needle),
    (v) => v.model,
  ).sort((a, b) => a.name.localeCompare(b.name));
}

export function listVcaTrims(
  vehicles: readonly VcaVehicle[],
  make: string,
  model: string,
  limit = CATALOGUE_TRIM_LIMIT,
): CatalogueVehicle[] {
  const makeNeedle = make.trim().toLowerCase();
  const modelNeedle = model.trim().toLowerCase();
  if (!makeNeedle || !modelNeedle) return [];
  return vehicles
    .filter((v) => v.make.toLowerCase() === makeNeedle && v.model.toLowerCase() === modelNeedle)
    .map((v) => vcaToCatalogue(v))
    .sort(
      (a, b) =>
        (a.derivative ?? '').localeCompare(b.derivative ?? '') ||
        (a.transmission ?? '').localeCompare(b.transmission ?? '') ||
        a.propulsion.localeCompare(b.propulsion),
    )
    .slice(0, limit);
}

export function searchVcaCatalogue(
  vehicles: readonly VcaVehicle[],
  q: string,
  limit = CATALOGUE_LIMIT,
): CatalogueVehicle[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];
  return vehicles
    .map((v) => ({ v, s: score(v, needle) }))
    .filter((x) => x.s < 99)
    .sort(
      (a, b) => a.s - b.s || a.v.make.localeCompare(b.v.make) || a.v.model.localeCompare(b.v.model),
    )
    .slice(0, limit)
    .map((x) => vcaToCatalogue(x.v));
}

export function searchVcaGrouped(
  vehicles: readonly VcaVehicle[],
  q: string,
  limit = CATALOGUE_LIMIT,
): CatalogueGroup[] {
  const groups: CatalogueGroup[] = [];
  const index = new Map<string, CatalogueGroup>();
  for (const vehicle of searchVcaCatalogue(vehicles, q, limit)) {
    const key = `${vehicle.make}\0${vehicle.model}`;
    let group = index.get(key);
    if (!group) {
      group = { make: vehicle.make, model: vehicle.model, vehicles: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.vehicles.push(vehicle);
  }
  return groups;
}

export function getVcaById(
  vehicles: readonly VcaVehicle[],
  id: string,
): CatalogueVehicle | undefined {
  const hit = vehicles.find((v) => v.id === id);
  return hit ? vcaToCatalogue(hit) : undefined;
}
