import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PageHeadProps {
  /** Rendered as the page h1; route entry focus targets it via `.console-main h1`. */
  title: ReactNode;
  id?: string;
  caption?: ReactNode;
  /** Optional parent link rendered above the title (e.g. a sub-page back link). */
  back?: { to: string; label: string };
  actions?: ReactNode;
  className?: string;
}

/** Page title, one-line caption and optional trailing action for a console page. */
function PageHead({ title, id, caption, back, actions, className }: PageHeadProps) {
  return (
    <header className={cn("console-page-head", className)}>
      {back ? (
        <Link className="console-section-link dc-back" to={back.to}>
          {back.label}
        </Link>
      ) : null}
      <div className={actions ? "console-page-head-row" : undefined}>
        <h1 id={id} tabIndex={-1}>
          {title}
        </h1>
        {actions ? <div className="console-page-head-actions">{actions}</div> : null}
      </div>
      {caption ? <p className="console-page-caption">{caption}</p> : null}
    </header>
  );
}

export { PageHead };
