import { useEffect } from 'react';
import { Layers, Bookmark, Ruler, Box } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Sheet, SheetContent } from '../ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { BasemapId } from '../../lib/mapStyle';
import type { MapBookmark } from '../../lib/mapBookmarks';

export type MapChromeProps = {
  isNarrow: boolean;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  basemap: BasemapId;
  onBasemap: (id: BasemapId) => void;
  hasVectorStyle: boolean;
  buildings3d: boolean;
  onBuildings3d: (on: boolean) => void;
  hasHeatmap: boolean;
  heatmapOn: boolean;
  onHeatmapOn: (on: boolean) => void;
  opacityPct: number;
  onOpacityPct: (n: number) => void;
  intensityPct: number;
  onIntensityPct: (n: number) => void;
  measuring: boolean;
  measureLabel: string;
  onToggleMeasure: () => void;
  bookmarks: MapBookmark[];
  canEditBookmarks: boolean;
  onSaveView: () => void;
  onGoBookmark: (b: MapBookmark) => void;
  onDeleteBookmark: (id: string) => void;
};

function ChromeFields(props: MapChromeProps) {
  return (
    <div className="space-y-4 text-left">
      <div>
        <Label htmlFor="map-basemap">Basemap</Label>
        <select
          id="map-basemap"
          title="Choose basemap"
          value={props.basemap}
          onChange={(e) => props.onBasemap(e.target.value as BasemapId)}
          className="mt-1 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text"
        >
          <option value="auto">Auto (theme)</option>
          <option value="street">Street</option>
          <option value="satellite">Satellite</option>
        </select>
      </div>

      {props.hasVectorStyle && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Box size={14} className="text-accent" />
            <Label htmlFor="map-3d">3D buildings</Label>
          </div>
          <Switch
            id="map-3d"
            title={props.buildings3d ? 'Turn 3D buildings off' : 'Turn 3D buildings on'}
            checked={props.buildings3d}
            onCheckedChange={props.onBuildings3d}
          />
        </div>
      )}

      {props.hasHeatmap && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="map-heat">Heatmap</Label>
            <Switch
              id="map-heat"
              title={props.heatmapOn ? 'Turn heatmap off' : 'Turn heatmap on'}
              checked={props.heatmapOn}
              onCheckedChange={props.onHeatmapOn}
            />
          </div>
          <div className={props.heatmapOn ? '' : 'pointer-events-none opacity-40'}>
            <div className="mb-1 flex justify-between text-xs text-text-muted">
              <span>See-through (map labels)</span>
              <span className="font-mono tabular-nums">{props.opacityPct}%</span>
            </div>
            <input
              type="range"
              min={12}
              max={100}
              value={props.opacityPct}
              onChange={(e) => props.onOpacityPct(Number(e.target.value))}
              disabled={!props.heatmapOn}
              title="Heatmap opacity so map labels stay readable"
              className="h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
            />
          </div>
          <div className={props.heatmapOn ? '' : 'pointer-events-none opacity-40'}>
            <div className="mb-1 flex justify-between text-xs text-text-muted">
              <span>Strength</span>
              <span className="font-mono tabular-nums">{props.intensityPct}%</span>
            </div>
            <input
              type="range"
              min={40}
              max={180}
              step={5}
              value={props.intensityPct}
              onChange={(e) => props.onIntensityPct(Number(e.target.value))}
              disabled={!props.heatmapOn}
              title="Heatmap colour strength"
              className="h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={props.measuring ? 'default' : 'outline'}
          title={props.measuring ? 'Stop measuring (Esc)' : 'Measure distance'}
          onClick={props.onToggleMeasure}
        >
          <Ruler size={16} />
          {props.measuring ? props.measureLabel || 'Measuring' : 'Measure'}
        </Button>
        {props.canEditBookmarks && (
          <Button type="button" variant="outline" title="Save this map view" onClick={props.onSaveView}>
            <Bookmark size={16} />
            Save view
          </Button>
        )}
        {props.bookmarks.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" title="Saved map views">
                Views
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {props.bookmarks.map((b) => (
                <DropdownMenuItem
                  key={b.id}
                  title={`Go to ${b.name}`}
                  className="justify-between gap-3"
                  onSelect={() => props.onGoBookmark(b)}
                >
                  <span className="truncate">{b.name}</span>
                  {props.canEditBookmarks && (
                    <button
                      type="button"
                      title={`Delete ${b.name}`}
                      aria-label={`Delete ${b.name}`}
                      className="h-11 px-2 text-xs text-text-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onDeleteBookmark(b.id);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {props.measuring && (
        <p className="text-xs text-text-muted">Click the map to add points. Esc cancels.</p>
      )}
    </div>
  );
}

export default function MapChrome(props: MapChromeProps) {
  useEffect(() => {
    if (!props.isNarrow || !props.sheetOpen) return;
    const id = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 450);
    return () => window.clearTimeout(id);
  }, [props.isNarrow, props.sheetOpen]);

  if (props.isNarrow) {
    return (
      <>
        <div className="pointer-events-auto absolute top-3 right-3 z-[500]">
          <Button
            type="button"
            size="icon"
            variant="outline"
            title="Map layers and tools"
            aria-label="Map layers and tools"
            onClick={() => props.onSheetOpenChange(true)}
          >
            <Layers size={18} />
          </Button>
        </div>
        <Sheet open={props.sheetOpen} onOpenChange={props.onSheetOpenChange}>
          <SheetContent title="Map layers and tools" side="bottom" className="safe-pb">
            <h2 className="mb-3 text-sm font-semibold text-text">Map layers and tools</h2>
            <ChromeFields {...props} />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className="pointer-events-auto absolute top-3 right-3 z-[500] w-[min(100%-1.5rem,18rem)] rounded-lg border border-border bg-surface/95 p-3 text-left shadow-lg backdrop-blur-sm">
      <ChromeFields {...props} />
    </div>
  );
}
