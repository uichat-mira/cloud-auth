import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { MIRA_DESKTOP_OAUTH_CLIENT_ID } from "@uichat-mira/cloud-auth-contracts";
import { verifySessionSecretHash } from "../security/session-token.js";
import { createRelayRoom } from "./host-presence.js";

export interface HostRecord {
  id: string;
  accountId: string;
  deviceId: string;
  sessionId: string;
  relayRoom: string;
  clientName: string | null;
  clientVersion: string | null;
  devicePlatform: string;
  deviceRevokedAt: string | null;
  sessionRevokedAt: string | null;
  sessionExpiresAt: string;
  createdAt: string;
  advertisedAt: string;
  leaseExpiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface RegisterHostInput {
  sessionId: string;
  sessionSecretHash: string;
  now: string;
  leaseExpiresAt: string;
}

export type HostRegistrationFailure = "unauthorized" | "not_approved";

export type HostRegistrationResult =
  | { ok: true; value: HostRecord }
  | { ok: false; reason: HostRegistrationFailure };

type HostRow = {
  id: string;
  account_id: string;
  device_id: string;
  session_id: string;
  relay_room: string;
  client_name: string | null;
  client_version: string | null;
  device_platform: string;
  device_revoked_at: string | null;
  session_revoked_at: string | null;
  session_expires_at: string;
  created_at: string;
  advertised_at: string;
  lease_expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

type HostAuthorityRow = {
  account_id: string;
  device_id: string | null;
  secret_hash: string;
  expires_at: string;
  revoked_at: string | null;
  is_allowed: number;
  disabled_at: string | null;
  device_account_id: string | null;
  device_platform: string | null;
  device_revoked_at: string | null;
  session_client_id: string | null;
};

const HOST_SELECT = `
  SELECT h.id, h.account_id, h.device_id, h.session_id, h.relay_room,
         d.client_name, d.client_version, d.platform AS device_platform,
         d.revoked_at AS device_revoked_at,
         s.revoked_at AS session_revoked_at, s.expires_at AS session_expires_at,
         h.created_at, h.advertised_at, h.lease_expires_at,
         h.revoked_at, h.revoke_reason
    FROM desktop_hosts h
    JOIN devices d ON d.id = h.device_id AND d.account_id = h.account_id
    JOIN sessions s ON s.id = h.session_id`;

export class HostRepository {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Registration authority is re-read under the write lock. A Cloud Session is
   * an approved Desktop Host caller only when it was issued by the first-party
   * `mira-desktop` OAuth client and is bound to a non-revoked desktop device for
   * the same account. A password/Portal session or a Mobile OAuth session is
   * never accepted, and the caller cannot name an account, device, or room.
   */
  registerHost(input: RegisterHostInput): HostRegistrationResult {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const authority = this.db
        .prepare(
          `SELECT
             s.account_id, s.device_id, s.secret_hash, s.expires_at, s.revoked_at,
             a.is_allowed, a.disabled_at,
             d.account_id AS device_account_id,
             d.platform AS device_platform,
             d.revoked_at AS device_revoked_at,
             (
               SELECT c.client_id
                 FROM oauth_authorization_codes c
                WHERE c.consumed_by_session_id = s.id
                  AND c.consume_reason = 'exchanged'
                ORDER BY c.consumed_at DESC
                LIMIT 1
             ) AS session_client_id
           FROM sessions s
           JOIN accounts a ON a.id = s.account_id
           LEFT JOIN devices d ON d.id = s.device_id
           WHERE s.id = ?`,
        )
        .get(input.sessionId) as HostAuthorityRow | undefined;

      const now = Date.parse(input.now);
      const expiresAt = authority ? Date.parse(authority.expires_at) : Number.NaN;
      if (
        !authority ||
        !Number.isFinite(now) ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= now ||
        authority.revoked_at !== null ||
        authority.is_allowed !== 1 ||
        authority.disabled_at !== null ||
        !verifySessionSecretHash(authority.secret_hash, input.sessionSecretHash)
      ) {
        this.db.exec("ROLLBACK;");
        return { ok: false, reason: "unauthorized" };
      }

      if (
        authority.device_id === null ||
        authority.device_account_id !== authority.account_id ||
        authority.device_revoked_at !== null
      ) {
        this.db.exec("ROLLBACK;");
        return {
          ok: false,
          reason: authority.device_id === null ? "not_approved" : "unauthorized",
        };
      }

      if (
        authority.device_platform !== "desktop" ||
        authority.session_client_id !== MIRA_DESKTOP_OAUTH_CLIENT_ID
      ) {
        this.db.exec("ROLLBACK;");
        return { ok: false, reason: "not_approved" };
      }

      const existing = this.findByDevice(authority.device_id);
      const hostId = existing?.id ?? randomUUID();
      const relayRoom = existing?.revokedAt === null ? existing.relayRoom : createRelayRoom();

      if (existing) {
        this.db
          .prepare(
            `UPDATE desktop_hosts
                SET session_id = ?,
                    relay_room = ?,
                    advertised_at = ?,
                    lease_expires_at = ?,
                    updated_at = ?,
                    revoked_at = NULL,
                    revoke_reason = NULL
              WHERE id = ?`,
          )
          .run(
            input.sessionId,
            relayRoom,
            input.now,
            input.leaseExpiresAt,
            input.now,
            hostId,
          );
      } else {
        this.db
          .prepare(
            `INSERT INTO desktop_hosts (
               id, account_id, device_id, session_id, relay_room,
               created_at, advertised_at, lease_expires_at, updated_at,
               revoked_at, revoke_reason
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
          )
          .run(
            hostId,
            authority.account_id,
            authority.device_id,
            input.sessionId,
            relayRoom,
            input.now,
            input.now,
            input.leaseExpiresAt,
            input.now,
          );
      }

      const host = this.findById(hostId);
      if (!host) throw new Error("Desktop Host registration did not persist");
      this.db.exec("COMMIT;");
      return { ok: true, value: host };
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  listByAccount(accountId: string): HostRecord[] {
    const rows = this.db
      .prepare(
        `${HOST_SELECT}
          WHERE h.account_id = ?
            AND h.revoked_at IS NULL
            AND d.revoked_at IS NULL
            AND d.platform = 'desktop'
          ORDER BY h.created_at ASC, h.id ASC`,
      )
      .all(accountId) as HostRow[];
    return rows.map(mapHost);
  }

  /**
   * Internal ownership lookup for OPS-019/G2. It is deliberately not an HTTP
   * route: a revoked Host or device owns no current room, while an offline Host
   * still exposes its ownership and current availability to the caller.
   */
  findOwnershipByRoom(relayRoom: string): HostRecord | null {
    const row = this.db
      .prepare(
        `${HOST_SELECT}
          WHERE h.relay_room = ?
            AND h.revoked_at IS NULL
            AND d.revoked_at IS NULL
            AND d.platform = 'desktop'`,
      )
      .get(relayRoom) as HostRow | undefined;
    return row ? mapHost(row) : null;
  }

  private findByDevice(deviceId: string): HostRecord | null {
    const row = this.db
      .prepare(
        `${HOST_SELECT}
          WHERE h.device_id = ?`,
      )
      .get(deviceId) as HostRow | undefined;
    return row ? mapHost(row) : null;
  }

  private findById(hostId: string): HostRecord | null {
    const row = this.db
      .prepare(
        `${HOST_SELECT}
          WHERE h.id = ?`,
      )
      .get(hostId) as HostRow | undefined;
    return row ? mapHost(row) : null;
  }
}

function mapHost(row: HostRow): HostRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    deviceId: row.device_id,
    sessionId: row.session_id,
    relayRoom: row.relay_room,
    clientName: row.client_name,
    clientVersion: row.client_version,
    devicePlatform: row.device_platform,
    deviceRevokedAt: row.device_revoked_at,
    sessionRevokedAt: row.session_revoked_at,
    sessionExpiresAt: row.session_expires_at,
    createdAt: row.created_at,
    advertisedAt: row.advertised_at,
    leaseExpiresAt: row.lease_expires_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
  };
}
