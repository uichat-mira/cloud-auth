import type { DatabaseSync } from "node:sqlite";
import {
  MIRA_DESKTOP_OAUTH_CLIENT_ID,
  canonicalRemoteDeviceScopes,
  remoteDeviceScopeSchema,
  type DevicePlatform,
  type RemoteDeviceScope,
} from "@uichat-mira/cloud-auth-contracts";
import { verifySessionSecretHash } from "../security/session-token.js";
import {
  effectiveGrantScopes,
  intersectGrantScopes,
  isGrantScopeSubset,
  type GrantScopesOverride,
} from "./grant-policy.js";

export type HostGrantFailure =
  | "unauthorized"
  | "not_found"
  | "not_allowed"
  | "stale_revision";

export type HostGrantResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: HostGrantFailure };

export interface GrantActor {
  sessionId: string;
  sessionSecretHash: string;
}

export interface SetHostGrantPolicyInput extends GrantActor {
  hostId: string;
  expectedRevision: number;
  scopes: readonly RemoteDeviceScope[];
  now: string;
}

export interface UpdateHostMobileGrantInput extends GrantActor {
  hostId: string;
  mobileDeviceId: string;
  expectedRevision: number;
  scopes: readonly RemoteDeviceScope[];
  now: string;
}

export interface RevokeHostMobileGrantInput extends GrantActor {
  hostId: string;
  mobileDeviceId: string;
  expectedRevision: number;
  now: string;
}

export interface HostGrantSnapshotInput extends GrantActor {
  hostId: string;
  now: string;
}

export interface HostMobileGrantInput extends GrantActor {
  hostId: string;
  now: string;
}

export interface HostGrantPolicyRecord {
  hostId: string;
  accountId: string;
  revision: number;
  scopes: RemoteDeviceScope[];
  updatedAt: string;
}

export interface HostGrantEntryRecord {
  mobileDeviceId: string;
  scopes: RemoteDeviceScope[];
  status: "active" | "revoked";
}

export interface HostGrantSnapshotRecord {
  hostId: string;
  accountId: string;
  policyConfigured: boolean;
  policyScopes: RemoteDeviceScope[];
  revision: number;
  grants: HostGrantEntryRecord[];
}

export interface HostMobileGrantRecord {
  hostId: string;
  accountId: string;
  mobileDeviceId: string;
  revision: number;
  scopes: RemoteDeviceScope[];
}

export interface HostMobileGrantMutationRecord {
  hostId: string;
  mobileDeviceId: string;
  revision: number;
  scopes: RemoteDeviceScope[];
  status: "active" | "revoked";
  updatedAt: string;
}

interface ActiveSessionRow {
  account_id: string;
  device_id: string | null;
  secret_hash: string;
  expires_at: string;
  revoked_at: string | null;
  is_allowed: number;
  disabled_at: string | null;
  device_account_id: string | null;
  device_platform: DevicePlatform | null;
  device_revoked_at: string | null;
}

interface SessionAuthority {
  accountId: string;
  deviceId: string | null;
  devicePlatform: DevicePlatform | null;
}

interface HostPolicyRow {
  host_id: string;
  account_id: string;
  policy_scopes: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface MobileOverrideRow {
  mobile_device_id: string;
  scopes: string;
  revoked_at: string | null;
  updated_at: string;
}

interface MobileDeviceRow {
  id: string;
}

export class HostGrantRepository {
  constructor(private readonly db: DatabaseSync) {}

