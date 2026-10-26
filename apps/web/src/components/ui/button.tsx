import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — Mira Console recipe.
 * Heights: sm 24 / default 28 / lg 32 / xl 36 / icon 28. Radius 4–6px, never pills.
 * Depth comes from the shared elevation tokens, not from borders.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px]",
    "text-[13px] leading-5 font-[550] tracking-normal",
    "transition-[background-color,box-shadow,color,border-color] duration-[85ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
    "outline-none disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-[#242424] text-white shadow-[var(--mc-el-contrast)] hover:bg-[#2e2e2e] active:bg-[#242424]",
        outline:
          "bg-white text-[var(--mc-text)] shadow-[var(--mc-el-control)] hover:bg-[var(--mc-surface-1)]",
        secondary:
          "bg-[var(--mc-surface-2)] text-[var(--mc-text)] shadow-[var(--mc-hairline-muted)] hover:bg-[#ececec]",
        ghost:
          "bg-transparent text-[var(--mc-text-secondary)] hover:bg-[var(--mc-overlay-hover)] hover:text-[var(--mc-text)]",
        destructive:
          "bg-white text-[var(--mc-danger-fg)] shadow-[var(--mc-el-control)] hover:bg-[var(--mc-danger-bg)]",
        link: "bg-transparent text-[var(--mc-accent)] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-6 rounded-[4px] px-[9px]",
        default: "h-7 px-[11px]",
        lg: "h-8 px-[15px]",
        xl: "h-9 px-4",
        icon: "size-7 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
