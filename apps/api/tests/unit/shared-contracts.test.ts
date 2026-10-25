import { describe, expect, it } from "vitest";
import {
  accountIdentitySchema,
  authErrorEnvelopeSchema,
  cloudSessionSchema,
  issuedCloudSessionSchema,
  loginRequestSchema,
} from "@uichat-mira/cloud-auth-contracts";

describe("shared Cloud Auth schemas", () => {
  const account = { id: "account-1", username: "Alice" };
  const expiresAt = "2026-10-24T12:00:00.000Z";

  it("accepts canonical login and session payloads", () => {
    expect(loginRequestSchema.parse({ username: "alice", password: "secret" })).toEqual({
      username: "alice",
      password: "secret",
    });
    const installationId = "01890f6e-4f3c-4cc8-9dbc-55116c2f3a8a";
    expect(
      loginRequestSchema.parse({
        username: "alice",
        password: "secret",
        device: { installationId, platform: "desktop" },
      }),
    ).toEqual({
      username: "alice",
      password: "secret",
      device: { installationId, platform: "desktop" },
    });
    expect(accountIdentitySchema.parse(account)).toEqual(account);
    expect(cloudSessionSchema.parse({ account, expiresAt })).toEqual({ account, expiresAt });
    expect(
      issuedCloudSessionSchema.parse({ account, expiresAt, sessionToken: "opaque-token" }),
    ).toEqual({ account, expiresAt, sessionToken: "opaque-token" });
  });

  it("rejects malformed or widened public payloads", () => {
    for (const payload of [
      {},
      { username: "", password: "secret" },
      { username: "alice", password: "" },
      { username: "a".repeat(129), password: "secret" },
      { username: "alice", password: "p".repeat(257) },
      { username: "alice", password: "secret", extra: true },
      {
        username: "alice",
        password: "secret",
        device: { installationId: "550e8400-e29b-11d4-a716-446655440000", platform: "desktop" },
      },
      {
        username: "alice",
        password: "secret",
        device: { installationId: "01890f6e-4f3c-4cc8-9dbc-55116c2f3a8a", platform: "server" },
      },
      {
        username: "alice",
        password: "secret",
        device: {
          installationId: "01890f6e-4f3c-4cc8-9dbc-55116c2f3a8a",
          platform: "desktop",
          accountId: "account-1",
        },
      },
    ]) {
      expect(loginRequestSchema.safeParse(payload).success).toBe(false);
    }

    for (const payload of [
      { account, expiresAt: "not-a-date" },
      { account: { id: "only-an-id" }, expiresAt },
      { account, expiresAt, sessionToken: "" },
      { account, expiresAt, sessionToken: "opaque-token", extra: true },
    ]) {
      expect(issuedCloudSessionSchema.safeParse(payload).success).toBe(false);
    }
  });

  it("keeps server-only administrator errors out of the browser contract", () => {
    expect(
      authErrorEnvelopeSchema.safeParse({
        error: { code: "AUTH_REAUTH_REQUIRED", message: "Re-authentication is required" },
      }).success,
    ).toBe(true);

    expect(
      authErrorEnvelopeSchema.safeParse({
        error: { code: "AUTH_DEVICE_REJECTED", message: "Mira Device is not accepted" },
      }).success,
    ).toBe(true);

    for (const code of [
      "AUTH_ACCOUNT_EXISTS",
      "AUTH_ACCOUNT_NOT_FOUND",
      "AUTH_INVALID_ADMIN_INPUT",
    ]) {
      expect(
        authErrorEnvelopeSchema.safeParse({
          error: { code, message: "server-only" },
        }).success,
      ).toBe(false);
    }
  });
});
