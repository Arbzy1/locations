import { Link } from "react-router-dom";
import { APP_VERSION_LABEL } from "../../lib/version";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export function AppVersionLink({ className }: { className?: string }) {
  return (
    <Link
      to="/changelog"
      className={cn("font-mono text-xs tabular-nums text-accent hover:underline", className)}
      title={`What's new in ${APP_VERSION_LABEL}`}
    >
      {APP_VERSION_LABEL}
    </Link>
  );
}

export function AppVersion({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      size={compact ? "icon" : "sm"}
      className={cn(
        "font-mono tabular-nums text-text-muted",
        compact ? "h-11 w-11 px-0 text-[9px]" : "h-11 justify-start px-3 text-[11px]",
        className,
      )}
      title={`What's new in ${APP_VERSION_LABEL}`}
      aria-label={`App version ${APP_VERSION_LABEL}`}
    >
      <Link to="/changelog">{APP_VERSION_LABEL}</Link>
    </Button>
  );
}
