import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";
import { enterMotion, reducedEnterMotion } from "../../lib/motion";
import { Button } from "./button";

export function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root {...props} />;
}

export function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger {...props} />;
}

export function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close {...props} />;
}

export function SheetContent({
  className,
  side = "bottom",
  title,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "bottom" | "left";
  title: string;
}) {
  const reduce = useReducedMotion();
  const motionProps = reduce ? reducedEnterMotion : enterMotion;
  const sideClass =
    side === "left"
      ? "left-0 top-0 h-full w-[min(24rem,90vw)]"
      : "bottom-0 left-0 right-0 max-h-[85dvh] rounded-t-2xl";

  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-[1190] bg-black/40" />
      <SheetPrimitive.Content asChild {...props}>
        <motion.div
          {...motionProps}
          title={title}
          className={cn(
            "fixed z-[1200] border border-border bg-surface p-4 text-text shadow-xl",
            sideClass,
            className,
          )}
        >
          <SheetPrimitive.Title className="sr-only">{title}</SheetPrimitive.Title>
          {children}
          <SheetPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Close"
              aria-label="Close"
              className="absolute right-2 top-2 h-11 w-11 text-text-muted"
            >
              <X size={16} />
            </Button>
          </SheetPrimitive.Close>
        </motion.div>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 flex flex-col gap-1 pr-10", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn("font-display text-base font-semibold text-text", className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("text-sm text-text-muted", className)} {...props} />;
}
