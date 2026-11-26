import type { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { HeaderLinks } from "@/components/header-links";
import { SessionBlock } from "@/components/session-block";
import { useAuthSession } from "@/lib/auth/context";
import { cn } from "@/lib/utils";

/**
 * Public portal shell — brand, the single contextual entry link and the footer.
 * It wraps `/`, `/login` and public 404s only; the account console has its own
 * shell (AccountLayout) with the section rail.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const { status } = useAuthSession();
  const checking = status === "idle" || status === "restoring";
  const authenticated = status === "authenticated";

  return (
    <div className="cloud-shell flex min-h-dvh flex-col">
      <header className="cloud-header">
        <div className="cloud-container cloud-header-inner">
          <Link
            to="/"
            className="cloud-brand focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <span aria-hidden="true" className="cloud-brand-mark">
              <img src="/brand/mira-id/svg/mira-id-app.svg" alt="" width={96} height={96} />
            </span>
            <span className="cloud-brand-copy">
              <strong>Mira ID</strong>
            </span>
          </Link>
          <nav aria-label="主导航" className="cloud-navigation">
            <HeaderLinks />
            {checking ? (
              <span role="status" className="text-xs text-muted-foreground">
                正在检查登录状态…
              </span>
            ) : authenticated ? (
              <SessionBlock />
            ) : (
              <NavLink
                to="/login"
                className={({ isActive }) => cn("cloud-nav-link", isActive && "cloud-nav-active")}
              >
                登录
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="cloud-container w-full flex-1">{children}</main>
      <footer className="cloud-container cloud-footer">
        <span>Mira ID · 让身份归你掌控</span>
        <span>独立云身份 · 本地 Mira 依然可用</span>
      </footer>
    </div>
  );
}

/** Route element for the public half of the tree. */
export function PublicLayout() {
  return (
    <PortalShell>
      <Outlet />
    </PortalShell>
  );
}
