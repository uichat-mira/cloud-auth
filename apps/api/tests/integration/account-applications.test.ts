import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type {
  ApplicationRegistrationHttpResponse,
  ApplicationRegistrationTransport,
} from "../../src/application-instances/transport.js";
import { createTestAuth } from "../helpers/auth.js";

const password = "correct horse battery staple";
const origin = "https://who-you.tomz.io";
const appId = "app_who_you_fixture_001";
const secret = "fixture-app-secret-0123456789";
const manifest = {
  schemaVersion: "1",
  appId,
  projectId: "who-you",
  name: "狐邮",
  description: "邮件服务",
  homeUrl: origin + "/",
  iconUrl: origin + "/icon.png",
  manifestRevision: 1,
  oauth: {
    clientId: origin + "/oauth-client.json",
    metadataUrl: origin + "/oauth-client.json",
    redirectUris: [origin + "/auth/callback"],
  },
  registrationVerification: {
    endpoint: origin + "/mira/verify-registration",
  },
  services: [
    {
      serviceId: "mail",
      name: "邮件服务",
      type: "mcp",
      protocol: {
        name: "mcp",
        version: "2026-07-28",
        endpoint: origin + "/mcp",
      },
      resource: origin + "/mcp",
      scopes: ["mail.read"],
      targets: ["mobile", "desktop"],
      capabilities: [
        {
          id: "mail-read",
          title: "邮件读取",
          toolRefs: ["mail.search"],
          selectionWeightHint: 0.8,
        },
      ],
      toolGovernance: [
        {
          toolRef: "mail.search",
          riskHints: ["sensitive-data-read"],
          confirmationHint: "recommended",
        },
      ],
      extensions: {},
    },
  ],
} as const;

class FixtureTransport implements ApplicationRegistrationTransport {
  constructor(private readonly currentSecret = secret) {}

  async get(url: string): Promise<ApplicationRegistrationHttpResponse> {
    if (url !== origin + "/.well-known/mira-application") {
      return { status: 404, body: { error: "not_found" } };
    }
    return { status: 200, body: manifest };
  }

  async post(url: string, body: unknown): Promise<ApplicationRegistrationHttpResponse> {
    if (url !== manifest.registrationVerification.endpoint) {
      return { status: 404, body: { error: "not_found" } };
    }
    const value = body as { appId?: string; appSecret?: string };
    if (value.appId !== appId || value.appSecret !== this.currentSecret) {
      return { status: 403, body: { ok: false } };
    }
    return { status: 200, body: { ok: true, appId } };
  }
}

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "mira-app-instance-"));
  const auth = createTestAuth(join(dir, "auth.sqlite"));
  const app = buildApp({
    db: auth.db,
    authService: auth.service,
    applicationRegistrationTransport: new FixtureTransport(),
  });
  const owner = await auth.service.provisionAccount("owner", password);
  const other = await auth.service.provisionAccount("other", password);
  const ownerSession = await auth.service.login("owner", password, "127.0.0.1");
  const otherSession = await auth.service.login("other", password, "127.0.0.2");
  cleanup = async () => {
    await app.close();
    auth.db.close();
    rmSync(dir, { recursive: true, force: true });
  };
  const call = (token: string, method: "GET" | "POST" | "DELETE", url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { authorization: "Bearer " + token },
      ...(payload === undefined ? {} : { payload }),
    });
  return { auth, app, owner, other, ownerSession, otherSession, call };
}

