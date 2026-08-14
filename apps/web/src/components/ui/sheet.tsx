import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { enterMotion } from "../../lib/motion";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  side = "bottom",
  title,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "bottom" | "left";
  title: string;
}) {
  const sideClass =
    side === "left"
      ? "left-0 top-0 h-full w-[min(24rem,90vw)]"
      : "bottom-0 left-0 right-0 max-h-[85dvh] rounded-t-2xl";
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[1190] bg-black/40" />
      <DialogPrimitive.Content asChild {...props}>
        <motion.div
          {...enterMotion}
          title={title}
          className={cn(
            "fixed z-[1200] border border-border bg-surface p-4 text-text shadow-xl",
            sideClass,
            className,
          )}
        >
          {children}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
