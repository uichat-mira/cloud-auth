import {
  canonicalRemoteDeviceScopes,
  type RemoteDeviceScope,
} from "@uichat-mira/cloud-auth-contracts";

export interface GrantWindow {
  issuedAt: string;
  validUntil: string;
  maxStalenessSeconds: number;
}

export interface GrantScopesOverride {
  scopes: readonly RemoteDeviceScope[];
  revokedAt: string | null;
  updatedAt: string;
}

/**
 * Snapshot validity is server-issued and deliberately short. A Desktop that
 * cannot refresh before `validUntil` must treat the proof as expired.
 */
export function grantWindow(now: Date, ttlSeconds: number): GrantWindow {
  return {
    issuedAt: now.toISOString(),
    validUntil: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    maxStalenessSeconds: ttlSeconds,
  };
}

/**
 * Absence of an override inherits the Host policy ceiling. A revoked override
 * yields no scopes; a present override can only narrow, because callers are
 * prevented from storing an override outside the ceiling.
 */
export function effectiveGrantScopes(
  policyScopes: readonly RemoteDeviceScope[],
  override: GrantScopesOverride | null,
): RemoteDeviceScope[] {
  if (!override) return canonicalRemoteDeviceScopes(policyScopes);
  if (override.revokedAt !== null) return [];
  return canonicalRemoteDeviceScopes(override.scopes);
}

export function isGrantScopeSubset(
  requested: readonly RemoteDeviceScope[],
  ceiling: readonly RemoteDeviceScope[],
): boolean {
  const allowed = new Set(ceiling);
  return requested.every((scope) => allowed.has(scope));
}

export function intersectGrantScopes(
  left: readonly RemoteDeviceScope[],
  right: readonly RemoteDeviceScope[],
): RemoteDeviceScope[] {
  const allowed = new Set(right);
  return canonicalRemoteDeviceScopes(left.filter((scope) => allowed.has(scope)));
}
