import { describe, expect, it } from 'vitest';
import {
  getVcaById,
  listVcaMakes,
  listVcaModels,
  listVcaTrims,
  searchVcaCatalogue,
  searchVcaGrouped,
} from "\@locations/brim/shared/vca/search.js";
import type { VcaVehicle } from "\@locations/brim/shared/vca/types.js";

const sample: VcaVehicle[] = [
  {
    id: 'vca_focus',
    make: 'Ford',
    model: 'Focus',
    derivative: '1.0 EcoBoost 125 Titanium',
    fuel: 'petrol',
    consumptionCombined: 51.4,
    unit: 'mpg',
    cycle: 'WLTP',
    datasetVersion: 'fixture',
  },
  {
    id: 'vca_fiesta',
    make: 'Ford',
    model: 'Fiesta',
    derivative: '1.0 EcoBoost ST-Line',
    fuel: 'petrol',
    consumptionCombined: 55.4,
    unit: 'mpg',
    cycle: 'WLTP',
    datasetVersion: 'fixture',
  },
  {
    id: 'vca_leaf',
    make: 'Nissan',
    model: 'Leaf',
    fuel: 'bev',
    consumptionCombined: 3.6,
    unit: 'mi/kWh',
    cycle: 'WLTP',
    datasetVersion: 'fixture',
  },
];

describe('searchVcaCatalogue', () => {
  it('returns nothing for a short or empty query', () => {
    expect(searchVcaCatalogue(sample, '')).toEqual([]);
    expect(searchVcaCatalogue(sample, 'F')).toEqual([]);
  });

  it('ranks make prefix ahead of a later substring', () => {
    const hits = searchVcaCatalogue(sample, 'ford');
    expect(hits.map((h) => h.model)).toEqual(['Fiesta', 'Focus']);
  });

  it('finds a model substring', () => {
    const hits = searchVcaCatalogue(sample, 'leaf');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.propulsion).toBe('bev');
    expect(hits[0]?.officialConsumption).toBe(3.6);
  });

  it('looks up by id', () => {
    expect(getVcaById(sample, 'vca_focus')?.make).toBe('Ford');
    expect(getVcaById(sample, 'missing')).toBeUndefined();
  });
});

describe('listVcaMakes', () => {
  it('pins Ford ahead of Nissan and reports counts', () => {
    const makes = listVcaMakes(sample);
    expect(makes[0]).toEqual({ name: 'Ford', count: 2 });
    expect(makes.map((m) => m.name)).toContain('Nissan');
  });
});

describe('listVcaModels', () => {
  it('lists Ford models A-Z', () => {
    expect(listVcaModels(sample, 'ford').map((m) => m.name)).toEqual(['Fiesta', 'Focus']);
    expect(listVcaModels(sample, '')).toEqual([]);
  });
});

describe('listVcaTrims', () => {
  it('returns the Focus trim and nothing for an unknown model', () => {
    const trims = listVcaTrims(sample, 'Ford', 'Focus');
    expect(trims).toHaveLength(1);
    expect(trims[0]?.derivative).toBe('1.0 EcoBoost 125 Titanium');
    expect(listVcaTrims(sample, 'Ford', 'Mondeo')).toEqual([]);
  });
});

describe('searchVcaGrouped', () => {
  it('groups Ford hits by model', () => {
    const groups = searchVcaGrouped(sample, 'ford');
    expect(groups.map((g) => g.model)).toEqual(['Fiesta', 'Focus']);
    expect(groups[0]?.vehicles).toHaveLength(1);
  });

  it('returns nothing for a short query', () => {
    expect(searchVcaGrouped(sample, 'F')).toEqual([]);
  });
});
