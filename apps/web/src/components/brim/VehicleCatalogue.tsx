import { useEffect, useMemo, useState } from 'react';
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { api, asList } from "../../lib/brim/api";

export type CatalogueVehicle = {
  id: string;
  make: string;
  model: string;
  derivative?: string;
  propulsion: 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'bev';
  transmission?: string;
  engineCc?: number;
  co2Gkm?: number;
  officialConsumption: number;
  officialUnit: 'mpg' | 'l/100km' | 'mi/kWh' | 'kWh/100km';
  officialCycle: 'WLTP' | 'NEDC';
};

type Facet = { name: string; count: number };
type Group = { make: string; model: string; vehicles: CatalogueVehicle[] };

const COMMON_MAKES = new Set(
  [
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
  ].map((name) => name.toLowerCase()),
);

const PROPULSION_LABEL: Record<CatalogueVehicle['propulsion'], string> = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  hybrid: 'Hybrid',
  phev: 'Plug-in hybrid',
  bev: 'Electric',
};

function figure(v: CatalogueVehicle): string {
  if (v.officialUnit === 'mpg') return `${v.officialConsumption} mpg`;
  if (v.officialUnit === 'mi/kWh') return `${v.officialConsumption} mi/kWh`;
  return `${v.officialConsumption} ${v.officialUnit}`;
}

function trimLine(v: CatalogueVehicle): string {
  return [v.derivative, PROPULSION_LABEL[v.propulsion], v.transmission, figure(v), v.officialCycle]
    .filter(Boolean)
    .join(' · ');
}

function isCommon(name: string): boolean {
  return COMMON_MAKES.has(name.toLowerCase());
}

function letterGroups(makes: Facet[]): { letter: string; makes: Facet[] }[] {
  const groups: { letter: string; makes: Facet[] }[] = [];
  for (const make of makes) {
    const letter = (make.name[0] ?? '#').toUpperCase();
    const last = groups.at(-1);
    if (last && last.letter === letter) last.makes.push(make);
    else groups.push({ letter, makes: [make] });
  }
  return groups;
}

function FacetButton({
  name,
  count,
  onClick,
}: {
  name: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" title={`Browse ${name}`}
      type="button"
      onClick={onClick}
      className="text-text flex h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-bg"
    >
      <span>{name}</span>
      <span className="tabular-nums font-mono text-xs text-text-muted">{count}</span>
    </Button>
  );
}

