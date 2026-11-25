import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  findFirstPartyOAuthClient, serviceDefinitionSchema, serviceIdSchema,
  MIRA_DESKTOP_OAUTH_CLIENT_ID, MIRA_MOBILE_OAUTH_CLIENT_ID, WHO_YOU_WEB_OAUTH_CLIENT_ID,
  applicationEnrollmentSchema, declarationWriteSchema, declarationRevisionSchema, developerApplicationPermissionSchema, reservedApplicationProjects,
  type ServiceDefinition,
} from "@uichat-mira/cloud-auth-contracts";
import { ServiceRegistryError } from "../service-registry/repository.js";

type Application = {
  client_id: string; project_id: string; display_name: string; redirect_uri: string;
  endpoint_origins_json: string; management_key_hash: string | null; disabled_at: string | null; owner_account_id: string | null;
};
type Declaration = { service_id: string; client_id: string; definition_json: string; revision: number; retired_at: string | null };
const err = (code: string, status = 409) => new ServiceRegistryError(code, status);
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const makeToken = (id: string) => "mca_admin_v1." + id + "." + randomBytes(32).toString("base64url");
function present(row: Declaration) {
  return { definition: serviceDefinitionSchema.parse(JSON.parse(row.definition_json)), revision: row.revision, retired: row.retired_at !== null };
}
function normalize(definition: ServiceDefinition) {
  const value = serviceDefinitionSchema.parse(definition);
  value.scopes.sort();
  return value;
}
function sameIdentity(a: ServiceDefinition, b: ServiceDefinition) {
  return a.projectId === b.projectId && a.audience === b.audience && a.serviceId === b.serviceId;
}
function sameScopes(a: ServiceDefinition, b: ServiceDefinition) {
  return JSON.stringify([...a.scopes].sort()) === JSON.stringify([...b.scopes].sort());
}

export class TrustedApplicationManagement {
  constructor(private readonly db: DatabaseSync) {}
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private application(id: string) {
    return this.db.prepare("SELECT * FROM oauth_cloud_applications WHERE client_id = ?").get(id) as Application | undefined;
  }
  private declaration(id: string) {
    return this.db.prepare("SELECT * FROM oauth_cloud_application_services WHERE service_id = ?").get(id) as Declaration | undefined;
  }
  private authenticate(token: string): Application {
    const match = /^mca_admin_v1\.([a-z][a-z0-9-]{0,63})\.[A-Za-z0-9_-]{43}$/.exec(token);
    if (!match) throw err("APPLICATION_AUTH_REQUIRED", 401);
    const row = this.application(match[1]!);
    const supplied = Buffer.from(hash(token), "hex");
    const stored = Buffer.from(row?.management_key_hash ?? "0".repeat(64), "hex");
    if (!row || !row.management_key_hash || stored.length !== supplied.length ||
        !timingSafeEqual(stored, supplied) || row.disabled_at !== null) throw err("APPLICATION_AUTH_REQUIRED", 401);
    return row;
  }

  private validateIdentity(clientId: string, projectId: string, redirectUri: string) {
    if (!serviceIdSchema.safeParse(clientId).success) throw err("APPLICATION_INVALID_DECLARATION", 400);
    const builtin = findFirstPartyOAuthClient(clientId);
    if (clientId === MIRA_DESKTOP_OAUTH_CLIENT_ID || clientId === MIRA_MOBILE_OAUTH_CLIENT_ID ||
        (builtin && !builtin.redirectUris.includes(redirectUri)) ||
        (clientId === WHO_YOU_WEB_OAUTH_CLIENT_ID && projectId !== "who-you") ||
        (clientId !== WHO_YOU_WEB_OAUTH_CLIENT_ID &&
          (projectId === "who-you" || findFirstPartyOAuthClient(WHO_YOU_WEB_OAUTH_CLIENT_ID)?.redirectUris.includes(redirectUri)))) {
      throw err("APPLICATION_IDENTITY_CONFLICT");
    }
  }

