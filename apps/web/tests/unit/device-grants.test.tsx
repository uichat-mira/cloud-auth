import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeviceGrantsCard } from "@/components/device-grants-card";
import { AuthProvider } from "@/lib/auth/context";
import { createAuthStore, type AuthStore } from "@/lib/auth/store";
import {
  createHostGrantsFailure,
  HostGrantsError,
  type HostGrantsClient,
} from "@/lib/grants/client";
import { HostGrantsProvider } from "@/lib/grants/context";
import { createMemoryStorage } from "../helpers/session-storage";
import { expiresAt } from "../helpers/auth-fixtures";
import {
  activeMobileId,
  createFakeAuthClient,
  createFakeHostGrantsClient,
  effectiveScopes,
  grantHostId,
  hostAvailable,
  hostOffline,
  mobileActive,
  mobileRevoked,
  snapshotGranted,
  snapshotNoPolicy,
  snapshotRevoked,
} from "../helpers/host-grants-fixtures";

function renderGrants(
  client: HostGrantsClient = createFakeHostGrantsClient(),
): { store: AuthStore; storage: ReturnType<typeof createMemoryStorage> } {
  const storage = createMemoryStorage({
    sessionToken: "mcs_v1.session.secret",
    expiresAt,
  });
  const store = createAuthStore({
    client: createFakeAuthClient(),
    storage,
  });

  render(
    <AuthProvider store={store}>
      <HostGrantsProvider client={client}>
        <DeviceGrantsCard />
      </HostGrantsProvider>
    </AuthProvider>,
  );

  return { store, storage };
}

async function renderLoadedGrants(
  client: HostGrantsClient = createFakeHostGrantsClient(),
) {
  const harness = renderGrants(client);
  await screen.findByRole("heading", { level: 2, name: "设备与授权" });
  await screen.findByText("工作 Desktop");
  return harness;
}

function staleRevisionError(): HostGrantsError {
  return new HostGrantsError(
    createHostGrantsFailure("stale_revision", {
      status: 409,
      code: "HOST_GRANT_STALE_REVISION",
    }),
  );
}

