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
