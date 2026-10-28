import {
  canonicalRemoteDeviceScopes,
  type HostGrantManagementEntry,
  type HostMobileGrantMutationResponse,
  type MiraDevice,
  type RemoteDeviceScope,
} from "@uichat-mira/cloud-auth-contracts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  createHostGrantsFailure,
  toHostGrantsFailure,
  type HostGrantsClient,
  type HostGrantsFailure,
} from "./client";

export interface HostGrantItem {
  mobileDeviceId: string;
  scopes: RemoteDeviceScope[];
  status: "active" | "revoked";
}

export interface HostGrantView {
  host: HostGrantManagementEntry["host"];
  revision: number;
  policyConfigured: boolean;
  policyScopes: RemoteDeviceScope[];
  validUntil: string | null;
  grants: HostGrantItem[];
  failure: HostGrantsFailure | null;
}

export interface HostGrantsNotice {
  tone: "success" | "warning" | "error";
  message: string;
}

export interface GrantMutationTarget {
  hostId: string;
  mobileDeviceId: string;
  action: "narrow" | "revoke";
}

export interface DeviceGrantsState {
  status: "loading" | "ready";
  refreshing: boolean;
  hosts: HostGrantView[];
  mobiles: MiraDevice[];
  revokedMobiles: MiraDevice[];
  loadFailure: HostGrantsFailure | null;
  pending: GrantMutationTarget | null;
  notice: HostGrantsNotice | null;
}

export interface UseDeviceGrantsOptions {
  client: HostGrantsClient;
  getSessionToken: () => string | null;
  onSessionExpired?: (token: string) => void;
  accountId: string | null;
  enabled: boolean;
}

export interface DeviceGrantsController extends DeviceGrantsState {
  refresh(options?: { announce?: boolean }): Promise<void>;
  narrow(input: {
    hostId: string;
    mobileDeviceId: string;
    expectedRevision: number;
    scopes: RemoteDeviceScope[];
  }): Promise<boolean>;
  revoke(input: {
    hostId: string;
    mobileDeviceId: string;
    expectedRevision: number;
  }): Promise<boolean>;
}

const initialState: DeviceGrantsState = {
  status: "loading",
  refreshing: false,
  hosts: [],
  mobiles: [],
  revokedMobiles: [],
  loadFailure: null,
  pending: null,
  notice: null,
};

