import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
}

/** Label, control and supporting copy with the shared 6px field rhythm. */
function Field({ label, htmlFor, children, hint, error, className }: FieldProps) {
  return (
    <div data-slot="field" className={cn("cloud-field", className)}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <p className="cloud-field-hint">{hint}</p> : null}
      {error ? (
        <p className="cloud-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
