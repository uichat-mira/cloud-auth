import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { OAuthRepository } from "../../src/oauth/oauth-repository.js";
import { OAuthService } from "../../src/oauth/oauth-service.js";
import { createTestAuth, type TestAuthContext } from "./auth.js";

export interface TestOAuthContext extends TestAuthContext {
  app: FastifyInstance;
  oauthRepository: OAuthRepository;
  oauthService: OAuthService;
}

export interface TestOAuthOptions {
  codeTtlSeconds?: number;
  now?: () => Date;
}

export function createTestOAuthContext(
  databasePath: string,
  options: TestOAuthOptions = {},
): TestOAuthContext {
  const auth = createTestAuth(databasePath);
  const oauthRepository = new OAuthRepository(auth.db);
  const oauthService = new OAuthService(oauthRepository, auth.service, {
    codeTtlSeconds: options.codeTtlSeconds ?? 300,
    now: options.now ?? (() => new Date()),
  });
  const app = buildApp({
    db: auth.db,
    authService: auth.service,
    deviceService: auth.deviceService,
    oauthService,
  });

  return {
    ...auth,
    app,
    oauthRepository,
    oauthService,
  };
}
