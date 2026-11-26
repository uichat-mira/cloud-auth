import type { DatabaseSync } from "node:sqlite";
import {
  applicationDeclaredServiceSchema,
  applicationManifestSchema,
  applicationServiceCatalogEntrySchema,
  applicationServiceScopeSchema,
  type ApplicationManifest,
  type ApplicationServiceCatalogEntry,
  type ApplicationServiceErrorCode,
} from "@uichat-mira/cloud-auth-contracts";

export class ApplicationServiceError extends Error {
  constructor(readonly code: ApplicationServiceErrorCode, readonly statusCode: number) {
    super(code);
  }
}

type InstanceRow = {
  app_id: string;
  project_id: string;
  manifest_revision: number;
  manifest_json: string;
};

type GrantRow = {
  account_id: string;
  app_id: string;
  service_id: string;
  project_id: string;
  resource: string;
  definition_json: string;
  manifest_revision: number;
  revision: number;
  granted_at: string;
  updated_at: string;
  revoked_at: string | null;
};

export interface ApplicationServiceBinding {
  appId: string;
  serviceId: string;
  resource: string;
  revision: number;
  manifestRevision: number;
  scopes: string[];
}

const failure = (code: ApplicationServiceErrorCode, statusCode: number) =>
  new ApplicationServiceError(code, statusCode);

function normalizeDeclaration(
  definition: ApplicationManifest["services"][number],
): ApplicationManifest["services"][number] {
  const copy = structuredClone(definition);
  copy.scopes.sort();
  return copy;
}

function encodeDeclaration(definition: ApplicationManifest["services"][number]): string {
  return JSON.stringify(normalizeDeclaration(definition));
}

export class ApplicationServiceRepository {
  constructor(private readonly db: DatabaseSync) {}

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

  private instance(appId: string): InstanceRow | undefined {
    return this.db.prepare(
      "SELECT app_id, project_id, manifest_revision, manifest_json FROM application_instances WHERE app_id = ? AND disabled_at IS NULL",
    ).get(appId) as InstanceRow | undefined;
  }

  private grant(accountId: string, appId: string, serviceId: string): GrantRow | undefined {
    return this.db.prepare(
      `SELECT account_id, app_id, service_id, project_id, resource, definition_json,
              manifest_revision, revision, granted_at, updated_at, revoked_at
         FROM application_service_grants
        WHERE account_id = ? AND app_id = ? AND service_id = ?`,
    ).get(accountId, appId, serviceId) as GrantRow | undefined;
  }

  private manifest(row: InstanceRow): ApplicationManifest {
    const manifest = applicationManifestSchema.parse(JSON.parse(row.manifest_json));
    if (manifest.appId !== row.app_id || manifest.projectId !== row.project_id) {
      throw new Error("Invalid persisted application instance manifest");
    }
    return manifest;
  }

  private currentEntry(
    row: GrantRow,
    manifest: ApplicationManifest,
  ): ApplicationServiceCatalogEntry | null {
    const current = manifest.services.find((service) => service.serviceId === row.service_id);
    if (!current || manifest.projectId !== row.project_id) return null;
    if (manifest.manifestRevision !== row.manifest_revision || encodeDeclaration(current) !== row.definition_json) return null;
    return applicationServiceCatalogEntrySchema.parse({
      ...normalizeDeclaration(current),
      appId: row.app_id,
      projectId: manifest.projectId,
      appName: manifest.name,
      revision: row.revision,
      manifestRevision: manifest.manifestRevision,
    });
  }

  /**
   * Establishes or refreshes all grants produced by one successful OAuth login
   * for exactly one registered APP_ID. The caller owns the login transaction
   * and passes the manifest revision it validated; this method re-reads the
   * server-owned instance manifest under the same writer lock.
   *
   * A missing or stale revision is rejected rather than granting a declaration
   * the login did not see. Services omitted from the current manifest are not
   * silently retained: their existing grant no longer matches the declaration
   * and therefore stops authorizing new credentials.
   */
  establishLoginGrants(
    accountId: string,
    appId: string,
    manifestRevision: number,
    now = new Date().toISOString(),
  ): void {
    if (!this.db.isTransaction) throw new Error("Application grants require a writer transaction");
    if (!this.db.prepare(
      "SELECT 1 FROM accounts WHERE id = ? AND is_allowed = 1 AND disabled_at IS NULL",
    ).get(accountId)) {
      throw failure("APPLICATION_SERVICE_NOT_FOUND", 404);
    }
    const instance = this.instance(appId);
    if (!instance) throw failure("APPLICATION_SERVICE_NOT_FOUND", 404);
    if (instance.manifest_revision !== manifestRevision) {
      throw failure("APPLICATION_SERVICE_DECLARATION_CHANGED", 409);
    }
    const manifest = this.manifest(instance);

    for (const raw of manifest.services) {
      const definition = normalizeDeclaration(raw);
      const encoded = JSON.stringify(definition);
      const old = this.grant(accountId, appId, definition.serviceId);
      if (old?.revoked_at === null && old.definition_json === encoded && old.manifest_revision === manifestRevision) {
        continue;
      }
      const revision = (old?.revision ?? 0) + 1;
      this.db.prepare(
        `INSERT INTO application_service_grants(
           account_id, app_id, service_id, project_id, resource, definition_json,
           manifest_revision, revision, granted_at, updated_at, revoked_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(account_id, app_id, service_id) DO UPDATE SET
           project_id = excluded.project_id,
           resource = excluded.resource,
           definition_json = excluded.definition_json,
           manifest_revision = excluded.manifest_revision,
           revision = excluded.revision,
           updated_at = excluded.updated_at,
           revoked_at = NULL`,
      ).run(
        accountId,
        appId,
        definition.serviceId,
        manifest.projectId,
        definition.resource,
        encoded,
        manifestRevision,
        revision,
        old?.granted_at ?? now,
        now,
      );
    }
  }

