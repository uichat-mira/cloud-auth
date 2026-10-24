import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { routes } from "@/app/routes";
import type { CloudAuthClient } from "@/lib/auth/client";
import { AuthProvider } from "@/lib/auth/context";
import { createAuthStore } from "@/lib/auth/store";
import { createMemoryStorage } from "../helpers/session-storage";
import {
  account,
  expiresAt,
  issuedSession,
} from "../helpers/auth-fixtures";

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
});
