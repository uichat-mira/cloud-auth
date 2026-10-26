import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { routes } from "@/app/routes";
import type { CloudAuthClient } from "@/lib/auth/client";
import { AuthProvider } from "@/lib/auth/context";
import { CloudAuthError, createAuthFailure } from "@/lib/auth/errors";
import { createAuthStore } from "@/lib/auth/store";
import { HostGrantsProvider } from "@/lib/grants/context";
import { createFakeHostGrantsClient } from "../helpers/host-grants-fixtures";
import { createMemoryStorage } from "../helpers/session-storage";
import {
  account,
  expiresAt,
  issuedSession,
} from "../helpers/auth-fixtures";

function createClient(overrides: Partial<CloudAuthClient> = {}): CloudAuthClient {
  return {
    login: async () => issuedSession("token-1"),
    getSession: async () => ({ account, expiresAt }),
    renewSession: async () => issuedSession("token-2"),
    changePassword: async () => undefined,
    logout: async () => undefined,
    ...overrides,
  };
}

function emptyGrantsClient() {
  return createFakeHostGrantsClient({
    listHosts: async () => [],
    listDevices: async () => [],
  });
}

function renderWithClient({
  client,
  initialSession = null,
  path,
}: {
  client: CloudAuthClient;
  initialSession?: { sessionToken: string; expiresAt: string } | null;
  path: string;
}) {
  const storage = createMemoryStorage(initialSession);
  const store = createAuthStore({ client, storage });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  render(
    <AuthProvider store={store}>
      <HostGrantsProvider client={emptyGrantsClient()}>
        <RouterProvider router={router} />
      </HostGrantsProvider>
    </AuthProvider>,
  );

  return { storage, store, router };
}

