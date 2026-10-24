import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { DevicePlatform } from "@uichat-mira/cloud-auth-contracts";

export interface DeviceRecord {
  id: string;
  accountId: string;
  installationId: string;
  platform: DevicePlatform;
  clientName: string | null;
  clientVersion: string | null;
  publicKey: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface RegisterDeviceInput {
  accountId: string;
  installationId: string;
  platform: DevicePlatform;
  clientName: string | null;
  clientVersion: string | null;
  now: string;
}

type DeviceRow = {
  id: string;
  account_id: string;
  installation_id: string;
  platform: DevicePlatform;
  client_name: string | null;
  client_version: string | null;
  public_key: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

export class DeviceRepository {
  constructor(private readonly db: DatabaseSync) {}

  registerDevice(input: RegisterDeviceInput): DeviceRecord | null | "platform_mismatch" {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const existing = this.findByInstallation(input.accountId, input.installationId);
      if (existing?.revokedAt) {
        this.db.exec("ROLLBACK;");
        return null;
      }
      if (existing && existing.platform !== input.platform) {
        this.db.exec("ROLLBACK;");
        return "platform_mismatch";
      }

      if (existing) {
        this.db
          .prepare(
            `UPDATE devices
                SET client_name = ?, client_version = ?, last_seen_at = ?
              WHERE id = ?`,
          )
          .run(input.clientName, input.clientVersion, input.now, existing.id);
      } else {
        this.db
          .prepare(
            `INSERT INTO devices (
               id, account_id, installation_id, platform, client_name, client_version,
               public_key, created_at, last_seen_at, revoked_at, revoke_reason
             ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL)`,
          )
          .run(
            randomUUID(),
            input.accountId,
            input.installationId,
            input.platform,
            input.clientName,
            input.clientVersion,
            input.now,
            input.now,
          );
      }

      const device = this.findByInstallation(input.accountId, input.installationId);
      if (!device) throw new Error("Device write did not persist");
      this.db.exec("COMMIT;");
      return device;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  listDevicesByAccount(accountId: string): DeviceRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, account_id, installation_id, platform, client_name, client_version, public_key,
                created_at, last_seen_at, revoked_at, revoke_reason
           FROM devices
          WHERE account_id = ?
          ORDER BY created_at ASC, id ASC`,
      )
      .all(accountId) as DeviceRow[];
    return rows.map(mapDevice);
  }

  private findByInstallation(accountId: string, installationId: string): DeviceRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, account_id, installation_id, platform, client_name, client_version, public_key,
                created_at, last_seen_at, revoked_at, revoke_reason
           FROM devices
          WHERE account_id = ? AND installation_id = ?`,
      )
      .get(accountId, installationId) as DeviceRow | undefined;
    return row ? mapDevice(row) : null;
  }
}

function mapDevice(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    installationId: row.installation_id,
    platform: row.platform,
    clientName: row.client_name,
    clientVersion: row.client_version,
    publicKey: row.public_key,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
  };
}
