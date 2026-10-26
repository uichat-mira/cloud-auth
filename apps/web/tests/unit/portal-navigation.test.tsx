import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PortalShell } from "@/app/root-layout";
import { routes } from "@/app/routes";

const auth = vi.hoisted(() => ({ status: "unauthenticated" }));

vi.mock("@/lib/auth/context", () => ({
  useAuthSession: () => ({ status: auth.status }),
}));
vi.mock("@/pages/account-page", () => ({
  AccountPage: () => <h1>账户内容</h1>,
}));
vi.mock("@/pages/login-page", () => ({
  LoginPage: () => <h1>登录内容</h1>,
}));

beforeEach(() => { auth.status = "unauthenticated"; });

describe("Mira Cloud single entry navigation", () => {
  it.each([
    ["unauthenticated", "登录", "/login"],
    ["authenticated", "账户中心", "/account"],
    ["unavailable", "检查登录状态", "/account"],
  ])("renders only %s entry", (status, label, target) => {
    auth.status = status;
    render(<MemoryRouter><PortalShell><p>页面内容</p></PortalShell></MemoryRouter>);

    const nav = screen.getByRole("navigation", { name: "主导航" });
    const links = nav.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent(label);
    expect(links[0]).toHaveAttribute("href", target);
    expect(screen.queryByRole("link", { name: /OAuth|授权/ })).not.toBeInTheDocument();
  });

  it.each(["idle", "restoring"])("does not guess identity during %s", (status) => {
    auth.status = status;
    render(<MemoryRouter><PortalShell><p>页面内容</p></PortalShell></MemoryRouter>);
    expect(screen.getByRole("navigation", { name: "主导航" }).querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("正在检查登录状态");
  });

  it.each([
    ["unauthenticated", "/login"],
    ["authenticated", "/account"],
    ["unavailable", "/account"],
  ])("selects the appropriate root route for %s", async (status, destination) => {
    auth.status = status;
    const router = createMemoryRouter(routes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.location.pathname).toBe(destination));
  });
});
