import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  useHeatmap,
  useHeatmapLayers,
  useHomeWork,
  useAreas,
  useInvalidateLocationQueries,
  useSources,
  usePlaceLabels,
} from '../../hooks/useApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useSession } from '../../lib/auth';
import MapView from './Map';
import MobilePanel, { MobilePanelOpenButton, type MobilePanelHeight } from '../shell/MobilePanel';
import { Flame, EyeOff, Eye, Star } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { placePath } from '../../lib/paths';
import { formatDuration } from '../../utils/format';
import type { HeatmapPoint, HotspotLabel, MapFocusTarget } from '../../types';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import FilterPresets from './FilterPresets';
import {
  parseHotspotsQuery,
  serializeHotspotsQuery,
  type HotspotsQuery,
} from '../../lib/view-search-params';
import {
  PLACE_COLOR_TOKENS,
  filterAndRankPlaces,
  findPlaceLabel,
  isPlaceColorToken,
  placeMetric,
  sourceTokenVar,
  toggleChip,
  uniqueLabelTags,
  uniqueTopTypes,
  type PlaceLabelMeta,
} from '../../lib/hotspots';

type HotspotArea = HeatmapPoint & {
  label: string;
  cluster: string;
  totalDurationMinutes: number;
  uniqueDays: number;
  topTypes: string[];
  settlement: string | null;
};

const COLOR_BG: Record<(typeof PLACE_COLOR_TOKENS)[number], string> = {
  accent: 'bg-accent',
  visit: 'bg-visit',
  walk: 'bg-walk',
  train: 'bg-train',
  car: 'bg-car',
  bus: 'bg-bus',
  cycle: 'bg-cycle',
};

function toArea(p: HeatmapPoint): HotspotArea {
  return {
    ...p,
    label: p.label || `Near ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`,
    cluster: p.cluster || p.label || `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`,
    totalDurationMinutes: p.totalDurationMinutes ?? 0,
    uniqueDays: p.uniqueDays ?? 0,
    topTypes: p.topTypes ?? [],
    settlement: p.settlement ?? null,
  };
}

