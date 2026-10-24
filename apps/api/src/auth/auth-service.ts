import type {
  AccountIdentity,
  CloudSession,
  DeviceLoginContext,
  IssuedCloudSession,
} from "@uichat-mira/cloud-auth-contracts";
import type { AuthRepository, AccountRecord } from "./auth-repository.js";
import { normalizeUsername } from "./username.js";
import { validatePassword, type PasswordHasher } from "../security/password.js";
import type { LoginGuard } from "../security/login-guard.js";
import {
  issueSessionToken,
  parseSessionToken,
  verifySessionSecret,
} from "../security/session-token.js";

export type AuthErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_INVALID_PASSWORD"
  | "AUTH_REAUTH_REQUIRED"
  | "AUTH_DEVICE_REJECTED"
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

  async login(
    username: string,
    password: string,
    ip: string,
    device?: DeviceLoginContext,
  ): Promise<IssuedCloudSession> {
    let usernameNormalized: string;
    try {
      usernameNormalized = normalizeUsername(username);
    } catch {
      usernameNormalized = "invalid";
    }

    const guard = this.beginCredentialAttempt(usernameNormalized, ip);

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
        account.passwordVersion,
        issued.secretHash,
        expiresAt,
        nowIso,
        device
          ? { installationId: device.installationId.toLowerCase(), platform: device.platform }
          : undefined,
      );
      if (!created) {
        if (device) {
          throw new AuthError(
            "AUTH_DEVICE_REJECTED",
            401,
            "Mira Device is not accepted for this account",
          );
        }
        throw new AuthError("AUTH_INVALID_CREDENTIALS", 401, "Invalid account or password");
      }

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

  getSession(token: string): CloudSession {
    const authenticated = this.requireSession(token);
    if (!this.repository.touchSession(authenticated.session.id, new Date().toISOString())) {
      throw reauthRequired();
    }
    return {
      account: publicAccount(authenticated.account),
      expiresAt: authenticated.session.expiresAt,
    };
  }

  renewSession(token: string): IssuedCloudSession {
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

  async changePassword(
    token: string,
    currentPassword: string,
    newPassword: string,
    ip: string,
  ): Promise<void> {
    const authenticated = this.requireSession(token);
    const guard = this.beginCredentialAttempt(
      authenticated.account.usernameNormalized,
      ip,
    );

    try {
      const currentPasswordValid = await this.passwordHasher.verify(
        currentPassword,
        authenticated.account.passwordHash,
      );
      if (!currentPasswordValid) {
        throw new AuthError("AUTH_INVALID_CREDENTIALS", 401, "Current password is incorrect");
      }

      try {
        validatePassword(newPassword);
      } catch (error) {
        throw new AuthError(
          "AUTH_INVALID_PASSWORD",
          400,
          error instanceof Error ? error.message : "Password does not meet the policy",
        );
      }

      const passwordHash = await this.passwordHasher.hash(newPassword);
      const changed = this.repository.changePasswordIfSessionActive(
        authenticated.account.id,
        authenticated.session.id,
        authenticated.session.secretHash,
        authenticated.account.passwordVersion,
        passwordHash,
        new Date().toISOString(),
      );
      if (!changed) throw reauthRequired();
      this.loginGuard.resetAfterSuccess(authenticated.account.usernameNormalized);
    } finally {
      guard.releaseHashSlot();
    }
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

  private beginCredentialAttempt(
    usernameNormalized: string,
    ip: string,
  ): { releaseHashSlot: () => void } {
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
      throw new AuthError(
        "AUTH_BUSY",
        503,
        "Authentication is temporarily busy",
        guard.retryAfterSeconds,
      );
    }
    return guard;
  }

  requireAccountIdentity(token: string): AccountIdentity {
    const authenticated = this.requireSession(token);
    return publicAccount(authenticated.account);
  }

  requireSessionContext(token: string): { account: AccountIdentity; sessionId: string } {
    const authenticated = this.requireSession(token);
    return {
      account: publicAccount(authenticated.account),
      sessionId: authenticated.session.id,
    };
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

    if (record.session.deviceId !== null) {
      if (record.session.deviceAccountId !== record.session.accountId) throw reauthRequired();
      if (record.session.deviceRevokedAt !== null) throw reauthRequired();
    }

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

function publicAccount(account: AccountRecord): AccountIdentity {
  return { id: account.id, username: account.username };
}

function reauthRequired(): AuthError {
  return new AuthError("AUTH_REAUTH_REQUIRED", 401, "Re-authentication is required");
}
