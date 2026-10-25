import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("uses safe bootstrap/auth defaults", () => {
    expect(loadConfig({})).toEqual({
      host: "0.0.0.0",
      port: 8788,
      databasePath: "./data/auth.sqlite",
      logLevel: "info",
      sessionTtlSeconds: 2_592_000,
      oauthAuthorizationCodeTtlSeconds: 300,
      hostLeaseSeconds: 120,
      passwordMaxConcurrency: 2,
      loginPerUsernamePerMinute: 5,
      loginPerIpPerMinute: 20,
      argon2MemoryKiB: 19_456,
      argon2Passes: 2,
      argon2Parallelism: 1,
      serviceCredentials: null,
    });
  });

  it("parses explicit service-credential signing material without requiring it", () => {
    expect(
      loadConfig({
        MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_KID: "cloud-auth-2026-10",
        MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\n...",
        MIRA_AUTH_SERVICE_CREDENTIAL_RETIRING_PUBLIC_KEYS:
          '{"cloud-auth-2026-09":"-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----"}',
        MIRA_AUTH_SERVICE_CREDENTIAL_TTL_SECONDS: "120",
      }).serviceCredentials,
    ).toEqual({
      activeKeyId: "cloud-auth-2026-10",
      activePrivateKey: "-----BEGIN PRIVATE KEY-----\n...",
      retiringPublicKeys: [
        {
          keyId: "cloud-auth-2026-09",
          publicKey: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
        },
      ],
      ttlSeconds: 120,
    });
  });

  it("fails service-credential configuration closed without breaking other config", () => {
    for (const env of [
      { MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_KID: "only-a-kid" },
      {
        MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_KID: "cloud-auth-2026-10",
        MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_PRIVATE_KEY: "pem",
        MIRA_AUTH_SERVICE_CREDENTIAL_TTL_SECONDS: "0",
      },
      {
        MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_KID: "cloud-auth-2026-10",
        MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_PRIVATE_KEY: "pem",
        MIRA_AUTH_SERVICE_CREDENTIAL_RETIRING_PUBLIC_KEYS: "not-json",
      },
      {
        MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_KID: "cloud-auth-2026-10",
        MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_PRIVATE_KEY: "pem",
        MIRA_AUTH_SERVICE_CREDENTIAL_RETIRING_PUBLIC_KEYS: '{"bad kid":"pem"}',
      },
    ]) {
      const config = loadConfig(env);
      expect(config.serviceCredentials).toBeNull();
      expect(config.port).toBe(8788);
    }
  });

  it("rejects unsafe or invalid runtime values", () => {
    expect(() => loadConfig({ PORT: "70000" })).toThrow(/PORT/);
    expect(() => loadConfig({ MIRA_AUTH_PASSWORD_MAX_CONCURRENCY: "9" })).toThrow(/CONCURRENCY/);
    expect(() => loadConfig({ MIRA_AUTH_ARGON2_MEMORY_KIB: "1024" })).toThrow(/ARGON2_MEMORY/);
    expect(() => loadConfig({ MIRA_AUTH_SESSION_TTL_SECONDS: "60" })).toThrow(/SESSION_TTL/);
    expect(() => loadConfig({ MIRA_AUTH_OAUTH_CODE_TTL_SECONDS: "59" })).toThrow(
      /OAUTH_CODE_TTL/,
    );
    expect(() => loadConfig({ MIRA_AUTH_OAUTH_CODE_TTL_SECONDS: "601" })).toThrow(
      /OAUTH_CODE_TTL/,
    );
    expect(() => loadConfig({ MIRA_AUTH_OAUTH_CODE_TTL_SECONDS: "soon" })).toThrow(
      /OAUTH_CODE_TTL/,
    );
    expect(
      loadConfig({ MIRA_AUTH_OAUTH_CODE_TTL_SECONDS: "600" })
        .oauthAuthorizationCodeTtlSeconds,
    ).toBe(600);
    expect(() => loadConfig({ MIRA_AUTH_HOST_LEASE_SECONDS: "29" })).toThrow(
      /HOST_LEASE_SECONDS/,
    );
    expect(() => loadConfig({ MIRA_AUTH_HOST_LEASE_SECONDS: "3601" })).toThrow(
      /HOST_LEASE_SECONDS/,
    );
    expect(loadConfig({ MIRA_AUTH_HOST_LEASE_SECONDS: "60" }).hostLeaseSeconds).toBe(60);
  });
});
