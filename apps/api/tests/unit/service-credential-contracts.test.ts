import { describe, expect, it } from "vitest";
import {
  CLOUD_RELAY_TRANSPORT_AUDIENCE,
  CLOUD_SHIYAN_AUDIENCE,
  RELAY_TRANSPORT_SCOPE,
  SERVICE_CREDENTIAL_ISSUER,
  SHIYAN_AUTHENTICATE_SCOPE,
  relayServiceCredentialClaimsSchema,
  relayTicketContextSchema,
  serviceCredentialClaimsSchema,
  serviceCredentialJwtHeaderSchema,
  shiyanServiceCredentialClaimsSchema,
} from "@uichat-mira/cloud-auth-contracts";

const temporal = { iat: 1_790_000_000, nbf: 1_790_000_000, exp: 1_790_000_300 };

const shiyanClaims = {
  iss: SERVICE_CREDENTIAL_ISSUER,
  sub: "account-0001",
  device_id: "device-0001",
  aud: CLOUD_SHIYAN_AUDIENCE,
  scope: [SHIYAN_AUTHENTICATE_SCOPE],
  ...temporal,
};

const relayClaims = {
  iss: SERVICE_CREDENTIAL_ISSUER,
  sub: "account-0001",
  device_id: "device-0001",
  aud: CLOUD_RELAY_TRANSPORT_AUDIENCE,
  scope: [RELAY_TRANSPORT_SCOPE],
  relay: { room: "room-7f3a", role: "client" },
  ...temporal,
};

describe("service credential shared contract", () => {
  it("pins the stable audience, issuer and scope literals", () => {
    expect(SERVICE_CREDENTIAL_ISSUER).toBe("mira:cloud-auth");
    expect(CLOUD_SHIYAN_AUDIENCE).toBe("mira:cloud-shiyan");
    expect(CLOUD_RELAY_TRANSPORT_AUDIENCE).toBe("mira:cloud-relay-transport");
    expect(SHIYAN_AUTHENTICATE_SCOPE).toBe("shiyan:authenticate");
    expect(RELAY_TRANSPORT_SCOPE).toBe("relay:transport");
  });

  it("accepts only the canonical claims shape per audience", () => {
    expect(serviceCredentialClaimsSchema.parse(shiyanClaims)).toEqual(shiyanClaims);
    expect(serviceCredentialClaimsSchema.parse(relayClaims)).toEqual(relayClaims);
    expect(shiyanServiceCredentialClaimsSchema.parse(shiyanClaims)).toEqual(shiyanClaims);
    expect(relayServiceCredentialClaimsSchema.parse(relayClaims)).toEqual(relayClaims);
  });

  it("rejects cross-audience scope and context combinations", () => {
    for (const payload of [
      { ...shiyanClaims, scope: [RELAY_TRANSPORT_SCOPE] },
      { ...shiyanClaims, scope: [] },
      { ...shiyanClaims, scope: [SHIYAN_AUTHENTICATE_SCOPE, RELAY_TRANSPORT_SCOPE] },
      { ...shiyanClaims, relay: { room: "room-7f3a", role: "client" } },
      { ...relayClaims, relay: undefined },
      { ...relayClaims, scope: [SHIYAN_AUTHENTICATE_SCOPE] },
      { ...relayClaims, relay: { room: "room-7f3a", role: "owner" } },
      { ...relayClaims, relay: { room: "room 7f3a", role: "client" } },
      { ...relayClaims, remote: { terminal: true } },
      { ...relayClaims, scope: [RELAY_TRANSPORT_SCOPE, "remote:terminal"] },
    ]) {
      expect(serviceCredentialClaimsSchema.safeParse(payload).success).toBe(false);
    }
  });

  it("rejects missing identity and invalid temporal claims", () => {
    for (const payload of [
      { ...shiyanClaims, iss: "" },
      { ...shiyanClaims, sub: "" },
      { ...shiyanClaims, device_id: "" },
      { ...shiyanClaims, iat: undefined },
      { ...shiyanClaims, nbf: undefined },
      { ...shiyanClaims, exp: undefined },
      { ...shiyanClaims, iat: 1.5 },
      { ...shiyanClaims, exp: temporal.iat },
      { ...shiyanClaims, nbf: temporal.iat - 1 },
    ]) {
      expect(serviceCredentialClaimsSchema.safeParse(payload).success).toBe(false);
    }
  });

  it("accepts only EdDSA/JWT headers with a bounded kid", () => {
    expect(
      serviceCredentialJwtHeaderSchema.parse({
        alg: "EdDSA",
        typ: "JWT",
        kid: "cloud-auth-2026-10",
      }),
    ).toEqual({ alg: "EdDSA", typ: "JWT", kid: "cloud-auth-2026-10" });

    for (const header of [
      { alg: "none", typ: "JWT", kid: "key-1" },
      { alg: "HS256", typ: "JWT", kid: "key-1" },
      { alg: "EdDSA", typ: "JWS", kid: "key-1" },
      { alg: "EdDSA", typ: "JWT" },
      { alg: "EdDSA", typ: "JWT", kid: "" },
      { alg: "EdDSA", typ: "JWT", kid: "key with spaces" },
      { alg: "EdDSA", typ: "JWT", kid: "k".repeat(65) },
      { alg: "EdDSA", typ: "JWT", kid: "key-1", extra: true },
    ]) {
      expect(serviceCredentialJwtHeaderSchema.safeParse(header).success).toBe(false);
    }
  });

  it("validates Relay context as transport identity only", () => {
    expect(relayTicketContextSchema.parse({ room: "room-7f3a", role: "host" })).toEqual({
      room: "room-7f3a",
      role: "host",
    });

    for (const context of [
      { room: "room-7f3a", role: "owner" },
      { room: "", role: "client" },
      { room: "room with spaces", role: "client" },
      { room: "r".repeat(129), role: "client" },
      { room: "room-7f3a", role: "client", tool: "terminal" },
    ]) {
      expect(relayTicketContextSchema.safeParse(context).success).toBe(false);
    }
  });
});
