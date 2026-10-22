import type { Transition } from "motion/react";

export const hoverSpring: Transition = { type: "spring", stiffness: 400, damping: 22 };
export const pressSpring: Transition = { type: "spring", stiffness: 500, damping: 28 };
export const enterSpring: Transition = { type: "spring", stiffness: 280, damping: 26 };

export const interactiveMotion = {
  whileHover: { scale: 1.03, y: -1 },
  whileTap: { scale: 0.97 },
  transition: hoverSpring,
};

export const reducedInteractiveMotion = {
  whileHover: { opacity: 0.9 },
  whileTap: { opacity: 0.8 },
  transition: { duration: 0.08 },
};

export const enterMotion = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 6, scale: 0.98 },
  transition: enterSpring,
};

/** prefers-reduced-motion: opacity only, ~80ms, no scale or slide. */
export const reducedEnterMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.08 },
};

export type OverlaySide = "top" | "bottom" | "left" | "right";

/** Popover / select / menu surfaces slide in from the side they open towards. */
export function popoverMotion(side: OverlaySide = "bottom") {
  const offset = 6;
  const from =
    side === "top"
      ? { opacity: 0, y: offset, scale: 0.98 }
      : side === "bottom"
        ? { opacity: 0, y: -offset, scale: 0.98 }
        : side === "left"
          ? { opacity: 0, x: offset, scale: 0.98 }
          : { opacity: 0, x: -offset, scale: 0.98 };
  return {
    initial: from,
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: from,
    transition: enterSpring,
  };
}

/** List stagger (30-50ms per the motion rule). */
export const staggerChildren = {
  animate: { transition: { staggerChildren: 0.04 } },
};

/** Opacity-only crossfade for skeleton/content swaps. */
export const fadeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
};

/** Child of a `staggerChildren` parent: fades up when the parent animates. */
export const revealMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: enterSpring },
};
