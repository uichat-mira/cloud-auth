import { describe, expect, it } from "vitest";
import {
  SERVICE_CREDENTIAL_ISSUER,
  applicationServiceBindingRequestSchema,
  applicationServiceCatalogEntrySchema,
  applicationServiceClaimsSchema,
  applicationServiceCredentialSchema,
  serviceCredentialClaimsSchema,
} from "@uichat-mira/cloud-auth-contracts";

const temporal = { iat: 1_790_000_000, nbf: 1_790_000_000, exp: 1_790_000_300 };
const resource = "https://mail-a.example/mcp";

const appClaims = {
  iss: SERVICE_CREDENTIAL_ISSUER,
  sub: "account-0001",
  device_id: "device-0001",
  aud: resource,
  app_id: "app-a-instance-0001",
  service_id: "mail",
  resource,
  scope: ["mail.read"],
  ...temporal,
};

describe("instance application service V1 contract", () => {
  it("keeps the composite APP_ID + serviceId + resource identity explicit", () => {
    const entry = {
      appId: "app-a-instance-0001",
      projectId: "fixture",
      serviceId: "mail",
      name: "Mail",
      appName: "Fixture Mail App",
      type: "mcp",
      protocol: { name: "mcp", version: "2026-07-28", endpoint: resource },
      resource,
      scopes: ["mail.read"],
      revision: 1,
      manifestRevision: 1,
    };
    expect(applicationServiceCatalogEntrySchema.parse(entry)).toMatchObject({
      appId: entry.appId,
      appName: "Fixture Mail App",
      name: "Mail",
      serviceId: entry.serviceId,
      resource,
      revision: 1,
    });
    expect(applicationServiceCatalogEntrySchema.safeParse({ ...entry, appName: undefined }).success).toBe(false);
    expect(applicationServiceCatalogEntrySchema.safeParse({ ...entry, appName: " " }).success).toBe(false);
    expect(
      applicationServiceCatalogEntrySchema.safeParse({ ...entry, serviceId: "MAIL" }).success,
    ).toBe(false);
    expect(
      applicationServiceCatalogEntrySchema.safeParse({ ...entry, resource: "http://mail" })
        .success,
    ).toBe(false);
  });

  it("rejects bare serviceId and caller-supplied authority in the binding request", () => {
    expect(
      applicationServiceBindingRequestSchema.parse({ resource, expectedRevision: 2 }),
    ).toEqual({ resource, expectedRevision: 2 });

    for (const invalid of [
      { expectedRevision: 1 },
      { serviceId: "mail", expectedRevision: 1 },
      { resource, expectedRevision: 1, audience: "mira:service:mail" },
      { resource, expectedRevision: 1, scopes: ["mail.write"] },
      { resource, expectedRevision: 1, appId: "app-b-instance-0001" },
      { resource, expectedRevision: 0 },
    ]) {
      expect(applicationServiceBindingRequestSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("binds the signed credential to issuer, subject, device, instance, resource and expiry", () => {
    expect(applicationServiceClaimsSchema.parse(appClaims)).toEqual(appClaims);
    expect(applicationServiceCredentialSchema.parse({
      token: "header.payload.signature",
      tokenType: "Bearer",
      appId: appClaims.app_id,
      serviceId: appClaims.service_id,
      resource,
      revision: 1,
      scopes: ["mail.read"],
      expiresAt: "2026-11-25T10:05:00.000Z",
    })).toBeTruthy();

    for (const invalid of [
      { ...appClaims, aud: "https://mail-b.example/mcp" },
      { ...appClaims, resource: "https://mail-b.example/mcp" },
      { ...appClaims, app_id: undefined },
      { ...appClaims, service_id: undefined },
      { ...appClaims, scope: ["mail.read", "mail.read"] },
      { ...appClaims, exp: appClaims.iat },
      { ...appClaims, consumer_id: "account-0001" },
      { ...appClaims, confirmation: {} },
    ]) {
      expect(applicationServiceClaimsSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("keeps V0 bare-serviceId claims outside the instance credential contract", () => {
    const legacy = {
      iss: SERVICE_CREDENTIAL_ISSUER,
      sub: "account-0001",
      device_id: "device-0001",
      aud: "mira:service:mail",
      scope: ["service:mail:read"],
      ...temporal,
    };
    expect(serviceCredentialClaimsSchema.parse(legacy)).toEqual(legacy);
    expect(applicationServiceClaimsSchema.safeParse(legacy).success).toBe(false);
    expect(applicationServiceClaimsSchema.safeParse({ ...appClaims, aud: legacy.aud }).success)
      .toBe(false);
  });
});
