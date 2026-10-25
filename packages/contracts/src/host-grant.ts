import { z } from "zod";

/**
 * Canonical Remote V1 capability vocabulary. These are the exact scope names
 * persisted by Mira Desktop's Remote V1 paired-device model
 * (`REMOTE_DEVICE_SCOPES`), not a Cloud Auth invention. Cloud Auth never
 * accepts wildcards, arbitrary strings, or Relay transport scopes here:
 * `relay:transport` is a transport admission decision, never Host Tool access.
 */
export const REMOTE_DEVICE_SCOPES = [
  "threads:read",
  "messages:read",
  "messages:write",
  "agent:read",
  "agent:approve",
  "agent:control",
  "tools:read",
  "tools:invoke",
  "tools:approve",
  "tools:control",
  "artifacts:read",
] as const;

export const remoteDeviceScopeSchema = z.enum(REMOTE_DEVICE_SCOPES);

export type RemoteDeviceScope = z.infer<typeof remoteDeviceScopeSchema>;

/**
 * Deduplicates and sorts scopes into the canonical Remote V1 order. The
 * storage and snapshot contracts are order-stable so revisions are meaningful.
 */
export function canonicalRemoteDeviceScopes(
  scopes: readonly RemoteDeviceScope[],
): RemoteDeviceScope[] {
  const selected = new Set(scopes);
  return REMOTE_DEVICE_SCOPES.filter((scope) => selected.has(scope));
}

const grantScopeListSchema = z
  .array(remoteDeviceScopeSchema)
  .max(REMOTE_DEVICE_SCOPES.length);

const expectedRevisionSchema = z.number().int().nonnegative();

/**
 * The Desktop owner's Host-level ceiling. Mobile grants can never exceed this
 * set, and a Mobile that joins later inherits only this ceiling.
 */
export const setHostGrantPolicyRequestSchema = z
  .object({
    expectedRevision: expectedRevisionSchema,
    scopes: grantScopeListSchema,
  })
  .strict();

/**
 * A Portal/account-session narrowing or revocation. The requested set must be
 * a subset of the Host ceiling and of the currently effective scopes; it can
 * never widen authority.
 */
export const updateHostMobileGrantRequestSchema = z
  .object({
    expectedRevision: expectedRevisionSchema,
    scopes: grantScopeListSchema,
  })
  .strict();

export const hostGrantPolicyResponseSchema = z
  .object({
    hostId: z.string().min(1),
    accountId: z.string().min(1),
    revision: expectedRevisionSchema,
    scopes: z.array(remoteDeviceScopeSchema),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const hostMobileGrantStatusSchema = z.enum(["active", "revoked"]);

export const hostGrantEntrySchema = z
  .object({
    mobileDeviceId: z.string().min(1),
    scopes: z.array(remoteDeviceScopeSchema),
    status: hostMobileGrantStatusSchema,
  })
  .strict();

/**
 * Complete authoritative Host grant snapshot. `grants` contains every active
 * same-account Mobile at `revision`; an absent Mobile has no grant. The
 * snapshot must be discarded once `validUntil` passes or a fetch fails.
 */
export const hostGrantSnapshotSchema = z
  .object({
    hostId: z.string().min(1),
    accountId: z.string().min(1),
    policyConfigured: z.boolean(),
    policyScopes: z.array(remoteDeviceScopeSchema),
    revision: expectedRevisionSchema,
    issuedAt: z.iso.datetime(),
    validUntil: z.iso.datetime(),
    maxStalenessSeconds: z.number().int().positive(),
    grants: z.array(hostGrantEntrySchema),
  })
  .strict();

/**
 * Account-owner Portal management view of durable Host grants. Unlike the
 * runtime /grants snapshot this response is NEVER a positive Host execution
 * credential: it carries no issuedAt, validUntil or grant TTL. Historical
 * Hosts ended by Desktop logout remain visible until their device is revoked.
 */
export const hostGrantManagementEntrySchema = z.object({
  host: z.object({
    id: z.string().min(1),
    displayName: z.string().min(1).max(80).nullable(),
    clientVersion: z.string().min(1).max(64).nullable(),
    availability: z.enum(["available", "offline"]),
  }).strict(),
  accountId: z.string().min(1),
  policyConfigured: z.boolean(),
  policyScopes: z.array(remoteDeviceScopeSchema),
  revision: expectedRevisionSchema,
  grants: z.array(hostGrantEntrySchema),
}).strict();

export const hostGrantManagementListResponseSchema = z.object({
  hosts: z.array(hostGrantManagementEntrySchema),
}).strict();

/**
 * A Mobile's own effective grant. It never includes another Mobile's identity
 * or the Host-wide snapshot.
 */
export const hostMobileGrantSchema = z
  .object({
    hostId: z.string().min(1),
    accountId: z.string().min(1),
    mobileDeviceId: z.string().min(1),
    revision: expectedRevisionSchema,
    scopes: z.array(remoteDeviceScopeSchema),
    issuedAt: z.iso.datetime(),
    validUntil: z.iso.datetime(),
    maxStalenessSeconds: z.number().int().positive(),
  })
  .strict();

export const hostMobileGrantMutationResponseSchema = z
  .object({
    hostId: z.string().min(1),
    mobileDeviceId: z.string().min(1),
    revision: expectedRevisionSchema,
    scopes: z.array(remoteDeviceScopeSchema),
    status: hostMobileGrantStatusSchema,
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const hostGrantErrorCodeSchema = z.enum([
  "HOST_GRANT_INVALID_REQUEST",
  "HOST_GRANT_REAUTH_REQUIRED",
  "HOST_GRANT_NOT_FOUND",
  "HOST_GRANT_NOT_ALLOWED",
  "HOST_GRANT_STALE_REVISION",
  "HOST_GRANT_INTERNAL_ERROR",
]);

export const hostGrantErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: hostGrantErrorCodeSchema,
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type SetHostGrantPolicyRequest = z.infer<typeof setHostGrantPolicyRequestSchema>;
export type UpdateHostMobileGrantRequest = z.infer<
  typeof updateHostMobileGrantRequestSchema
>;
export type HostGrantPolicyResponse = z.infer<typeof hostGrantPolicyResponseSchema>;
export type HostGrantEntry = z.infer<typeof hostGrantEntrySchema>;
export type HostGrantSnapshot = z.infer<typeof hostGrantSnapshotSchema>;
export type HostMobileGrant = z.infer<typeof hostMobileGrantSchema>;
export type HostMobileGrantStatus = z.infer<typeof hostMobileGrantStatusSchema>;
export type HostMobileGrantMutationResponse = z.infer<
  typeof hostMobileGrantMutationResponseSchema
>;
export type HostGrantErrorCode = z.infer<typeof hostGrantErrorCodeSchema>;
export type HostGrantErrorEnvelope = z.infer<typeof hostGrantErrorEnvelopeSchema>;

export type HostGrantManagementEntry = z.infer<typeof hostGrantManagementEntrySchema>;
export type HostGrantManagementListResponse = z.infer<typeof hostGrantManagementListResponseSchema>;
