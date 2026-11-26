import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationServiceCatalogEntry } from "@uichat-mira/cloud-auth-contracts";
import { mountPortal, storedSession } from "../helpers/render-portal";

const entry = (
  appId: string,
  origin: string,
  overrides: Partial<ApplicationServiceCatalogEntry> = {},
): ApplicationServiceCatalogEntry => ({
  appId,
  projectId: "fixture-mail",
  serviceId: "mail",
  name: "邮件服务",
  appName: "邮件应用",
  type: "mcp",
  protocol: { name: "mcp", version: "2026-07-28", endpoint: origin + "/mcp" },
  resource: origin + "/mcp",
  scopes: ["mail.read"],
  revision: 1,
  manifestRevision: 1,
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("instance service authorizations", () => {
  it("groups services by APP_ID and revokes one exact service without removing the application", async () => {
    const aMail = entry("app-fixture-a", "https://a.example");
    const aArchive = entry("app-fixture-a", "https://a.example", {
      serviceId: "archive",
      name: "归档服务",
      resource: "https://a.example/archive",
      protocol: { name: "mcp", version: "2026-07-28", endpoint: "https://a.example/archive" },
      scopes: ["archive.read"],
    });
    const bMail = entry("app-fixture-b", "https://b.example");
    let services = [aMail, aArchive, bMail];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/revoke")) {
        expect(url).toBe("/v1/application-services/app-fixture-a/mail/revoke");
        expect(JSON.parse(String(init.body))).toEqual({
          resource: aMail.resource,
          expectedRevision: 1,
        });
        services = [aArchive, bMail];
        return Response.json({ revision: 2 });
      }
      return Response.json({ services });
    });
    vi.stubGlobal("fetch", fetcher);

    mountPortal({ path: "/account/services", session: storedSession });
    const panel = await screen.findByRole("region", { name: "已授权应用" });
    const appA = await within(panel).findByRole("region", {
      name: "应用授权 邮件应用 app-fixture-a",
    });
    const appB = await within(panel).findByRole("region", {
      name: "应用授权 邮件应用 app-fixture-b",
    });

    expect(within(appA).getByText("邮件服务")).toBeInTheDocument();
    expect(within(appA).getByText("归档服务")).toBeInTheDocument();
    expect(within(appA).getAllByRole("button", { name: "解除应用授权" })).toHaveLength(1);
    expect(within(appB).getAllByRole("button", { name: "解除应用授权" })).toHaveLength(1);

    fireEvent.click(within(appA).getAllByRole("button", { name: "撤销服务" })[0]!);

    await waitFor(() => expect(within(appA).queryByText("邮件服务")).not.toBeInTheDocument());
    expect(within(appA).getByText("归档服务")).toBeInTheDocument();
    expect(within(appB).getByText("邮件服务")).toBeInTheDocument();
  });

  it("revokes an application once at the application level and removes all of its services", async () => {
    const aMail = entry("app-fixture-a", "https://a.example");
    const aArchive = entry("app-fixture-a", "https://a.example", {
      serviceId: "archive",
      name: "归档服务",
      resource: "https://a.example/archive",
      protocol: { name: "mcp", version: "2026-07-28", endpoint: "https://a.example/archive" },
    });
    const bMail = entry("app-fixture-b", "https://b.example");
    let services = [aMail, aArchive, bMail];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/application-authorizations/")) {
        expect(url).toBe("/v1/account/application-authorizations/app-fixture-a/revoke");
        services = [bMail];
        return new Response(null, { status: 204 });
      }
      return Response.json({ services });
    });
    vi.stubGlobal("fetch", fetcher);

    mountPortal({ path: "/account/services", session: storedSession });
    const panel = await screen.findByRole("region", { name: "已授权应用" });
    const appA = await within(panel).findByRole("region", {
      name: "应用授权 邮件应用 app-fixture-a",
    });
    fireEvent.click(within(appA).getByRole("button", { name: "解除应用授权" }));

    await waitFor(() =>
      expect(
        within(panel).queryByRole("region", { name: "应用授权 邮件应用 app-fixture-a" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(panel).getByRole("region", { name: "应用授权 邮件应用 app-fixture-b" }),
    ).toBeInTheDocument();
  });
});
