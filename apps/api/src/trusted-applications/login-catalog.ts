import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  findFirstPartyOAuthClient, serviceDefinitionSchema, serviceIdSchema,
  MIRA_DESKTOP_OAUTH_CLIENT_ID, MIRA_MOBILE_OAUTH_CLIENT_ID, WHO_YOU_WEB_OAUTH_CLIENT_ID,
  type FirstPartyOAuthClient, type ServiceDefinition,
} from "@uichat-mira/cloud-auth-contracts";

export interface LoginClient extends FirstPartyOAuthClient {
  displayName?: string;
}

export interface LoginGrantSnapshot {
  client: LoginClient;
  fingerprint: string | null;
  services: ServiceDefinition[];
}

type ApplicationRow = {
  client_id: string;
  project_id: string;
  display_name: string;
  redirect_uri: string;
  disabled_at: string | null;
  generation: number;
};

function validWebCallback(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname &&
      !url.username && !url.password && !url.search && !url.hash &&
      !/[\s\\*]/.test(value) && value.length <= 2048;
  } catch { return false; }
}

/** Login authority reads only trusted, server-owned records, never a manifest
 * supplied by the OAuth caller. Both code creation and exchange use this read
 * within the existing SQLite writer transaction. */
export class TrustedApplicationLoginCatalog {
  constructor(private readonly db: DatabaseSync) {}

  snapshot(clientId: string, redirectUri: string): LoginGrantSnapshot | null {
    const builtin = findFirstPartyOAuthClient(clientId);
    if (clientId === MIRA_DESKTOP_OAUTH_CLIENT_ID || clientId === MIRA_MOBILE_OAUTH_CLIENT_ID) {
      return builtin?.redirectUris.includes(redirectUri)
        ? { client: builtin, fingerprint: null, services: [] } : null;
    }
    const row = this.db.prepare(
      "SELECT client_id, project_id, display_name, redirect_uri, disabled_at, generation FROM oauth_cloud_applications WHERE client_id = ?",
    ).get(clientId) as ApplicationRow | undefined;
    if (!row) {
      // Until the existing reviewed Who You client is enrolled, preserve its
      // current login. A disabled managed row must NEVER fall back to this.
      return builtin?.redirectUris.includes(redirectUri)
        ? { client: builtin, fingerprint: null, services: [] } : null;
    }
    if (row.disabled_at !== null || row.redirect_uri !== redirectUri ||
        !validWebCallback(redirectUri) || !serviceIdSchema.safeParse(row.client_id).success ||
        !serviceIdSchema.safeParse(row.project_id).success ||
        row.display_name.trim().length === 0 || row.display_name.length > 100) return null;
    if (builtin && !builtin.redirectUris.includes(redirectUri)) return null;
    if (clientId === WHO_YOU_WEB_OAUTH_CLIENT_ID && row.project_id !== "who-you") return null;
    if (clientId !== WHO_YOU_WEB_OAUTH_CLIENT_ID &&
        (row.project_id === "who-you" || findFirstPartyOAuthClient(WHO_YOU_WEB_OAUTH_CLIENT_ID)?.redirectUris.includes(redirectUri))) return null;

    const rows = this.db.prepare(
      "SELECT service_id, definition_json, revision FROM oauth_cloud_application_services WHERE client_id = ? AND retired_at IS NULL ORDER BY service_id",
    ).all(clientId) as { service_id: string; definition_json: string; revision: number }[];
    const services = rows.map(item => {
      const definition = serviceDefinitionSchema.parse(JSON.parse(item.definition_json));
      if (definition.serviceId !== item.service_id || definition.projectId !== row.project_id) {
        throw new Error("Invalid trusted application service ownership");
      }
      definition.scopes.sort();
      return definition;
    });
    const fingerprint = createHash("sha256").update(JSON.stringify({
      clientId: row.client_id, projectId: row.project_id,
      displayName: row.display_name, redirectUri: row.redirect_uri, generation: row.generation,
      revisions: rows.map(item => [item.service_id, item.revision]), services,
    })).digest("hex");
    return {
      client: { clientId: row.client_id, platform: "web", redirectUris: [row.redirect_uri], displayName: row.display_name },
      fingerprint, services,
    };
  }
}
