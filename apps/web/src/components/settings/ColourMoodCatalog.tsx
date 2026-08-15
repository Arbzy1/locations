import { motion, useReducedMotion } from "motion/react";
import { Shuffle } from "lucide-react";
import { useTheme } from "../../lib/theme";
import { COLOUR_MOODS, type MoodId } from "../../lib/theme/moods";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";
import { hoverSpring, pressSpring } from "../../lib/motion";

export default function ColourMoodCatalog() {
  const { theme, mood, setMood, shuffleMood } = useTheme();
  const reduce = useReducedMotion();

  return (
    <Card className="md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Colour moods</CardTitle>
          <p className="mt-1 text-sm text-text-muted">
            Tints chrome, accents, and mode colours. Light and dark still live on the rail. Map tiles follow light and
            dark, not the mood.
          </p>
        </div>
        <Button type="button" variant="outline" title="Pick a random colour mood" onClick={shuffleMood}>
          <Shuffle size={16} />
          Shuffle
        </Button>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {COLOUR_MOODS.map((item) => {
          const selected = item.id === mood;
          const swatch = theme === "light" ? item.light : item.dark;
          const title = `Use colour mood ${item.name}`;
          return (
            <li key={item.id}>
              <motion.button
                type="button"
                title={title}
                aria-label={title}
                aria-pressed={selected}
                onClick={() => setMood(item.id as MoodId)}
                className={cn(
                  "relative flex min-h-11 w-full flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left",
                  selected ? "border-accent bg-accent/10" : "border-border bg-bg",
                )}
                whileHover={reduce ? { opacity: 0.92 } : { scale: 1.02, y: -1 }}
                whileTap={reduce ? { opacity: 0.85 } : { scale: 0.98 }}
                transition={reduce ? { duration: 0.08 } : selected ? pressSpring : hoverSpring}
              >
                {selected && (
                  <motion.span
                    layoutId="colour-mood-selected"
                    className="absolute inset-0 rounded-xl border-2 border-accent"
                    transition={reduce ? { duration: 0.08 } : hoverSpring}
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  <span className="h-4 w-4 rounded-full border border-border" style={{ background: swatch.bg }} />
                  <span className="h-4 w-4 rounded-full border border-border" style={{ background: swatch.accent }} />
                  <span className="h-4 w-4 rounded-full border border-border" style={{ background: swatch.visit }} />
                </span>
                <span className="relative font-medium text-text">{item.name}</span>
                <span className="relative text-xs text-text-muted">{item.blurb}</span>
              </motion.button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
