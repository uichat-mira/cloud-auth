import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WHO_YOU_WEB_OAUTH_CLIENT_ID, WHO_YOU_WEB_OAUTH_REDIRECT_URI } from "@uichat-mira/cloud-auth-contracts";
import { createTestOAuthContext } from "../helpers/oauth.js";
import { computePkceS256Challenge } from "../../src/oauth/pkce.js";

describe("retired Who You Web native-session path", () => {
  it("rejects the old fixed client without creating native device, session or grant", async () => {
    const dir = mkdtempSync(join(tmpdir(), "who-you-oauth-retired-"));
    const ctx = createTestOAuthContext(join(dir, "auth.sqlite"));
    try {
      const password = "correct horse battery staple";
      await ctx.service.provisionAccount("alice", password);
      const request = {
        response_type: "code" as const, client_id: WHO_YOU_WEB_OAUTH_CLIENT_ID,
        redirect_uri: WHO_YOU_WEB_OAUTH_REDIRECT_URI, state: "fixture-state-0123456789",
        code_challenge: computePkceS256Challenge("v".repeat(43)), code_challenge_method: "S256" as const,
      };
      const get = await ctx.app.inject({ method: "GET", url: "/v1/oauth/authorize?" + new URLSearchParams(request) });
      expect(get.statusCode).toBe(400);
      await expect(ctx.oauthService.authorizeWithPassword("alice", password, "127.0.0.1", request)).rejects.toMatchObject({ code: "OAUTH_UNAUTHORIZED_CLIENT" });
      const token = await ctx.app.inject({ method: "POST", url: "/v1/oauth/token", payload: {
        grant_type: "authorization_code", client_id: request.client_id, redirect_uri: request.redirect_uri,
        code: "mca_v1." + "a".repeat(22) + "." + "b".repeat(43), code_verifier: "v".repeat(43),
        installation_id: "01890f6e-4f3c-4cc8-9dbc-55116c2f", platform: "web",
      }});
      expect(token.statusCode).toBe(400);
      for (const table of ["sessions", "devices", "application_service_grants"]) {
        expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM " + table).get()).toMatchObject({ n: 0 });
      }
    } finally {
      await ctx.app.close(); ctx.db.close(); rmSync(dir, { recursive: true, force: true });
    }
  });
});
