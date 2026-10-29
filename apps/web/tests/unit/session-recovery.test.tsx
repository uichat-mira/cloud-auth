import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthStore } from "@/lib/auth/store";
import { loginUrlForAccount, returnToFromLoginSearch, safeAccountReturnTo } from "@/lib/auth/return-location";
import { HostGrantsError, createHostGrantsFailure } from "@/lib/grants/client";
import { createFakeAuthClient, createFakeHostGrantsClient } from "../helpers/host-grants-fixtures";
import { account, issuedSession } from "../helpers/auth-fixtures";
import { mountPortal } from "../helpers/render-portal";
import { createMemoryStorage } from "../helpers/session-storage";

afterEach(() => vi.unstubAllGlobals());

const future = () => new Date(Date.now() + 60 * 60_000).toISOString();
const session = () => ({ sessionToken: "mcs_v1.current.session", expiresAt: future() });
const authClient = (expiresAt = future()) => createFakeAuthClient({
  getSession: async () => ({ account, expiresAt }),
  login: async () => ({ ...issuedSession("mcs_v1.reauthenticated.session"), expiresAt: future() }),
});

describe("account return route is local and bounded", () => {
  it.each([
    ["/account/services/dc?tab=policy#latest", "/account/services/dc?tab=policy#latest"],
    ["/account/devices", "/account/devices"],
    ["/account", "/account"],
    ["//example.com/account", "/account"],
    ["https://example.com/account", "/account"],
    ["/login", "/account"],
    ["/account/../../login", "/account"],
    ["/account\\evil.com", "/account"],
    ["/%61ccount", "/account"],
  ])("accepts only account routes: %s", (input, expected) => {
    expect(safeAccountReturnTo(input)).toBe(expected);
  });

  it("never puts a bearer token into a redirect and preserves a same-origin deep link", () => {
    expect(loginUrlForAccount("/account")).toBe("/login");
    const url = loginUrlForAccount("/account/services/dc?panel=state#control");
    expect(url).toContain("returnTo=");
    expect(returnToFromLoginSearch(url.slice(url.indexOf("?")))).toBe("/account/services/dc?panel=state#control");
    expect(returnToFromLoginSearch("?returnTo=https%3A%2F%2Fevil.example")).toBe("/account");
  });
});

