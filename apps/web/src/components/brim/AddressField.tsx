import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Command, CommandEmpty, CommandItem, CommandList } from "../ui/command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";
import {
  fetchPlaceSuggestions,
  newPlaceSession,
  resolvePlaceSuggestion,
  type Place,
  type PlaceSuggestion,
} from "../../lib/brim/places-client";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import type { MapBias } from "../../lib/brim/estimate/types";

type AddressFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: Place) => void;
  onFocusField?: () => void;
  onClear?: () => void;
  describedBy?: string | undefined;
  invalid?: boolean;
  committed?: boolean;
  shortcuts?: ReactNode;
  bias?: MapBias;
};

export function AddressField({
  id,
  label,
  value,
  onChange,
  onSelect,
  onFocusField,
  onClear,
  describedBy,
  invalid,
  committed,
  shortcuts,
  bias,
}: AddressFieldProps) {
  const listId = useId();
  const session = useRef(newPlaceSession());
  const [hits, setHits] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(0);
  // Suggestions only pop open while the user is in this field, not when a value is set for them.
  const focused = useRef(false);
  const { isDesktop: wide } = useBreakpoint();
  const showClear = Boolean(committed || value.trim());

  useEffect(() => {
    window.clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    timer.current = window.setTimeout(() => {
      void fetchPlaceSuggestions(q, session.current, bias)
        .then((next) => {
          setHits(next);
          setOpen(focused.current);
        })
        .catch(() => {
          setHits([]);
          setOpen(false);
        });
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [value, bias?.lat, bias?.lng]);

  async function applyHit(hit: PlaceSuggestion) {
    const place = await resolvePlaceSuggestion(hit, session.current);
    if (!place) return;
    onChange(place.label);
    onSelect(place);
    setHits([]);
    setOpen(false);
    session.current = newPlaceSession();
  }

  async function pick(hit: PlaceSuggestion) {
    setBusy(true);
    try {
      await applyHit(hit);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (busy) return;
    const q = value.trim();
    if (q.length < 2) return;
    setBusy(true);
    try {
      const next = hits.length > 0 ? hits : await fetchPlaceSuggestions(q, session.current, bias);
      const first = next[0];
      if (!first) {
        setHits(next);
        setOpen(true);
        return;
      }
      await applyHit(first);
    } catch {
      setHits([]);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    onChange("");
    onClear?.();
    setHits([]);
    setOpen(false);
  }

  const input = (
    <Input
      id={id}
      value={value}
      role="combobox"
      aria-expanded={open && !busy}
      aria-controls={listId}
      aria-autocomplete="list"
      autoComplete="off"
      enterKeyHint="search"
      placeholder="Type a UK street, or tap Pin then the map."
      {...(describedBy ? { "aria-describedby": describedBy } : {})}
      {...(invalid ? { "aria-invalid": true as const } : {})}
      onFocus={() => {
        focused.current = true;
        onFocusField?.();
        if (hits.length > 0) setOpen(true);
      }}
      onBlur={() => {
        focused.current = false;
      }}
      onChange={(ev) => {
        onChange(ev.target.value);
      }}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          setOpen(false);
          return;
        }
        if (ev.key === "Enter") {
          ev.preventDefault();
          void confirm();
        }
      }}
    />
  );

  const list = (
    <Command shouldFilter={false}>
      <CommandList id={listId}>
        <CommandEmpty>No matching address. Keep typing a UK street or postcode.</CommandEmpty>
        {hits.map((hit) => (
          <CommandItem
            key={hit.placeId ?? hit.label}
            value={hit.label}
            onSelect={() => void pick(hit)}
          >
            {hit.label}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );

  const field = wide ? (
    <Popover open={open && !busy} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div>{input}</div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        onOpenAutoFocus={(ev) => ev.preventDefault()}
        onCloseAutoFocus={(ev) => ev.preventDefault()}
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] p-1"
      >
        {list}
      </PopoverContent>
    </Popover>
  ) : (
    <>
      {input}
      {open && !busy ? (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface p-1">
          {list}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="relative">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1">
        <div className="min-w-0 flex-1">{field}</div>
        <Button title="Set" type="button" variant="outline" size="sm" onClick={() => void confirm()} disabled={busy}>
          Set
        </Button>
        {showClear ? (
          <Button title="Clear" type="button" variant="outline" size="sm" onClick={clear} aria-label={`Clear ${label}`}>
            Clear
          </Button>
        ) : null}
      </div>
      {shortcuts ? <div className="mt-1 flex flex-wrap gap-1">{shortcuts}</div> : null}
    </div>
  );
}