  list(accountId: string): ApplicationServiceCatalogEntry[] {
    const rows = this.db.prepare(
      `SELECT account_id, app_id, service_id, project_id, resource, definition_json,
              manifest_revision, revision, granted_at, updated_at, revoked_at
         FROM application_service_grants
        WHERE account_id = ? AND revoked_at IS NULL
        ORDER BY app_id, service_id`,
    ).all(accountId) as GrantRow[];
    const manifests = new Map<string, ApplicationManifest | null>();
    const entries: ApplicationServiceCatalogEntry[] = [];
    for (const row of rows) {
      let manifest = manifests.get(row.app_id);
      if (manifest === undefined) {
        const instance = this.instance(row.app_id);
        manifest = instance ? this.manifest(instance) : null;
        manifests.set(row.app_id, manifest);
      }
      if (!manifest) continue;
      const entry = this.currentEntry(row, manifest);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  /**
   * Re-reads the exact grant and current declaration for credential issuance.
   * Revoked, foreign-resource and missing grants share a bounded not-found
   * response; a changed declaration or stale revision fails closed.
   */
  requireBinding(
    accountId: string,
    appId: string,
    serviceId: string,
    resource: string,
    expectedRevision: number,
  ): ApplicationServiceBinding {
    const row = this.grant(accountId, appId, serviceId);
    if (!row || row.revoked_at !== null || row.resource !== resource) {
      throw failure("APPLICATION_SERVICE_NOT_FOUND", 404);
    }
    const instance = this.instance(appId);
    if (!instance) throw failure("APPLICATION_SERVICE_NOT_FOUND", 404);
    const manifest = this.manifest(instance);
    const current = manifest.services.find((service) => service.serviceId === serviceId);
    if (
      !current ||
      manifest.projectId !== row.project_id ||
      manifest.manifestRevision !== row.manifest_revision ||
      encodeDeclaration(current) !== row.definition_json
    ) {
      throw failure("APPLICATION_SERVICE_DECLARATION_CHANGED", 409);
    }
    if (row.revision !== expectedRevision) {
      throw failure("APPLICATION_SERVICE_CHANGED", 409);
    }
    const parsed = normalizeDeclaration(applicationDeclaredServiceSchema.parse(current));
    return {
      appId,
      serviceId,
      resource,
      revision: row.revision,
      manifestRevision: manifest.manifestRevision,
      scopes: parsed.scopes.map((scope) => applicationServiceScopeSchema.parse(scope)),
    };
  }

  revoke(
    accountId: string,
    appId: string,
    serviceId: string,
    resource: string,
    expectedRevision: number,
  ): number {
    return this.transaction(() => {
      const row = this.grant(accountId, appId, serviceId);
      if (!row || row.resource !== resource) {
        throw failure("APPLICATION_SERVICE_NOT_FOUND", 404);
      }
      if (row.revision !== expectedRevision) {
        throw failure("APPLICATION_SERVICE_CHANGED", 409);
      }
      if (row.revoked_at !== null) return row.revision;
      // A code issued before explicit revocation may not restore this grant.
      this.db.prepare("UPDATE application_oauth_codes SET consumed_at = ? WHERE account_id = ? AND app_id = ? AND consumed_at IS NULL")
        .run(new Date().toISOString(), accountId, appId);
      const revision = row.revision + 1;
      this.db.prepare(
        `UPDATE application_service_grants
            SET revision = ?, revoked_at = ?, updated_at = ?
          WHERE account_id = ? AND app_id = ? AND service_id = ?`,
      ).run(revision, new Date().toISOString(), new Date().toISOString(), accountId, appId, serviceId);
      return revision;
    });
  }
}
