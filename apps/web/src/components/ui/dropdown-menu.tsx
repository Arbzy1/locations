import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "../../lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        className={cn(
          "z-[1300] min-w-[10rem] rounded-lg border border-border bg-surface p-2 text-text shadow-lg",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  title,
  asChild,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      asChild={asChild}
      title={title}
      className={cn(
        "flex h-11 cursor-pointer items-center rounded-lg px-3 text-sm text-text-muted outline-none transition duration-300 hover:bg-bg/50 hover:text-text",
        className,
      )}
      {...props}
    />
  );
}
