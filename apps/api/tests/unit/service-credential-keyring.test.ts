import { createPublicKey, generateKeyPairSync, type JsonWebKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CLOUD_SHIYAN_AUDIENCE,
  SERVICE_CREDENTIAL_ISSUER,
  SHIYAN_AUTHENTICATE_SCOPE,
  serviceCredentialJwksSchema,
} from "@uichat-mira/cloud-auth-contracts";
import { createServiceCredentialKeyRing } from "../../src/service-credentials/keyring.js";
import { issueServiceCredential } from "../../src/service-credentials/signer.js";
import { verifyServiceCredential } from "../../src/service-credentials/verifier.js";

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

  it("rejects private PEM in public-only slots rather than deriving and retaining it", () => {
    const active = keyPair();
    const other = keyPair();

    const ring = createServiceCredentialKeyRing({
      activeKeyId: "current",
      activePrivateKey: privatePem(active),
      retiringPublicKeys: [
        { keyId: "verification-only", publicKey: privatePem(other) },
      ],
      ttlSeconds: 300,
    });

    expect(ring).toBeNull();
    // A real public PEM is valid for both pre-publication and retirement.
    expect(
      createServiceCredentialKeyRing({
        activeKeyId: "current",
        activePrivateKey: privatePem(active),
        retiringPublicKeys: [
          { keyId: "verification-only", publicKey: publicPem(other) },
        ],
        ttlSeconds: 300,
      })?.jwks.keys,
    ).toHaveLength(2);
  });

  it("pre-publishes next key so cached JWKS accepts new tokens before and after signing switch", () => {
    const oldPair = keyPair();
    const nextPair = keyPair();
    const oldKid = "old-key";
    const nextKid = "next-key";

    // Phase A: old signer remains active while the next PUBLIC key is published.
    // A consumer may cache this snapshot for the full JWKS cache lifetime.
    const prePublished = createServiceCredentialKeyRing({
      activeKeyId: oldKid,
      activePrivateKey: privatePem(oldPair),
      retiringPublicKeys: [{ keyId: nextKid, publicKey: publicPem(nextPair) }],
      ttlSeconds: 300,
    });

    // Phase B: after cached JWKS expires, switch the active signer and retain
    // the previous public key until all old credentials and caches expire.
    const switched = createServiceCredentialKeyRing({
      activeKeyId: nextKid,
      activePrivateKey: privatePem(nextPair),
      retiringPublicKeys: [{ keyId: oldKid, publicKey: publicPem(oldPair) }],
      ttlSeconds: 300,
    });

    if (!prePublished || !switched) throw new Error("Rotation test key rings are invalid");

    const toTrustedKeys = (ring: typeof prePublished) =>
      new Map(
        ring.jwks.keys.map((key) => [
          key.kid,
          createPublicKey({ key: key as JsonWebKey, format: "jwk" }),
        ] as const),
      );

    const cachedBeforeSwitch = toTrustedKeys(prePublished);
    const refreshedAfterSwitch = toTrustedKeys(switched);
    const input = {
      accountId: "account-1",
      deviceId: "device-1",
      audience: CLOUD_SHIYAN_AUDIENCE,
      scope: [SHIYAN_AUTHENTICATE_SCOPE],
    } as const;
    const oldToken = issueServiceCredential(prePublished.signer, input);
    const nextToken = issueServiceCredential(switched.signer, input);

    const verify = (token: string, publicKeys: ReturnType<typeof toTrustedKeys>) =>
      verifyServiceCredential(token, {
        issuer: SERVICE_CREDENTIAL_ISSUER,
        audience: CLOUD_SHIYAN_AUDIENCE,
        publicKeys,
      });

    expect(verify(oldToken, cachedBeforeSwitch).keyId).toBe(oldKid);
    expect(verify(nextToken, cachedBeforeSwitch).keyId).toBe(nextKid);
    expect(verify(oldToken, refreshedAfterSwitch).keyId).toBe(oldKid);
    expect(verify(nextToken, refreshedAfterSwitch).keyId).toBe(nextKid);

    // A direct swap without pre-publication would have failed for old caches.
    const oldOnly = new Map([[oldKid, oldPair.publicKey]]);
    expect(() => verify(nextToken, oldOnly)).toThrow(/unknown key id/);

    // After the documented overlap window, retirement removes the old kid.
    const afterRetirement = new Map([[nextKid, nextPair.publicKey]]);
    expect(verify(nextToken, afterRetirement).keyId).toBe(nextKid);
    expect(() => verify(oldToken, afterRetirement)).toThrow(/unknown key id/);
  });
});
