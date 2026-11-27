import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
 * The public shell (`/`, `/login`, public 404) shows a single `登录` link while
 * signed out and reuses the console account menu once signed in. It is not the
 * console rail: `/account/**` owns the section navigation and is covered by
 * console-navigation.test.tsx.
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

function publicNav() {
  return within(screen.getByRole("navigation", { name: "主导航" }));
}

function publicNavLinks(): HTMLAnchorElement[] {
  return Array.from(screen.getByRole("navigation", { name: "主导航" }).querySelectorAll("a"));
}

describe("Mira account navigation", () => {
  it("offers the open platform, docs and one 登录 entry while signed out", async () => {
    mountPublicShell("unauthenticated");

    const login = await waitFor(() => publicNav().getByRole("link", { name: "登录" }));
    expect(login).toHaveAttribute("href", "/login");
    expect(publicNav().getByRole("link", { name: "开放平台" })).toHaveAttribute(
      "href",
      "/open-platform",
    );
    expect(publicNav().getByRole("link", { name: "文档" })).toHaveAttribute("href", "/docs");
    expect(publicNavLinks()).toHaveLength(3);
    expect(screen.queryByRole("link", { name: /OAuth|授权/ })).not.toBeInTheDocument();
  });

  it("switches the signed-in header to the account menu with the console entry", async () => {
    mountPublicShell("authenticated");

    const trigger = await screen.findByRole("button", { name: "账户菜单" });
    expect(publicNav().getByRole("link", { name: "开放平台" })).toHaveAttribute(
      "href",
      "/open-platform",
    );
    expect(publicNav().getByRole("link", { name: "文档" })).toHaveAttribute("href", "/docs");
    expect(publicNavLinks()).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "账户中心" })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    const actions = screen.getByRole("group", { name: "账户操作" });
    expect(within(actions).getByRole("link", { name: "控制台" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(within(actions).getByRole("button", { name: "退出登录" })).toBeInTheDocument();
  });

  it("falls back to the 登录 entry when the session is unavailable", async () => {
    mountPublicShell("unavailable");

    const login = await waitFor(() => publicNav().getByRole("link", { name: "登录" }));
    expect(login).toHaveAttribute("href", "/login");
    expect(publicNavLinks()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "账户菜单" })).not.toBeInTheDocument();
  });

  it.each(["idle", "checking"] as const)(
    "keeps the docs entry and a status hint during %s",
    async (status) => {
      mountPublicShell(status);

      expect(await screen.findByRole("status")).toHaveTextContent("正在检查登录状态");
      expect(publicNav().getByRole("link", { name: "开放平台" })).toHaveAttribute(
        "href",
        "/open-platform",
      );
      expect(publicNav().getByRole("link", { name: "文档" })).toHaveAttribute("href", "/docs");
      expect(publicNav().queryByRole("link", { name: "登录" })).not.toBeInTheDocument();
      expect(publicNavLinks()).toHaveLength(2);
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
        await within(main).findByRole("heading", { level: 1, name: "Mira 账号" }),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(
          within(main).getByRole("link", {
            name:
              status === "authenticated"
                ? "进入账户中心"
                : status === "unavailable"
                  ? "检查登录状态"
                  : "登录 Mira 账号",
          }),
        ).toHaveAttribute("href", destination);
      });
      expect(router.state.location.pathname).toBe("/");
      expect(screen.getByRole("link", { name: "Mira ID" })).toHaveAttribute("href", "/");
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
    expect(within(main).getByRole("heading", { level: 1, name: "Mira 账号" })).toBeInTheDocument();
    expect(within(main).getByRole("status")).toHaveTextContent("正在检查登录状态");
    expect(
      within(main).queryByRole("link", { name: /登录 Mira 账号|进入账户中心|检查登录状态/ }),
    ).toBeNull();
    expect(router.state.location.pathname).toBe("/");
  });
});
