import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "../../lib/utils";

export function Switch({
  title,
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      title={title}
      className={cn(
        "peer inline-flex h-11 w-14 shrink-0 cursor-pointer items-center rounded-full border border-border bg-bg transition duration-300 data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-6 w-6 translate-x-1 rounded-full bg-text transition duration-300 data-[state=checked]:translate-x-7 data-[state=checked]:bg-on-accent" />
    </SwitchPrimitive.Root>
  );
}
