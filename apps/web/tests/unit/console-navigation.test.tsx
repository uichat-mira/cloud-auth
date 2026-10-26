import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CloudAuthClient } from "@/lib/auth/client";
import { CloudAuthError, createAuthFailure } from "@/lib/auth/errors";
import type { HostGrantsClient } from "@/lib/grants/client";
import { createFakeAuthClient, createFakeHostGrantsClient } from "../helpers/host-grants-fixtures";
import { mountPortal, storedSession } from "../helpers/render-portal";

type ConsoleStatus =
  | "authenticated"
  | "unauthenticated"
  | "unavailable"
  | "idle"
  | "restoring";

const sections = [
  { href: "/account", label: "概览" },
  { href: "/account/devices", label: "设备与授权" },
  { href: "/account/security", label: "账户安全" },
  { href: "/account/services", label: "关联服务" },
] as const;

/** A grants client that records every read so tests can prove none happened. */
function countingGrantsClient(): { client: HostGrantsClient; calls: string[] } {
  const calls: string[] = [];
  const base = createFakeHostGrantsClient();
  const client: HostGrantsClient = {
    ...base,
    listManagement: async (token) => {
      calls.push("listManagement");
      return base.listManagement(token);
    },
    listDevices: async (token) => {
      calls.push("listDevices");
      return base.listDevices(token);
    },
    listHosts: async (token) => {
      calls.push("listHosts");
      return base.listHosts(token);
    },
    getSnapshot: async (token, hostId) => {
      calls.push("getSnapshot");
      return base.getSnapshot(token, hostId);
    },
  };
  return { client, calls };
}

function authClientFor(status: ConsoleStatus): CloudAuthClient {
  if (status === "unavailable") {
    return createFakeAuthClient({
      getSession: async () => {
        throw new CloudAuthError(createAuthFailure("service_unavailable"));
      },
    });
  }
  if (status === "restoring") {
    // Never resolves: the shell has to stay in its checking state.
    return createFakeAuthClient({ getSession: () => new Promise<never>(() => undefined) });
  }
  return createFakeAuthClient();
}

function mountConsole({
  path,
  status,
  grantsClient = createFakeHostGrantsClient(),
}: {
  path: string;
  status: ConsoleStatus;
  grantsClient?: HostGrantsClient;
}) {
  return mountPortal({
    path,
    client: authClientFor(status),
    grantsClient,
    session: status === "unauthenticated" ? null : storedSession,
    configure:
      status === "idle"
        ? (store) => {
            // Keep the store in its initial gate: no restore work has happened yet.
            vi.spyOn(store.getState(), "restore").mockImplementation(async () => undefined);
          }
        : undefined,
  });
}

async function consoleNav() {
  const nav = await screen.findByRole("navigation", { name: "账户分区" });
  return nav;
}

describe("console section navigation", () => {
  it.each([
    ["/account", "概览"],
    ["/account/devices", "设备与授权"],
    ["/account/security", "账户安全"],
    ["/account/services", "关联服务"],
  ] as const)("offers the four sections on %s and marks %s active", async (path, activeLabel) => {
    mountConsole({ path, status: "authenticated" });

    const nav = await consoleNav();
    await waitFor(() => {
      expect(within(nav).getAllByRole("link")).toHaveLength(sections.length);
    });

    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      sections.map((section) => section.href),
    );
    expect(links.map((link) => link.textContent?.trim())).toEqual(
      sections.map((section) => section.label),
    );

    const active = links.filter((link) => link.getAttribute("aria-current") === "page");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent(activeLabel);
  });

  it("keeps exactly one 退出登录 control in the console rail", async () => {
    mountConsole({ path: "/account", status: "authenticated" });

    await screen.findByRole("heading", { level: 1, name: "我的账户" });
    expect(screen.getAllByRole("button", { name: "退出登录" })).toHaveLength(1);
  });

  it.each(["unauthenticated", "unavailable", "idle", "restoring"] as const)(
    "never offers section links while %s",
    async (status) => {
      mountConsole({ path: "/account/devices", status });

      const nav = await consoleNav();
      expect(within(nav).queryAllByRole("link")).toHaveLength(0);
      expect(screen.queryAllByRole("button", { name: "退出登录" })).toHaveLength(0);
    },
  );

  it("explains a deep link instead of mounting the page while signed out", async () => {
    const { client, calls } = countingGrantsClient();
    const { router } = mountConsole({
      path: "/account/devices",
      status: "unauthenticated",
      grantsClient: client,
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "我的账户" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往登录" })).toHaveAttribute(
      "href",
      "/login",
    );

    // The route is preserved; only the content inside the shell is the recovery.
    expect(router.state.location.pathname).toBe("/account/devices");
    expect(
      screen.queryByRole("heading", { level: 1, name: "设备与授权" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刷新列表" })).not.toBeInTheDocument();

    // No grant read may be attempted without a confirmed session.
    await waitFor(() => expect(calls).toEqual([]));
  });

  it("keeps the grants reads to the console pages themselves", async () => {
    const { client, calls } = countingGrantsClient();
    mountConsole({ path: "/account/devices", status: "authenticated", grantsClient: client });

    expect(
      await screen.findByRole("heading", { level: 1, name: "设备与授权" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(calls).toContain("listManagement"));
  });
});
