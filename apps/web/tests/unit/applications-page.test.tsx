import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountPortal, storedSession } from "../helpers/render-portal";

const origin = "https://who-you.tomz.io";
const app = {
  clientId: "who-you-web",
  projectId: "who-you",
  displayName: "Who You",
  redirectUri: origin + "/auth/callback",
  endpointOrigins: [origin],
  disabled: false,
  services: [],
};
const permission = { endpointOrigins: [origin], reservedProjects: ["who-you"] };
const fixtureSecret = "fixture-only-app-secret";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());
describe("application owner portal", () => {
  it("shows no creation or credentials for a normal user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ applications: [], developer: null })),
    );
    mountPortal({ path: "/account/applications", session: storedSession });
    expect(await screen.findByText("当前账号尚未开通应用开发权限。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "创建应用" })).not.toBeInTheDocument();
  });
  it("creates, shows one-time secret, closes it and reflects services from server", async () => {
    let created = false;
    const transport = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({
          projectId: "who-you",
          displayName: "Who You",
          redirectUri: origin + "/auth/callback",
          endpointOrigins: [origin],
          currentPassword: "fixture-password",
        });
        created = true;
        return json({ clientId: "who-you-web", managementToken: fixtureSecret });
      }
      return json({
        developer: permission,
        applications: created
          ? [
              {
                ...app,
                services: [
                  {
                    definition: {
                      serviceId: "who-you",
                      projectId: "who-you",
                      displayName: "狐邮 MCP",
                      protocol: { name: "mcp", version: "2025-11-25", endpoint: origin + "/mcp" },
                      audience: "mira:who-you",
                      scopes: ["whoyou.read"],
                    },
                    revision: 1,
                    retired: false,
                  },
                ],
              },
            ]
          : [],
      });
    });
    vi.stubGlobal("fetch", transport);
    mountPortal({ path: "/account/applications", session: storedSession });
    fireEvent.click(await screen.findByRole("button", { name: "创建应用" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("应用名称"), { target: { value: "Who You" } });
    fireEvent.change(within(dialog).getByLabelText("项目标识"), { target: { value: "who-you" } });
    fireEvent.change(within(dialog).getByLabelText("OAuth 回调地址"), {
      target: { value: origin + "/auth/callback" },
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: origin }));
    fireEvent.change(within(dialog).getByLabelText("当前密码"), {
      target: { value: "fixture-password" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建应用" }));
    expect(await screen.findByDisplayValue(fixtureSecret)).toBeInTheDocument();
    expect(await screen.findByText("狐邮 MCP")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByDisplayValue(fixtureSecret)).not.toBeInTheDocument());
    expect(screen.getByText("••••••••••••••••")).toBeInTheDocument();
  });
});