describe("shared Cloud Session recovery", () => {
  it("resumes a deep-linked DC route after interactive login", async () => {
    const { router } = mountPortal({
      path: "/login?returnTo=%2Faccount%2Fservices%2Fdc",
      client: authClient(),
      session: null,
    });
    await screen.findByRole("heading", { name: "登录 Mira Cloud" });
    fireEvent.change(screen.getByLabelText("账号"), { target: { value: "pilot" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "a test password for login" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/account/services/dc"));
  });

  it("shows a passive renewal prompt only near expiry", async () => {
    const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
    const { store } = mountPortal({
      path: "/account/security",
      session: { sessionToken: "mcs_v1.valid", expiresAt },
      client: createFakeAuthClient({
        getSession: async () => ({ account, expiresAt }),
        renewSession: async () => ({ ...issuedSession("mcs_v1.renewed"), expiresAt: future() }),
      }),
    });
    expect(await screen.findByText(/本次登录将在约/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保持登录" }));
    await waitFor(() => expect(store.getState().notice).toBe("session_renewed"));
    expect(screen.queryByText(/本次登录将在约/)).not.toBeInTheDocument();
  });

  it("reschedules expiry enforcement when a session lasts beyond the browser timer ceiling", async () => {
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString();
    const spy = vi.spyOn(window, "setTimeout");
    try {
      mountPortal({
        path: "/account/services",
        session: { sessionToken: "long-lived", expiresAt },
        client: authClient(expiresAt),
      });
      await screen.findByRole("heading", { name: "关联服务" });
      const largeTimers = () => spy.mock.calls.filter(([, delay]) => delay === 2_147_483_647);
      expect(largeTimers().length).toBeGreaterThan(0);
      const firstTimer = largeTimers()[0]?.[0];
      expect(typeof firstTimer).toBe("function");
      act(() => { if (typeof firstTimer === "function") firstTimer(); });
      expect(largeTimers().length).toBeGreaterThan(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("invalidates only the failed token so an old 401 cannot log out a renewed account", async () => {
    const storage = createMemoryStorage({ sessionToken: "old", expiresAt: future() });
    const store = createAuthStore({ client: authClient(), storage });
    await store.getState().restore();
    expect(store.getState().status).toBe("authenticated");
    await store.getState().renew();
    const newToken = storage.load()?.sessionToken;
    expect(newToken).not.toBe("old");
    store.getState().invalidateSession("old");
    expect(store.getState().status).toBe("authenticated");
    expect(storage.load()?.sessionToken).toBe(newToken);
    store.getState().invalidateSession(newToken ?? "");
    expect(store.getState()).toMatchObject({ status: "unauthenticated", failure: { kind: "reauth_required" } });
    expect(storage.load()).toBeNull();
  });

  it("DC 401 locks the page and preserves its address for re-login; never replays start", async () => {
    const calls = vi.fn(async (...args: Parameters<typeof fetch>) => new Response(JSON.stringify(
      String(args[0]).endsWith("/status") ? { error: "invalid session" } : { error: "unexpected operation" },
    ), { status: 401, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", calls);
    const { storage } = mountPortal({
      path: "/account/services/dc",
      client: authClient(),
      session: session(),
    });
    expect(await screen.findByText(/登录已过期/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "启动 DC" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往登录" })).toHaveAttribute(
      "href", "/login?returnTo=%2Faccount%2Fservices%2Fdc",
    );
    expect(storage.load()).toBeNull();
    expect(calls.mock.calls.map(([url]) => String(url))).toEqual(["/dc/api/status"]);
  });

  it("device grants 401 shares the same recovery instead of continuing on an expired session", async () => {
    const grantsClient = createFakeHostGrantsClient({
      listManagement: async () => { throw new HostGrantsError(createHostGrantsFailure("reauth_required", { status: 401 })); },
    });
    const { storage } = mountPortal({ path: "/account/devices", client: authClient(), session: session(), grantsClient });
    expect(await screen.findByText(/登录已过期/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "设备与授权" })).not.toBeInTheDocument();
    expect(storage.load()).toBeNull();
  });

  it("account overview also enters shared recovery on grants 401", async () => {
    const grantsClient = createFakeHostGrantsClient({
      listManagement: async () => {
        throw new HostGrantsError(createHostGrantsFailure("reauth_required", { status: 401 }));
      },
    });
    const { store, storage } = mountPortal({
      path: "/account", client: authClient(), session: session(), grantsClient,
    });
    expect(await screen.findByText(/登录已过期/)).toBeInTheDocument();
    expect(store.getState().status).toBe("unauthenticated");
    expect(storage.load()).toBeNull();
  });

  it("recovers an old in-flight grants 401 by reading with the newer session", async () => {
    const original = createFakeHostGrantsClient();
    const tokens: string[] = [];
    let rejectOld: ((reason: unknown) => void) | undefined;
    const grantsClient = createFakeHostGrantsClient({
      listManagement: async (token) => {
        tokens.push(token);
        if (tokens.length === 1) {
          return new Promise((_, reject) => { rejectOld = reject; });
        }
        return original.listManagement(token);
      },
    });
    const { store, storage } = mountPortal({
      path: "/account/devices", client: authClient(), session: session(), grantsClient,
    });
    await waitFor(() => expect(tokens).toHaveLength(1));
    await act(async () => { await store.getState().renew(); });
    const renewedToken = storage.load()?.sessionToken;
    expect(renewedToken).not.toBe(tokens[0]);
    await act(async () => { rejectOld?.(new HostGrantsError(createHostGrantsFailure("reauth_required", { status: 401 }))); });
    expect(await screen.findByText("工作 Desktop")).toBeInTheDocument();
    await waitFor(() => expect(tokens).toEqual([session().sessionToken, renewedToken]));
    expect(screen.getByRole("button", { name: "刷新列表" })).toBeEnabled();
    expect(store.getState().status).toBe("authenticated");
  });

  it("clears a stale mutation's busy state without replaying revocation after renewal", async () => {
    let rejectOld: ((reason: unknown) => void) | undefined;
    const revocations: string[] = [];
    const grantsClient = createFakeHostGrantsClient({
      revokeGrant: async (token) => {
        revocations.push(token);
        return new Promise((_, reject) => { rejectOld = reject; });
      },
    });
    const { store, storage } = mountPortal({
      path: "/account/devices", client: authClient(), session: session(), grantsClient,
    });
    await screen.findByText("工作 Desktop");
    fireEvent.click(screen.getByRole("button", { name: "撤销授权" }));
    fireEvent.click(screen.getByRole("button", { name: "确认撤销" }));
    await waitFor(() => expect(revocations).toHaveLength(1));
    await act(async () => { await store.getState().renew(); });
    const renewedToken = storage.load()?.sessionToken;
    await act(async () => { rejectOld?.(new HostGrantsError(createHostGrantsFailure("reauth_required", { status: 401 }))); });
    await waitFor(() => expect(screen.getByRole("button", { name: "撤销授权" })).toBeEnabled());
    expect(revocations).toEqual([session().sessionToken]);
    expect(storage.load()?.sessionToken).toBe(renewedToken);
    expect(store.getState().status).toBe("authenticated");
  });

  it("a DC 403 owner-denial does not sign the user out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "denied" }), { status: 403 })));
    const { store } = mountPortal({ path: "/account/services/dc", client: authClient(), session: session() });
    expect(await screen.findByText(/没有这台服务器的管理权限/)).toBeInTheDocument();
    expect(store.getState().status).toBe("authenticated");
  });
});
