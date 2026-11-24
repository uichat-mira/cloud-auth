import type { DatabaseSync } from "node:sqlite";
import { serviceDefinitionSchema, serviceIdSchema, type ServiceDefinition, type RegisteredService } from "@uichat-mira/cloud-auth-contracts";

export class ServiceRegistryError extends Error {
  constructor(readonly code: string, readonly statusCode: number) { super(code); }
}
type Row = { definition_json: string; revision: number; revoked_at: string | null };
function publicRecord(row: Row): RegisteredService {
  return { definition: serviceDefinitionSchema.parse(JSON.parse(row.definition_json)), revision: row.revision };
}

export class ServiceRegistryRepository {
  constructor(private readonly db: DatabaseSync) {}
  private row(accountId: string, serviceId: string): Row | undefined {
    return this.db.prepare("SELECT definition_json, revision, revoked_at FROM service_registrations WHERE account_id = ? AND service_id = ?")
      .get(accountId, serviceId) as Row | undefined;
  }
  list(accountId: string): RegisteredService[] {
    return (this.db.prepare("SELECT definition_json, revision, revoked_at FROM service_registrations WHERE account_id = ? AND revoked_at IS NULL ORDER BY service_id")
      .all(accountId) as Row[]).map(publicRecord);
  }
  // Read within the credential issuer's existing BEGIN IMMEDIATE transaction.
  require(accountId: string, serviceId: string, revision: number): RegisteredService {
    const row = this.row(accountId, serviceId);
    if (!row || row.revoked_at !== null) throw new ServiceRegistryError("SERVICE_REGISTRATION_NOT_FOUND", 404);
    if (row.revision !== revision) throw new ServiceRegistryError("SERVICE_REGISTRATION_CHANGED", 409);
    return publicRecord(row);
  }
  // Trusted management path only. Public account sessions cannot mutate this ledger.
  register(accountId: string, input: ServiceDefinition, expectedRevision?: number): RegisteredService {
    const definition = serviceDefinitionSchema.parse(input);
    definition.scopes.sort();
    return this.transaction(() => {
      if (!this.db.prepare("SELECT id FROM accounts WHERE id = ? AND is_allowed = 1 AND disabled_at IS NULL").get(accountId)) {
        throw new ServiceRegistryError("SERVICE_REGISTRATION_ACCOUNT_NOT_FOUND", 404);
      }
      const old = this.row(accountId, definition.serviceId);
      const encoded = JSON.stringify(definition);
      if (old && old.revoked_at === null && old.definition_json === encoded) return publicRecord(old);
      if ((old?.revision ?? 0) !== (expectedRevision ?? 0)) throw new ServiceRegistryError("SERVICE_REGISTRATION_CHANGED", 409);
      // A service id is a stable identity, not a way to rotate a credential's
      // audience into another service or repurpose a different project's grant.
      const existing = this.db.prepare("SELECT definition_json FROM service_registrations WHERE service_id = ? LIMIT 1")
        .get(definition.serviceId) as { definition_json: string } | undefined;
      if (existing) {
        const prior = serviceDefinitionSchema.parse(JSON.parse(existing.definition_json));
        if (prior.projectId !== definition.projectId || prior.audience !== definition.audience) {
          throw new ServiceRegistryError("SERVICE_REGISTRATION_IDENTITY_CONFLICT", 409);
        }
      }
      const revision = (old?.revision ?? 0) + 1;
      this.db.prepare("INSERT INTO service_registrations(account_id, service_id, definition_json, revision, revoked_at) VALUES (?, ?, ?, ?, NULL) ON CONFLICT(account_id, service_id) DO UPDATE SET definition_json = excluded.definition_json, revision = excluded.revision, revoked_at = NULL")
        .run(accountId, definition.serviceId, encoded, revision);
      return { definition, revision };
    });
  }
  revoke(accountId: string, serviceId: string, expectedRevision: number): number {
    serviceIdSchema.parse(serviceId);
    return this.transaction(() => {
      const old = this.row(accountId, serviceId);
      if (!old) throw new ServiceRegistryError("SERVICE_REGISTRATION_NOT_FOUND", 404);
      if (old.revision !== expectedRevision) throw new ServiceRegistryError("SERVICE_REGISTRATION_CHANGED", 409);
      if (old.revoked_at !== null) return old.revision;
      const revision = old.revision + 1;
      this.db.prepare("UPDATE service_registrations SET revision = ?, revoked_at = ? WHERE account_id = ? AND service_id = ?")
        .run(revision, new Date().toISOString(), accountId, serviceId);
      return revision;
    });
  }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
