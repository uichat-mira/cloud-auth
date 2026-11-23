import type {
  HostGrantManagementEntry,
  MiraDevice,
  RemoteDeviceScope,
} from "@uichat-mira/cloud-auth-contracts";
import type { HostGrantsClient, HostGrantsFailure } from "./client";

export interface HostGrantItem {
  mobileDeviceId: string;
  scopes: RemoteDeviceScope[];
  status: "active" | "revoked";
}

/**
 * One Host record as the Portal may manage it. Every field here is rendered;
 * the ledger's execution-proof fields (validUntil, policyScopes) belong to the
 * Desktop Host, not to this account-owned view.
 */
export interface HostGrantView {
  host: HostGrantManagementEntry["host"];
  revision: number;
  policyConfigured: boolean;
  grants: HostGrantItem[];
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
