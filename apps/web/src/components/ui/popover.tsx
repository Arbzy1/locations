import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";
import { popoverMotion, reducedEnterMotion } from "../../lib/motion";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", side = "bottom", sideOffset = 8, children, ...props }, ref) => {
  const reduce = useReducedMotion();
  const enter = reduce ? reducedEnterMotion : popoverMotion(side);
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "z-[1300] w-72 rounded-lg border border-border bg-surface p-3 text-text shadow-xl outline-none",
          className,
        )}
        {...props}
      >
        <motion.div initial={enter.initial} animate={enter.animate} transition={enter.transition}>
          {children}
        </motion.div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = "PopoverContent";
