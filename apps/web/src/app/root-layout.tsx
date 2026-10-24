import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const navigation = [
  { to: "/login", label: "登录" },
  { to: "/account", label: "账户" },
] as const;

export function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            to="/login"
            className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
                    "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          Mira Cloud Account · 共享身份服务
        </div>
      </footer>
    </div>
  );
}
