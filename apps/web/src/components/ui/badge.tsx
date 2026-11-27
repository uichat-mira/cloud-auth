import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge — compact status label. Tones mirror the notice state tokens so a
 * status reads the same whether it is inline or announced.
 */
const badgeVariants = cva(
  [
    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[4px]",
    "px-1.5 text-[11px] leading-4 font-[550]",
  ].join(" "),
  {
    variants: {
      tone: {
        neutral:
          "bg-[var(--mc-surface-3)] text-[var(--mc-text-secondary)] shadow-[var(--mc-hairline-muted)]",
        success:
          "bg-[var(--mc-success-bg)] text-[var(--mc-success-fg)] shadow-[0_0_0_0.5px_var(--mc-success-border)]",
        warning:
          "bg-[var(--mc-warning-bg)] text-[var(--mc-warning-fg)] shadow-[0_0_0_0.5px_var(--mc-warning-border)]",
        danger:
          "bg-[var(--mc-danger-bg)] text-[var(--mc-danger-fg)] shadow-[0_0_0_0.5px_var(--mc-danger-border)]",
        info: "bg-[var(--mc-info-bg)] text-[var(--mc-info-fg)] shadow-[0_0_0_0.5px_var(--mc-info-border)]",
        brand:
          "bg-[var(--mc-selected-bg)] text-[var(--mc-selected-fg)] shadow-[inset_0_0_0_0.5px_var(--mc-selected-hairline)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-tone={tone ?? "neutral"}
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}

export { Badge };
