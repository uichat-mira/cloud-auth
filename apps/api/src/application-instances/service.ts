import type { DatabaseSync } from "node:sqlite";
import {
  applicationManifestSchema,
  oauthClientIdSchema,
  findFirstPartyOAuthClient,
  WHO_YOU_WEB_OAUTH_CLIENT_ID,
  applicationRegistrationRequestSchema,
  applicationRegistrationVerificationResponseSchema,
  type ApplicationManifest,
  type OwnedApplicationInstance,
} from "@uichat-mira/cloud-auth-contracts";
import type { ApplicationRegistrationTransport } from "./transport.js";
import { ApplicationTransportError } from "./transport.js";

type InstanceRow = {
  app_id: string;
  owner_account_id: string | null;
  origin: string;
  project_id: string;
  display_name: string;
  manifest_revision: number;
  manifest_json: string;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
};

export class ApplicationInstanceError extends Error {
  constructor(readonly code: string, readonly statusCode: number) {
    super(code);
  }
}

const failure = (code: string, statusCode: number) => new ApplicationInstanceError(code, statusCode);

function present(row: InstanceRow): OwnedApplicationInstance {
  return {
    appId: row.app_id,
    origin: row.origin,
    manifest: applicationManifestSchema.parse(JSON.parse(row.manifest_json)),
    disabledAt: row.disabled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertSameOrigin(origin: string, url: string, field: string) {
  if (new URL(url).origin !== origin) {
    throw failure("APPLICATION_METADATA_ORIGIN_MISMATCH_" + field, 400);
  }
}

function validateManifest(origin: string, expectedAppId: string, manifest: ApplicationManifest) {
  if (manifest.appId !== expectedAppId) throw failure("APPLICATION_ID_MISMATCH", 409);
  assertSameOrigin(origin, manifest.homeUrl, "HOME");
  if (manifest.iconUrl) assertSameOrigin(origin, manifest.iconUrl, "ICON");
  if (manifest.oauth.metadataUrl) assertSameOrigin(origin, manifest.oauth.metadataUrl, "OAUTH_METADATA");
  if (!oauthClientIdSchema.safeParse(manifest.oauth.clientId).success ||
      findFirstPartyOAuthClient(manifest.oauth.clientId) ||
      manifest.oauth.clientId === WHO_YOU_WEB_OAUTH_CLIENT_ID) {
    throw failure("APPLICATION_OAUTH_CLIENT_INVALID", 400);
  }
  if (manifest.oauth.clientId.startsWith("https:")) assertSameOrigin(origin, manifest.oauth.clientId, "OAUTH_CLIENT");
  for (const redirectUri of manifest.oauth.redirectUris) {
    assertSameOrigin(origin, redirectUri, "OAUTH_REDIRECT");
    if (new URL(redirectUri).search) throw failure("APPLICATION_OAUTH_CALLBACK_INVALID", 400);
  }
  assertSameOrigin(origin, manifest.registrationVerification.endpoint, "VERIFICATION");
  for (const service of manifest.services) {
    assertSameOrigin(origin, service.protocol.endpoint, "SERVICE_ENDPOINT");
    assertSameOrigin(origin, service.resource, "SERVICE_RESOURCE");
  }
}

export class ApplicationInstanceService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly transport: ApplicationRegistrationTransport,
  ) {}

  list(accountId: string): OwnedApplicationInstance[] {
    const rows = this.db.prepare(
      "SELECT * FROM application_instances WHERE owner_account_id = ? ORDER BY display_name, app_id",
    ).all(accountId) as InstanceRow[];
    return rows.map(present);
  }

  get(accountId: string, appId: string): OwnedApplicationInstance {
    const row = this.db.prepare(
      "SELECT * FROM application_instances WHERE app_id = ? AND owner_account_id = ?",
    ).get(appId, accountId) as InstanceRow | undefined;
    if (!row) throw failure("APPLICATION_NOT_FOUND", 404);
    return present(row);
  }

  async register(accountId: string, input: unknown): Promise<OwnedApplicationInstance> {
    const parsed = applicationRegistrationRequestSchema.safeParse(input);
    if (!parsed.success) throw failure("APPLICATION_INVALID_REQUEST", 400);
    const { origin, appId, appSecret } = parsed.data;

    let discovery;
    try {
      discovery = await this.transport.get(origin + "/.well-known/mira-application");
    } catch (error) {
      throw this.transportFailure(error);
    }
    if (discovery.status !== 200) throw failure("APPLICATION_DISCOVERY_FAILED", 502);
    const manifestResult = applicationManifestSchema.safeParse(discovery.body);
    if (!manifestResult.success) throw failure("APPLICATION_INVALID_MANIFEST", 502);
    const manifest = manifestResult.data;
    validateManifest(origin, appId, manifest);

    let verification;
    try {
      verification = await this.transport.post(manifest.registrationVerification.endpoint, {
        appId,
        appSecret,
      });
    } catch (error) {
      throw this.transportFailure(error);
    }
    if (verification.status === 401 || verification.status === 403) {
      throw failure("APPLICATION_SECRET_REJECTED", 403);
    }
    if (verification.status !== 200) throw failure("APPLICATION_VERIFICATION_FAILED", 502);
    const verified = applicationRegistrationVerificationResponseSchema.safeParse(verification.body);
    if (!verified.success || verified.data.appId !== appId) {
      throw failure("APPLICATION_VERIFICATION_FAILED", 502);
    }

    const now = new Date().toISOString();
    const encoded = JSON.stringify(manifest);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (!this.db.prepare(
        "SELECT 1 FROM accounts WHERE id = ? AND is_allowed = 1 AND disabled_at IS NULL",
      ).get(accountId)) throw failure("APPLICATION_OWNER_NOT_FOUND", 404);

      const byId = this.db.prepare("SELECT * FROM application_instances WHERE app_id = ?")
        .get(appId) as InstanceRow | undefined;
      const byOrigin = this.db.prepare("SELECT app_id FROM application_instances WHERE origin = ?")
        .get(origin) as { app_id: string } | undefined;

      if (this.db.prepare("SELECT 1 FROM application_instances WHERE app_id <> ? AND json_extract(manifest_json, '$.oauth.clientId') = ?").get(appId, manifest.oauth.clientId)) {
        throw failure("APPLICATION_OAUTH_CLIENT_CONFLICT", 409);
      }
      if (byOrigin && byOrigin.app_id !== appId) throw failure("APPLICATION_IDENTITY_CONFLICT", 409);
      if (byId?.owner_account_id && byId.owner_account_id !== accountId) {
        throw failure("APPLICATION_ALREADY_OWNED", 409);
      }
      if (byId && byId.origin !== origin) throw failure("APPLICATION_ORIGIN_CHANGED", 409);
      if (byId && manifest.manifestRevision < byId.manifest_revision) {
        throw failure("APPLICATION_MANIFEST_ROLLBACK", 409);
      }
      if (byId && manifest.manifestRevision === byId.manifest_revision && encoded !== byId.manifest_json) {
        throw failure("APPLICATION_MANIFEST_REVISION_REQUIRED", 409);
      }

      if (byId) {
        this.db.prepare(
          "UPDATE application_instances SET owner_account_id = ?, project_id = ?, display_name = ?, manifest_revision = ?, manifest_json = ?, updated_at = ? WHERE app_id = ?",
        ).run(accountId, manifest.projectId, manifest.name, manifest.manifestRevision, encoded, now, appId);
      } else {
        this.db.prepare(
          "INSERT INTO application_instances(app_id, owner_account_id, origin, project_id, display_name, manifest_revision, manifest_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(appId, accountId, origin, manifest.projectId, manifest.name, manifest.manifestRevision, encoded, now, now);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(accountId, appId);
  }

  removeOwnership(accountId: string, appId: string): { appId: string; owned: false } {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare(
        "SELECT owner_account_id FROM application_instances WHERE app_id = ?",
      ).get(appId) as { owner_account_id: string | null } | undefined;
      if (!row || row.owner_account_id !== accountId) throw failure("APPLICATION_NOT_FOUND", 404);
      this.db.prepare(
        "UPDATE application_instances SET owner_account_id = NULL, updated_at = ? WHERE app_id = ?",
      ).run(new Date().toISOString(), appId);
      this.db.exec("COMMIT");
      return { appId, owned: false };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private transportFailure(error: unknown): ApplicationInstanceError {
    if (error instanceof ApplicationTransportError) {
      if (error.code === "BUSY") return failure("APPLICATION_REGISTRATION_BUSY", 503);
      if (error.code === "UNSAFE_TARGET" || error.code === "INVALID_TARGET") {
        return failure("APPLICATION_UNSAFE_ORIGIN", 400);
      }
    }
    return failure("APPLICATION_DISCOVERY_FAILED", 502);
  }
}