describe("auth-backed route components", () => {
  it("submits login through the session store and logs out without touching fetch or tokens", async () => {
    const storage = createMemoryStorage();
    const loginCalls: Array<{ username: string; password: string }> = [];
    let logoutToken: string | null = null;

    const client: CloudAuthClient = {
      login: async (request) => {
        loginCalls.push(request);
        return issuedSession("token-1");
      },
      getSession: async () => ({ account, expiresAt }),
      renewSession: async () => issuedSession("token-2"),
      changePassword: async () => undefined,
      logout: async (token) => {
        logoutToken = token;
      },
    };

    const store = createAuthStore({ client, storage });
    const router = createMemoryRouter(routes, { initialEntries: ["/login"] });

    render(
      <AuthProvider store={store}>
        <HostGrantsProvider client={emptyGrantsClient()}>
          <RouterProvider router={router} />
        </HostGrantsProvider>
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText("账号"), {
      target: { value: "pilot" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/account");
    });
    expect(await screen.findByText("pilot")).toBeInTheDocument();
    expect(loginCalls).toEqual([
      { username: "pilot", password: "correct horse battery staple" },
    ]);
    expect(storage.load()?.sessionToken).toBe("token-1");

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(logoutToken).toBe("token-1");
      expect(storage.load()).toBeNull();
    });
    expect(await screen.findByRole("link", { name: "前往登录" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("keeps a concise local-first note without the technical explainer", () => {
    renderWithClient({ client: createClient(), path: "/login" });

    expect(
      screen.getByText(/仅用于 Mira 运营的云端服务/),
    ).toBeInTheDocument();
    expect(screen.getByText(/本地、直连与 Tailscale/)).toBeInTheDocument();
    expect(screen.queryByText("Cloud Shiyan")).not.toBeInTheDocument();
    expect(screen.queryByText("Hosted Relay")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/只是想查看账户页面/),
    ).not.toBeInTheDocument();
  });

  it("disables submission with a pending label while login is in flight", async () => {
    let resolveLogin: () => void = () => undefined;
    const pendingLogin = new Promise<void>((resolve) => {
      resolveLogin = resolve;
    });

    const { router } = renderWithClient({
      client: createClient({
        login: async () => {
          await pendingLogin;
          return issuedSession("token-1");
        },
      }),
      path: "/login",
    });

    fireEvent.change(screen.getByLabelText("账号"), {
      target: { value: "pilot" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(
      await screen.findByRole("button", { name: "登录中…" }),
    ).toBeDisabled();
    expect(router.state.location.pathname).toBe("/login");

    resolveLogin();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/account");
    });
  });

  it("shows restoring feedback before redirecting an existing session", async () => {
    let resolveSession: () => void = () => undefined;
    const pendingSession = new Promise<void>((resolve) => {
      resolveSession = resolve;
    });

    const { router } = renderWithClient({
      client: createClient({
        getSession: async () => {
          await pendingSession;
          return { account, expiresAt };
        },
      }),
      initialSession: { sessionToken: "token-1", expiresAt },
      path: "/login",
    });

    expect(
      await screen.findByText("正在恢复登录状态…"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeDisabled();

    resolveSession();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/account");
    });
  });

  it("renders invalid credentials as a readable login failure", async () => {
    const { storage } = renderWithClient({
      client: createClient({
        login: async () => {
          throw new CloudAuthError(
            createAuthFailure("invalid_credentials", {
              status: 401,
              code: "AUTH_INVALID_CREDENTIALS",
            }),
          );
        },
      }),
      path: "/login",
    });

    fireEvent.change(screen.getByLabelText("账号"), {
      target: { value: "pilot" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "账号或密码不正确。",
    );
    expect(screen.getByRole("button", { name: "登录" })).toBeEnabled();
    expect(storage.load()).toBeNull();
  });

  it("renders a distinct network-unavailable failure", async () => {
    renderWithClient({
      client: createClient({
        login: async () => {
          throw new CloudAuthError(createAuthFailure("network_unavailable"));
        },
      }),
      path: "/login",
    });

    fireEvent.change(screen.getByLabelText("账号"), {
      target: { value: "pilot" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "无法连接认证服务，请检查网络后重试。",
    );
  });

  it("shows the restored identity, session, and not-yet-connected services", async () => {
    renderWithClient({
      client: createClient(),
      initialSession: { sessionToken: "token-1", expiresAt },
      path: "/account",
    });

    expect(await screen.findByText("pilot")).toBeInTheDocument();
    fireEvent.click(screen.getByText("账户及会话详情"));
    expect(screen.getByText("account-1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("关联服务 · 尚未接入"));
    expect(
      screen.getByRole("heading", { level: 2, name: "关联服务" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("尚未接入")).toHaveLength(2);
    expect(screen.getByText("Cloud Shiyan")).toBeInTheDocument();
    expect(screen.getByText("Hosted Relay")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "设备与授权" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("没有可管理的 Desktop Host"),
    ).toBeInTheDocument();
  });

  it("confirms an explicit session renewal without leaving the account view", async () => {
    const { storage } = renderWithClient({
      client: createClient({
        renewSession: async () => issuedSession("token-2"),
      }),
      initialSession: { sessionToken: "token-1", expiresAt },
      path: "/account",
    });

    await screen.findByText("pilot");
    fireEvent.click(screen.getByText("当前登录会话"));
    fireEvent.click(screen.getByRole("button", { name: "续期 Session" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cloud Session 已续期",
    );
    await waitFor(() => {
      expect(storage.load()?.sessionToken).toBe("token-2");
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "我的账户" }),
    ).toBeInTheDocument();
  });

  it("keeps password fields in a dismissible dialog and clears them on cancel", async () => {
    renderWithClient({
      client: createClient(),
      initialSession: { sessionToken: "token-1", expiresAt },
      path: "/account",
    });

    await screen.findByText("pilot");
    expect(screen.queryByLabelText("当前密码")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("当前密码")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));

    expect(screen.getByRole("dialog", { name: "修改密码" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "an example old password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "修改密码" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
    expect(screen.getByLabelText("当前密码")).toHaveValue("");
  });

  it("submits a password change, shows pending state, and forces re-login", async () => {
    let resolveChange: () => void = () => undefined;
    const pendingChange = new Promise<void>((resolve) => {
      resolveChange = resolve;
    });
    const calls: Array<{
      token: string;
      currentPassword: string;
      newPassword: string;
    }> = [];

    const { storage } = renderWithClient({
      client: createClient({
        changePassword: async (token, request) => {
          calls.push({ token, ...request });
          await pendingChange;
        },
      }),
      initialSession: { sessionToken: "token-1", expiresAt },
      path: "/account",
    });

    await screen.findByText("pilot");
    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
    expect(screen.getByRole("dialog", { name: "修改密码" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "another strong replacement passphrase" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));

    expect(
      await screen.findByRole("button", { name: "修改中…" }),
    ).toBeDisabled();

    resolveChange();

    expect(
      await screen.findByText("密码已修改，请重新登录。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往登录" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByLabelText("当前密码")).not.toBeInTheDocument();
    expect(calls).toEqual([
      {
        token: "token-1",
        currentPassword: "correct horse battery staple",
        newPassword: "another strong replacement passphrase",
      },
    ]);
    await waitFor(() => {
      expect(storage.load()).toBeNull();
    });
  });

  it("shows an incorrect-current-password error without ending the session", async () => {
    const { storage } = renderWithClient({
      client: createClient({
        changePassword: async () => {
          throw new CloudAuthError(
            createAuthFailure("invalid_credentials", {
              status: 401,
              code: "AUTH_INVALID_CREDENTIALS",
            }),
          );
        },
      }),
      initialSession: { sessionToken: "token-1", expiresAt },
      path: "/account",
    });

    await screen.findByText("pilot");
    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
    expect(screen.getByRole("dialog", { name: "修改密码" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "wrong current password" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "another strong replacement passphrase" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "账号或密码不正确。",
    );
    expect(screen.getByLabelText("当前密码")).toBeInTheDocument();
    expect(storage.load()).toEqual({ sessionToken: "token-1", expiresAt });
  });

  it("shows a password-policy error without revoking the session", async () => {
    const { storage } = renderWithClient({
      client: createClient({
        changePassword: async () => {
          throw new CloudAuthError(
            createAuthFailure("invalid_password", {
              status: 400,
              code: "AUTH_INVALID_PASSWORD",
            }),
          );
        },
      }),
      initialSession: { sessionToken: "token-1", expiresAt },
      path: "/account",
    });

    await screen.findByText("pilot");
    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
    expect(screen.getByRole("dialog", { name: "修改密码" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "a long but rejected new password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "新密码不符合密码策略，请使用至少 15 个字符的新密码。",
    );
    expect(screen.getByLabelText("当前密码")).toBeInTheDocument();
    expect(storage.load()).toEqual({ sessionToken: "token-1", expiresAt });
  });

  it("returns to the logged-out account view with an expired-session explanation", async () => {
    const { storage } = renderWithClient({
      client: createClient({
        getSession: async () => {
          throw new CloudAuthError(
            createAuthFailure("reauth_required", {
              status: 401,
              code: "AUTH_REAUTH_REQUIRED",
            }),
          );
        },
      }),
      initialSession: { sessionToken: "token-1", expiresAt },
      path: "/account",
    });

    expect(
      await screen.findByText("登录状态已失效或已过期，请重新登录。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往登录" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(storage.load()).toBeNull();
  });

  it("renders rate limiting with a retry hint", async () => {
    const { storage } = renderWithClient({
      client: createClient({
        login: async () => {
          throw new CloudAuthError(
            createAuthFailure("rate_limited", { retryAfterSeconds: 30 }),
          );
        },
      }),
      path: "/login",
    });

    fireEvent.change(screen.getByLabelText("账号"), {
      target: { value: "pilot" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "尝试次数过多，请稍后再试。（约 30 秒后可重试）",
    );
    expect(storage.load()).toBeNull();
  });

  it("renders a distinct service-unavailable failure", async () => {
    renderWithClient({
      client: createClient({
        login: async () => {
          throw new CloudAuthError(createAuthFailure("service_unavailable"));
        },
      }),
      path: "/login",
    });

    fireEvent.change(screen.getByLabelText("账号"), {
      target: { value: "pilot" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(
      await screen.findByText("认证服务暂时不可用，请稍后重试。"),
    ).toBeInTheDocument();
  });
});
