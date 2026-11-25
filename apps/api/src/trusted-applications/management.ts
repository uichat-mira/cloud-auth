import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  findFirstPartyOAuthClient, serviceDefinitionSchema, serviceIdSchema,
  MIRA_DESKTOP_OAUTH_CLIENT_ID, MIRA_MOBILE_OAUTH_CLIENT_ID, WHO_YOU_WEB_OAUTH_CLIENT_ID, WHO_YOU_WEB_OAUTH_REDIRECT_URI,
  applicationEnrollmentSchema, declarationWriteSchema, declarationRevisionSchema,
  type ServiceDefinition,
} from "@uichat-mira/cloud-auth-contracts";
import { ServiceRegistryError } from "../service-registry/repository.js";

type Application = {
  client_id: string; project_id: string; display_name: string; redirect_uri: string;
  endpoint_origins_json: string; management_key_hash: string | null; disabled_at: string | null;
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

  // Administrator-only, one-time application onboarding. Return secret once.
  enroll(clientId: string, input: unknown) {
    serviceIdSchema.parse(clientId);
    const value = applicationEnrollmentSchema.parse(input);
    const builtin = findFirstPartyOAuthClient(clientId);
    if (clientId === MIRA_DESKTOP_OAUTH_CLIENT_ID || clientId === MIRA_MOBILE_OAUTH_CLIENT_ID ||
        (builtin && !builtin.redirectUris.includes(value.redirectUri)) ||
        (clientId === WHO_YOU_WEB_OAUTH_CLIENT_ID && (value.projectId !== "who-you" || value.redirectUri !== WHO_YOU_WEB_OAUTH_REDIRECT_URI)) ||
        (clientId !== WHO_YOU_WEB_OAUTH_CLIENT_ID &&
          (value.projectId === "who-you" || value.redirectUri === WHO_YOU_WEB_OAUTH_REDIRECT_URI))) {
      throw err("APPLICATION_IDENTITY_CONFLICT");
    }
    return this.transaction(() => {
      if (this.application(clientId) || this.db.prepare(
        "SELECT 1 FROM oauth_cloud_applications WHERE project_id = ? OR redirect_uri = ?"
      ).get(value.projectId, value.redirectUri)) throw err("APPLICATION_IDENTITY_CONFLICT");
      const token = makeToken(clientId);
      this.db.prepare("INSERT INTO oauth_cloud_applications(client_id, project_id, display_name, redirect_uri, endpoint_origins_json, management_key_hash) VALUES (?, ?, ?, ?, ?, ?)")
        .run(clientId, value.projectId, value.displayName, value.redirectUri, JSON.stringify(value.endpointOrigins), hash(token));
      return { clientId, managementToken: token };
    });
  }

  rotate(clientId: string) {
    return this.transaction(() => {
      const app = this.application(clientId);
      if (!app || app.disabled_at !== null) throw err("APPLICATION_NOT_FOUND", 404);
      const token = makeToken(clientId);
      this.db.prepare("UPDATE oauth_cloud_applications SET management_key_hash = ? WHERE client_id = ?").run(hash(token), clientId);
      return { clientId, managementToken: token };
    });
  }

  disable(clientId: string) {
    return this.transaction(() => {
      const app = this.application(clientId);
      if (!app) throw err("APPLICATION_NOT_FOUND", 404);
      if (app.disabled_at !== null) return { clientId, disabled: true };
      const now = new Date().toISOString();
      this.db.prepare("UPDATE oauth_cloud_applications SET disabled_at = ?, management_key_hash = NULL, generation = generation + 1 WHERE client_id = ?").run(now, clientId);
      this.db.prepare("UPDATE service_registrations SET revoked_at = ?, revision = revision + 1 WHERE revoked_at IS NULL AND service_id IN (SELECT service_id FROM oauth_cloud_application_services WHERE client_id = ?)").run(now, clientId);
      return { clientId, disabled: true };
    });
  }

  enable(clientId: string) {
    return this.transaction(() => {
      const app = this.application(clientId);
      if (!app || app.disabled_at === null) throw err("APPLICATION_NOT_DISABLED", 409);
      const token = makeToken(clientId);
      this.db.prepare("UPDATE oauth_cloud_applications SET disabled_at = NULL, management_key_hash = ?, generation = generation + 1 WHERE client_id = ?").run(hash(token), clientId);
      return { clientId, managementToken: token };
    });
  }

  list(token: string) {
    return this.transaction(() => {
      const app = this.authenticate(token);
      return { services: (this.db.prepare("SELECT * FROM oauth_cloud_application_services WHERE client_id = ? ORDER BY service_id").all(app.client_id) as Declaration[]).map(present) };
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
