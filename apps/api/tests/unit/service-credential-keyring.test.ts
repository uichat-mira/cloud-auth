import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { serviceCredentialJwksSchema } from "@uichat-mira/cloud-auth-contracts";
import { createServiceCredentialKeyRing } from "../../src/service-credentials/keyring.js";

function keyPair() {
  return generateKeyPairSync("ed25519");
}

function privatePem(pair: ReturnType<typeof keyPair>): string {
  return pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function publicPem(pair: ReturnType<typeof keyPair>): string {
  return pair.publicKey.export({ type: "spki", format: "pem" }).toString();
}

describe("service credential key ring", () => {
  it("publishes only the active and retiring Ed25519 public keys", () => {
    const active = keyPair();
    const retiring = keyPair();
    const ring = createServiceCredentialKeyRing({
      activeKeyId: "cloud-auth-2026-10",
      activePrivateKey: privatePem(active).replace(/\n/g, "\\n"),
      retiringPublicKeys: [
        { keyId: "cloud-auth-2026-09", publicKey: publicPem(retiring).replace(/\n/g, "\\n") },
      ],
      ttlSeconds: 300,
    });

    expect(ring).not.toBeNull();
    expect(ring?.activeKeyId).toBe("cloud-auth-2026-10");
    expect(ring?.signer).toMatchObject({ keyId: "cloud-auth-2026-10", ttlSeconds: 300 });
    expect(ring?.jwks.keys.map((key) => key.kid)).toEqual([
      "cloud-auth-2026-10",
      "cloud-auth-2026-09",
    ]);
    expect(serviceCredentialJwksSchema.parse(ring?.jwks)).toEqual(ring?.jwks);
    for (const key of ring?.jwks.keys ?? []) {
      expect(key).not.toHaveProperty("d");
      expect(key).not.toHaveProperty("p");
      expect(key).not.toHaveProperty("q");
    }
  });

  it("rejects malformed, duplicated or unsafe key material", () => {
    const active = keyPair();
    const retiring = keyPair();
    const base = {
      activeKeyId: "cloud-auth-2026-10",
      activePrivateKey: privatePem(active),
      retiringPublicKeys: [],
      ttlSeconds: 300,
    };

    for (const config of [
      null,
      { ...base, activeKeyId: "" },
      { ...base, activeKeyId: "key with spaces" },
      { ...base, activeKeyId: "k".repeat(65) },
      { ...base, activePrivateKey: "not a private key" },
      { ...base, activePrivateKey: publicPem(active) },
      { ...base, ttlSeconds: 0 },
      { ...base, ttlSeconds: 601 },
      {
        ...base,
        retiringPublicKeys: [{ keyId: "old", publicKey: "not a public key" }],
      },
      {
        ...base,
        retiringPublicKeys: [
          { keyId: "old", publicKey: publicPem(retiring) },
          { keyId: "old", publicKey: publicPem(retiring) },
        ],
      },
      {
        ...base,
        retiringPublicKeys: [
          { keyId: "cloud-auth-2026-10", publicKey: publicPem(retiring) },
        ],
      },
    ]) {
      expect(createServiceCredentialKeyRing(config)).toBeNull();
    }
  });

  it("stores retirement public keys without a private key", () => {
    const active = keyPair();
    const retiring = keyPair();
    const retiringPrivate = retiring.privateKey.export({
      type: "pkcs8",
      format: "pem",
    });

    const ring = createServiceCredentialKeyRing({
      activeKeyId: "cloud-auth-2026-10",
      activePrivateKey: privatePem(active),
      retiringPublicKeys: [
        { keyId: "cloud-auth-2026-09", publicKey: retiringPrivate.toString() },
      ],
      ttlSeconds: 300,
    });

    expect(ring?.jwks.keys).toHaveLength(2);
    expect(JSON.stringify(ring?.jwks)).not.toContain("PRIVATE");
    expect(ring?.jwks.keys[1]).not.toHaveProperty("d");
  });
});
