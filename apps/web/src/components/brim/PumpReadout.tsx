import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

type PumpReadoutProps = {
  value: number;
  currency?: string;
  unit?: string;
  fractionDigits?: number;
};

function formatPump(value: number, fractionDigits: number): string {
  if (fractionDigits > 0) return value.toFixed(fractionDigits);
  return String(Math.round(value)).padStart(3, " ");
}

export function PumpReadout({ value, currency = "£", unit, fractionDigits = 0 }: PumpReadoutProps) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const [digits, setDigits] = useState(() => formatPump(0, fractionDigits));
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    const unsub = mv.on("change", (next) => setDigits(formatPump(next, fractionDigits)));
    return () => unsub();
  }, [mv, fractionDigits]);

  useEffect(() => {
    const spoken = `${currency}${formatPump(value, fractionDigits).trim()}${unit ? ` ${unit}` : ""}`;
    setAnnounce("");
    if (reduce) {
      mv.set(value);
      setDigits(formatPump(value, fractionDigits));
      setAnnounce(spoken);
      return;
    }
    const controls = animate(mv, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onComplete: () => {
        setAnnounce(spoken);
      },
    });
    return () => controls.stop();
  }, [value, currency, unit, fractionDigits, reduce, mv]);

  return (
    <div className="inline-block">
      <p
        className="tabular-nums font-mono font-display"
        style={{
          color: "var(--accent)",
          fontSize: "clamp(2.2rem, 6vw, 3.6rem)",
          margin: 0,
          minWidth: "7ch",
          letterSpacing: "0.04em",
        }}
      >
        {currency}
        {digits.padStart(3, " ")}
        {unit ? <span style={{ fontSize: "1rem", marginLeft: "0.4rem" }}>{unit}</span> : null}
      </p>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
