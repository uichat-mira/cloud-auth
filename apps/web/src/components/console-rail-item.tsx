import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/** Shared appearance for console section links and rail actions. */
export function ConsoleRailItem({
  asChild = false,
  className,
  ...props
}: ComponentProps<"button"> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";

  return <Component className={cn("console-nav-link", className)} {...props} />;
}
