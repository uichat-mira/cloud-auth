import { canonicalRemoteDeviceScopes } from "@uichat-mira/cloud-auth-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { createHostGrantsFailure, toHostGrantsFailure } from "./client";
import { revokeFailedSession } from "@/lib/auth/reauth";
import { applyMutation, handleMutationFailure, toHostView } from "./grant-state";
import type { DeviceGrantsController, DeviceGrantsState, UseDeviceGrantsOptions } from "./types";

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

  const refresh = useCallback(
    async (options?: { announce?: boolean }) => {
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
        if (
          deviceResult.status === "rejected" &&
          toHostGrantsFailure(deviceResult.reason).kind === "reauth_required"
        ) {
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
          notice:
            deviceResult.status === "rejected"
              ? {
                  tone: "warning",
                  message: "手机设备名称暂时无法读取，授权仍可管理；暂以通用名称显示。",
                }
              : announce
                ? {
                    tone: "success",
                    message:
                      "已读取最新云端设备与授权；如果数据没变化，列表会保持原样。Desktop 的实际授权执行仍取决于自身同步。",
                  }
                : null,
        }));
      } catch (error) {
        if (requestSequence !== sequence.current) return;
        if (toHostGrantsFailure(error).kind === "reauth_required") {
          const { rotated } = revokeFailedSession(
            sessionToken,
            getSessionToken,
            onSessionExpired ?? (() => undefined),
          );
          if (rotated) {
            // Only the old bearer was rejected. Reload using the renewed token.
            void refresh();
          } else {
            // Also clear loading if this caller has no session owner callback.
            setState((current) => ({
              ...current,
              status: "ready",
              refreshing: false,
              pending: null,
              loadFailure: toHostGrantsFailure(error),
            }));
          }
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
    },
    [client, getSessionToken, accountId, onSessionExpired],
  );

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
        const result = await client.narrowGrant(sessionToken, hostId, mobileDeviceId, {
          expectedRevision,
          scopes: canonicalRemoteDeviceScopes(scopes),
        });

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
        return handleMutationFailure(
          error,
          refresh,
          setState,
          sessionToken,
          getSessionToken,
          onSessionExpired,
        );
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
        return handleMutationFailure(
          error,
          refresh,
          setState,
          sessionToken,
          getSessionToken,
          onSessionExpired,
        );
      }
    },
    [client, getSessionToken, refresh, onSessionExpired],
  );

  return { ...state, refresh, narrow, revoke };
}

export type {
  DeviceGrantsController,
  DeviceGrantsState,
  GrantMutationTarget,
  HostGrantItem,
  HostGrantsNotice,
  HostGrantView,
  UseDeviceGrantsOptions,
} from "./types";
