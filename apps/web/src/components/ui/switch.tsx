import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";
import { interactiveMotion, reducedInteractiveMotion } from "../../lib/motion";

const MotionSwitchRoot = motion.create(SwitchPrimitive.Root);

export type SwitchProps = Omit<
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
>;

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ title, className, disabled, ...props }, ref) => {
  const reduce = useReducedMotion();
  const motionProps = disabled
    ? {}
    : reduce
      ? reducedInteractiveMotion
      : interactiveMotion;

  return (
    <MotionSwitchRoot
      ref={ref}
      title={title}
      disabled={disabled}
      className={cn(
        "peer inline-flex h-11 w-14 shrink-0 cursor-pointer items-center rounded-full border border-border bg-bg transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent",
        className,
      )}
      {...motionProps}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-6 w-6 translate-x-1 rounded-full bg-text transition-transform duration-300 data-[state=checked]:translate-x-7 data-[state=checked]:bg-on-accent" />
    </MotionSwitchRoot>
  );
});
Switch.displayName = "Switch";