describe("Device and Host grants card", () => {
  it("renders account-owned hosts, phones, and effective scopes without raw identifiers", async () => {
    const { storage } = await renderLoadedGrants();

    expect(screen.getByText("Pixel 手机")).toBeInTheDocument();
    expect(screen.getByText("工作 Desktop")).toBeInTheDocument();
    expect(screen.getByText("最近在线")).toBeInTheDocument();
    expect(screen.getByText("读取会话")).toBeInTheDocument();
    expect(screen.getByText("查看工具")).toBeInTheDocument();
    expect(screen.queryByText("调用工具")).not.toBeInTheDocument();
    expect(screen.queryByText(grantHostId)).not.toBeInTheDocument();
    expect(screen.queryByText(activeMobileId)).not.toBeInTheDocument();
    expect(storage.load()?.sessionToken).toBe("mcs_v1.session.secret");
  });

  it("narrows only the current scopes and reports deferred Desktop enforcement", async () => {
    const calls: Array<{
      hostId: string;
      mobileDeviceId: string;
      expectedRevision: number;
      scopes: string[];
    }> = [];
    const client = createFakeHostGrantsClient({
      narrowGrant: async (_token, hostId, mobileDeviceId, request) => {
        calls.push({ hostId, mobileDeviceId, ...request });
        return {
          hostId,
          mobileDeviceId,
          revision: request.expectedRevision + 1,
          scopes: request.scopes,
          status: "active",
          updatedAt: "2026-10-25T12:01:00.000Z",
        };
      },
    });

    await renderLoadedGrants(client);

    fireEvent.click(screen.getByRole("button", { name: "调整范围" }));
    fireEvent.click(screen.getByLabelText("查看工具"));
    fireEvent.click(screen.getByRole("button", { name: "保存收窄" }));

    expect(await screen.findByRole("status")).toHaveTextContent("云端已保存");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Portal 无法确认 Desktop 已立即生效",
    );
    expect(calls).toEqual([
      {
        hostId: grantHostId,
        mobileDeviceId: activeMobileId,
        expectedRevision: 4,
        scopes: ["threads:read"],
      },
    ]);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "保存收窄" })).toBeNull();
    });
    expect(screen.queryByText("查看工具")).not.toBeInTheDocument();
    expect(screen.queryByText(/已在 Desktop 生效/)).not.toBeInTheDocument();
    expect(screen.getByText("云端版本 5")).toBeInTheDocument();
  });

  it("requires an explicit confirmation before revoking a grant", async () => {
    const calls: Array<{
      hostId: string;
      mobileDeviceId: string;
      expectedRevision: number;
    }> = [];
    const client = createFakeHostGrantsClient({
      revokeGrant: async (_token, hostId, mobileDeviceId, expectedRevision) => {
        calls.push({ hostId, mobileDeviceId, expectedRevision });
        return {
          hostId,
          mobileDeviceId,
          revision: expectedRevision + 1,
          scopes: [],
          status: "revoked",
          updatedAt: "2026-10-25T12:02:00.000Z",
        };
      },
    });

    await renderLoadedGrants(client);

    fireEvent.click(screen.getByRole("button", { name: "撤销授权" }));
    expect(calls).toHaveLength(0);
    expect(screen.getByText(/确定撤销/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认撤销" }));

    expect(await screen.findByRole("status")).toHaveTextContent("云端已撤销");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Portal 无法确认 Desktop 已立即断开",
    );
    expect(calls).toEqual([
      {
        hostId: grantHostId,
        mobileDeviceId: activeMobileId,
        expectedRevision: 4,
      },
    ]);
    expect(screen.getByText("已撤销")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "撤销授权" }),
    ).not.toBeInTheDocument();
  });

  it("reloads authoritative state on a stale revision without blindly retrying", async () => {
    let snapshotCalls = 0;
    const narrowCalls: unknown[] = [];
    const client = createFakeHostGrantsClient({
      getSnapshot: async () => {
        snapshotCalls += 1;
        return snapshotCalls === 1
          ? snapshotGranted
          : {
              ...snapshotGranted,
              revision: 6,
              grants: [
                {
                  mobileDeviceId: activeMobileId,
                  scopes: ["threads:read"],
                  status: "active",
                },
              ],
            };
      },
      narrowGrant: async (...args) => {
        narrowCalls.push(args);
        throw staleRevisionError();
      },
    });

    await renderLoadedGrants(client);

    fireEvent.click(screen.getByRole("button", { name: "调整范围" }));
    fireEvent.click(screen.getByLabelText("查看工具"));
    fireEvent.click(screen.getByRole("button", { name: "保存收窄" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "云端授权已被其他操作更新",
    );
    await waitFor(() => {
      expect(snapshotCalls).toBeGreaterThanOrEqual(2);
    });
    expect(narrowCalls).toHaveLength(1);
    expect(screen.getByText("云端版本 6")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "保存收窄" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the Cloud Session after a grants 401 and shows an expired-session message", async () => {
    const { store, storage } = renderGrants(
      createFakeHostGrantsClient({
        listHosts: async () => {
          throw new HostGrantsError(
            createHostGrantsFailure("reauth_required", {
              status: 401,
              code: "HOST_GRANT_REAUTH_REQUIRED",
            }),
          );
        },
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cloud Session 已失效",
    );
    expect(store.getState().status).toBe("authenticated");
    expect(storage.load()?.sessionToken).toBe("mcs_v1.session.secret");
  });

  it("distinguishes forbidden mutations from session expiry", async () => {
    const { store } = await renderLoadedGrants(
      createFakeHostGrantsClient({
        narrowGrant: async () => {
          throw new HostGrantsError(
            createHostGrantsFailure("forbidden", {
              status: 403,
              code: "HOST_GRANT_NOT_ALLOWED",
            }),
          );
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "调整范围" }));
    fireEvent.click(screen.getByLabelText("查看工具"));
    fireEvent.click(screen.getByRole("button", { name: "保存收窄" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "云端拒绝此操作",
    );
    expect(store.getState().status).toBe("authenticated");
  });

  it("distinguishes a revoked Host snapshot from a network outage", async () => {
    await renderLoadedGrants(
      createFakeHostGrantsClient({
        getSnapshot: async () => {
          throw new HostGrantsError(
            createHostGrantsFailure("not_found", {
              status: 404,
              code: "HOST_GRANT_NOT_FOUND",
            }),
          );
        },
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Desktop Host 或手机设备已不存在或已撤销。",
    );
    expect(screen.getByText("工作 Desktop")).toBeInTheDocument();
  });

  it("shows network and service failures distinctly without ending the session", async () => {
    const { store } = renderGrants(
      createFakeHostGrantsClient({
        listHosts: async () => {
          throw new HostGrantsError(
            createHostGrantsFailure("network_unavailable"),
          );
        },
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "无法连接云端授权服务",
    );
    expect(store.getState().status).toBe("authenticated");
  });

  it("shows service unavailable and retries through the explicit refresh control", async () => {
    let calls = 0;
    const client = createFakeHostGrantsClient({
      listHosts: async () => {
        calls += 1;
        if (calls === 1) {
          throw new HostGrantsError(
            createHostGrantsFailure("service_unavailable", {
              status: 503,
            }),
          );
        }
        return [hostAvailable];
      },
    });

    await renderGrants(client);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "云端授权服务暂时不可用",
    );
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));

    expect(await screen.findByText("工作 Desktop")).toBeInTheDocument();
  });

  it("explains no-Host discovery including the revoked/logged-out Host limitation", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        listHosts: async () => [],
        listDevices: async () => [],
      }),
    );

    expect(
      await screen.findByText("没有可管理的 Desktop Host"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/历史 Host 可能不会出现在列表中/),
    ).toBeInTheDocument();
  });

  it("explains an unconfigured Host policy without offering widening controls", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        getSnapshot: async () => snapshotNoPolicy,
        listDevices: async () => [mobileActive],
      }),
    );

    expect(
      await screen.findByText("Desktop 尚未为此 Host 设置授权范围。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "调整范围" }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes a configured Host with no mobile devices", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        getSnapshot: async () => ({ ...snapshotGranted, grants: [] }),
        listDevices: async () => [],
      }),
    );

    expect(
      await screen.findByText("此账户还没有手机设备。"),
    ).toBeInTheDocument();
  });

  it("marks an offline Host without claiming immediate enforcement", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        listHosts: async () => [hostOffline],
        getSnapshot: async () => ({
          ...snapshotGranted,
          hostId: hostOffline.id,
        }),
      }),
    );

    const card = (await screen.findByText("客厅 Desktop")).closest(
      "[data-slot='card']",
    );
    if (!card) throw new Error("Expected the offline Host card");
    expect(within(card as HTMLElement).getByText("离线")).toBeInTheDocument();
    expect(
      within(card as HTMLElement).getByText(
        /云端保存成功不等于 Desktop 已立即执行/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/已立即生效/)).not.toBeInTheDocument();
  });

  it("reflects the current effective scopes after a loaded snapshot", async () => {
    await renderLoadedGrants(
      createFakeHostGrantsClient({
        getSnapshot: async () => ({
          ...snapshotGranted,
          grants: [
            {
              mobileDeviceId: activeMobileId,
              scopes: effectiveScopes,
              status: "active",
            },
          ],
        }),
      }),
    );

    expect(screen.getByText("读取会话")).toBeInTheDocument();
    expect(screen.getByText("查看工具")).toBeInTheDocument();
  });

  it("does not render a snapshot that belongs to another account", async () => {
    await renderLoadedGrants(
      createFakeHostGrantsClient({
        getSnapshot: async () => ({
          ...snapshotGranted,
          accountId: "another-account",
        }),
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "云端授权服务出现异常",
    );
    expect(screen.queryByText("读取会话")).not.toBeInTheDocument();
    expect(screen.queryByText("Pixel 手机")).not.toBeInTheDocument();
  });

  it("shows a revoked grant as terminal without offering reactivation controls", async () => {
    await renderLoadedGrants(
      createFakeHostGrantsClient({
        getSnapshot: async () => snapshotRevoked,
      }),
    );

    expect(screen.getByText("已撤销")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "调整范围" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "撤销授权" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/此授权已在云端撤销，不能在此恢复/),
    ).toBeInTheDocument();
  });

  it("notes revoked mobile devices without rendering them as grants", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        listDevices: async () => [mobileActive, mobileRevoked],
      }),
    );

    expect(await screen.findByText("工作 Desktop")).toBeInTheDocument();
    expect(
      screen.getByText(/台已撤销的手机设备/),
    ).toBeInTheDocument();
    expect(screen.queryByText("旧手机")).not.toBeInTheDocument();
  });
});
