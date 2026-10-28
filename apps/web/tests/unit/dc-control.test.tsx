import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDcControlClient, DcControlError, type DcStatus } from "@/lib/dc-control";
import { mountPortal, storedSession } from "../helpers/render-portal";

const status: DcStatus = {
  running: false,
  legacyRunning: false,
  remainingSeconds: null,
  memoryBytes: null,
  policy: { durationMinutes: 30, memoryMiB: 384, cpuPercent: 50, minAvailableMiB: 512 },
  at: "2026-10-29T09:00:00+00:00",
};

function reply(body: unknown, httpStatus = 200): Response {
  return new Response(JSON.stringify(body), {
    status: httpStatus,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("host DC client boundary", () => {
  it("uses the Cloud Session only for the same-origin loopback-proxied status API", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => reply(status));
    const client = createDcControlClient(fetcher as typeof fetch);
    expect(await client.status("session-secret")).toMatchObject(status);
    expect(fetcher).toHaveBeenCalledWith("/dc/api/status", expect.objectContaining({
      method: "GET",
      credentials: "same-origin",
      mode: "same-origin",
      cache: "no-store",
      headers: { Authorization: "Bearer session-secret" },
    }));
  });

  it("fails closed on a different owner, malformed data and invalid policy", async () => {
    const forbidden = vi.fn(async (..._args: Parameters<typeof fetch>) => reply({ error: "no access" }, 403));
    await expect(createDcControlClient(forbidden as typeof fetch).status("token")).rejects.toMatchObject({
      httpStatus: 403,
      message: "当前云账号没有这台服务器的管理权限。",
    });

    const malformed = vi.fn(async (..._args: Parameters<typeof fetch>) => reply({ running: false }));
    await expect(createDcControlClient(malformed as typeof fetch).status("token")).rejects.toBeInstanceOf(DcControlError);

    const calls = vi.fn(async (..._args: Parameters<typeof fetch>) => reply(status));
    await expect(createDcControlClient(calls as typeof fetch).savePolicy("token", {
      ...status.policy, durationMinutes: 999 as 15,
    })).rejects.toMatchObject({ httpStatus: 400 });
    expect(calls).not.toHaveBeenCalled();
  });

  it("never sends a mutation without a bearer token", async () => {
    const calls = vi.fn(async (..._args: Parameters<typeof fetch>) => reply(status));
    await expect(createDcControlClient(calls as typeof fetch).start("")).rejects.toMatchObject({ httpStatus: 401 });
    expect(calls).not.toHaveBeenCalled();
  });
});

describe("DC inside Mira account", () => {
  it("does not mount the control page or call its API when signed out", async () => {
    const calls = vi.fn(async (..._args: Parameters<typeof fetch>) => reply(status));
    vi.stubGlobal("fetch", calls);
    mountPortal({ path: "/account/services/dc", session: null });
    expect(await screen.findByRole("link", { name: "前往登录" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("heading", { name: "DC 控制台" })).not.toBeInTheDocument();
    expect(calls).not.toHaveBeenCalled();
  });

  it("renders the real Cloud Account shell and keeps navigation active", async () => {
    const calls = vi.fn(async (..._args: Parameters<typeof fetch>) => reply(status));
    vi.stubGlobal("fetch", calls);
    mountPortal({ path: "/account/services/dc", session: storedSession });

    expect(await screen.findByRole("heading", { level: 1, name: "DC 控制台" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "启动 DC" })).toBeEnabled());
    const nav = screen.getByRole("navigation", { name: "账户分区" });
    expect(within(nav).getByRole("link", { name: "关联服务" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link", { name: "关联服务" }).some((link) => link.getAttribute("href") === "/account/services")).toBe(true);
    expect(screen.getAllByRole("button", { name: "退出登录" })).toHaveLength(1);
    expect(calls).toHaveBeenCalledWith("/dc/api/status", expect.any(Object));
  });

  it("saves a changed policy before start and keeps actions bound to the DC API", async () => {
    const calls = vi.fn(async (..._args: Parameters<typeof fetch>) => reply(status));
    vi.stubGlobal("fetch", calls);
    mountPortal({ path: "/account/services/dc", session: storedSession });
    await waitFor(() => expect(screen.getByRole("button", { name: "启动 DC" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("内存上限"), { target: { value: "512" } });
    fireEvent.click(screen.getByRole("button", { name: "启动 DC" }));
    await waitFor(() => expect(calls.mock.calls.some((row) => row[0] === "/dc/api/start")).toBe(true));

    const policies = calls.mock.calls.filter((row) => row[0] === "/dc/api/policy");
    expect(policies).toHaveLength(1);
    expect(policies[0]?.[1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ ...status.policy, memoryMiB: 512 }),
      headers: expect.objectContaining({ Authorization: "Bearer " + storedSession.sessionToken }),
    });
    const start = calls.mock.calls.find((row) => row[0] === "/dc/api/start");
    expect(start?.[1]).toMatchObject({ method: "POST", body: "{}", credentials: "same-origin" });
    const paths = calls.mock.calls.map((row) => row[0]);
    expect(paths.indexOf("/dc/api/policy")).toBeLessThan(paths.indexOf("/dc/api/start"));
  });

  it("shows an owner-denied response without enabling host controls", async () => {
    const calls = vi.fn(async (..._args: Parameters<typeof fetch>) => reply({ error: "forbidden" }, 403));
    vi.stubGlobal("fetch", calls);
    mountPortal({ path: "/account/services/dc", session: storedSession });
    expect(await screen.findByRole("alert")).toHaveTextContent("没有这台服务器的管理权限");
    expect(screen.getByRole("button", { name: "启动 DC" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存策略" })).toBeDisabled();
  });
});
