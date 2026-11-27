import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mountPortal } from "../helpers/render-portal";

describe("open platform page", () => {
  it("renders the single-screen public overview inside the portal shell", async () => {
    mountPortal({ path: "/open-platform" });

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "把 Mira ID 延伸到你的应用",
      }),
    ).toBeInTheDocument();

    const headerNav = within(screen.getByRole("navigation", { name: "主导航" }));
    expect(headerNav.getByRole("link", { name: "开放平台" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const trust = within(screen.getByRole("complementary", { name: "Mira ID 信任链" }));
    expect(trust.getAllByRole("listitem")).toHaveLength(4);

    expect(screen.getAllByRole("link", { name: "登录后登记应用" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "登录后登记应用" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "阅读开发指南" })).toHaveAttribute(
      "href",
      "/docs/open-platform-developer-guide",
    );

    expect(screen.queryByRole("navigation", { name: "页面目录" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Mira ID 是 Mira 生态的身份底座。" }),
    ).not.toBeInTheDocument();
  });
});
