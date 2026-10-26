import type { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const navigation = [
  { to: "/account", label: "账户中心" },
  { to: "/login", label: "登录" },
] as const;

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="cloud-shell flex min-h-dvh flex-col">
      <header className="cloud-header">
        <div className="cloud-container cloud-header-inner">
          <Link to="/account" className="cloud-brand focus-visible:outline-2 focus-visible:outline-offset-4">
            <span aria-hidden="true" className="cloud-brand-mark">M.</span>
            <span className="cloud-brand-copy">
              <strong>Mira Cloud</strong>
              <small>Your account</small>
            </span>
          </Link>
          <nav aria-label="主导航" className="cloud-navigation">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn("cloud-nav-link", isActive && "cloud-nav-active")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="cloud-container w-full flex-1">{children}</main>
      <footer className="cloud-container cloud-footer">
        <span>Mira Cloud Account · 让身份归你掌控</span>
        <span>独立云身份 · 本地 Mira 依然可用</span>
      </footer>
    </div>
  );
}

export function RootLayout() {
  return (
    <PortalShell>
      <Outlet />
    </PortalShell>
  );
}
