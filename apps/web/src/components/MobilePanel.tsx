import { useEffect, useId, type ReactNode } from 'react';
import { ChevronUp, X } from 'lucide-react';
import { useBreakpoint } from '../hooks/useBreakpoint';

export type MobilePanelHeight = 'peek' | 'half' | 'full';

interface Props {
  /** Whether the overlay panel is open (tablet drawer / phone sheet expanded). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Phone sheet height when open. */
  height?: MobilePanelHeight;
  onHeightChange?: (height: MobilePanelHeight) => void;
  title: string;
  children: ReactNode;
  /** Called when layout size changes (open/close/height/breakpoint) so maps can invalidateSize. */
  onLayoutChange?: () => void;
  /** Optional class on the scrollable body. */
  bodyClassName?: string;
}

const HEIGHT_CLASS: Record<MobilePanelHeight, string> = {
  peek: 'h-[38%]',
  half: 'h-[55%]',
  full: 'h-[85%]',
};

/**
 * Phone: bottom sheet over the map. Tablet: left overlay drawer with scrim.
 * Not rendered on desktop (lg+); parents keep persistent side panels.
 */
export default function MobilePanel({
  open,
  onOpenChange,
  height = 'half',
  onHeightChange,
  title,
  children,
  onLayoutChange,
  bodyClassName = '',
}: Props) {
  const { isPhone, isTablet, isMobileShell } = useBreakpoint();
  const titleId = useId();

  useEffect(() => {
    onLayoutChange?.();
  }, [open, height, isPhone, isTablet, isMobileShell, onLayoutChange]);

  if (!isMobileShell) return null;

  if (isTablet) {
    return (
      <>
        <div
          className={`absolute inset-0 z-[1100] bg-bg/50 transition-opacity duration-ui-enter ease-ui ${
            open ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => onOpenChange(false)}
          aria-hidden={!open}
        />
        <aside
          className={`absolute inset-y-0 left-0 z-[1101] flex w-[min(22rem,85vw)] flex-col border-r border-border bg-surface shadow-xl transition-transform duration-ui-enter ease-ui ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-hidden={!open}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h2 id={titleId} className="truncate text-sm font-semibold text-text">
              {title}
            </h2>
            <button
              type="button"
              title="Close panel"
              aria-label="Close panel"
              onClick={() => onOpenChange(false)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors duration-ui-hover ease-ui hover:bg-bg/50 hover:text-text"
            >
              <X size={18} />
            </button>
          </div>
          <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
        </aside>
      </>
    );
  }

  // Phone bottom sheet
  const cycleHeight = () => {
    if (!onHeightChange) {
      onOpenChange(!open);
      return;
    }
    if (!open) {
      onOpenChange(true);
      onHeightChange('half');
      return;
    }
    if (height === 'peek') onHeightChange('half');
    else if (height === 'half') onHeightChange('full');
    else {
      onOpenChange(false);
      onHeightChange('peek');
    }
  };

  const sheetOpen = open;
  const sheetHeight = sheetOpen ? height : 'peek';

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-[1100] flex flex-col rounded-t-xl border border-b-0 border-border bg-surface shadow-[0_-8px_24px_rgba(0,0,0,0.25)] transition-[height] duration-ui-enter ease-ui ${HEIGHT_CLASS[sheetHeight]}`}
      role="dialog"
      aria-labelledby={titleId}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <button
          type="button"
          title={sheetOpen ? 'Resize or collapse list panel' : 'Expand list panel'}
          aria-label={sheetOpen ? 'Resize or collapse list panel' : 'Expand list panel'}
          aria-expanded={sheetOpen}
          onClick={cycleHeight}
          className="flex min-h-11 flex-1 items-center gap-2 rounded-lg px-1 text-left transition-colors duration-ui-hover ease-ui hover:bg-bg/40"
        >
          <span className="mx-auto flex w-10 justify-center md:mx-0">
            <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
          </span>
          <span id={titleId} className="hidden flex-1 truncate text-sm font-semibold text-text sm:inline">
            {title}
          </span>
          <ChevronUp
            size={18}
            className={`ml-auto shrink-0 text-text-muted transition-transform duration-ui-enter ease-ui ${
              sheetOpen && height === 'full' ? 'rotate-180' : sheetOpen ? 'rotate-0' : 'rotate-0'
            }`}
          />
        </button>
        {sheetOpen && (
          <button
            type="button"
            title="Collapse to peek"
            aria-label="Collapse to peek"
            onClick={() => {
              onOpenChange(false);
              onHeightChange?.('peek');
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-ui-hover ease-ui hover:bg-bg/50 hover:text-text"
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>
        <div className="px-3 pt-2 pb-1 text-sm font-semibold text-text sm:hidden">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** Floating control to open the tablet drawer when closed. */
export function MobilePanelOpenButton({
  label,
  onClick,
  visible,
}: {
  label: string;
  onClick: () => void;
  visible: boolean;
}) {
  const { isTablet } = useBreakpoint();
  if (!isTablet || !visible) return null;

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="absolute left-3 top-3 z-[1050] flex h-11 items-center gap-2 rounded-lg border border-border bg-surface/95 px-3 text-sm font-medium text-text shadow-lg backdrop-blur-sm transition-colors duration-ui-hover ease-ui hover:bg-bg/80"
    >
      {label}
    </button>
  );
}
