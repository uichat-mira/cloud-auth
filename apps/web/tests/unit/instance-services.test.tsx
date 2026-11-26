import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountPortal, storedSession } from "../helpers/render-portal";

const entry = (appId: string, origin: string) => ({
  appId,
  projectId: "fixture-mail",
  serviceId: "mail",
  name: "邮件服务",
  type: "mcp",
  protocol: { name: "mcp", version: "2026-07-28", endpoint: origin + "/mcp" },
  resource: origin + "/mcp",
  scopes: ["mail.read"],
  revision: 1,
  manifestRevision: 1,
});

/**
 * A granted Who You instance. 关联服务 must show it only because the catalog
 * returned it — never because the console knows the application in advance.
 */
const whoYouGrant = {
  appId: "app_who_you_fixture_001",
  projectId: "who-you",
  serviceId: "mail",
  name: "狐邮",
  type: "mcp",
  protocol: { name: "mcp", version: "2026-07-28", endpoint: "https://who-you.tomz.io/mcp" },
  resource: "https://who-you.tomz.io/mcp",
  scopes: ["mail.read"],
  revision: 1,
  manifestRevision: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("instance service authorizations", () => {
  it("renders same-name instances separately and revokes the exact resource and revision", async () => {
    const a = entry("app-fixture-a", "https://a.example");
    const b = entry("app-fixture-b", "https://b.example");
    let services = [a, b];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        expect(url).toBe("/v1/application-services/app-fixture-a/mail/revoke");
        expect(JSON.parse(String(init.body))).toEqual({
          resource: a.resource,
          expectedRevision: 1,
        });
        services = [b];
        return Response.json({ revision: 2 });
      }
      return Response.json({ services });
    });
    vi.stubGlobal("fetch", fetcher);
    mountPortal({ path: "/account/services", session: storedSession });
    const panel = await screen.findByRole("region", { name: "已授权应用服务" });
    await within(panel).findByText(/https:\/\/a.example\/mcp/);
    expect(within(panel).getAllByText("邮件服务")).toHaveLength(2);
    fireEvent.click(within(panel).getAllByRole("button", { name: "撤销服务" })[0]!);
    await waitFor(() => expect(within(panel).getAllByText("邮件服务")).toHaveLength(1));
    expect(within(panel).getByText(/https:\/\/b.example\/mcp/)).toBeInTheDocument();
  });

  it("shows an application only when the authorization catalog reports it", async () => {
    let services = [whoYouGrant];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        services = [];
        return Response.json({ revision: 2 });
      }
      return Response.json({ services });
    });
    vi.stubGlobal("fetch", fetcher);
    mountPortal({ path: "/account/services", session: storedSession });

    const panel = await screen.findByRole("region", { name: "已授权应用服务" });
    await within(panel).findByText("狐邮");
    expect(within(panel).getByText(/https:\/\/who-you\.tomz\.io\/mcp/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "撤销服务" })).toBeInTheDocument();

    // A grant is not an ownership entry point, and the console never lists a
    // Mira-owned service because an application happens to be authorised.
    const miraServices = screen.getByRole("region", { name: "Mira 服务" });
    expect(within(miraServices).queryByText("狐邮")).not.toBeInTheDocument();
  });
});
