import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountPortal } from "../helpers/render-portal";

function docsNav() {
  return within(screen.getByRole("navigation", { name: "文档目录" }));
}

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

describe("docs page", () => {
  it("redirects the index to the developer guide and marks the active section", async () => {
    const { router } = mountPortal({ path: "/docs" });

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Mira ID 开放平台开发指南（V1 预览）",
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/docs/open-platform-developer-guide");
    expect(docsNav().getAllByRole("link")).toHaveLength(7);
    expect(docsNav().getByRole("link", { name: "开发指南" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(docsNav().getByRole("link", { name: "部署与排障" })).toHaveAttribute(
      "href",
      "/docs/deployment",
    );
  });

  it("renders the bundled document and rewrites its cross-document links", async () => {
    mountPortal({ path: "/docs/open-platform-protocol-v1" });

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Mira ID 开放平台：应用接入协议 V1（设计稿）",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "开放应用 OAuth V1" })).toHaveAttribute(
      "href",
      "/docs/application-oauth-v1",
    );
    expect(screen.getByRole("link", { name: "实例级服务凭据 V1" })).toHaveAttribute(
      "href",
      "/docs/open-platform-service-credentials-v1",
    );
    expect(screen.getByRole("link", { name: "开放平台开发指南" })).toHaveAttribute(
      "href",
      "/docs/open-platform-developer-guide",
    );
    expect(screen.getByRole("link", { name: "V0 服务登记" })).toHaveAttribute(
      "href",
      "https://github.com/uichat-mira/cloud-auth/blob/dev/docs/service-registry-v0.md",
    );

    const external = screen.getByRole("link", { name: /IETF OAuth CIMD/ });
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", expect.stringContaining("noreferrer"));

    expect(
      screen.getByRole("heading", { level: 2, name: "1. 产品决策（已确认）" }),
    ).toHaveAttribute("id");
  });

  it("renders a deployment document", async () => {
    mountPortal({ path: "/docs/deployment" });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Mira Cloud Auth 部署与排障指南" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "1. 服务边界与拓扑" }),
    ).toBeInTheDocument();
  });

  it("keeps the docs navigation when a document id is unknown", async () => {
    const { router } = mountPortal({ path: "/docs/does-not-exist" });

    expect(
      await screen.findByRole("heading", { level: 1, name: "文档不存在" }),
    ).toBeInTheDocument();
    expect(docsNav().getAllByRole("link")).toHaveLength(7);
    expect(screen.getByRole("link", { name: "返回开发指南" })).toHaveAttribute(
      "href",
      "/docs/open-platform-developer-guide",
    );
    expect(router.state.location.pathname).toBe("/docs/does-not-exist");
  });

  it("moves focus to the document title when switching documents", async () => {
    mountPortal({ path: "/docs/deployment" });
    await screen.findByRole("heading", {
      level: 1,
      name: "Mira Cloud Auth 部署与排障指南",
    });

    fireEvent.click(docsNav().getByRole("link", { name: "接入协议 V1" }));

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Mira ID 开放平台：应用接入协议 V1（设计稿）",
    });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});