function TrimButton({
  vehicle,
  onPick,
}: {
  vehicle: CatalogueVehicle;
  onPick: (v: CatalogueVehicle) => void;
}) {
  return (
    <Button variant="ghost" title="Use this trim"
      type="button"
      onClick={() => onPick(vehicle)}
      className="h-auto text-text flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 py-2 text-left text-sm hover:bg-bg"
    >
      <span>{vehicle.derivative ?? `${vehicle.make} ${vehicle.model}`}</span>
      <span className="tabular-nums font-mono text-xs text-text-muted">
        {[
          PROPULSION_LABEL[vehicle.propulsion],
          vehicle.transmission,
          figure(vehicle),
          vehicle.officialCycle,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </Button>
  );
}

export function VehicleCatalogue({
  selected,
  onSelect,
  open: openProp,
  onOpenChange,
}: {
  selected: CatalogueVehicle | null;
  onSelect: (vehicle: CatalogueVehicle | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (openProp === undefined) setUncontrolledOpen(next);
  }
  const [q, setQ] = useState('');
  const [make, setMake] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [makes, setMakes] = useState<Facet[]>([]);
  const [models, setModels] = useState<Facet[]>([]);
  const [trims, setTrims] = useState<CatalogueVehicle[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const searching = q.trim().length >= 2;

  const commonMakes = useMemo(() => makes.filter((m) => isCommon(m.name)), [makes]);
  const otherMakes = useMemo(() => letterGroups(makes.filter((m) => !isCommon(m.name))), [makes]);

  useEffect(() => {
    if (!open || searching) return;
    if (make && model) {
      const handle = setTimeout(() => {
        void api<{ vehicles: CatalogueVehicle[] }>(
          `/api/brim/vehicles/catalogue?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`,
        )
          .then((r) => setTrims(asList(r.vehicles)))
          .catch(() => setTrims([]));
      }, 0);
      return () => clearTimeout(handle);
    }
    if (make) {
      void api<{ models: Facet[] }>(
        `/api/brim/vehicles/catalogue/models?make=${encodeURIComponent(make)}`,
      )
        .then((r) => setModels(asList(r.models)))
        .catch(() => setModels([]));
      return;
    }
    void api<{ makes: Facet[] }>('/api/brim/vehicles/catalogue/makes')
      .then((r) => setMakes(asList(r.makes)))
      .catch(() => setMakes([]));
  }, [open, searching, make, model]);

  useEffect(() => {
    if (!open || !searching) {
      setGroups([]);
      return;
    }
    const handle = setTimeout(() => {
      void api<{ vehicles: CatalogueVehicle[] }>(
        `/api/brim/vehicles/catalogue?q=${encodeURIComponent(q)}`,
      )
        .then((r) => {
          const next: Group[] = [];
          const index = new Map<string, Group>();
          for (const vehicle of asList(r.vehicles)) {
            const key = `${vehicle.make}\0${vehicle.model}`;
            let group = index.get(key);
            if (!group) {
              group = { make: vehicle.make, model: vehicle.model, vehicles: [] };
              index.set(key, group);
              next.push(group);
            }
            group.vehicles.push(vehicle);
          }
          setGroups(next);
        })
        .catch(() => setGroups([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [open, q, searching]);

  function resetBrowse() {
    setQ('');
    setMake(null);
    setModel(null);
    setModels([]);
    setTrims([]);
    setGroups([]);
  }

  function pick(vehicle: CatalogueVehicle) {
    onSelect(vehicle);
    setOpen(false);
    resetBrowse();
  }

  function closeEmpty() {
    onSelect(null);
    setOpen(false);
    resetBrowse();
  }

  return (
    <div className="space-y-2">
      <Label>Car</Label>
      <Button variant="ghost" title="Find your car"
        type="button"
        onClick={() => setOpen(true)}
        className="h-auto text-text flex min-h-11 w-full flex-col items-start justify-center rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-text"
      >
        {selected ? (
          <>
            <span>
              {selected.make} {selected.model}
            </span>
            <span className="tabular-nums font-mono text-xs text-text-muted">{trimLine(selected)}</span>
          </>
        ) : (
          <span className="text-text-muted">Find your car</span>
        )}
      </Button>
      {selected ? (
        <div className="flex gap-3">
          <Button title="Change" type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            Change
          </Button>
          <Button title="Not this car" type="button" variant="outline" size="sm" onClick={() => onSelect(null)}>
            Not this car
          </Button>
        </div>
      ) : (
        <p className="text-xs text-text-muted">Search, or browse by make. UK type-approved cars only.</p>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetBrowse();
        }}
      >
        <DialogContent title="Find your car" className="flex max-h-[min(92dvh,36rem)] w-full flex-col gap-3 p-4 md:w-[min(92vw,36rem)]">
          <DialogHeader className="mb-0 pr-8">
            <DialogTitle>Find your car</DialogTitle>
            <DialogDescription>Search, or pick a make then a model.</DialogDescription>
          </DialogHeader>
          <Input title="Search cars"
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder="Ford Focus, Nissan Leaf…"
            aria-label="Search cars"
            inputMode="search"
            enterKeyHint="search"
            autoFocus
          />
          {!searching ? (
            <nav
              className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted"
              aria-label="Catalogue"
            >
              <Button variant="ghost" title="Makes"
                type="button"
                className="min-h-11 hover:text-text"
                onClick={() => {
                  setMake(null);
                  setModel(null);
                }}
              >
                Makes
              </Button>
              {make ? (
                <>
                  <span>/</span>
                  <Button variant="ghost" title={`Back to ${make} models`} type="button" className="min-h-11 hover:text-text" onClick={() => setModel(null)}>
                    {make}
                  </Button>
                </>
              ) : null}
              {model ? (
                <>
                  <span>/</span>
                  <span className="text-text">{model}</span>
                </>
              ) : null}
            </nav>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {searching ? (
              groups.length === 0 ? (
                <p className="px-3 py-6 text-sm text-text-muted">
                  No match. Type mpg on the form instead.
                </p>
              ) : (
                groups.map((group) => (
                  <div key={`${group.make} ${group.model}`} className="mb-3">
                    <p className="px-3 py-1 text-xs uppercase tracking-wider text-text-muted">
                      {group.make} {group.model}
                    </p>
                    {group.vehicles.map((vehicle) => (
                      <TrimButton key={vehicle.id} vehicle={vehicle} onPick={pick} />
                    ))}
                  </div>
                ))
              )
            ) : make && model ? (
              trims.length === 0 ? (
                <p className="px-3 py-6 text-sm text-text-muted">No trims for this model.</p>
              ) : (
                trims.map((vehicle) => (
                  <TrimButton key={vehicle.id} vehicle={vehicle} onPick={pick} />
                ))
              )
            ) : make ? (
              models.map((item) => (
                <FacetButton
                  key={item.name}
                  name={item.name}
                  count={item.count}
                  onClick={() => setModel(item.name)}
                />
              ))
            ) : (
              <>
                {commonMakes.length > 0 ? (
                  <div className="mb-3">
                    <p className="px-3 py-1 text-xs uppercase tracking-wider text-text-muted">
                      Common in the UK
                    </p>
                    {commonMakes.map((item) => (
                      <FacetButton
                        key={item.name}
                        name={item.name}
                        count={item.count}
                        onClick={() => setMake(item.name)}
                      />
                    ))}
                  </div>
                ) : null}
                {otherMakes.map((group) => (
                  <div key={group.letter} className="mb-2">
                    <p className="px-3 py-1 text-xs uppercase tracking-wider text-text-muted">
                      {group.letter}
                    </p>
                    {group.makes.map((item) => (
                      <FacetButton
                        key={item.name}
                        name={item.name}
                        count={item.count}
                        onClick={() => setMake(item.name)}
                      />
                    ))}
                  </div>
                ))}
                {makes.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-text-muted">Loading makes…</p>
                ) : null}
              </>
            )}
          </div>
          <Button title="Close the car finder"
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={closeEmpty}
          >
            I don&apos;t see my car
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
