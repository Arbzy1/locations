import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import * as React from "react";
import { cn } from "../../lib/utils";
import { interactiveMotion, reducedInteractiveMotion } from "../../lib/motion";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium outline-none ring-accent focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-accent text-on-accent hover:brightness-110",
        outline: "border border-border bg-surface text-text hover:bg-bg",
        ghost: "text-text-muted hover:bg-bg/50 hover:text-text",
        destructive: "border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20",
      },
      size: {
        default: "h-11 min-h-11 px-4 py-2",
        sm: "h-11 min-h-11 px-3 text-xs",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

const MotionButton = motion.create("button");

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, title, ...props }, ref) => {
    const reduce = useReducedMotion();
    const motionProps = reduce ? reducedInteractiveMotion : interactiveMotion;
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size }), className)} title={title} {...props} />
      );
    }
    return (
      <MotionButton
        ref={ref}
        title={title}
        className={cn(buttonVariants({ variant, size }), className)}
        {...motionProps}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
