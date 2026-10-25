import type {
  DesktopHost,
  HostGrantSnapshot,
  HostGrantManagementEntry,
  HostMobileGrantMutationResponse,
  MiraDevice,
  RemoteDeviceScope,
} from "@uichat-mira/cloud-auth-contracts";
import type { CloudAuthClient } from "@/lib/auth/client";
import type { HostGrantsClient } from "@/lib/grants/client";
import { account, expiresAt, issuedSession } from "./auth-fixtures";

export const grantHostId = "11111111-1111-4111-8111-111111111111";
export const offlineHostId = "33333333-3333-4333-8333-333333333333";
export const activeMobileId = "22222222-2222-4222-8222-222222222222";
export const revokedMobileId = "44444444-4444-4444-8444-444444444444";

export const policyScopes: RemoteDeviceScope[] = [
  "threads:read",
  "tools:read",
  "tools:invoke",
];

export const effectiveScopes: RemoteDeviceScope[] = [
  "threads:read",
  "tools:read",
];

export const hostAvailable: DesktopHost = {
  id: grantHostId,
  deviceId: "55555555-5555-4555-8555-555555555555",
  displayName: "工作 Desktop",
  clientVersion: "1.4.0",
  availability: "available",
  relayRoom: "room_fixture_host",
  registeredAt: "2026-10-25T10:00:00.000Z",
  lastAdvertisedAt: "2026-10-25T12:00:00.000Z",
  leaseExpiresAt: "2026-10-25T12:02:00.000Z",
};

export const hostOffline: DesktopHost = {
  ...hostAvailable,
  id: offlineHostId,
  displayName: "客厅 Desktop",
  availability: "offline",
  lastAdvertisedAt: "2026-10-24T10:00:00.000Z",
  leaseExpiresAt: "2026-10-24T10:02:00.000Z",
};

export const mobileActive: MiraDevice = {
  id: activeMobileId,
  platform: "mobile",
  clientName: "Pixel 手机",
  clientVersion: "2.1.0",
  createdAt: "2026-10-20T08:00:00.000Z",
  lastSeenAt: "2026-10-25T11:59:00.000Z",
  revokedAt: null,
};

export const mobileRevoked: MiraDevice = {
  id: revokedMobileId,
  platform: "mobile",
  clientName: "旧手机",
  clientVersion: "1.0.0",
  createdAt: "2026-10-01T08:00:00.000Z",
  lastSeenAt: "2026-10-02T08:00:00.000Z",
  revokedAt: "2026-10-03T08:00:00.000Z",
};

export const snapshotGranted: HostGrantSnapshot = {
  hostId: hostAvailable.id,
  accountId: account.id,
  policyConfigured: true,
  policyScopes,
  revision: 4,
  issuedAt: "2026-10-25T12:00:00.000Z",
  validUntil: "2026-10-25T12:05:00.000Z",
  maxStalenessSeconds: 300,
  grants: [
    {
      mobileDeviceId: mobileActive.id,
      scopes: effectiveScopes,
      status: "active",
    },
  ],
};

export const snapshotNoPolicy: HostGrantSnapshot = {
  ...snapshotGranted,
  policyConfigured: false,
  policyScopes: [],
  revision: 0,
  grants: [],
};

export const snapshotRevoked: HostGrantSnapshot = {
  ...snapshotGranted,
  revision: 5,
  grants: [
    {
      mobileDeviceId: mobileActive.id,
      scopes: [],
      status: "revoked",
    },
  ],
};

export function mutationResponse(input: {
  hostId?: string;
  mobileDeviceId?: string;
  revision: number;
  scopes: RemoteDeviceScope[];
  status: "active" | "revoked";
}): HostMobileGrantMutationResponse {
  return {
    hostId: input.hostId ?? hostAvailable.id,
    mobileDeviceId: input.mobileDeviceId ?? mobileActive.id,
    revision: input.revision,
    scopes: input.scopes,
    status: input.status,
    updatedAt: "2026-10-25T12:01:00.000Z",
  };
}

export function createFakeHostGrantsClient(
  overrides: Partial<HostGrantsClient> = {},
): HostGrantsClient {
  // Legacy per-Host fake inputs are composed into the new Portal-only
  // management response, so component regressions keep testing the same
  // scope/revision interactions without issuing execution proofs.
  const client: HostGrantsClient = {
    listManagement: async (token) => {
      const hosts = await client.listHosts(token);
      return Promise.all(hosts.map(async (host): Promise<HostGrantManagementEntry> => {
        const snapshot = await client.getSnapshot(token, host.id);
        return {
          host: {
            id: host.id,
            displayName: host.displayName,
            clientVersion: host.clientVersion,
            availability: host.availability,
          },
          accountId: snapshot.accountId,
          policyConfigured: snapshot.policyConfigured,
          policyScopes: snapshot.policyScopes,
          revision: snapshot.revision,
          grants: snapshot.grants,
        };
      }));
    },
    listHosts: async () => [hostAvailable],
    listDevices: async () => [mobileActive],
    getSnapshot: async () => snapshotGranted,
    narrowGrant: async (_token, hostId, mobileDeviceId, request) =>
      mutationResponse({
        hostId,
        mobileDeviceId,
        revision: request.expectedRevision + 1,
        scopes: request.scopes,
        status: "active",
      }),
    revokeGrant: async (_token, hostId, mobileDeviceId, expectedRevision) =>
      mutationResponse({
        hostId,
        mobileDeviceId,
        revision: expectedRevision + 1,
        scopes: [],
        status: "revoked",
      }),
    ...overrides,
  };
  return client;
}

export function createFakeAuthClient(
  overrides: Partial<CloudAuthClient> = {},
): CloudAuthClient {
  return {
    login: async () => issuedSession("token-1"),
    getSession: async () => ({ account, expiresAt }),
    renewSession: async () => issuedSession("token-2"),
    changePassword: async () => undefined,
    logout: async () => undefined,
    ...overrides,
  };
}
