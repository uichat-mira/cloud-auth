import type { AuthRepository, AccountRecord } from "./auth-repository.js";
import { normalizeUsername } from "./username.js";
import type { PasswordHasher } from "../security/password.js";
import type { LoginGuard } from "../security/login-guard.js";
import {
  issueSessionToken,
  parseSessionToken,
  verifySessionSecret,
} from "../security/session-token.js";

export type AuthErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_REAUTH_REQUIRED"
  | "AUTH_RATE_LIMITED"
  | "AUTH_BUSY"
  | "AUTH_ACCOUNT_EXISTS"
  | "AUTH_ACCOUNT_NOT_FOUND"
  | "AUTH_INVALID_ADMIN_INPUT";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly statusCode: number,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export interface SessionResponse {
  account: {
    id: string;
    username: string;
  };
  expiresAt: string;
}

export interface IssuedSessionResponse extends SessionResponse {
  sessionToken: string;
}

export interface AuthServiceOptions {
  sessionTtlSeconds: number;
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly loginGuard: LoginGuard,
    private readonly options: AuthServiceOptions,
  ) {}

  async login(username: string, password: string, ip: string): Promise<IssuedSessionResponse> {
    let usernameNormalized: string;
    try {
      usernameNormalized = normalizeUsername(username);
    } catch {
      usernameNormalized = "invalid";
    }

    const guard = this.loginGuard.begin(usernameNormalized, ip);
    if (!guard.allowed) {
      if (guard.code === "rate_limited") {
        throw new AuthError(
          "AUTH_RATE_LIMITED",
          429,
          "Too many login attempts",
          guard.retryAfterSeconds,
        );
      }
      throw new AuthError("AUTH_BUSY", 503, "Authentication is temporarily busy", guard.retryAfterSeconds);
    }

    try {
      const account = usernameNormalized === "invalid"
        ? null
        : this.repository.findAccountByUsername(usernameNormalized);

      const passwordValid = account
        ? await this.passwordHasher.verify(password, account.passwordHash)
        : await this.burnUnknown(password);

      if (!account || !passwordValid || !account.isAllowed || account.disabledAt) {
        throw new AuthError("AUTH_INVALID_CREDENTIALS", 401, "Invalid account or password");
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const expiresAt = new Date(now.getTime() + this.options.sessionTtlSeconds * 1000).toISOString();
      const issued = issueSessionToken();

      const created = this.repository.createSessionIfAccountActive(
        issued.id,
        account.id,
        account.passwordChangedAt,
        issued.secretHash,
        expiresAt,
        nowIso,
      );
      if (!created) {
        throw new AuthError("AUTH_INVALID_CREDENTIALS", 401, "Invalid account or password");
      }

      this.repository.updateLastLogin(account.id, nowIso);
      this.loginGuard.resetAfterSuccess(account.usernameNormalized);

      return {
        sessionToken: issued.token,
        account: publicAccount(account),
        expiresAt,
      };
    } finally {
      guard.releaseHashSlot();
    }
  }

  getSession(token: string): SessionResponse {
    const authenticated = this.requireSession(token);
    this.repository.touchSession(authenticated.session.id, new Date().toISOString());
    return {
      account: publicAccount(authenticated.account),
      expiresAt: authenticated.session.expiresAt,
    };
  }

  renewSession(token: string): IssuedSessionResponse {
    const authenticated = this.requireSession(token);
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.options.sessionTtlSeconds * 1000).toISOString();
    const issued = issueSessionToken(authenticated.session.id);

    const rotated = this.repository.rotateSession(
      authenticated.session.id,
      authenticated.session.secretHash,
      issued.secretHash,
      expiresAt,
      nowIso,
    );
    if (!rotated) throw reauthRequired();

    return {
      sessionToken: issued.token,
      account: publicAccount(authenticated.account),
      expiresAt,
    };
  }

  logout(token: string): void {
    const authenticated = this.requireSession(token);
    this.repository.revokeSession(authenticated.session.id, "logout", new Date().toISOString());
  }

  async provisionAccount(username: string, password: string): Promise<AccountRecord> {
    const usernameNormalized = this.normalizeAdminUsername(username);
    if (this.repository.findAccountByUsername(usernameNormalized)) {
      throw new AuthError("AUTH_ACCOUNT_EXISTS", 409, "Account already exists");
    }

    const passwordHash = await this.passwordHasher.hash(password);
    const now = new Date().toISOString();
    return this.repository.createAccount(username.trim().normalize("NFKC"), usernameNormalized, passwordHash, now);
  }

  async resetPassword(username: string, password: string): Promise<void> {
    const account = this.requireAdminAccount(username);
    const passwordHash = await this.passwordHasher.hash(password);
    this.repository.updatePasswordAndRevokeSessions(account.id, passwordHash, new Date().toISOString());
  }

  setAllowed(username: string, allowed: boolean): void {
    const account = this.requireAdminAccount(username);
    this.repository.setAllowedAndRevokeIfDenied(account.id, allowed, new Date().toISOString());
  }

  setDisabled(username: string, disabled: boolean): void {
    const account = this.requireAdminAccount(username);
    this.repository.setDisabledAndRevoke(account.id, disabled, new Date().toISOString());
  }

  private requireSession(token: string) {
    const parsed = parseSessionToken(token);
    if (!parsed) throw reauthRequired();

    const record = this.repository.findSessionWithAccount(parsed.id);
    if (!record) throw reauthRequired();

    if (!verifySessionSecret(parsed.secret, record.session.secretHash)) throw reauthRequired();
    if (record.session.revokedAt) throw reauthRequired();
    if (Date.parse(record.session.expiresAt) <= Date.now()) throw reauthRequired();
    if (!record.account.isAllowed || record.account.disabledAt) throw reauthRequired();

    return record;
  }

  private requireAdminAccount(username: string): AccountRecord {
    const usernameNormalized = this.normalizeAdminUsername(username);
    const account = this.repository.findAccountByUsername(usernameNormalized);
    if (!account) throw new AuthError("AUTH_ACCOUNT_NOT_FOUND", 404, "Account not found");
    return account;
  }

  private normalizeAdminUsername(username: string): string {
    try {
      return normalizeUsername(username);
    } catch (error) {
      throw new AuthError(
        "AUTH_INVALID_ADMIN_INPUT",
        400,
        error instanceof Error ? error.message : "Invalid username",
      );
    }
  }

  private async burnUnknown(password: string): Promise<false> {
    await this.passwordHasher.burnUnknownPassword(password);
    return false;
  }
}

function publicAccount(account: AccountRecord): { id: string; username: string } {
  return { id: account.id, username: account.username };
}

function reauthRequired(): AuthError {
  return new AuthError("AUTH_REAUTH_REQUIRED", 401, "Re-authentication is required");
}
