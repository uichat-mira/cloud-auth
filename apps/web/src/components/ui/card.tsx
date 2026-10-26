import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card — Mira Console "panel": an inset surface (#fafafa) separated from the white
 * page canvas by a translucent hairline, never by a 1px solid border.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col rounded-[8px] bg-[var(--mc-surface-1)] text-[var(--mc-text)]",
        "shadow-[var(--mc-hairline-muted)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 px-4 pt-4",
        className,
      )}
      {...props}
    />
  );
}

/**
 * `as` lets a card act as a landmark subsection (e.g. one host record = one h2)
 * without changing the visual recipe.
 */
function CardTitle({
  className,
  as,
  ...props
}: React.ComponentProps<"div"> & { as?: "h2" | "h3" }) {
  const Comp = as ?? "div";
  return (
    <Comp
      data-slot="card-title"
      className={cn("text-sm leading-5 font-[550] tracking-normal", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        "text-[13px] leading-5 text-[var(--mc-text-secondary)]",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 py-4", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
