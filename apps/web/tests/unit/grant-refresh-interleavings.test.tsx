import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    storage: createMemoryStorage({ sessionToken: "mcs_v1.session.secret", expiresAt }),
  });

  render(
    <AuthProvider store={store}>
      <HostGrantsProvider client={client}>
        <DeviceGrantsCard />
      </HostGrantsProvider>
    </AuthProvider>,
  );
}

describe("grant refresh and mutation interleavings", () => {
  it("does not report an empty host list while retrying a failed request", async () => {
    const original = createFakeHostGrantsClient();
    let calls = 0;
    let release: (() => void) | undefined;
    const client = createFakeHostGrantsClient({
      listManagement: async (token) => {
        calls += 1;
        if (calls === 1) {
          throw new HostGrantsError(createHostGrantsFailure("network_unavailable"));
        }
        await new Promise<void>((resolve) => { release = resolve; });
        return original.listManagement(token);
      },
    });

    mount(client);
    expect(await screen.findByRole("alert")).toHaveTextContent("无法连接云端授权服务");
    expect(screen.queryByText("没有可管理的 Desktop Host")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    expect(screen.getByRole("button", { name: "读取中…" })).toBeDisabled();
    expect(screen.queryByText("没有可管理的 Desktop Host")).not.toBeInTheDocument();

    await act(async () => { release?.(); });
    expect(await screen.findByText("工作 Desktop")).toBeInTheDocument();
    expect(screen.queryByText("没有可管理的 Desktop Host")).not.toBeInTheDocument();
  });

  it("prevents revocation during a slow GET, avoiding a stale snapshot overwriting mutation", async () => {
    const original = createFakeHostGrantsClient();
    let reads = 0;
    let revocations = 0;
    let release: (() => void) | undefined;
    const client = createFakeHostGrantsClient({
      listManagement: async (token) => {
        reads += 1;
        if (reads === 2) {
          await new Promise<void>((resolve) => { release = resolve; });
        }
        return original.listManagement(token);
      },
      revokeGrant: async (...args) => {
        revocations += 1;
        return original.revokeGrant(...args);
      },
    });

    mount(client);
    await screen.findByText("工作 Desktop");
    fireEvent.click(screen.getByRole("button", { name: "刷新列表" }));

    expect(screen.getByRole("button", { name: "读取中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "撤销授权" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "调整范围" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "撤销授权" }));
    expect(revocations).toBe(0);
    expect(screen.queryByRole("button", { name: "确认撤销" })).not.toBeInTheDocument();

    await act(async () => { release?.(); });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "刷新列表" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "撤销授权" })).toBeEnabled();
    expect(revocations).toBe(0);
  });
});
