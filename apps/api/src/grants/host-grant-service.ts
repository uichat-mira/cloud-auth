import type {
  HostGrantPolicyResponse,
  HostGrantSnapshot,
  HostMobileGrant,
  HostMobileGrantMutationResponse,
  SetHostGrantPolicyRequest,
  UpdateHostMobileGrantRequest,
} from "@uichat-mira/cloud-auth-contracts";
import { hashSessionSecret, parseSessionToken } from "../security/session-token.js";
import { grantWindow } from "./grant-policy.js";
import type { HostGrantRepository, HostGrantResult } from "./host-grant-repository.js";

export type HostGrantErrorCode =
  | "HOST_GRANT_INVALID_REQUEST"
  | "HOST_GRANT_REAUTH_REQUIRED"
  | "HOST_GRANT_NOT_FOUND"
  | "HOST_GRANT_NOT_ALLOWED"
  | "HOST_GRANT_STALE_REVISION";

export class HostGrantError extends Error {
  constructor(
    readonly code: HostGrantErrorCode,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export interface HostGrantServiceOptions {
  snapshotTtlSeconds: number;
  now?: () => Date;
}

export class HostGrantService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: HostGrantRepository,
    private readonly options: HostGrantServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  setPolicy(
    token: string,
    hostId: string,
    request: SetHostGrantPolicyRequest,
  ): HostGrantPolicyResponse {
    const actor = this.actor(token);
    const now = this.now().toISOString();
    const result = this.repository.setPolicy({
      ...actor,
      hostId,
      expectedRevision: request.expectedRevision,
      scopes: request.scopes,
      now,
    });
    const value = unwrap(result);
    return {
      hostId: value.hostId,
      accountId: value.accountId,
      revision: value.revision,
      scopes: value.scopes,
      updatedAt: value.updatedAt,
    };
  }

  getSnapshot(token: string, hostId: string): HostGrantSnapshot {
    const actor = this.actor(token);
    const now = this.now();
    const result = this.repository.getSnapshot({
      ...actor,
      hostId,
      now: now.toISOString(),
    });
    const value = unwrap(result);
    return {
      hostId: value.hostId,
      accountId: value.accountId,
      policyConfigured: value.policyConfigured,
      policyScopes: value.policyScopes,
      revision: value.revision,
      ...grantWindow(now, this.options.snapshotTtlSeconds),
      grants: value.grants,
    };
  }

  getMobileGrant(token: string, hostId: string): HostMobileGrant {
    const actor = this.actor(token);
    const now = this.now();
    const result = this.repository.getMobileGrant({
      ...actor,
      hostId,
      now: now.toISOString(),
    });
    const value = unwrap(result);
    return {
      hostId: value.hostId,
      accountId: value.accountId,
      mobileDeviceId: value.mobileDeviceId,
      revision: value.revision,
      scopes: value.scopes,
      ...grantWindow(now, this.options.snapshotTtlSeconds),
    };
  }

  updateMobileGrant(
    token: string,
    hostId: string,
    mobileDeviceId: string,
    request: UpdateHostMobileGrantRequest,
  ): HostMobileGrantMutationResponse {
    const actor = this.actor(token);
    const now = this.now().toISOString();
    const result = this.repository.updateMobileGrant({
      ...actor,
      hostId,
      mobileDeviceId,
      expectedRevision: request.expectedRevision,
      scopes: request.scopes,
      now,
    });
    const value = unwrap(result);
    return {
      hostId: value.hostId,
      mobileDeviceId: value.mobileDeviceId,
      revision: value.revision,
      scopes: value.scopes,
      status: value.status,
      updatedAt: value.updatedAt,
    };
  }

  revokeMobileGrant(
    token: string,
    hostId: string,
    mobileDeviceId: string,
    expectedRevision: number,
  ): HostMobileGrantMutationResponse {
    const actor = this.actor(token);
    const now = this.now().toISOString();
    const result = this.repository.revokeMobileGrant({
      ...actor,
      hostId,
      mobileDeviceId,
      expectedRevision,
      now,
    });
    const value = unwrap(result);
    return {
      hostId: value.hostId,
      mobileDeviceId: value.mobileDeviceId,
      revision: value.revision,
      scopes: value.scopes,
      status: value.status,
      updatedAt: value.updatedAt,
    };
  }

  private actor(token: string): { sessionId: string; sessionSecretHash: string } {
    const parsed = parseSessionToken(token);
    if (!parsed) {
      throw new HostGrantError(
        "HOST_GRANT_REAUTH_REQUIRED",
        401,
        "Re-authentication is required",
      );
    }
    return {
      sessionId: parsed.id,
      sessionSecretHash: hashSessionSecret(parsed.secret),
    };
  }
}

function unwrap<T>(result: HostGrantResult<T>): T {
  if (result.ok) return result.value;
  switch (result.reason) {
    case "unauthorized":
      throw new HostGrantError(
        "HOST_GRANT_REAUTH_REQUIRED",
        401,
        "Re-authentication is required",
      );
    case "not_found":
      throw new HostGrantError(
        "HOST_GRANT_NOT_FOUND",
        404,
        "Desktop Host or Mobile device not found",
      );
    case "not_allowed":
      throw new HostGrantError(
        "HOST_GRANT_NOT_ALLOWED",
        403,
        "Host grant change is not allowed",
      );
    case "stale_revision":
      throw new HostGrantError(
        "HOST_GRANT_STALE_REVISION",
        409,
        "Host grant revision is stale",
      );
  }
}
