import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";
import { enterMotion, hoverSpring, reducedEnterMotion } from "../../lib/motion";

const TabsValueContext = React.createContext<{ value: string | undefined; pillId: string }>({
  value: undefined,
  pillId: "tabs-pill",
});

/** Radix Tabs that tracks the active value so the trigger pill can share a `layoutId`. */
export function Tabs({
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const current = value ?? uncontrolled;
  const pillId = `tabs-pill-${React.useId()}`;
  return (
    <TabsValueContext.Provider value={{ value: current, pillId }}>
      <TabsPrimitive.Root
        value={current}
        onValueChange={(next) => {
          if (value === undefined) setUncontrolled(next);
          onValueChange?.(next);
        }}
        {...props}
      />
    </TabsValueContext.Provider>
  );
}

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex items-center gap-1 rounded-lg border border-border bg-bg p-1", className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, value, title, ...props }, ref) => {
  const ctx = React.useContext(TabsValueContext);
  const reduce = useReducedMotion();
  const active = ctx.value === value;
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      title={title ?? (typeof children === "string" ? children : value)}
      className={cn(
        "relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm outline-none transition-colors duration-200 ease-ui focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50",
        active ? "text-accent" : "text-text-muted hover:text-text",
        className,
      )}
      {...props}
    >
      {active && (
        <motion.span
          layoutId={ctx.pillId}
          className="absolute inset-0 rounded-md bg-accent/15"
          transition={reduce ? { duration: 0.08 } : hoverSpring}
          aria-hidden
        />
      )}
      <span className="relative">{children}</span>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const reduce = useReducedMotion();
  const enter = reduce ? reducedEnterMotion : enterMotion;
  return (
    <TabsPrimitive.Content ref={ref} className={cn("outline-none", className)} {...props}>
      <motion.div initial={enter.initial} animate={enter.animate} transition={enter.transition}>
        {children}
      </motion.div>
    </TabsPrimitive.Content>
  );
});
TabsContent.displayName = "TabsContent";
