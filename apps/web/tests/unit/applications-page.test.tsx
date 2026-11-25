import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountPortal, storedSession } from "../helpers/render-portal";

const origin = "https://who-you.tomz.io";
const appId = "app_who_you_fixture_001";
const secret = "fixture-app-secret-0123456789";
const application = {
  appId,
  origin,
  createdAt: "2026-11-25T00:00:00.000Z",
  updatedAt: "2026-11-25T00:00:00.000Z",
  manifest: {
    schemaVersion: "1",
    appId,
    projectId: "who-you",
    name: "狐邮",
    homeUrl: origin + "/",
    manifestRevision: 1,
    oauth: {
      clientId: origin + "/oauth-client.json",
      metadataUrl: origin + "/oauth-client.json",
      redirectUris: [origin + "/auth/callback"],
    },
    registrationVerification: { endpoint: origin + "/mira/verify-registration" },
    services: [
      {
        serviceId: "mail",
        name: "邮件服务",
        type: "mcp",
        protocol: { name: "mcp", version: "2026-07-28", endpoint: origin + "/mcp" },
        resource: origin + "/mcp",
        scopes: ["mail.read"],
      },
    ],
  },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Mira ID application instance portal", () => {
  it("registers with only Origin + APP_ID + AppSecret and never renders the secret", async () => {
    let registered = false;
    const transport = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ origin, appId, appSecret: secret });
        registered = true;
        return json({ application });
      }
      return json({ applications: registered ? [application] : [] });
    });
    vi.stubGlobal("fetch", transport);

    mountPortal({ path: "/account/applications", session: storedSession });
    expect(await screen.findByText("尚未登记应用。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "登记应用" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("应用地址"), { target: { value: origin + "/" } });
    fireEvent.change(within(dialog).getByLabelText("APP_ID"), { target: { value: appId } });
    fireEvent.change(within(dialog).getByLabelText("AppSecret"), { target: { value: secret } });
    fireEvent.click(within(dialog).getByRole("button", { name: "验证并登记" }));

    expect(await screen.findByText("狐邮")).toBeInTheDocument();
    expect(await screen.findByText("邮件服务")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(secret);
  });

  it("removes only the management relationship", async () => {
    let applications = [application];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        applications = [];
        return json({ appId, owned: false });
      }
      return json({ applications });
    }));

    mountPortal({ path: "/account/applications", session: storedSession });
    expect(await screen.findByText("狐邮")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "移除" }));
    await waitFor(() => expect(screen.queryByText("狐邮")).not.toBeInTheDocument());
    expect(await screen.findByText("已移除应用管理关系。")).toBeInTheDocument();
  });
});
