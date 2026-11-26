import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps extends ComponentProps<"section"> {
  labelledBy?: string;
}

/** Hairline-separated page section with the shared console rhythm. */
function Section({ className, labelledBy, ...props }: SectionProps) {
  return (
    <section
      data-slot="section"
      aria-labelledby={labelledBy}
      className={cn("console-section", className)}
      {...props}
    />
  );
}

interface SectionHeadProps {
  title: ReactNode;
  id?: string;
  caption?: ReactNode;
  action?: ReactNode;
  className?: string;
}

function SectionHead({ title, id, caption, action, className }: SectionHeadProps) {
  return (
    <div className={cn("console-section-head", className)}>
      <div>
        <h2 id={id}>{title}</h2>
        {caption ? <p className="console-section-caption">{caption}</p> : null}
      </div>
      {action}
    </div>
  );
}

export { Section, SectionHead };
