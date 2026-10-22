import { Button } from "../../ui/button";
import { pinHudCopy } from "../../../lib/brim/estimate/vehicle-label";
import type { FocusStop } from "../../../lib/brim/estimate/types";

export function PinHud({
  focusStop,
  onCancel,
}: {
  focusStop: FocusStop;
  onCancel: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <p className="text-sm">{pinHudCopy(focusStop)}</p>
        <Button title="Cancel" type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
