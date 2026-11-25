import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";
import { enterMotion, reducedEnterMotion } from "../../lib/motion";
import { Button, type ButtonProps } from "./button";

export function AlertDialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

export function AlertDialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function AlertDialogContent({
  className,
  children,
  title,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title?: string }) {
  const reduce = useReducedMotion();
  const motionProps = reduce ? reducedEnterMotion : enterMotion;

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[1270] bg-black/55" />
      <DialogPrimitive.Content
        asChild
        role="alertdialog"
        onPointerDownOutside={(e) => {
          onPointerDownOutside?.(e);
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          onInteractOutside?.(e);
          e.preventDefault();
        }}
        {...props}
      >
        <motion.div
          {...motionProps}
          title={title}
          className={cn(
            "fixed left-1/2 top-1/2 z-[1280] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 text-text shadow-xl",
            className,
          )}
        >
          {title ? <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title> : null}
          {children}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 flex flex-col gap-1.5", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("font-display text-lg font-semibold text-text", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-text-muted", className)}
      {...props}
    />
  );
}

export const AlertDialogAction = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ type = "button", title = "Confirm action", ...props }, ref) => (
    <Button ref={ref} type={type} title={title} {...props} />
  ),
);
AlertDialogAction.displayName = "AlertDialogAction";

export const AlertDialogCancel = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ type = "button", variant = "outline", title = "Cancel", ...props }, ref) => (
    <DialogPrimitive.Close asChild>
      <Button ref={ref} type={type} variant={variant} title={title} {...props} />
    </DialogPrimitive.Close>
  ),
);
AlertDialogCancel.displayName = "AlertDialogCancel";
