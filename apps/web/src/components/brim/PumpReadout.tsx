import { animate, useMotionValue, useTransform, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

type PumpReadoutProps = {
  value: number;
  currency?: string;
  unit?: string;
};

export function PumpReadout({ value, currency = "£", unit }: PumpReadoutProps) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const shown = useTransform(mv, (v) => Math.round(v));
  const [digits, setDigits] = useState("0");
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    const unsub = shown.on("change", (v) => setDigits(String(v)));
    return () => unsub();
  }, [shown]);

  useEffect(() => {
    setAnnounce("");
    if (reduce) {
      mv.set(value);
      setDigits(String(Math.round(value)));
      setAnnounce(`${currency}${Math.round(value)}${unit ? ` ${unit}` : ""}`);
      return;
    }
    const controls = animate(mv, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onComplete: () => {
        setAnnounce(`${currency}${Math.round(value)}${unit ? ` ${unit}` : ""}`);
      },
    });
    return () => controls.stop();
  }, [value, currency, unit, reduce, mv]);

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
