import type { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const navigation = [
  { to: "/login", label: "登录" },
  { to: "/account", label: "账户" },
] as const;

const focusRing = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const navLinkClassName =
  "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="portal-container flex flex-wrap items-center justify-between gap-3 py-4">
          <Link
            to="/login"
            className={cn("flex items-center gap-3 rounded-md", focusRing)}
          >
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
            >
              M
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight">
                Mira Cloud
              </span>
              <span className="block text-xs text-muted-foreground">
                Account
              </span>
            </span>
          </Link>

          <nav aria-label="主导航" className="flex items-center gap-1 text-sm">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    navLinkClassName,
                    focusRing,
                    isActive && "bg-accent text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="portal-container flex-1 py-8 sm:py-12">{children}</main>

      <footer className="border-t">
        <div className="portal-container py-6 text-xs text-muted-foreground">
          Mira Cloud Account · 共享身份服务
        </div>
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
