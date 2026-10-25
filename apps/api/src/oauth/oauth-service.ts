import {
  findFirstPartyOAuthClient,
  type FirstPartyOAuthClient,
  type OAuthAuthorizationRequest,
} from "@uichat-mira/cloud-auth-contracts";
import type { AuthService } from "../auth/auth-service.js";
import { issueAuthorizationCode } from "./authorization-code.js";
import { OAuthError } from "./errors.js";
import type { OAuthRepository } from "./oauth-repository.js";

export interface OAuthServiceOptions {
  codeTtlSeconds: number;
  now?: () => Date;
}

export interface IssuedAuthorizationGrant {
  code: string;
  redirectUri: string;
  state: string;
  expiresAt: string;
}

export class OAuthService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: OAuthRepository,
    private readonly authService: AuthService,
    private readonly options: OAuthServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  resolveRegisteredClient(
    clientId: string | undefined,
    redirectUri: string | undefined,
  ): FirstPartyOAuthClient | null {
    if (!clientId || !redirectUri) return null;
    const client = findFirstPartyOAuthClient(clientId);
    if (!client?.redirectUris.includes(redirectUri)) return null;
    return client;
  }

  /**
   * The Cloud Session is the only accepted authorization context. Callers
   * cannot name an account, device, consent flag, or callback on their own:
   * the account comes from the server-validated browser session and the
   * callback must already be in the reviewed first-party registry.
   */
  authorize(token: string, request: OAuthAuthorizationRequest): IssuedAuthorizationGrant {
    const client = this.resolveRegisteredClient(
      request.client_id,
      request.redirect_uri,
    );
    if (!client) {
      throw new OAuthError(
        "OAUTH_UNAUTHORIZED_CLIENT",
        400,
        "OAuth client or redirect URI is not registered",
      );
    }

    const session = this.authService.requireSessionContext(token);
    const now = this.now();
    const nowIso = now.toISOString();
    const expiresAt = new Date(
      now.getTime() + this.options.codeTtlSeconds * 1000,
    ).toISOString();
    const issued = issueAuthorizationCode();

    const created = this.repository.createAuthorizationCodeIfAccountActive({
      id: issued.id,
      accountId: session.account.id,
      clientId: client.clientId,
      redirectUri: request.redirect_uri,
      codeChallenge: request.code_challenge,
      codeChallengeMethod: "S256",
      secretHash: issued.secretHash,
      expiresAt,
      now: nowIso,
    });
    if (!created) {
      throw new OAuthError(
        "OAUTH_REAUTH_REQUIRED",
        401,
        "Re-authentication is required",
      );
    }

    return {
      code: issued.code,
      redirectUri: request.redirect_uri,
      state: request.state,
      expiresAt,
    };
  }
}
