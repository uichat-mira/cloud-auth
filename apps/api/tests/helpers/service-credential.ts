import { generateKeyPairSync } from "node:crypto";
import type { ServiceCredentialKeyMaterialConfig } from "../../src/service-credentials/keyring.js";
import { createTestOAuthContext, type TestOAuthContext } from "./oauth.js";

export type TestServiceCredentialContext = TestOAuthContext;

export function createTestServiceCredentialKeyMaterial(
  overrides: Partial<ServiceCredentialKeyMaterialConfig> = {},
): ServiceCredentialKeyMaterialConfig {
  const { privateKey } = generateKeyPairSync("ed25519");
  return {
    activeKeyId: "test-active-key",
    activePrivateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    retiringPublicKeys: [],
    ttlSeconds: 300,
    ...overrides,
  };
}

export function createTestServiceCredentialContext(
  databasePath: string,
  keyMaterial: ServiceCredentialKeyMaterialConfig | null = createTestServiceCredentialKeyMaterial(),
): TestServiceCredentialContext {
  return createTestOAuthContext(databasePath, {
    serviceCredentialKeyMaterial: keyMaterial,
  });
}
