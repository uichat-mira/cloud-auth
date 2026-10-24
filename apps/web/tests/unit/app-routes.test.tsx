import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import { routes } from "@/app/routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
  });

  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return router;
}

describe("web route shell", () => {
  it("renders the login form ready for auth operations", () => {
    renderAt("/login");

    expect(
      screen.getByRole("heading", { level: 1, name: "登录 Mira Cloud" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("账号")).toBeEnabled();
    expect(screen.getByLabelText("密码")).toBeEnabled();
    expect(screen.getByRole("button", { name: "登录" })).toBeEnabled();
  });

  it("redirects the root route to login", async () => {
    const router = renderAt("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "登录 Mira Cloud" }),
    ).toBeInTheDocument();
  });

  it("renders the account shell without a stored session", async () => {
    renderAt("/account");

    expect(
      screen.getByRole("heading", { level: 1, name: "账户概览" }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText("未登录")).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "前往登录" }),
    ).toHaveAttribute("href", "/login");
  });

  it("navigates between route shells through the primary navigation", async () => {
    const user = userEvent.setup();
    const router = renderAt("/login");

    await user.click(screen.getByRole("link", { name: "账户" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/account");
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "账户概览" }),
    ).toBeInTheDocument();
  });

  it("renders the not-found surface for unknown routes", () => {
    renderAt("/missing");

    expect(
      screen.getByRole("heading", { level: 1, name: "页面不存在" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "前往登录" }),
    ).toHaveAttribute("href", "/login");
  });
});