  setPolicy(input: SetHostGrantPolicyInput): HostGrantResult<HostGrantPolicyRecord> {
    return this.transaction(() => {
      const session = this.readActiveSession(
        input.sessionId,
        input.sessionSecretHash,
        input.now,
      );
      if (!session) return { ok: false as const, reason: "unauthorized" as const };

      if (!this.isHostOwnedBySession(input.hostId, session.accountId, input.sessionId, input.now)) {
        return { ok: false as const, reason: "not_found" as const };
      }

      const existing = this.findPolicy(input.hostId);
      const currentRevision = existing?.revision ?? 0;
      if (currentRevision !== input.expectedRevision) {
        return { ok: false as const, reason: "stale_revision" as const };
      }

      const scopes = canonicalRemoteDeviceScopes(input.scopes);
      const revision = currentRevision + 1;

      if (existing) {
        this.db
          .prepare(
            `UPDATE host_grant_policies
                SET policy_scopes = ?, revision = ?, updated_at = ?
              WHERE host_id = ? AND account_id = ?`,
          )
          .run(JSON.stringify(scopes), revision, input.now, input.hostId, session.accountId);
        this.narrowExistingOverrides(input.hostId, session.accountId, scopes, input.now);
      } else {
        this.db
          .prepare(
            `INSERT INTO host_grant_policies (
               host_id, account_id, policy_scopes, revision, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            input.hostId,
            session.accountId,
            JSON.stringify(scopes),
            revision,
            input.now,
            input.now,
          );
      }

      return {
        ok: true as const,
        value: {
          hostId: input.hostId,
          accountId: session.accountId,
          revision,
          scopes,
          updatedAt: input.now,
        },
      };
    });
  }

  updateMobileGrant(
    input: UpdateHostMobileGrantInput,
  ): HostGrantResult<HostMobileGrantMutationRecord> {
    return this.transaction(() => {
      const authority = this.requireAccountMutationAuthority(
        input,
        input.hostId,
        input.mobileDeviceId,
      );
      if (!authority.ok) return authority;

      const { accountId, policy, revision, mobileDeviceId, override } = authority.value;
      if (revision !== input.expectedRevision) {
        return { ok: false, reason: "stale_revision" };
      }

      const requested = canonicalRemoteDeviceScopes(input.scopes);
      if (!isGrantScopeSubset(requested, policy.scopes)) {
        return { ok: false, reason: "not_allowed" };
      }

      if (override !== null && override.revokedAt !== null) {
        return { ok: false, reason: "not_allowed" };
      }

      const current = effectiveGrantScopes(policy.scopes, override);
      if (!isGrantScopeSubset(requested, current)) {
        return { ok: false, reason: "not_allowed" };
      }

      const nextRevision = revision + 1;
      this.db
        .prepare(
          `INSERT INTO host_mobile_grant_overrides (
             host_id, mobile_device_id, account_id, scopes, revoked_at, updated_at
           ) VALUES (?, ?, ?, ?, NULL, ?)
           ON CONFLICT(host_id, mobile_device_id) DO UPDATE SET
             scopes = excluded.scopes,
             revoked_at = NULL,
             updated_at = excluded.updated_at`,
        )
        .run(input.hostId, mobileDeviceId, accountId, JSON.stringify(requested), input.now);
      this.bumpRevision(input.hostId, nextRevision, input.now);

      return {
        ok: true,
        value: {
          hostId: input.hostId,
          mobileDeviceId,
          revision: nextRevision,
          scopes: requested,
          status: "active",
          updatedAt: input.now,
        },
      };
    });
  }

  revokeMobileGrant(
    input: RevokeHostMobileGrantInput,
  ): HostGrantResult<HostMobileGrantMutationRecord> {
    return this.transaction(() => {
      const authority = this.requireAccountMutationAuthority(
        input,
        input.hostId,
        input.mobileDeviceId,
      );
      if (!authority.ok) return authority;

      const { accountId, policy, revision, mobileDeviceId, override } = authority.value;
      if (revision !== input.expectedRevision) {
        return { ok: false, reason: "stale_revision" };
      }

      if (override?.revokedAt) {
        return {
          ok: true,
          value: {
            hostId: input.hostId,
            mobileDeviceId,
            revision,
            scopes: [],
            status: "revoked",
            updatedAt: override.updatedAt,
          },
        };
      }

      const nextRevision = revision + 1;
      this.db
        .prepare(
          `INSERT INTO host_mobile_grant_overrides (
             host_id, mobile_device_id, account_id, scopes, revoked_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(host_id, mobile_device_id) DO UPDATE SET
             scopes = excluded.scopes,
             revoked_at = excluded.revoked_at,
             updated_at = excluded.updated_at`,
        )
        .run(
          input.hostId,
          mobileDeviceId,
          accountId,
          JSON.stringify(policy.scopes),
          input.now,
          input.now,
        );
      this.bumpRevision(input.hostId, nextRevision, input.now);

      return {
        ok: true,
        value: {
          hostId: input.hostId,
          mobileDeviceId,
          revision: nextRevision,
          scopes: [],
          status: "revoked",
          updatedAt: input.now,
        },
      };
    });
  }

  getSnapshot(input: HostGrantSnapshotInput): HostGrantResult<HostGrantSnapshotRecord> {
    return this.transaction(() => {
      const session = this.readActiveSession(
        input.sessionId,
        input.sessionSecretHash,
        input.now,
      );
      if (!session) return { ok: false as const, reason: "unauthorized" as const };

      if (!this.isHostActiveForAccount(input.hostId, session.accountId, input.now)) {
        return { ok: false as const, reason: "not_found" as const };
      }

      const policy = this.findPolicy(input.hostId);
      if (!policy) {
        return {
          ok: true as const,
          value: {
            hostId: input.hostId,
            accountId: session.accountId,
            policyConfigured: false,
            policyScopes: [],
            revision: 0,
            grants: [],
          },
        };
      }

      const policyScopes = parseStoredScopes(policy.policy_scopes);
      const overrides = this.listOverrides(input.hostId);
      const mobiles = this.db
        .prepare(
          `SELECT id
             FROM devices
            WHERE account_id = ?
              AND platform = 'mobile'
              AND revoked_at IS NULL
            ORDER BY created_at ASC, id ASC`,
        )
        .all(session.accountId) as unknown as MobileDeviceRow[];

      const grants = mobiles.map((mobile) => {
        const override = overrides.get(mobile.id) ?? null;
        return {
          mobileDeviceId: mobile.id,
          scopes: effectiveGrantScopes(policyScopes, override),
          status: override?.revokedAt ? ("revoked" as const) : ("active" as const),
        };
      });

      return {
        ok: true,
        value: {
          hostId: input.hostId,
          accountId: session.accountId,
          policyConfigured: true,
          policyScopes,
          revision: policy.revision,
          grants,
        },
      };
    }, false);
  }

  getMobileGrant(input: HostMobileGrantInput): HostGrantResult<HostMobileGrantRecord> {
    return this.transaction(() => {
      const session = this.readActiveSession(
        input.sessionId,
        input.sessionSecretHash,
        input.now,
      );
      if (!session) return { ok: false as const, reason: "unauthorized" as const };
      if (session.deviceId === null || session.devicePlatform !== "mobile") {
        return { ok: false as const, reason: "not_allowed" as const };
      }

      if (!this.isHostActiveForAccount(input.hostId, session.accountId, input.now)) {
        return { ok: false as const, reason: "not_found" as const };
      }

      const policy = this.findPolicy(input.hostId);
      if (!policy) {
        return { ok: false as const, reason: "not_found" as const };
      }

      const override = this.findOverride(input.hostId, session.deviceId);
      if (override?.revokedAt) {
        return { ok: false as const, reason: "not_found" as const };
      }

      return {
        ok: true as const,
        value: {
          hostId: input.hostId,
          accountId: session.accountId,
          mobileDeviceId: session.deviceId,
          revision: policy.revision,
          scopes: effectiveGrantScopes(parseStoredScopes(policy.policy_scopes), override),
        },
      };
    }, false);
  }

  private requireAccountMutationAuthority(
    input: GrantActor & { now: string },
    hostId: string,
    mobileDeviceId: string,
  ):
    | { ok: true; value: {
        accountId: string;
        policy: HostGrantPolicyRecord;
        revision: number;
        mobileDeviceId: string;
        override: GrantScopesOverride | null;
      } }
    | { ok: false; reason: HostGrantFailure } {
    const session = this.readActiveSession(input.sessionId, input.sessionSecretHash, input.now);
    if (!session) return { ok: false, reason: "unauthorized" };

    if (!this.isHostActiveForAccount(hostId, session.accountId, input.now)) {
      return { ok: false, reason: "not_found" };
    }

    const policy = this.findPolicy(hostId);
    if (!policy) return { ok: false, reason: "not_allowed" };

    const mobile = this.db
      .prepare(
        `SELECT id
           FROM devices
          WHERE id = ? AND account_id = ? AND platform = 'mobile' AND revoked_at IS NULL`,
      )
      .get(mobileDeviceId, session.accountId) as MobileDeviceRow | undefined;
    if (!mobile) return { ok: false, reason: "not_found" };

    const override = this.findOverride(hostId, mobileDeviceId);
    return {
      ok: true,
      value: {
        accountId: session.accountId,
        policy: {
          hostId: policy.host_id,
          accountId: policy.account_id,
          revision: policy.revision,
          scopes: parseStoredScopes(policy.policy_scopes),
          updatedAt: policy.updated_at,
        },
        revision: policy.revision,
        mobileDeviceId: mobile.id,
        override,
      },
    };
  }

  private readActiveSession(
    sessionId: string,
    expectedSecretHash: string,
    now: string,
  ): SessionAuthority | null {
    const row = this.db
      .prepare(
        `SELECT
           s.account_id, s.device_id, s.secret_hash, s.expires_at, s.revoked_at,
           a.is_allowed, a.disabled_at,
           d.account_id AS device_account_id,
           d.platform AS device_platform,
           d.revoked_at AS device_revoked_at
         FROM sessions s
         JOIN accounts a ON a.id = s.account_id
         LEFT JOIN devices d ON d.id = s.device_id
         WHERE s.id = ?`,
      )
      .get(sessionId) as ActiveSessionRow | undefined;

    const expiresAt = row ? Date.parse(row.expires_at) : Number.NaN;
    if (
      !row ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.parse(now) ||
      row.revoked_at !== null ||
      row.is_allowed !== 1 ||
      row.disabled_at !== null ||
      !verifySessionSecretHash(row.secret_hash, expectedSecretHash)
    ) {
      return null;
    }

    if (row.device_id !== null) {
      if (
        row.device_account_id !== row.account_id ||
        row.device_platform === null ||
        row.device_revoked_at !== null
      ) {
        return null;
      }
    }

    return {
      accountId: row.account_id,
      deviceId: row.device_id,
      devicePlatform: row.device_platform,
    };
  }

  private isHostActiveForAccount(hostId: string, accountId: string, now: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 AS ok
           FROM desktop_hosts h
           JOIN devices d ON d.id = h.device_id
           JOIN sessions s ON s.id = h.session_id
          WHERE h.id = ?
            AND h.account_id = ?
            AND h.revoked_at IS NULL
            AND d.account_id = h.account_id
            AND d.platform = 'desktop'
            AND d.revoked_at IS NULL
            AND s.account_id = h.account_id
            AND s.device_id = h.device_id
            AND s.revoked_at IS NULL
            AND s.expires_at > ?`,
      )
      .get(hostId, accountId, now);
    return row !== undefined;
  }

  /**
   * A policy write is a Desktop-owner act. The caller must be the Cloud Session
   * that currently owns the Host, that session must carry persisted
   * `mira-desktop` OAuth provenance, and the Host device must still be active.
   * A Portal bearer or a Mobile session can never set the ceiling.
   */
  private isHostOwnedBySession(
    hostId: string,
    accountId: string,
    sessionId: string,
    now: string,
  ): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 AS ok
           FROM desktop_hosts h
           JOIN devices d ON d.id = h.device_id
           JOIN sessions s ON s.id = h.session_id
           JOIN accounts a ON a.id = h.account_id
          WHERE h.id = ?
            AND h.account_id = ?
            AND h.session_id = ?
            AND h.revoked_at IS NULL
            AND d.account_id = h.account_id
            AND d.platform = 'desktop'
            AND d.revoked_at IS NULL
            AND s.account_id = h.account_id
            AND s.revoked_at IS NULL
            AND s.expires_at > ?
            AND a.is_allowed = 1
            AND a.disabled_at IS NULL
            AND EXISTS (
              SELECT 1
                FROM oauth_authorization_codes c
               WHERE c.consumed_by_session_id = s.id
                 AND c.consume_reason = 'exchanged'
                 AND c.client_id = ?
            )`,
      )
      .get(hostId, accountId, sessionId, now, MIRA_DESKTOP_OAUTH_CLIENT_ID);
    return row !== undefined;
  }

  private findPolicy(hostId: string): HostPolicyRow | null {
    const row = this.db
      .prepare(
        `SELECT host_id, account_id, policy_scopes, revision, created_at, updated_at
           FROM host_grant_policies
          WHERE host_id = ?`,
      )
      .get(hostId) as HostPolicyRow | undefined;
    return row ?? null;
  }

  private findOverride(hostId: string, mobileDeviceId: string): GrantScopesOverride | null {
    const row = this.db
      .prepare(
        `SELECT mobile_device_id, scopes, revoked_at, updated_at
           FROM host_mobile_grant_overrides
          WHERE host_id = ? AND mobile_device_id = ?`,
      )
      .get(hostId, mobileDeviceId) as MobileOverrideRow | undefined;
    if (!row) return null;
    return {
      scopes: parseStoredScopes(row.scopes),
      revokedAt: row.revoked_at,
      updatedAt: row.updated_at,
    };
  }

  private listOverrides(hostId: string): Map<string, GrantScopesOverride> {
    const rows = this.db
      .prepare(
        `SELECT mobile_device_id, scopes, revoked_at, updated_at
           FROM host_mobile_grant_overrides
          WHERE host_id = ?`,
      )
      .all(hostId) as unknown as MobileOverrideRow[];
    return new Map(
      rows.map((row) => [
        row.mobile_device_id,
        {
          scopes: parseStoredScopes(row.scopes),
          revokedAt: row.revoked_at,
          updatedAt: row.updated_at,
        },
      ]),
    );
  }

  /**
   * Lowering the Host ceiling must not leave a stored Mobile override above it.
   * The override keeps its identity and revocation state but is intersected.
   */
  private narrowExistingOverrides(
    hostId: string,
    accountId: string,
    policyScopes: readonly RemoteDeviceScope[],
    now: string,
  ): void {
    const rows = this.db
      .prepare(
        `SELECT mobile_device_id, scopes, revoked_at, updated_at
           FROM host_mobile_grant_overrides
          WHERE host_id = ? AND account_id = ?`,
      )
      .all(hostId, accountId) as unknown as MobileOverrideRow[];

    const update = this.db.prepare(
      `UPDATE host_mobile_grant_overrides
          SET scopes = ?, updated_at = ?
        WHERE host_id = ? AND mobile_device_id = ?`,
    );

    for (const row of rows) {
      if (row.revoked_at !== null) continue;
      const stored = parseStoredScopes(row.scopes);
      const narrowed = intersectGrantScopes(stored, policyScopes);
      if (narrowed.length === stored.length && narrowed.every((scope, index) => scope === stored[index])) {
        continue;
      }
      update.run(JSON.stringify(narrowed), now, hostId, row.mobile_device_id);
    }
  }

  private bumpRevision(hostId: string, revision: number, now: string): void {
    this.db
      .prepare(
        `UPDATE host_grant_policies
            SET revision = ?, updated_at = ?
          WHERE host_id = ?`,
      )
      .run(revision, now, hostId);
  }

  private transaction<T>(work: () => T, write = true): T {
    this.db.exec(write ? "BEGIN IMMEDIATE;" : "BEGIN;");
    try {
      const result = work();
      this.db.exec("COMMIT;");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }
}

function parseStoredScopes(value: string): RemoteDeviceScope[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    const scopes = parsed.filter(
      (entry): entry is RemoteDeviceScope => remoteDeviceScopeSchema.safeParse(entry).success,
    );
    return canonicalRemoteDeviceScopes(scopes);
  } catch {
    return [];
  }
}
