import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input — Mira Console recipe: hairline depth instead of a border, 36px default
 * height, white surface, 3px accent halo on focus.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 items-center rounded-[6px] border-0 bg-white px-2.5 py-0",
        "text-sm leading-5 text-[var(--mc-text)] shadow-[var(--mc-el-control)]",
        "outline-none transition-[box-shadow,color] duration-[85ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
        "placeholder:text-[var(--mc-text-faint)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:text-[var(--mc-danger-fg)] aria-invalid:shadow-[0_0_0_1px_var(--mc-danger-fg)]",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-[550] file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
