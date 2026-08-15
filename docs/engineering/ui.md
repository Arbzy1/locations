# UI: shadcn + Motion

- Primitives: `apps/web/src/components/ui/`
- `cn()`: `apps/web/src/lib/utils.ts`
- Springs: `apps/web/src/lib/motion.ts`

Every interactive control needs hover, active, and release springs. MapLibre tile pan/zoom is exempt. `prefers-reduced-motion: reduce` drops scale bounce to opacity-only.

Theme tokens in `apps/web/src/index.css` feed both Tailwind (`bg-bg`) and shadcn (`bg-background`).
