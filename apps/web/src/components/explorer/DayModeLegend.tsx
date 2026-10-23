import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { enterMotion } from '../../lib/motion';
import { modeColorVar, type JourneyColoring } from '../../lib/map/journeyColors';
import { MODE_LABELS } from '../../types';

/** prefers-reduced-motion: opacity only, about 80 ms. */
const reducedFade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.08 } };

/** Same dash patterns as the map's journey layers (Map.tsx `dashLayers`), in SVG units. */
const DASH: Record<string, string | undefined> = {
  walking: '1.5 2.5',
  cycling: '3 1.5',
  bus: '4.5 2',
  train: '6 3 1.5 3',
  subway: '6 3 1.5 3',
  flying: '2 3.5',
  unknown: '1.5 1.5',
};

/**
 * Top-left of the Day View map: the transport modes used that day with their line
 * style and count. Tapping one hides or shows its journeys. While one journey is in
 * focus, a chip says which and brings the others back.
 */
export default function DayModeLegend({
  modes,
  hidden,
  onToggle,
  coloring,
  focused,
  onClearFocus,
}: {
  modes: [string, number][];
  hidden: string[];
  onToggle: (mode: string) => void;
  coloring: JourneyColoring;
  focused: { n: number; mode: string } | null;
  onClearFocus: () => void;
}) {
  const reduce = useReducedMotion();
  const motionProps = reduce ? reducedFade : enterMotion;
  if (!modes.length) return null;
  return (
    <div
      // Phones: one row that scrolls sideways, so the chips do not cover the map.
      className="absolute left-3 top-3 z-[400] flex max-w-[calc(100%-5.5rem)] gap-1.5 overflow-x-auto [scrollbar-width:none] lg:pointer-events-none lg:flex-wrap lg:overflow-visible"
      role="group"
      aria-label="Transport modes on this day"
    >
      {modes.map(([mode, count]) => {
        const off = hidden.includes(mode);
        const label = MODE_LABELS[mode] || mode;
        // Coloured by journey, the swatch shows only the line style.
        const color = coloring === 'mode' ? modeColorVar(mode) : 'var(--text-muted)';
        return (
          <Button
            key={mode}
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={!off}
            title={off ? `Show ${label.toLowerCase()} journeys` : `Hide ${label.toLowerCase()} journeys`}
            onClick={() => onToggle(mode)}
            className={cn(
              'pointer-events-auto h-11 shrink-0 gap-1.5 bg-surface/95 px-2.5 text-xs shadow-sm lg:h-8',
              off && 'opacity-45 line-through',
            )}
          >
            <svg width="18" height="6" aria-hidden className="shrink-0">
              <line
                x1="1"
                y1="3"
                x2="17"
                y2="3"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={DASH[mode]}
              />
            </svg>
            <span>{label}</span>
            <span className="text-text-muted">{count}</span>
          </Button>
        );
      })}
      <AnimatePresence>
        {focused && (
          <motion.div key="focus" {...motionProps} className="pointer-events-auto shrink-0">
            <Button
              type="button"
              size="sm"
              title="Show all journeys again"
              onClick={onClearFocus}
              className="h-11 gap-1.5 px-2.5 text-xs shadow-sm lg:h-8"
            >
              Journey {focused.n} ({(MODE_LABELS[focused.mode] || focused.mode).toLowerCase()})
              <span className="opacity-80">· Show all</span>
              <X size={12} aria-hidden />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
