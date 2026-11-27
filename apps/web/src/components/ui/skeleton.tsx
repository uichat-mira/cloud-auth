import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton — decorative loading placeholder. Always `aria-hidden`; the
 * surrounding container owns `aria-busy` and the loading label.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-slot="skeleton"
      className={cn(
        "block rounded-[var(--mc-r-xs)] bg-[var(--mc-surface-2)]",
        "animate-[mc-pulse_1.6s_ease-in-out_infinite]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
