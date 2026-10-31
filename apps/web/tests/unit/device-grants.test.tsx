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
  hostOffline,
  managementEntry,
  mobileActive,
  mobileRevoked,
  snapshotGranted,
  snapshotNoPolicy,
  snapshotRevoked,
} from "../helpers/host-grants-fixtures";

function renderGrants(client: HostGrantsClient = createFakeHostGrantsClient()): {
  store: AuthStore;
  storage: ReturnType<typeof createMemoryStorage>;
} {
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

async function renderLoadedGrants(client: HostGrantsClient = createFakeHostGrantsClient()) {
  const harness = renderGrants(client);
  // The card no longer owns the page heading (the devices route does), so wait
  // on the records the card itself renders.
  await screen.findByRole("button", { name: "刷新列表" });
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
    const row = screen.getByText("Pixel 手机").closest(".cloud-grant-row");
    expect(row).not.toBeNull();
    const identity = row?.querySelector(".cloud-grant-identity");
    const header = row?.querySelector(".cloud-grant-header");
    expect(identity).toContainElement(screen.getByText("授权中"));
    expect(header).toContainElement(screen.getByRole("button", { name: "调整范围" }));
    expect(header).toContainElement(screen.getByRole("button", { name: "撤销授权" }));
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
    const dialog = screen.getByRole("dialog", { name: "调整授权" });
    expect(within(dialog).getByText(/只能取消已有权限/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText("查看工具"));
    expect(calls).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "确认保存" }));

    expect(await screen.findByRole("status")).toHaveTextContent("云端已保存");
    expect(screen.getByRole("status")).toHaveTextContent("Portal 无法确认 Desktop 已立即生效");
    expect(calls).toEqual([
      {
        hostId: grantHostId,
        mobileDeviceId: activeMobileId,
        expectedRevision: 4,
        scopes: ["threads:read"],
      },
    ]);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "调整授权" })).not.toBeInTheDocument();
    });
    expect(screen.queryByText("查看工具")).not.toBeInTheDocument();
    expect(screen.queryByText(/已在 Desktop 生效/)).not.toBeInTheDocument();
    expect(screen.getByText("云端版本 5")).toBeInTheDocument();
  });

  it("discards draft changes on cancel and Escape without sending a mutation", async () => {
    const calls: unknown[] = [];
    await renderLoadedGrants(
      createFakeHostGrantsClient({
        narrowGrant: async (...args) => {
          calls.push(args);
          throw new Error("Must not be called when canceling");
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "调整范围" }));
    let dialog = screen.getByRole("dialog", { name: "调整授权" });
    fireEvent.click(within(dialog).getByLabelText("查看工具"));
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "调整授权" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "调整范围" }));
    dialog = screen.getByRole("dialog", { name: "调整授权" });
    expect(within(dialog).getByLabelText("查看工具")).toBeChecked();
    fireEvent.click(within(dialog).getByLabelText("查看工具"));
    fireEvent.click(within(dialog).getByLabelText("读取会话"));
    expect(within(dialog).getByRole("button", { name: "确认保存" })).toBeDisabled();
    expect(within(dialog).getByText(/请使用“撤销授权”/)).toBeInTheDocument();
    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByRole("dialog", { name: "调整授权" })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("keeps the scope dialog open and draft intact when a write is rejected", async () => {
    const calls: unknown[] = [];
    await renderLoadedGrants(
      createFakeHostGrantsClient({
        narrowGrant: async (...args) => {
          calls.push(args);
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
    const dialog = screen.getByRole("dialog", { name: "调整授权" });
    fireEvent.click(within(dialog).getByLabelText("查看工具"));
    fireEvent.click(within(dialog).getByRole("button", { name: "确认保存" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("保存未成功");
    expect(within(dialog).getByLabelText("查看工具")).not.toBeChecked();
    expect(calls).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "调整授权" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("status")).toHaveTextContent("Portal 无法确认 Desktop 已立即断开");
    expect(calls).toEqual([
      {
        hostId: grantHostId,
        mobileDeviceId: activeMobileId,
        expectedRevision: 4,
      },
    ]);
    expect(screen.getByText("已撤销")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤销授权" })).not.toBeInTheDocument();
  });

  it("reloads authoritative state on a stale revision without blindly retrying", async () => {
    let snapshotCalls = 0;
    const narrowCalls: unknown[] = [];
    const client = createFakeHostGrantsClient({
      listManagement: async () => {
        snapshotCalls += 1;
        return [
          managementEntry(
            snapshotCalls === 1
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
                },
          ),
        ];
      },
      narrowGrant: async (...args) => {
        narrowCalls.push(args);
        throw staleRevisionError();
      },
    });

    await renderLoadedGrants(client);

    fireEvent.click(screen.getByRole("button", { name: "调整范围" }));
    fireEvent.click(screen.getByLabelText("查看工具"));
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("云端授权已被其他操作更新");
    await waitFor(() => {
      expect(snapshotCalls).toBeGreaterThanOrEqual(2);
    });
    expect(narrowCalls).toHaveLength(1);
    expect(screen.getByText("云端版本 6")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认保存" })).not.toBeInTheDocument();
  });

  it("keeps grant revocation available when optional device labels fail", async () => {
    const client = createFakeHostGrantsClient({
      listDevices: async () => {
        throw new HostGrantsError(createHostGrantsFailure("service_unavailable", { status: 503 }));
      },
    });
    renderGrants(client);
    expect(await screen.findByText("工作 Desktop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "撤销授权" })).toBeEnabled();
    expect(screen.getAllByText("手机设备").length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent("手机设备名称暂时无法读取");
    // A cosmetic metadata outage must never log the account out.
    fireEvent.click(screen.getByRole("button", { name: "撤销授权" }));
    expect(screen.getByRole("button", { name: "确认撤销" })).toBeEnabled();
  });

  it("invalidates the Cloud Session after a grants 401 so the protected controls disappear", async () => {
    const { store, storage } = renderGrants(
      createFakeHostGrantsClient({
        listManagement: async () => {
          throw new HostGrantsError(
            createHostGrantsFailure("reauth_required", {
              status: 401,
              code: "HOST_GRANT_REAUTH_REQUIRED",
            }),
          );
        },
      }),
    );

    await waitFor(() => expect(store.getState().status).toBe("unauthenticated"));
    expect(storage.load()).toBeNull();
    expect(screen.queryByRole("button", { name: "撤销授权" })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));

    expect(await screen.findByText("云端拒绝此操作。")).toBeInTheDocument();
    expect(store.getState().status).toBe("authenticated");
  });

  it("distinguishes a failed management ledger read from a network outage", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        listManagement: async () => {
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
    expect(screen.queryByText("工作 Desktop")).not.toBeInTheDocument();
  });

  it("shows network and service failures distinctly without ending the session", async () => {
    const { store } = renderGrants(
      createFakeHostGrantsClient({
        listManagement: async () => {
          throw new HostGrantsError(createHostGrantsFailure("network_unavailable"));
        },
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("无法连接云端授权服务");
    expect(store.getState().status).toBe("authenticated");
  });

  it("shows service unavailable and retries through the explicit refresh control", async () => {
    let calls = 0;
    const client = createFakeHostGrantsClient({
      listManagement: async () => {
        calls += 1;
        if (calls === 1) {
          throw new HostGrantsError(
            createHostGrantsFailure("service_unavailable", {
              status: 503,
            }),
          );
        }
        return [managementEntry(snapshotGranted)];
      },
    });

    await renderGrants(client);

    expect(await screen.findByRole("alert")).toHaveTextContent("云端授权服务暂时不可用");
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));

    expect(await screen.findByText("工作 Desktop")).toBeInTheDocument();
  });

  it("explains an empty management ledger without hiding historical eligible Hosts", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        listManagement: async () => [],
        listDevices: async () => [],
      }),
    );

    expect(await screen.findByText("没有可管理的 Desktop Host")).toBeInTheDocument();
    expect(
      screen.getByText(/设备退出云账号或 Session 过期时也可管理已保存的权限/),
    ).toBeInTheDocument();
  });

  it("explains an unconfigured Host policy without offering widening controls", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        listManagement: async () => [managementEntry(snapshotNoPolicy)],
        listDevices: async () => [mobileActive],
      }),
    );

    expect(await screen.findByText("Desktop 尚未为此 Host 设置授权范围。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "调整范围" })).not.toBeInTheDocument();
  });

  it("distinguishes a configured Host with no mobile devices", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        listManagement: async () => [managementEntry({ ...snapshotGranted, grants: [] })],
        listDevices: async () => [],
      }),
    );

    expect(await screen.findByText("此账户还没有手机设备。")).toBeInTheDocument();
  });

  it("allows managing a durable revoked-by-logout Host from the ledger alone", async () => {
    const client = createFakeHostGrantsClient({
      listManagement: async () => [managementEntry(snapshotGranted, hostOffline)],
    });
    renderGrants(client);
    expect(await screen.findByText("客厅 Desktop")).toBeInTheDocument();
    expect(screen.getByText("离线")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "撤销授权" })).toBeEnabled();
  });

  it("marks an offline Host without claiming immediate enforcement", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        listManagement: async () => [managementEntry(snapshotGranted, hostOffline)],
      }),
    );

    const card = (await screen.findByText("客厅 Desktop")).closest("[data-slot='card']");
    if (!card) throw new Error("Expected the offline Host card");
    expect(within(card as HTMLElement).getByText("离线")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText(/未观察到在线/)).toBeInTheDocument();
    expect(screen.queryByText(/已立即生效/)).not.toBeInTheDocument();
    // The execution caveat moved to the devices page footer; the record card
    // must not repeat it (see auth-pages.test.tsx, devices route).
    expect(screen.queryByText(/云端保存成功不等于 Desktop 已立即执行/)).not.toBeInTheDocument();
  });

  it("reflects the current effective scopes after a loaded snapshot", async () => {
    await renderLoadedGrants(
      createFakeHostGrantsClient({
        listManagement: async () => [
          managementEntry({
            ...snapshotGranted,
            grants: [
              {
                mobileDeviceId: activeMobileId,
                scopes: effectiveScopes,
                status: "active",
              },
            ],
          }),
        ],
      }),
    );

    expect(screen.getByText("读取会话")).toBeInTheDocument();
    expect(screen.getByText("查看工具")).toBeInTheDocument();
  });

  it("does not render management data that belongs to another account", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        listManagement: async () => [
          { ...managementEntry(snapshotGranted), accountId: "another-account" },
        ],
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("云端授权服务出现异常");
    expect(screen.queryByText("读取会话")).not.toBeInTheDocument();
    expect(screen.queryByText("Pixel 手机")).not.toBeInTheDocument();
  });

  it("shows a revoked grant as terminal without offering reactivation controls", async () => {
    await renderLoadedGrants(
      createFakeHostGrantsClient({
        listManagement: async () => [managementEntry(snapshotRevoked)],
      }),
    );

    expect(screen.getByText("已撤销")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "调整范围" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤销授权" })).not.toBeInTheDocument();
    expect(screen.getByText(/此授权已在云端撤销，不能在此恢复/)).toBeInTheDocument();
  });

  it("notes revoked mobile devices without rendering them as grants", async () => {
    renderGrants(
      createFakeHostGrantsClient({
        listDevices: async () => [mobileActive, mobileRevoked],
      }),
    );

    expect(await screen.findByText("工作 Desktop")).toBeInTheDocument();
    expect(screen.getByText(/台已撤销的手机设备/)).toBeInTheDocument();
    expect(screen.queryByText("旧手机")).not.toBeInTheDocument();
  });
});
