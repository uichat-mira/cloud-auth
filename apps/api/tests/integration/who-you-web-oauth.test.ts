import { randomUUID, createPublicKey, type KeyObject, type JsonWebKey } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  WHO_YOU_WEB_OAUTH_CLIENT_ID, WHO_YOU_WEB_OAUTH_REDIRECT_URI,
  CLOUD_WHO_YOU_AUDIENCE, SERVICE_CREDENTIAL_ISSUER, WHOYOU_READ_SCOPE,
  issuedCloudSessionSchema, issuedServiceCredentialSchema,
  type OAuthAuthorizationRequest,
} from "@uichat-mira/cloud-auth-contracts";
import { createTestOAuthContext } from "../helpers/oauth.js";
import { createTestServiceCredentialKeyMaterial } from "../helpers/service-credential.js";
import { parseSessionToken } from "../../src/security/session-token.js";
import { verifyServiceCredential } from "../../src/service-credentials/index.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
const password = "correct horse battery staple";
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const request: OAuthAuthorizationRequest = {
  response_type: "code", client_id: WHO_YOU_WEB_OAUTH_CLIENT_ID,
  redirect_uri: WHO_YOU_WEB_OAUTH_REDIRECT_URI,
  state: "who-you-web-state-0123456789abcdef",
  code_challenge: challenge, code_challenge_method: "S256",
};

describe("Who You Web login keeps the device + service-credential authority", () => {
  it("issues a genuine web-bound session and Who You read ticket, never a Desktop grant", async () => {
    const d = mkdtempSync(join(tmpdir(), "who-you-cloud-auth-"));
    directories.push(d);
    const material = createTestServiceCredentialKeyMaterial();
    const ctx = createTestOAuthContext(join(d, "auth.sqlite"), {
      serviceCredentialKeyMaterial: material,
    });
    try {
      await ctx.service.provisionAccount("alice", password);
      const grant = await ctx.oauthService.authorizeWithPassword(
        "alice", password, "127.0.0.1", request,
      );
      const installation = randomUUID();
      const exchange = {
        grant_type: "authorization_code" as const,
        client_id: WHO_YOU_WEB_OAUTH_CLIENT_ID,
        code: grant.code, redirect_uri: WHO_YOU_WEB_OAUTH_REDIRECT_URI,
        code_verifier: verifier, installation_id: installation, platform: "web" as const,
      };
      const crossPlatform = await ctx.app.inject({
        method: "POST", url: "/v1/oauth/token",
        payload: { ...exchange, platform: "desktop" },
      });
      expect(crossPlatform.statusCode).toBe(400);
      expect(crossPlatform.json()).toMatchObject({ error: { code: "OAUTH_INVALID_GRANT" } });
      const accepted = await ctx.app.inject({
        method: "POST", url: "/v1/oauth/token", payload: exchange,
      });
      expect(accepted.statusCode).toBe(200);
      const session = issuedCloudSessionSchema.parse(accepted.json());
      const device = ctx.db.prepare(`SELECT d.id, d.platform, d.installation_id, d.client_name
        FROM sessions s JOIN devices d ON d.id = s.device_id WHERE s.id = ?`)
        .get(parseSessionToken(session.sessionToken)!.id) as {
          id: string; platform: string; installation_id: string; client_name: string;
        };
      expect(device).toMatchObject({ platform: "web", installation_id: installation,
        client_name: "Who You Web" });
      expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM desktop_hosts").get())
        .toMatchObject({ n: 0 });
      const issued = await ctx.app.inject({
        method: "POST", url: "/v1/service-credentials",
        headers: { authorization: `Bearer ${session.sessionToken}` },
        payload: { audience: CLOUD_WHO_YOU_AUDIENCE },
      });
      expect(issued.statusCode).toBe(200);
      const ticket = issuedServiceCredentialSchema.parse(issued.json());
      const keys = new Map<string, KeyObject>(ctx.keyRing!.jwks.keys.map(
        (k) => [k.kid, createPublicKey({ key: k as JsonWebKey, format: "jwk" })],
      ));
      const claims = verifyServiceCredential(ticket.token, {
        issuer: SERVICE_CREDENTIAL_ISSUER, audience: CLOUD_WHO_YOU_AUDIENCE, publicKeys: keys,
      }).claims;
      expect(claims).toMatchObject({
        sub: session.account.id, device_id: device.id,
        aud: CLOUD_WHO_YOU_AUDIENCE, scope: [WHOYOU_READ_SCOPE],
        consumer_id: session.account.id,
      });
      ctx.deviceService.revoke(session.sessionToken, device.id);
      const revoked = await ctx.app.inject({
        method: "POST", url: "/v1/service-credentials",
        headers: { authorization: `Bearer ${session.sessionToken}` },
        payload: { audience: CLOUD_WHO_YOU_AUDIENCE },
      });
      expect(revoked.statusCode).toBe(401);
    } finally {
      await ctx.app.close();
      ctx.db.close();
    }
  });
});