  private insertApplication(clientId: string, input: unknown, owner: string | null) {
    const parsed = applicationEnrollmentSchema.safeParse(input);
    if (!parsed.success) throw err("APPLICATION_INVALID_DECLARATION", 400);
    const value = parsed.data;
    this.validateIdentity(clientId, value.projectId, value.redirectUri);
    if (this.application(clientId) || this.db.prepare(
      "SELECT 1 FROM oauth_cloud_applications WHERE project_id = ? OR redirect_uri = ?"
    ).get(value.projectId, value.redirectUri)) throw err("APPLICATION_IDENTITY_CONFLICT");
    const token = makeToken(clientId);
    this.db.prepare("INSERT INTO oauth_cloud_applications(client_id, project_id, display_name, redirect_uri, endpoint_origins_json, management_key_hash, owner_account_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(clientId, value.projectId, value.displayName, value.redirectUri, JSON.stringify(value.endpointOrigins), hash(token), owner);
    return { clientId, managementToken: token };
  }

  // Operator compatibility: preexisting trusted enrollment remains available.
  enroll(clientId: string, input: unknown) {
    return this.transaction(() => {
      const parsed = applicationEnrollmentSchema.safeParse(input);
      if (!parsed.success) throw err("APPLICATION_INVALID_DECLARATION", 400);
      return this.insertApplication(clientId, parsed.data, null);
    });
  }

  private rotateWithin(clientId: string) {
    const app = this.application(clientId);
    if (!app || app.disabled_at !== null) throw err("APPLICATION_NOT_FOUND", 404);
    const token = makeToken(clientId);
    this.db.prepare("UPDATE oauth_cloud_applications SET management_key_hash = ? WHERE client_id = ?").run(hash(token), clientId);
    return { clientId, managementToken: token };
  }
  rotate(clientId: string) { return this.transaction(() => this.rotateWithin(clientId)); }

  private disableWithin(clientId: string) {
    const app = this.application(clientId);
    if (!app) throw err("APPLICATION_NOT_FOUND", 404);
    if (app.disabled_at !== null) return { clientId, disabled: true as const };
    const now = new Date().toISOString();
    this.db.prepare("UPDATE oauth_cloud_applications SET disabled_at = ?, management_key_hash = NULL, generation = generation + 1 WHERE client_id = ?").run(now, clientId);
    this.db.prepare("UPDATE service_registrations SET revoked_at = ?, revision = revision + 1 WHERE revoked_at IS NULL AND service_id IN (SELECT service_id FROM oauth_cloud_application_services WHERE client_id = ?)").run(now, clientId);
    return { clientId, disabled: true as const };
  }
  disable(clientId: string) { return this.transaction(() => this.disableWithin(clientId)); }

  private enableWithin(clientId: string) {
    const app = this.application(clientId);
    if (!app || app.disabled_at === null) throw err("APPLICATION_NOT_DISABLED", 409);
    const token = makeToken(clientId);
    this.db.prepare("UPDATE oauth_cloud_applications SET disabled_at = NULL, management_key_hash = ?, generation = generation + 1 WHERE client_id = ?").run(hash(token), clientId);
    return { clientId, managementToken: token };
  }
  enable(clientId: string) { return this.transaction(() => this.enableWithin(clientId)); }

  private permission(accountId: string) {
    const row = this.db.prepare("SELECT endpoint_origins_json,reserved_projects_json FROM application_developer_permissions WHERE account_id = ?").get(accountId) as
      {endpoint_origins_json:string;reserved_projects_json:string} | undefined;
    return row ? developerApplicationPermissionSchema.parse({
      endpointOrigins:JSON.parse(row.endpoint_origins_json),reservedProjects:JSON.parse(row.reserved_projects_json),
    }) : null;
  }

  private requireApprovedMetadata(accountId: string, projectId: string, redirectUri: string, origins: string[]) {
    const permission = this.permission(accountId);
    if (!permission) throw err("APPLICATION_DEVELOPER_REQUIRED",403);
    if (projectId === "mira-desktop" || projectId === "mira-mobile" ||
        (reservedApplicationProjects.some(p => p === projectId) && !permission.reservedProjects.some(p => p === projectId)) ||
        !permission.endpointOrigins.includes(new URL(redirectUri).origin) ||
        !origins.every(origin => permission.endpointOrigins.includes(origin))) throw err("APPLICATION_DECLARATION_FORBIDDEN",403);
  }

  /** First-party developer admission is account-scoped, not per application.
   * An operator verifies origin ownership; accounts cannot grant themselves
   * developer qualification or claim a canonical project. */
  approveDeveloper(accountId: string, input: unknown) {
    const parsed = developerApplicationPermissionSchema.safeParse(input);
    if (!parsed.success) throw err("APPLICATION_INVALID_DECLARATION",400);
    const value = parsed.data;
    return this.transaction(() => {
      if (!this.db.prepare("SELECT 1 FROM accounts WHERE id = ? AND is_allowed = 1 AND disabled_at IS NULL").get(accountId)) throw err("APPLICATION_OWNER_NOT_FOUND",404);
      // Keep the authorization for already-owned applications stable. An
      // operator must disable/resolve such an application separately.
      const existing = (this.db.prepare("SELECT * FROM oauth_cloud_applications WHERE owner_account_id = ?").all(accountId) as Application[]);
      if (existing.some(app => !value.endpointOrigins.includes(new URL(app.redirect_uri).origin) ||
        !(JSON.parse(app.endpoint_origins_json) as string[]).every(origin => value.endpointOrigins.includes(origin)) ||
        (reservedApplicationProjects.some(p => p === app.project_id) && !value.reservedProjects.some(p => p === app.project_id)))) {
        throw err("APPLICATION_IDENTITY_CONFLICT");
      }
      // Canonical project admission belongs to only one developer account.
      for (const other of this.db.prepare("SELECT reserved_projects_json FROM application_developer_permissions WHERE account_id <> ?").all(accountId) as {reserved_projects_json:string}[]) {
        if ((JSON.parse(other.reserved_projects_json) as string[]).some(p => value.reservedProjects.some(project => project === p))) throw err("APPLICATION_IDENTITY_CONFLICT");
      }
      this.db.prepare("INSERT INTO application_developer_permissions(account_id,endpoint_origins_json,reserved_projects_json) VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET endpoint_origins_json=excluded.endpoint_origins_json,reserved_projects_json=excluded.reserved_projects_json")
        .run(accountId,JSON.stringify(value.endpointOrigins),JSON.stringify(value.reservedProjects));
      return {approved:true};
    });
  }

  claimLegacyApplication(accountId: string, clientId: string) {
    return this.transaction(() => {
      if (!this.db.prepare("SELECT 1 FROM accounts WHERE id = ? AND is_allowed = 1 AND disabled_at IS NULL").get(accountId)) throw err("APPLICATION_OWNER_NOT_FOUND",404);
      const app = this.application(clientId);
      if (!app) throw err("APPLICATION_NOT_FOUND",404);
      if (app.owner_account_id !== null && app.owner_account_id !== accountId) throw err("APPLICATION_IDENTITY_CONFLICT");
      this.requireApprovedMetadata(accountId,app.project_id,app.redirect_uri,JSON.parse(app.endpoint_origins_json));
      this.db.prepare("UPDATE oauth_cloud_applications SET owner_account_id = ? WHERE client_id = ? AND owner_account_id IS NULL").run(accountId,clientId);
      return {clientId, claimed:true};
    });
  }

  private owned(accountId: string, clientId: string) {
    const app = this.application(clientId);
    if (!app || app.owner_account_id !== accountId) throw err("APPLICATION_NOT_FOUND",404);
    if (!this.permission(accountId)) throw err("APPLICATION_DEVELOPER_REQUIRED",403);
    return app;
  }

  ownerCatalog(authorize: () => string) {
    return this.transaction(() => {
      const accountId = authorize();
      const applications = (this.db.prepare("SELECT * FROM oauth_cloud_applications WHERE owner_account_id = ? ORDER BY client_id").all(accountId) as Application[]).map(app => ({
        clientId:app.client_id, projectId:app.project_id, displayName:app.display_name,
        redirectUri:app.redirect_uri, endpointOrigins:JSON.parse(app.endpoint_origins_json), disabled:app.disabled_at !== null,
        services:this.declarations(app.client_id),
      }));
      return { applications, developer:this.permission(accountId) };
    });
  }

  ownerCreate(authorize: () => string, input: unknown) {
    return this.transaction(() => {
      const accountId = authorize();
      const parsed = applicationEnrollmentSchema.safeParse(input);
      if (!parsed.success) throw err("APPLICATION_INVALID_DECLARATION",400);
      const value = parsed.data;
      this.requireApprovedMetadata(accountId,value.projectId,value.redirectUri,value.endpointOrigins);
      const clientId = value.projectId === "who-you" ? WHO_YOU_WEB_OAUTH_CLIENT_ID : "app-" + randomBytes(16).toString("hex");
      return this.insertApplication(clientId,value,accountId);
    });
  }

  ownerAction(authorize: () => string, clientId: string, action: "rotate" | "disable" | "enable") {
    return this.transaction(() => {
      this.owned(authorize(),clientId);
      if (action === "rotate") return this.rotateWithin(clientId);
      if (action === "disable") return this.disableWithin(clientId);
      return this.enableWithin(clientId);
    });
  }

  private declarations(clientId: string) {
    return (this.db.prepare("SELECT * FROM oauth_cloud_application_services WHERE client_id = ? ORDER BY service_id").all(clientId) as Declaration[]).map(present);
  }

  list(token: string) {
    return this.transaction(() => {
      const app = this.authenticate(token);
      return { services: this.declarations(app.client_id) };
    });
  }

  put(token: string, serviceId: string, input: unknown) {
    return this.transaction(() => {
      const app = this.authenticate(token);
      const parsed = declarationWriteSchema.safeParse(input);
      if (!parsed.success) throw err("APPLICATION_INVALID_DECLARATION", 400);
      const { expectedRevision } = parsed.data;
      const definition = normalize(parsed.data.definition);
      const origins = JSON.parse(app.endpoint_origins_json) as string[];
      if (definition.serviceId !== serviceId || definition.projectId !== app.project_id ||
          !origins.includes(new URL(definition.protocol.endpoint).origin)) throw err("APPLICATION_DECLARATION_FORBIDDEN", 403);
      const old = this.declaration(serviceId);
      if (old && old.client_id !== app.client_id) throw err("APPLICATION_DECLARATION_FORBIDDEN", 403);
      const encoded = JSON.stringify(definition);
      if ((old?.revision ?? 0) !== expectedRevision) throw err("APPLICATION_DECLARATION_CHANGED");
      if (old) {
        const previous = present(old).definition;
        if (!sameIdentity(previous, definition)) throw err("APPLICATION_IDENTITY_CONFLICT");
        // No authorization-scope changes until the maintainer defines consent semantics.
        if (!sameScopes(previous, definition)) throw err("APPLICATION_SCOPE_CHANGE_UNDECIDED");
        if (old.retired_at === null && old.definition_json === encoded) return present(old);
      }
      // A legacy grant may already own this service ID. Never silently adopt a
      // different identity or change the permissions of existing account grants.
      const grants = this.db.prepare("SELECT definition_json FROM service_registrations WHERE service_id = ?").all(serviceId) as {definition_json:string}[];
      for (const grant of grants) {
        const prior = normalize(JSON.parse(grant.definition_json));
        if (!sameIdentity(prior, definition)) throw err("APPLICATION_IDENTITY_CONFLICT");
        if (!sameScopes(prior, definition)) throw err("APPLICATION_SCOPE_CHANGE_UNDECIDED");
      }
      const revision = (old?.revision ?? 0) + 1;
      this.db.prepare("INSERT INTO oauth_cloud_application_services(service_id, client_id, definition_json, revision, retired_at) VALUES (?, ?, ?, ?, NULL) ON CONFLICT(service_id) DO UPDATE SET definition_json = excluded.definition_json, revision = excluded.revision, retired_at = NULL")
        .run(serviceId, app.client_id, encoded, revision);
      // Only existing live grants are updated; retired/revoked accounts stay revoked.
      this.db.prepare("UPDATE service_registrations SET definition_json = ?, revision = revision + 1 WHERE service_id = ? AND revoked_at IS NULL AND definition_json <> ?")
        .run(encoded, serviceId, encoded);
      return { definition, revision, retired: false };
    });
  }

  retire(token: string, serviceId: string, input: unknown) {
    return this.transaction(() => {
      const app = this.authenticate(token);
      const parsed = declarationRevisionSchema.safeParse(input);
      if (!parsed.success) throw err("APPLICATION_INVALID_DECLARATION", 400);
      const old = this.declaration(serviceId);
      if (!old || old.client_id !== app.client_id) throw err("APPLICATION_DECLARATION_NOT_FOUND", 404);
      if (old.revision !== parsed.data.expectedRevision) throw err("APPLICATION_DECLARATION_CHANGED");
      if (old.retired_at !== null) return present(old);
      const now = new Date().toISOString();
      this.db.prepare("UPDATE oauth_cloud_application_services SET retired_at = ?, revision = revision + 1 WHERE service_id = ?").run(now, serviceId);
      this.db.prepare("UPDATE service_registrations SET revoked_at = ?, revision = revision + 1 WHERE service_id = ? AND revoked_at IS NULL").run(now, serviceId);
      return { ...present(old), revision: old.revision + 1, retired: true };
    });
  }
}
