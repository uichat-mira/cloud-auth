import type {
  HostGrantManagementEntry,
  HostMobileGrantMutationResponse,
} from "@uichat-mira/cloud-auth-contracts";
import type { Dispatch, SetStateAction } from "react";
import { revokeFailedSession } from "@/lib/auth/reauth";
import { toHostGrantsFailure } from "./client";
import type { DeviceGrantsState, HostGrantView } from "./types";

export async function handleMutationFailure(
  error: unknown,
  refresh: () => Promise<void>,
  setState: Dispatch<SetStateAction<DeviceGrantsState>>,
  sessionToken: string,
  getSessionToken: () => string | null,
  onSessionExpired?: (token: string) => void,
): Promise<boolean> {
  const failure = toHostGrantsFailure(error);
  if (failure.kind === "reauth_required") {
    // A privileged mutation is never replayed; only its read-only state is
    // refreshed, and only when the failed token had already been renewed.
    setState((current) => ({ ...current, pending: null }));
    const { currentToken, rotated } = revokeFailedSession(
      sessionToken,
      getSessionToken,
      onSessionExpired ?? (() => undefined),
    );
    if (rotated) {
      await refresh();
      // Refresh clears its own notice. Keep the failed write visible after it.
      setState((current) => ({
        ...current,
        notice: {
          tone: "error",
          message: "Cloud Session 已更新，本次授权变更未执行，请重新确认后重试。",
        },
      }));
    } else if (currentToken === sessionToken) {
      setState((current) => ({ ...current, notice: { tone: "error", message: failure.message } }));
    }
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

export function applyMutation(
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
      grants,
    };
  });
}

export function toHostView(entry: HostGrantManagementEntry): HostGrantView {
  return {
    host: entry.host,
    revision: entry.revision,
    policyConfigured: entry.policyConfigured,
    grants: entry.grants.map((grant) => ({
      mobileDeviceId: grant.mobileDeviceId,
      scopes: grant.scopes,
      status: grant.status,
    })),
  };
}
