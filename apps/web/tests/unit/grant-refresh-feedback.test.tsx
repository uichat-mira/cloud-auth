import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeviceGrantsCard } from "@/components/device-grants-card";
import { AuthProvider } from "@/lib/auth/context";
import { createAuthStore } from "@/lib/auth/store";
import { HostGrantsError, createHostGrantsFailure } from "@/lib/grants/client";
import { HostGrantsProvider } from "@/lib/grants/context";
import { expiresAt } from "../helpers/auth-fixtures";
import {
  createFakeAuthClient,
  createFakeHostGrantsClient,
} from "../helpers/host-grants-fixtures";
import { createMemoryStorage } from "../helpers/session-storage";

function mount(client: ReturnType<typeof createFakeHostGrantsClient>) {
  const store = createAuthStore({
    client: createFakeAuthClient(),
    storage: createMemoryStorage({
      sessionToken: "mcs_v1.session.secret",
      expiresAt,
    }),
  });
  render(
    <AuthProvider store={store}>
      <HostGrantsProvider client={client}>
        <DeviceGrantsCard />
      </HostGrantsProvider>
    </AuthProvider>,
  );
}

describe("manual cloud authorization list refresh", () => {
  it("shows in-progress feedback and success even when grants did not change", async () => {
    const original = createFakeHostGrantsClient();
    let calls = 0;
    let resolveRefresh: (() => void) | undefined;
    const client = createFakeHostGrantsClient({
      listManagement: async (token) => {
        calls += 1;
        if (calls === 2) {
          await new Promise<void>((resolve) => { resolveRefresh = resolve; });
        }
        return original.listManagement(token);
      },
    });

    mount(client);
    await screen.findByText("工作 Desktop");
    expect(screen.queryByText(/已读取最新云端设备与授权/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新列表" }));
    expect(screen.getByRole("button", { name: "读取中…" })).toBeDisabled();
    expect(screen.getByText("工作 Desktop")).toBeInTheDocument();
    expect(calls).toBe(2);

    resolveRefresh?.();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "刷新列表" })).toBeEnabled();
    });
    expect(screen.getByRole("status")).toHaveTextContent("已读取最新云端设备与授权");
    expect(screen.getByRole("status")).toHaveTextContent("Desktop 的实际授权执行");
    expect(screen.getByText("工作 Desktop")).toBeInTheDocument();
  });

  it("shows a failure rather than claiming a successful refresh", async () => {
    const original = createFakeHostGrantsClient();
    let calls = 0;
    const client = createFakeHostGrantsClient({
      listManagement: async (token) => {
        calls += 1;
        if (calls === 2) {
          throw new HostGrantsError(createHostGrantsFailure("network_unavailable"));
        }
        return original.listManagement(token);
      },
    });

    mount(client);
    await screen.findByText("工作 Desktop");

    fireEvent.click(screen.getByRole("button", { name: "刷新列表" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("无法连接云端授权服务");
    expect(screen.queryByText(/已读取最新云端设备与授权/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新列表" })).toBeEnabled();
  });
});
