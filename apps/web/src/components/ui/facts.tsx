import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Fact {
  label: ReactNode;
  value: ReactNode;
  /** Identifiers and token tails read better in mono. */
  mono?: boolean;
  /** Allow long ids to wrap instead of overflowing the column. */
  breakAll?: boolean;
}

interface FactsProps {
  items: readonly Fact[];
  className?: string;
  /** Right-aligned value column for compact, numeric panels. */
  align?: "start" | "end";
}

/** Label/value summary list used by account, security and service panels. */
function Facts({ items, className, align = "start" }: FactsProps) {
  return (
    <dl data-slot="facts" data-align={align} className={cn("console-facts", className)}>
      {items.map((fact, index) => (
        <div key={index}>
          <dt>{fact.label}</dt>
          <dd className={cn(fact.mono && "cloud-mono", fact.breakAll && "cloud-break-all")}>
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export { Facts };
