import type { DatabaseSync } from "node:sqlite";
import {
  findFirstPartyOAuthClient,
  MIRA_DESKTOP_OAUTH_CLIENT_ID,
  MIRA_MOBILE_OAUTH_CLIENT_ID,
  type FirstPartyOAuthClient,
} from "@uichat-mira/cloud-auth-contracts";

export interface LoginClient extends FirstPartyOAuthClient {
  displayName?: string;
  origin?: string;
  manifestRevision?: number;
  serviceLabels?: string[];
}

export interface LoginGrantSnapshot {
  client: LoginClient;
  fingerprint: string | null;
}

/** Native Cloud Session authority. Open applications are never admitted here. */
export class TrustedApplicationLoginCatalog {
  constructor(_db: DatabaseSync) {}

  snapshot(clientId: string, redirectUri: string): LoginGrantSnapshot | null {
    if (clientId !== MIRA_DESKTOP_OAUTH_CLIENT_ID && clientId !== MIRA_MOBILE_OAUTH_CLIENT_ID) return null;
    const client = findFirstPartyOAuthClient(clientId);
    return client?.redirectUris.includes(redirectUri)
      ? { client, fingerprint: null } : null;
  }
}
