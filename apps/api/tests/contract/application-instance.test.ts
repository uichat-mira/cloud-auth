import { describe, expect, it } from "vitest";
import {
  applicationManifestSchema,
  applicationRegistrationRequestSchema,
} from "@uichat-mira/cloud-auth-contracts";

const origin = "https://app.example";
const service = {
  serviceId: "mail",
  name: "Mail",
  type: "mcp",
  protocol: { name: "mcp", version: "2026-07-28", endpoint: origin + "/mcp" },
  resource: origin + "/mcp",
  scopes: ["mail.read"],
  capabilities: [{ id: "mail.read", title: "Mail", toolRefs: ["mail.search"] }],
  toolGovernance: [
    {
      toolRef: "mail.search",
      riskHints: ["sensitive-data-read", "future-risk-dimension"],
      confirmationHint: "recommended",
    },
  ],
};
const manifest = {
  schemaVersion: "1",
  appId: "app_fixture_001",
  projectId: "fixture",
  name: "Fixture",
  homeUrl: origin + "/",
  manifestRevision: 1,
  oauth: {
    clientId: origin + "/oauth-client.json",
    metadataUrl: origin + "/oauth-client.json",
    redirectUris: [origin + "/auth/callback"],
  },
  registrationVerification: { endpoint: origin + "/mira/verify-registration" },
  services: [service],
};

describe("application instance V1 contract", () => {
  it("accepts exactly Origin + APP_ID + AppSecret for registration", () => {
    expect(
      applicationRegistrationRequestSchema.parse({
        origin,
        appId: manifest.appId,
        appSecret: "fixture-secret-0123456789",
      }),
    ).toEqual({
      origin,
      appId: manifest.appId,
      appSecret: "fixture-secret-0123456789",
    });
    expect(
      applicationRegistrationRequestSchema.safeParse({
        origin,
        appId: manifest.appId,
        appSecret: "fixture-secret-0123456789",
        callback: origin + "/auth/callback",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed and non-HTTPS origins without throwing", () => {
    for (const value of ["not-a-url", "http://app.example", "https://app.example/path", "https://app.example#fragment"]) {
      expect(applicationRegistrationRequestSchema.safeParse({
        origin: value, appId: manifest.appId, appSecret: "fixture-secret-0123456789",
      }).success).toBe(false);
    }
  });

  it("preserves unknown risk hints and rejects duplicate service identity", () => {
    const parsed = applicationManifestSchema.parse(manifest);
    expect(parsed.services[0]?.capabilities?.[0]?.id).toBe("mail.read");
    expect(parsed.services[0]?.toolGovernance?.[0]?.riskHints).toEqual([
      "sensitive-data-read",
      "future-risk-dimension",
    ]);
    expect(
      applicationManifestSchema.safeParse({
        ...manifest,
        services: [service, { ...service }],
      }).success,
    ).toBe(false);
  });
});
