import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { routes } from "@/app/routes";
import type { CloudAuthClient } from "@/lib/auth/client";
import { AuthProvider } from "@/lib/auth/context";
import type {
  PersistedCloudSession,
  SessionStorageAdapter,
} from "@/lib/auth/session-storage";
import { createAuthStore } from "@/lib/auth/store";

const account = { id: "account-1", username: "pilot" };
const expiresAt = "2026-11-01T00:00:00.000Z";

function createMemoryStorage() {
  let current: PersistedCloudSession | null = null;
  return {
    load: () => current,
    save: (session: PersistedCloudSession) => {
      current = session;
    },
    clear: () => {
      current = null;
    },
  } satisfies SessionStorageAdapter;
}

describe("auth-backed route components", () => {
  it("submits login through the session store and logs out without touching fetch or tokens", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    const loginCalls: Array<{ username: string; password: string }> = [];
    let logoutToken: string | null = null;

    const client: CloudAuthClient = {
      login: async (request) => {
        loginCalls.push(request);
        return {
          sessionToken: "token-1",
          account,
          expiresAt,
        };
      },
      getSession: async () => ({ account, expiresAt }),
      renewSession: async () => ({
        sessionToken: "token-2",
        account,
        expiresAt,
      }),
      logout: async (token) => {
        logoutToken = token;
      },
    };

    const store = createAuthStore({ client, storage });
    const router = createMemoryRouter(routes, { initialEntries: ["/login"] });

    render(
      <AuthProvider store={store}>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    await user.type(screen.getByLabelText("账号"), "pilot");
    await user.type(screen.getByLabelText("密码"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/account");
    });
    expect(await screen.findByText("pilot")).toBeInTheDocument();
    expect(loginCalls).toEqual([
      { username: "pilot", password: "correct horse battery staple" },
    ]);
    expect(storage.load()?.sessionToken).toBe("token-1");

    await user.click(screen.getByRole("button", { name: "退出登录" }));

    expect(logoutToken).toBe("token-1");
    expect(storage.load()).toBeNull();
    expect(await screen.findByRole("link", { name: "前往登录" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
