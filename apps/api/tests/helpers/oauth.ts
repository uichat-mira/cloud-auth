import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { OAuthRepository } from "../../src/oauth/oauth-repository.js";
import { OAuthService } from "../../src/oauth/oauth-service.js";
import {
  createServiceCredentialKeyRing,
  type ServiceCredentialKeyMaterialConfig,
  type ServiceCredentialKeyRing,
} from "../../src/service-credentials/keyring.js";
import { ServiceCredentialService } from "../../src/service-credentials/service.js";
import { createTestAuth, type TestAuthContext } from "./auth.js";

export interface TestOAuthContext extends TestAuthContext {
  app: FastifyInstance;
  oauthRepository: OAuthRepository;
  oauthService: OAuthService;
  keyRing: ServiceCredentialKeyRing | null;
  serviceCredentialService: ServiceCredentialService | null;
}

export interface TestOAuthOptions {
  codeTtlSeconds?: number;
  sessionTtlSeconds?: number;
  now?: () => Date;
  serviceCredentialKeyMaterial?: ServiceCredentialKeyMaterialConfig | null;
}

export function createTestOAuthContext(
  databasePath: string,
  options: TestOAuthOptions = {},
): TestOAuthContext {
  const auth = createTestAuth(databasePath);
  const oauthRepository = new OAuthRepository(auth.db);
  const oauthService = new OAuthService(oauthRepository, auth.service, {
    codeTtlSeconds: options.codeTtlSeconds ?? 300,
    sessionTtlSeconds: options.sessionTtlSeconds ?? 3600,
    now: options.now ?? (() => new Date()),
  });
  const keyRing = options.serviceCredentialKeyMaterial === undefined
    ? null
    : createServiceCredentialKeyRing(options.serviceCredentialKeyMaterial);
  const serviceCredentialService = keyRing
    ? new ServiceCredentialService(auth.repository, keyRing)
    : null;
  const app = buildApp({
    db: auth.db,
    authService: auth.service,
    deviceService: auth.deviceService,
    oauthService,
    ...(serviceCredentialService ? { serviceCredentialService } : {}),
  });

  return {
    ...auth,
    app,
    oauthRepository,
    oauthService,
    keyRing,
    serviceCredentialService,
  };
}
