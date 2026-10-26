import { NavLink } from "react-router-dom";
import { ConsoleRailItem } from "@/components/console-rail-item";
import { useAuthSession } from "@/lib/auth/context";
import { sessionLabels } from "@/lib/auth/session-labels";

export interface ConsoleSection {
  to: string;
  label: string;
  /** Only the overview needs exact matching; deeper routes prefix-match their section. */
  end?: boolean;
}

/** The four console sections. Order is the reading order of the rail. */
export const consoleSections: ConsoleSection[] = [
  { to: "/account", label: "概览", end: true },
  { to: "/account/devices", label: "设备与授权" },
  { to: "/account/security", label: "账户安全" },
  { to: "/account/services", label: "关联服务" },
];

/**
 * Section rail. Signed-out states get the same <nav> landmark but no links, so
 * the console never offers navigation into pages that would redirect or fail.
 * NavLink sets `aria-current="page"`; the stylesheet keys the active state off it.
 */
export function ConsoleNav() {
  const { status } = useAuthSession();

  return (
    <nav aria-label="账户分区" className="console-nav">
      {status === "authenticated" ? (
        consoleSections.map((section) => (
          <ConsoleRailItem key={section.to} asChild>
            <NavLink to={section.to} end={section.end ?? false}>
              {section.label}
            </NavLink>
          </ConsoleRailItem>
        ))
      ) : (
        <span className="console-nav-hint">{sessionLabels[status]}</span>
      )}
    </nav>
  );
}
