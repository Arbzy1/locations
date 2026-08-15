import * as React from "react";
import { cn } from "../../lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, title, ...props }, ref) => (
    <input
      ref={ref}
      title={title}
      className={cn(
        "h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text outline-none ring-accent transition duration-300 placeholder:text-text-muted focus:ring-1",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