export function useDeviceGrants({
  client,
  getSessionToken,
  onSessionExpired,
  accountId,
  enabled,
}: UseDeviceGrantsOptions): DeviceGrantsController {
  const [state, setState] = useState<DeviceGrantsState>(initialState);
  const sequence = useRef(0);

  const refresh = useCallback(async (options?: { announce?: boolean }) => {
    const announce = options?.announce === true;
    const requestSequence = (sequence.current += 1);
    const sessionToken = getSessionToken();

    if (!sessionToken || !accountId) {
      setState((current) => ({
        ...current,
        status: "ready",
        hosts: [],
        mobiles: [],
        revokedMobiles: [],
        refreshing: false,
        loadFailure: createHostGrantsFailure("reauth_required"),
        notice: null,
      }));
      return;
    }

    setState((current) => ({
      ...current,
      refreshing: announce,
      loadFailure: null,
      notice: null,
    }));

    try {
      // Device metadata decorates labels only. A failure to load friendly
      // names must never make an otherwise valid grant impossible to revoke.
      const [managementResult, deviceResult] = await Promise.allSettled([
        client.listManagement(sessionToken),
        client.listDevices(sessionToken),
      ]);
      if (managementResult.status === "rejected") throw managementResult.reason;
      if (deviceResult.status === "rejected" && toHostGrantsFailure(deviceResult.reason).kind === "reauth_required") {
        throw deviceResult.reason;
      }
      const managed = managementResult.value;
      const devices = deviceResult.status === "fulfilled" ? deviceResult.value : [];

      // Management is account-owned state, not a runtime Host grant snapshot.
      // The backend never attaches a TTL or current execution credential.
      if (managed.some((entry) => entry.accountId !== accountId)) {
        throw new Error("Cross-account grant-management response");
      }
      const hostViews = managed.map(toHostView);

      if (requestSequence !== sequence.current) return;

      setState((current) => ({
        ...current,
        status: "ready",
        refreshing: false,
        hosts: hostViews,
        mobiles: devices.filter(
          (device) => device.platform === "mobile" && device.revokedAt === null,
        ),
        revokedMobiles: devices.filter(
          (device) => device.platform === "mobile" && device.revokedAt !== null,
        ),
        loadFailure: null,
        notice: deviceResult.status === "rejected"
          ? {
              tone: "warning",
              message: "手机设备名称暂时无法读取，授权仍可管理；暂以通用名称显示。",
            }
          : announce
            ? {
                tone: "success",
                message: "已读取最新云端设备与授权；如果数据没变化，列表会保持原样。Desktop 的实际授权执行仍取决于自身同步。",
              }
            : null,
      }));
    } catch (error) {
      if (requestSequence !== sequence.current) return;
      if (toHostGrantsFailure(error).kind === "reauth_required") {
        onSessionExpired?.(sessionToken);
        return;
      }
      setState((current) => ({
        ...current,
        status: "ready",
        hosts: [],
        mobiles: [],
        revokedMobiles: [],
        refreshing: false,
        loadFailure: toHostGrantsFailure(error),
      }));
    }
  }, [client, getSessionToken, accountId, onSessionExpired]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  const narrow: DeviceGrantsController["narrow"] = useCallback(
    async ({ hostId, mobileDeviceId, expectedRevision, scopes }) => {
      const sessionToken = getSessionToken();
      if (!sessionToken) {
        setState((current) => ({
          ...current,
          pending: null,
          notice: {
            tone: "error",
            message: createHostGrantsFailure("reauth_required").message,
          },
        }));
        return false;
      }

      setState((current) => ({
        ...current,
        pending: { hostId, mobileDeviceId, action: "narrow" },
        notice: null,
      }));

      try {
        const result = await client.narrowGrant(
          sessionToken,
          hostId,
          mobileDeviceId,
          {
            expectedRevision,
            scopes: canonicalRemoteDeviceScopes(scopes),
          },
        );

        setState((current) => ({
          ...current,
          hosts: applyMutation(current.hosts, result),
          pending: null,
          notice: {
            tone: "success",
            message:
              "云端已保存新的授权范围。Desktop 会在下次同步或授权快照过期后按新范围执行；Portal 无法确认 Desktop 已立即生效。",
          },
        }));
        return true;
      } catch (error) {
        return handleMutationFailure(error, refresh, setState, sessionToken, onSessionExpired);
      }
    },
    [client, getSessionToken, refresh, onSessionExpired],
  );

  const revoke: DeviceGrantsController["revoke"] = useCallback(
    async ({ hostId, mobileDeviceId, expectedRevision }) => {
      const sessionToken = getSessionToken();
      if (!sessionToken) {
        setState((current) => ({
          ...current,
          pending: null,
          notice: {
            tone: "error",
            message: createHostGrantsFailure("reauth_required").message,
          },
        }));
        return false;
      }

      setState((current) => ({
        ...current,
        pending: { hostId, mobileDeviceId, action: "revoke" },
        notice: null,
      }));

      try {
        const result = await client.revokeGrant(
          sessionToken,
          hostId,
          mobileDeviceId,
          expectedRevision,
        );

        setState((current) => ({
          ...current,
          hosts: applyMutation(current.hosts, result),
          pending: null,
          notice: {
            tone: "success",
            message:
              "云端已撤销此手机设备的授权。Desktop 会在下次同步或授权快照过期后停止使用这些权限；Portal 无法确认 Desktop 已立即断开。",
          },
        }));
        return true;
      } catch (error) {
        return handleMutationFailure(error, refresh, setState);
      }
    },
    [client, getSessionToken, refresh],
  );

  return { ...state, refresh, narrow, revoke };
}

async function handleMutationFailure(
  error: unknown,
  refresh: () => Promise<void>,
  setState: Dispatch<SetStateAction<DeviceGrantsState>>,
  sessionToken: string,
  onSessionExpired?: (token: string) => void,
): Promise<boolean> {
  const failure = toHostGrantsFailure(error);
  if (failure.kind === "reauth_required") {
    onSessionExpired?.(sessionToken);
    return false;
  }

  if (
    failure.kind === "stale_revision" ||
    failure.kind === "not_found" ||
    failure.kind === "forbidden"
  ) {
    await refresh();
  }

  setState((current) => ({
    ...current,
    pending: null,
    notice: { tone: "error", message: failure.message },
  }));
  return false;
}

function applyMutation(
  hosts: HostGrantView[],
  result: HostMobileGrantMutationResponse,
): HostGrantView[] {
  return hosts.map((view) => {
    if (view.host.id !== result.hostId) return view;

    const grants = view.grants.map((grant) =>
      grant.mobileDeviceId === result.mobileDeviceId
        ? {
            mobileDeviceId: grant.mobileDeviceId,
            scopes: result.scopes,
            status: result.status,
          }
        : grant,
    );

    return {
      ...view,
      revision: result.revision,
      validUntil: null,
      grants,
    };
  });
}

function toHostView(entry: HostGrantManagementEntry): HostGrantView {
  return {
    host: entry.host,
    revision: entry.revision,
    policyConfigured: entry.policyConfigured,
    policyScopes: entry.policyScopes,
    validUntil: null,
    grants: entry.grants.map((grant) => ({
      mobileDeviceId: grant.mobileDeviceId,
      scopes: grant.scopes,
      status: grant.status,
    })),
    failure: null,
  };
}
