import { motion, useReducedMotion } from 'motion/react';
import { Flame, Route as RouteIcon } from 'lucide-react';
import { interactiveMotion, reducedInteractiveMotion } from '../../lib/motion';
import { cn } from '../../lib/utils';
import type { MapMode } from '../../lib/nav/map-mode';

const MODES: { id: MapMode; label: string; title: string; icon: React.ReactNode }[] = [
  { id: 'heat', label: 'Heat', title: 'Show where you spend time as a heatmap', icon: <Flame size={14} /> },
  { id: 'lines', label: 'Lines', title: 'Show every journey line for a period', icon: <RouteIcon size={14} /> },
];

/** Heat / Lines toggle for the Map tab. */
export default function MapModeSwitch({
  mode,
  onChange,
  className,
}: {
  mode: MapMode;
  onChange: (mode: MapMode) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const motionProps = reduce ? reducedInteractiveMotion : interactiveMotion;
  return (
    <div
      role="radiogroup"
      aria-label="Map view"
      className={cn('flex gap-0.5 rounded-full border border-border bg-surface/95 p-0.5 shadow-md backdrop-blur-sm', className)}
    >
      {MODES.map((m) => {
        const active = m.id === mode;
        return (
          <motion.button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={m.title}
            onClick={() => onChange(m.id)}
            className={cn(
              'relative flex h-11 items-center gap-1.5 rounded-full px-4 text-sm transition-colors duration-300 ease-ui',
              active ? 'text-accent' : 'text-text-muted hover:text-text',
            )}
            {...motionProps}
          >
            {active && (
              <motion.span
                layoutId="map-mode-pill"
                className="absolute inset-0 rounded-full bg-accent/15"
                transition={reduce ? { duration: 0.08 } : { type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {m.icon}
              {m.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