async function patchPlace(body: Record<string, unknown>) {
  const res = await fetch('/api/places/labels', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

function AreaDetails({
  area,
  meta,
  canEdit,
  onPatched,
}: {
  area: HotspotArea;
  meta: PlaceLabelMeta | undefined;
  canEdit: boolean;
  onPatched: () => void;
}) {
  const [label, setLabel] = useState(area.label);
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const placeKey = area.cluster || `${area.lat.toFixed(5)},${area.lon.toFixed(5)}`;
  const favourite = Boolean(meta?.favourite);
  const tags = meta?.tags ?? [];
  const color = meta?.color ?? null;

  const run = async (body: Record<string, unknown>) => {
    setSaving(true);
    await patchPlace({ placeKey, ...body });
    setSaving(false);
    onPatched();
  };

  const addTag = () => {
    const next = tagDraft.trim();
    if (!next) return;
    setTagDraft('');
    void run({ tags: [...tags, next].slice(0, 5) });
  };

  return (
    <div className="rounded-lg border border-border bg-bg/50 p-3">
      <div className="mb-2 text-sm font-semibold leading-snug text-text">{area.label}</div>
      <Button variant="outline" size="sm" asChild title="Open place page" className="mb-2">
        <Link to={placePath(area.cluster)}>Place page</Link>
      </Button>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-text-muted">Visits</dt>
        <dd className="text-right font-mono">{area.count}</dd>
        <dt className="text-text-muted">Days</dt>
        <dd className="text-right font-mono">{area.uniqueDays}</dd>
        <dt className="text-text-muted">Time there</dt>
        <dd className="text-right font-mono">{formatDuration(area.totalDurationMinutes)}</dd>
        {area.settlement && (
          <>
            <dt className="text-text-muted">Area</dt>
            <dd className="text-right">{area.settlement}</dd>
          </>
        )}
        <dt className="text-text-muted">Coords</dt>
        <dd className="text-right font-mono text-text-muted">
          {area.lat.toFixed(4)}, {area.lon.toFixed(4)}
        </dd>
      </dl>
      {area.topTypes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {area.topTypes.map((t) => (
            <span
              key={t}
              className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-text-muted"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {canEdit && (
        <>
          <div className="mt-3 flex gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              title="Custom name for this place"
            />
            <Button
              type="button"
              size="sm"
              title="Save place name"
              disabled={saving}
              onClick={() => void run({ label: label.trim() })}
            >
              Save
            </Button>
          </div>
          <Button
            type="button"
            variant={favourite ? 'default' : 'outline'}
            size="sm"
            className="mt-2"
            title={favourite ? 'Remove from favourites' : 'Mark as favourite'}
            aria-label={favourite ? 'Remove from favourites' : 'Mark as favourite'}
            disabled={saving}
            onClick={() => void run({ favourite: !favourite })}
          >
            <Star size={14} className={favourite ? 'fill-current' : ''} />
            {favourite ? 'Favourited' : 'Favourite'}
          </Button>
          <div className="mt-3">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">Colour</p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant={color ? 'outline' : 'default'}
                size="sm"
                className="h-11 px-2"
                title="Clear place colour"
                disabled={saving}
                onClick={() => void run({ color: null })}
              >
                None
              </Button>
              {PLACE_COLOR_TOKENS.map((token) => (
                <Button
                  key={token}
                  type="button"
                  variant="outline"
                  size="icon"
                  title={`Set colour ${token}`}
                  aria-label={`Set colour ${token}`}
                  disabled={saving}
                  className={color === token ? 'ring-2 ring-accent' : ''}
                  onClick={() => void run({ color: token })}
                >
                  <span className={`h-5 w-5 rounded ${COLOR_BG[token]}`} />
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">Tags</p>
            <div className="mb-2 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11"
                  title={`Remove tag ${tag}`}
                  disabled={saving}
                  onClick={() => void run({ tags: tags.filter((t) => t !== tag) })}
                >
                  {tag} ×
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                title="Add a short tag for this place"
                placeholder="Add tag"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" size="sm" title="Add tag" disabled={saving} onClick={addTag}>
                Add
              </Button>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            title="Hide this place from Hotspots, search, and Insights"
            disabled={saving}
            onClick={() => void run({ hidden: true, label: label.trim() || area.label })}
          >
            <EyeOff size={14} />
            Hide this place
          </Button>
        </>
      )}
      <p className="mt-2 text-[10px] text-text-muted">Selected: map zooms to this spot</p>
    </div>
  );
}

export default function HotspotsView() {
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === 'demo';
  const { data: sources } = useSources();
  const { data: homeWork } = useHomeWork();
  const { data: areas } = useAreas();
  const { data: labels } = usePlaceLabels();
  const invalidate = useInvalidateLocationQueries();
  const [params, setParams] = useSearchParams();
  const filters = parseHotspotsQuery(params);
  const from = filters.from;
  const to = filters.to;
  const sourceIds = filters.sources;
  const selectedTypes = filters.types;
  const selectedTags = filters.tags;
  const favouritesOnly = filters.fav;
  const rankBy = filters.rank;
  const patchFilters = (next: Partial<HotspotsQuery>) => {
    setParams(serializeHotspotsQuery({ ...filters, ...next }), { replace: true });
  };
  const { data: heatmapPoints, isLoading } = useHeatmap({
    from: from || undefined,
    to: to || undefined,
    sources: sourceIds.length ? sourceIds : undefined,
  });
  const activeSourceIds =
    sourceIds.length ? sourceIds : (sources ?? []).map((s) => s.id);
  const layerQueries = useHeatmapLayers(
    activeSourceIds.length > 1 ? activeSourceIds : undefined,
    { from: from || undefined, to: to || undefined },
  );
  const { isDesktop, isPhone } = useBreakpoint();
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetHeight, setSheetHeight] = useState<MobilePanelHeight>('half');
  const [sizeSignal, setSizeSignal] = useState(0);

  useEffect(() => {
    if (filters.lat == null || filters.lon == null) return;
    setFocusTarget({ lat: filters.lat, lon: filters.lon, zoom: 16 });
  }, [filters.lat, filters.lon]);

  const bumpSize = useCallback(() => setSizeSignal((n) => n + 1), []);
  const labelRows: PlaceLabelMeta[] = labels ?? [];

  const allAreas = useMemo(
    () => (heatmapPoints ?? []).map((p) => toArea(p)),
    [heatmapPoints],
  );

  const typeOptions = useMemo(() => uniqueTopTypes(allAreas), [allAreas]);
  const tagOptions = useMemo(() => uniqueLabelTags(labelRows), [labelRows]);
  const hiddenLabels = useMemo(() => labelRows.filter((l) => l.hidden), [labelRows]);

  const filteredAreas = useMemo(
    () =>
      filterAndRankPlaces(allAreas, {
        types: selectedTypes,
        tags: selectedTags,
        favouritesOnly,
        rankBy,
        labels: labelRows,
      }),
    [allAreas, selectedTypes, selectedTags, favouritesOnly, rankBy, labelRows],
  );

  const topAreas = filteredAreas.slice(0, 20);
  const maxMetric = Math.max(1, ...topAreas.map((a) => placeMetric(a, rankBy)));

  const heatForMap: HeatmapPoint[] = useMemo(
    () =>
      filteredAreas.map((a) => ({
        ...a,
        weight: placeMetric(a, rankBy),
      })),
    [filteredAreas, rankBy],
  );

  const heatmapLayers = useMemo(() => {
    if (activeSourceIds.length <= 1) return undefined;
    return activeSourceIds.map((id, i) => ({
      id,
      points: (layerQueries[i]?.data ?? []).map((p) => ({
        ...p,
        weight: p.weight ?? p.count,
      })),
      colorToken: sources?.find((s) => s.id === id)?.color ?? null,
    }));
  }, [activeSourceIds, layerQueries, sources]);

  const hotspotLabels: HotspotLabel[] = useMemo(
    () =>
      topAreas.slice(0, 12).map((a, i) => {
        const showSettlement =
          a.settlement && !a.label.toLowerCase().includes(a.settlement.toLowerCase());
        const meta = findPlaceLabel(a, labelRows);
        return {
          lat: a.lat,
          lon: a.lon,
          label: showSettlement ? `${a.label} (${a.settlement})` : a.label,
          count: a.count,
          rank: i + 1,
          badge:
            rankBy === 'dwell' ? formatDuration(a.totalDurationMinutes) : String(a.count),
          color: isPlaceColorToken(meta?.color) ? meta.color : undefined,
        };
      }),
    [topAreas, labelRows, rankBy],
  );

  const areaKey = (a: HotspotArea) => `${a.lat},${a.lon}`;

  const homeWorkPins = useMemo(() => {
    const pins: { kind: 'home' | 'work'; lat: number; lon: number; label: string }[] = [];
    const coordFor = (cluster: string | undefined) => {
      if (!cluster) return null;
      const fromHeat = (heatmapPoints || []).find(
        (p) => p.cluster === cluster || p.label === cluster,
      );
      if (fromHeat) return { lat: fromHeat.lat, lon: fromHeat.lon };
      const fromArea = (areas || []).find((a) => a.cluster === cluster);
      if (fromArea && Number.isFinite(fromArea.lat) && Number.isFinite(fromArea.lon)) {
        return { lat: fromArea.lat, lon: fromArea.lon };
      }
      return null;
    };
    const homeAt = coordFor(homeWork?.home?.cluster);
    if (homeAt) {
      pins.push({ kind: 'home', ...homeAt, label: homeWork!.home!.cluster });
    }
    const workAt = coordFor(homeWork?.work?.cluster);
    if (workAt) {
      pins.push({ kind: 'work', ...workAt, label: homeWork!.work!.cluster });
    }
    return pins;
  }, [heatmapPoints, areas, homeWork]);

  const onSelectArea = (area: HotspotArea) => {
    setSelectedKey(areaKey(area));
    setFocusTarget({ lat: area.lat, lon: area.lon, zoom: 15 });
    if (isPhone) {
      setPanelOpen(true);
      setSheetHeight('half');
    }
  };

  const listHeader = (
    <div className="border-b border-border p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Flame size={20} className="text-train" />
        Hotspots
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        {heatmapPoints ? `${filteredAreas.length} of ${heatmapPoints.length} locations` : 'Loading...'}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">
        Tap a row for details and to zoom the map. Tags mark top spots on the map.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input
          type="date"
          title="Heatmap start date"
          value={from}
          onChange={(e) => patchFilters({ from: e.target.value })}
          className="h-11 rounded-lg border border-border bg-bg px-2 text-xs text-text"
        />
        <input
          type="date"
          title="Heatmap end date"
          value={to}
          onChange={(e) => patchFilters({ to: e.target.value })}
          className="h-11 rounded-lg border border-border bg-bg px-2 text-xs text-text"
        />
      </div>
      <FilterPresets />
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant={rankBy === 'visits' ? 'default' : 'outline'}
          size="sm"
          className="flex-1"
          title="Rank places by visit count"
          onClick={() => patchFilters({ rank: 'visits' })}
        >
          Visits
        </Button>
        <Button
          type="button"
          variant={rankBy === 'dwell' ? 'default' : 'outline'}
          size="sm"
          className="flex-1"
          title="Rank places by time spent"
          onClick={() => patchFilters({ rank: 'dwell' })}
        >
          Time there
        </Button>
      </div>
      <Button
        type="button"
        variant={favouritesOnly ? 'default' : 'outline'}
        size="sm"
        className="mt-2 w-full"
        title="Show favourite places only"
        aria-pressed={favouritesOnly}
        onClick={() => patchFilters({ fav: !favouritesOnly })}
      >
        <Star size={14} className={favouritesOnly ? 'fill-current' : ''} />
        Favourites
      </Button>
      {typeOptions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {typeOptions.map((t) => {
            const on = selectedTypes.includes(t);
            return (
              <Button
                key={t}
                type="button"
                variant={on ? 'default' : 'outline'}
                size="sm"
                title={on ? `Remove ${t} filter` : `Filter to ${t}`}
                onClick={() => patchFilters({ types: toggleChip(selectedTypes, t) })}
              >
                {t}
              </Button>
            );
          })}
        </div>
      )}
      {tagOptions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tagOptions.map((t) => {
            const on = selectedTags.includes(t);
            return (
              <Button
                key={t}
                type="button"
                variant={on ? 'default' : 'outline'}
                size="sm"
                title={on ? `Remove tag ${t}` : `Filter to tag ${t}`}
                onClick={() => patchFilters({ tags: toggleChip(selectedTags, t) })}
              >
                {t}
              </Button>
            );
          })}
        </div>
      )}
      {sources && sources.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {sources.map((s) => {
            const on = sourceIds.includes(s.id) || sourceIds.length === 0;
            return (
              <Button
                key={s.id}
                type="button"
                variant={on ? 'default' : 'outline'}
                size="sm"
                title={on ? `Hide ${s.label} heat layer` : `Show ${s.label} heat layer`}
                onClick={() =>
                  patchFilters({
                    sources: sourceIds.includes(s.id)
                      ? sourceIds.filter((id) => id !== s.id)
                      : sourceIds.length === 0
                        ? sources.filter((x) => x.id !== s.id).map((x) => x.id)
                        : [...sourceIds, s.id],
                  })
                }
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: sourceTokenVar(s.color) }}
                />
                {s.label}
              </Button>
            );
          })}
        </div>
      )}
      {hiddenLabels.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-bg/40 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">Hidden places</p>
          {hiddenLabels.map((row) => (
            <div key={row.placeKey} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate text-xs text-text">{row.label}</span>
              {isDemo ? (
                <span className="text-[10px] text-text-muted">Hidden</span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title={`Show ${row.label} on Hotspots again`}
                  onClick={() =>
                    void patchPlace({ placeKey: row.placeKey, hidden: false }).then(() => invalidate())
                  }
                >
                  <Eye size={14} />
                  Unhide
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const listBody = (
    <>
      {isLoading ? (
        <div className="p-4 text-sm text-text-muted">Loading heatmap data...</div>
      ) : (
        <div className="p-2">
          {topAreas.map((area, i) => {
            const key = areaKey(area);
            const selected = selectedKey === key;
            const metric = placeMetric(area, rankBy);
            const tipTitle = `${area.label}: ${
              rankBy === 'dwell' ? formatDuration(area.totalDurationMinutes) : `${area.count} visits`
            }`;
            const meta = findPlaceLabel(area, labelRows);
            return (
              <div key={key} className="mb-1">
                <button
                  type="button"
                  title={tipTitle}
                  onClick={() => onSelectArea(area)}
                  className={`flex w-full items-center gap-3 rounded p-2.5 text-left transition-colors duration-ui-emphasis ease-ui hover:bg-bg/50 ${
                    selected ? 'bg-bg/70 ring-1 ring-accent/40' : ''
                  }`}
                >
                  <div className="w-6 shrink-0 text-right font-mono text-sm text-text-muted">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-1 truncate text-sm">
                      {meta?.favourite && (
                        <Star size={12} className="shrink-0 fill-current text-accent" />
                      )}
                      <span className="truncate">{area.label}</span>
                    </div>
                    {area.settlement &&
                      !area.label.toLowerCase().includes(area.settlement.toLowerCase()) && (
                        <div className="mb-1 truncate text-[11px] text-text-muted">
                          {area.settlement}
                        </div>
                      )}
                    <div className="h-2 overflow-hidden rounded-full bg-bg">
                      <div
                        className="h-full rounded-full transition-[width] duration-ui-emphasis ease-ui"
                        style={{
                          width: `${(metric / maxMetric) * 100}%`,
                          background: isPlaceColorToken(meta?.color)
                            ? `var(--${meta.color})`
                            : 'linear-gradient(90deg, var(--accent), var(--train))',
                        }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-sm text-text-muted">
                    {rankBy === 'dwell' ? formatDuration(area.totalDurationMinutes) : area.count}
                  </div>
                </button>
                {selected && (
                  <div className="ui-enter px-2 pb-2 pt-1">
                    <AreaDetails
                      area={area}
                      meta={meta}
                      canEdit={!isDemo}
                      onPatched={invalidate}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const mapPane = (
    <div className="relative min-h-0 flex-1">
      <MapView
        heatmapPoints={heatForMap}
        heatmapLayers={heatmapLayers}
        hotspotLabels={hotspotLabels}
        homeWorkPins={homeWorkPins}
        focusTarget={focusTarget}
        sizeSignal={sizeSignal}
      />
      <MobilePanelOpenButton
        label="Show hotspots"
        visible={!panelOpen}
        onClick={() => setPanelOpen(true)}
      />
      <MobilePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        height={sheetHeight}
        onHeightChange={setSheetHeight}
        title="Hotspots"
        onLayoutChange={bumpSize}
      >
        {listHeader}
        {listBody}
      </MobilePanel>
    </div>
  );

  if (isDesktop) {
    return (
      <div className="flex h-full">
        <div className="w-80 shrink-0 overflow-y-auto border-r border-border bg-surface">
          {listHeader}
          {listBody}
        </div>
        <div className="relative min-h-0 flex-1">
          <MapView
            heatmapPoints={heatForMap}
        heatmapLayers={heatmapLayers}
            hotspotLabels={hotspotLabels}
            homeWorkPins={homeWorkPins}
            focusTarget={focusTarget}
            sizeSignal={sizeSignal}
          />
        </div>
      </div>
    );
  }

  return <div className="relative flex h-full min-h-0">{mapPane}</div>;
}