describe("Mira ID V1 application instance ownership", () => {
  it("registers from Origin + APP_ID + AppSecret, stores no secret, and isolates ownership", async () => {
    const { auth, owner, ownerSession, otherSession, call } = await setup();
    const route = "/v1/account/applications";
    expect((await call(ownerSession.sessionToken, "GET", route)).json()).toEqual({ applications: [] });

    const registered = await call(ownerSession.sessionToken, "POST", route, { origin, appId, appSecret: secret });
    expect(registered.statusCode).toBe(200);
    expect(registered.headers["cache-control"]).toBe("no-store");
    expect(registered.body).not.toContain(secret);
    expect(registered.json().application).toMatchObject({
      appId,
      origin,
      manifest: { name: "狐邮", oauth: { redirectUris: [origin + "/auth/callback"] } },
    });

    const row = auth.db.prepare("SELECT * FROM application_instances WHERE app_id = ?").get(appId) as Record<string, unknown>;
    expect(row.owner_account_id).toBe(owner.id);
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(Object.keys(row).some((key) => key.toLowerCase().includes("secret"))).toBe(false);

    expect((await call(otherSession.sessionToken, "GET", route)).json()).toEqual({ applications: [] });
    expect((await call(otherSession.sessionToken, "POST", route, { origin, appId, appSecret: secret })).statusCode).toBe(409);

    const fakeManagementToken = "mca_admin_v1.fixture." + "x".repeat(43);
    expect((await call(fakeManagementToken, "GET", route)).statusCode).toBe(401);
  });

  it("rejects wrong credentials and identity mismatch, then allows a verified re-claim after ownership removal", async () => {
    const { ownerSession, otherSession, call } = await setup();
    const route = "/v1/account/applications";

    const wrongSecret = await call(ownerSession.sessionToken, "POST", route, {
      origin,
      appId,
      appSecret: "wrong-secret-0123456789",
    });
    expect(wrongSecret.statusCode).toBe(403);
    expect(wrongSecret.json()).toMatchObject({ error: { code: "APPLICATION_SECRET_REJECTED" } });

    const wrongId = await call(ownerSession.sessionToken, "POST", route, {
      origin,
      appId: "app_wrong_fixture_001",
      appSecret: secret,
    });
    expect(wrongId.statusCode).toBe(409);
    expect(wrongId.json()).toMatchObject({ error: { code: "APPLICATION_ID_MISMATCH" } });

    expect((await call(ownerSession.sessionToken, "POST", route, { origin, appId, appSecret: secret })).statusCode).toBe(200);
    expect((await call(ownerSession.sessionToken, "DELETE", route + "/" + encodeURIComponent(appId))).json())
      .toEqual({ appId, owned: false });
    expect((await call(ownerSession.sessionToken, "GET", route)).json()).toEqual({ applications: [] });

    const claimed = await call(otherSession.sessionToken, "POST", route, { origin, appId, appSecret: secret });
    expect(claimed.statusCode).toBe(200);
    expect((await call(otherSession.sessionToken, "GET", route)).json().applications).toHaveLength(1);
  });

  it("rejects manifest URLs that escape the verified Origin", async () => {
    const { ownerSession, call, app } = await setup();
    await app.close();
    const authDir = mkdtempSync(join(tmpdir(), "mira-app-origin-mismatch-"));
    const auth = createTestAuth(join(authDir, "auth.sqlite"));
    await auth.service.provisionAccount("owner2", password);
    const session = await auth.service.login("owner2", password, "127.0.0.3");
    const badManifest = {
      ...manifest,
      oauth: { ...manifest.oauth, redirectUris: ["https://evil.example/callback"] },
    };
    const transport: ApplicationRegistrationTransport = {
      get: async () => ({ status: 200, body: badManifest }),
      post: async () => ({ status: 200, body: { ok: true, appId } }),
    };
    const badApp = buildApp({ db: auth.db, authService: auth.service, applicationRegistrationTransport: transport });
    try {
      const response = await badApp.inject({
        method: "POST",
        url: "/v1/account/applications",
        headers: { authorization: "Bearer " + session.sessionToken },
        payload: { origin, appId, appSecret: secret },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toMatch(/^APPLICATION_METADATA_ORIGIN_MISMATCH_/);
    } finally {
      await badApp.close();
      auth.db.close();
      rmSync(authDir, { recursive: true, force: true });
    }
    expect(call).toBeTypeOf("function");
  });
});
