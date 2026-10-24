import { generateKeyPairSync } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import {
  createServiceCredentialKeyRing,
  type ServiceCredentialKeyMaterialConfig,
  type ServiceCredentialKeyRing,
} from "../../src/service-credentials/keyring.js";
import { ServiceCredentialService } from "../../src/service-credentials/service.js";
import { createTestAuth, type TestAuthContext } from "./auth.js";

export interface TestServiceCredentialContext extends TestAuthContext {
  app: FastifyInstance;
  keyMaterial: ServiceCredentialKeyMaterialConfig | null;
  keyRing: ServiceCredentialKeyRing | null;
}

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
  const auth = createTestAuth(databasePath);
  const keyRing = createServiceCredentialKeyRing(keyMaterial);
  const serviceCredentialService = new ServiceCredentialService(auth.repository, keyRing);
  const app = buildApp({
    db: auth.db,
    authService: auth.service,
    deviceService: auth.deviceService,
    serviceCredentialService,
  });

  return {
    ...auth,
    app,
    keyMaterial,
    keyRing,
  };
}
