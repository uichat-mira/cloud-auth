import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PortalShell } from "@/app/root-layout";
import type { CloudAuthClient } from "@/lib/auth/client";
import { AuthProvider } from "@/lib/auth/context";
import { CloudAuthError, createAuthFailure } from "@/lib/auth/errors";
import { createAuthStore } from "@/lib/auth/store";
import { createFakeAuthClient } from "../helpers/host-grants-fixtures";
import { mountPortal, storedSession } from "../helpers/render-portal";
import { createMemoryStorage } from "../helpers/session-storage";

type ShellStatus = "unauthenticated" | "authenticated" | "unavailable" | "checking" | "idle";

/**
 * The public shell (`/`, `/login`, public 404) keeps exactly one contextual
 * entry link. It is not the console rail: `/account/**` owns the four-section
 * navigation and is covered by console-navigation.test.tsx.
 */
function mountPublicShell(status: ShellStatus) {
  const client: CloudAuthClient =
    status === "unavailable"
      ? createFakeAuthClient({
          getSession: async () => {
            throw new CloudAuthError(createAuthFailure("service_unavailable"));
          },
        })
      : status === "checking"
        ? createFakeAuthClient({ getSession: () => new Promise<never>(() => undefined) })
        : createFakeAuthClient();

  const store = createAuthStore({
    client,
    storage: createMemoryStorage(status === "unauthenticated" ? null : storedSession),
  });

  if (status === "idle") {
    // The gate before any restore work: keep the store in its initial state.
    vi.spyOn(store.getState(), "restore").mockImplementation(async () => undefined);
  }

  return render(
    <MemoryRouter>
      <AuthProvider store={store}>
        <PortalShell>
          <p>页面内容</p>
        </PortalShell>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function publicNavLinks(): HTMLAnchorElement[] {
  const nav = screen.getByRole("navigation", { name: "主导航" });
  return Array.from(nav.querySelectorAll("a"));
}

describe("Mira Cloud single entry navigation", () => {
  it("offers exactly one 登录 entry while signed out", async () => {
    mountPublicShell("unauthenticated");

    const links = await waitFor(() => {
      const current = publicNavLinks();
      expect(current).toHaveLength(1);
      return current;
    });

    expect(links[0]).toHaveTextContent("登录");
    expect(links[0]).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: /OAuth|授权/ })).not.toBeInTheDocument();
  });

  it("points the authenticated entry at the console", async () => {
    mountPublicShell("authenticated");

    const links = await waitFor(() => {
      const current = publicNavLinks();
      expect(current).toHaveLength(1);
      return current;
    });

    expect(links[0]).toHaveTextContent("账户中心");
    expect(links[0]).toHaveAttribute("href", "/account");
  });

  it("never guesses an identity while the session is unavailable", async () => {
    mountPublicShell("unavailable");

    const links = await waitFor(() => {
      const current = publicNavLinks();
      expect(current).toHaveLength(1);
      return current;
    });

    expect(links[0]).toHaveTextContent("检查登录状态");
    expect(links[0]).toHaveAttribute("href", "/account");
    expect(screen.queryByRole("link", { name: "账户中心" })).not.toBeInTheDocument();
  });

  it.each(["idle", "checking"] as const)(
    "renders no entry link and a status hint during %s",
    async (status) => {
      mountPublicShell(status);

      expect(await screen.findByRole("status")).toHaveTextContent("正在检查登录状态");
      expect(publicNavLinks()).toHaveLength(0);
      expect(
        within(screen.getByRole("navigation", { name: "主导航" })).queryByRole("link"),
      ).toBeNull();
    },
  );

  it.each([
    ["unauthenticated", "/login"],
    ["authenticated", "/account"],
    ["unavailable", "/account"],
  ] as const)(
    "keeps the home page with the appropriate entry for %s",
    async (status, destination) => {
      const client: CloudAuthClient =
        status === "unavailable"
          ? createFakeAuthClient({
              getSession: async () => {
                throw new CloudAuthError(createAuthFailure("service_unavailable"));
              },
            })
          : createFakeAuthClient();

      const { router } = mountPortal({
        path: "/",
        client,
        session: status === "unauthenticated" ? null : storedSession,
      });

      const main = screen.getByRole("main");
      expect(
        await within(main).findByRole("heading", { level: 1, name: "Mira Cloud 账户" }),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(
          within(main).getByRole("link", {
            name:
              status === "authenticated"
                ? "进入账户中心"
                : status === "unavailable"
                  ? "检查登录状态"
                  : "登录 Mira Cloud",
          }),
        ).toHaveAttribute("href", destination);
      });
      expect(router.state.location.pathname).toBe("/");
      expect(screen.getByRole("link", { name: "Mira Cloud" })).toHaveAttribute("href", "/");
      expect(screen.queryByLabelText("密码")).not.toBeInTheDocument();
      // The route tree must mount cleanly: a missing provider used to throw into
      // the route errorElement while the redirect assertion still passed.
      expect(screen.queryByRole("heading", { name: "页面暂时无法显示" })).not.toBeInTheDocument();
    },
  );

  it("keeps home content visible while restoring without guessing an entry", () => {
    const { router } = mountPortal({
      path: "/",
      session: storedSession,
      client: createFakeAuthClient({ getSession: () => new Promise<never>(() => undefined) }),
    });
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { level: 1, name: "Mira Cloud 账户" }),
    ).toBeInTheDocument();
    expect(within(main).getByRole("status")).toHaveTextContent("正在检查登录状态");
    expect(
      within(main).queryByRole("link", { name: /登录 Mira Cloud|进入账户中心|检查登录状态/ }),
    ).toBeNull();
    expect(router.state.location.pathname).toBe("/");
  });
});
