import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { RemoteDeviceScope } from "@uichat-mira/cloud-auth-contracts";
import { createCloudAuthClient } from "@/lib/auth/client";
import { createAuthStore } from "@/lib/auth/store";
import {
  createHostGrantsClient,
  HostGrantsError,
  type HostGrantsFailure,
} from "@/lib/grants/client";
import { createMemoryStorage } from "../helpers/session-storage";
import { account, expiresAt } from "../helpers/auth-fixtures";
import {
  activeMobileId,
  effectiveScopes,
  grantHostId,
  hostAvailable,
  mobileActive,
  policyScopes,
} from "../helpers/host-grants-fixtures";

const password = "correct horse battery staple";
const sessionToken = "mcs_v1.integration-1.secret";

const servers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

interface GrantFixtureState {
  revision: number;
  scopes: RemoteDeviceScope[];
  status: "active" | "revoked";
}

async function startGrantsBackend() {
  let activeToken: string | null = null;
  const state: GrantFixtureState = {
    revision: 4,
    scopes: [...effectiveScopes],
    status: "active",
  };
  const requests: string[] = [];

  const server = createServer(async (request, response) => {
    requests.push(`${request.method ?? "GET"} ${request.url ?? "/"}`);

    if (request.method === "POST" && request.url === "/v1/auth/login") {
      const body = await readJson(request);
      if (body.username !== "pilot" || body.password !== password) {
        sendAuthError(response, 401, "AUTH_INVALID_CREDENTIALS");
        return;
      }
      activeToken = sessionToken;
      sendJson(response, 200, { sessionToken, account, expiresAt });
      return;
    }

    const token = bearerToken(request);
    if (!token || token !== activeToken) {
      sendGrantError(response, 401, "HOST_GRANT_REAUTH_REQUIRED");
      return;
    }

    if (request.method === "GET" && request.url === "/v1/auth/session") {
      sendJson(response, 200, { account, expiresAt });
      return;
    }

    if (request.method === "GET" && request.url === "/v1/hosts/grant-management") {
      sendJson(response, 200, {
        hosts: [
          {
            host: {
              id: grantHostId,
              displayName: hostAvailable.displayName,
              clientVersion: hostAvailable.clientVersion,
              availability: "offline",
            },
            accountId: account.id,
            policyConfigured: true,
            policyScopes,
            revision: state.revision,
            grants: [
              {
                mobileDeviceId: activeMobileId,
                scopes: state.scopes,
                status: state.status,
              },
            ],
          },
        ],
      });
      return;
    }

    if (request.method === "GET" && request.url === "/v1/devices") {
      sendJson(response, 200, { devices: [mobileActive] });
      return;
    }

    const grantMatch = /^\/v1\/hosts\/([^/?]+)\/grants(?:\/([^/?]+))?(?:\?(.*))?$/.exec(
      request.url ?? "",
    );
    if (!grantMatch) {
      sendGrantError(response, 404, "HOST_GRANT_NOT_FOUND");
      return;
    }

    const [, hostId, mobileDeviceId, query] = grantMatch;
    if (hostId !== grantHostId) {
      sendGrantError(response, 404, "HOST_GRANT_NOT_FOUND");
      return;
    }

    if (mobileDeviceId !== activeMobileId) {
      sendGrantError(response, 404, "HOST_GRANT_NOT_FOUND");
      return;
    }

    if (request.method === "PATCH") {
      const body = await readJson(request);
      if (body.expectedRevision !== state.revision) {
        sendGrantError(response, 409, "HOST_GRANT_STALE_REVISION");
        return;
      }
      const requested = Array.isArray(body.scopes) ? (body.scopes as RemoteDeviceScope[]) : [];
      if (
        state.status === "revoked" ||
        !requested.every((scope) => policyScopes.includes(scope) && state.scopes.includes(scope))
      ) {
        sendGrantError(response, 403, "HOST_GRANT_NOT_ALLOWED");
        return;
      }
      state.revision += 1;
      state.scopes = requested;
      sendJson(response, 200, mutation(state));
      return;
    }

    if (request.method === "DELETE") {
      const expectedRevision = Number(new URLSearchParams(query ?? "").get("expectedRevision"));
      if (expectedRevision !== state.revision) {
        sendGrantError(response, 409, "HOST_GRANT_STALE_REVISION");
        return;
      }
      if (state.status !== "revoked") {
        state.revision += 1;
        state.status = "revoked";
        state.scopes = [];
      }
      sendJson(response, 200, mutation(state));
      return;
    }

    sendGrantError(response, 404, "HOST_GRANT_NOT_FOUND");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock grants backend did not expose a TCP port");
  }

  const handle = {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    expireSessions() {
      activeToken = null;
    },
    async close() {
      if (!server.listening) return;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
  servers.push(handle);
  return handle;
}

function mutation(state: GrantFixtureState) {
  return {
    hostId: grantHostId,
    mobileDeviceId: activeMobileId,
    revision: state.revision,
    scopes: state.scopes,
    status: state.status,
    updatedAt: "2026-10-25T12:01:00.000Z",
  };
}

async function captureFailure(action: Promise<unknown>): Promise<HostGrantsFailure> {
  try {
    await action;
  } catch (error) {
    expect(error).toBeInstanceOf(HostGrantsError);
    return (error as HostGrantsError).failure;
  }
  throw new Error("Expected the grants client to reject");
}

describe("Portal Host grants flow against a real mocked HTTP contract", () => {
  it("loads granted fixtures, narrows, rejects widening, detects stale revisions, and revokes", async () => {
    const backend = await startGrantsBackend();
    const storage = createMemoryStorage();
    const authStore = createAuthStore({
      client: createCloudAuthClient({ baseUrl: backend.url }),
      storage,
    });

    await authStore.getState().login("pilot", password);
    const token = storage.load()?.sessionToken;
    if (!token) throw new Error("Expected login to persist a Cloud Session");

    const grants = createHostGrantsClient({ baseUrl: backend.url });

    // A logged-out Host is still manageable through the durable Portal route;
    // no runtime /grants snapshot is needed to render or edit stored state.
    await expect(grants.listManagement(token)).resolves.toMatchObject([
      {
        host: { id: grantHostId, availability: "offline" },
        revision: 4,
        grants: [{ mobileDeviceId: activeMobileId, scopes: effectiveScopes }],
      },
    ]);

    await expect(grants.listDevices(token)).resolves.toEqual([mobileActive]);

    const initial = (await grants.listManagement(token))[0];
    expect(initial).toMatchObject({
      revision: 4,
      policyConfigured: true,
      grants: [
        {
          mobileDeviceId: activeMobileId,
          scopes: effectiveScopes,
          status: "active",
        },
      ],
    });

    const narrowed = await grants.narrowGrant(token, grantHostId, activeMobileId, {
      expectedRevision: 4,
      scopes: ["threads:read"],
    });
    expect(narrowed).toMatchObject({
      revision: 5,
      scopes: ["threads:read"],
      status: "active",
    });
    await expect(grants.listManagement(token)).resolves.toMatchObject([
      {
        revision: 5,
        grants: [
          {
            mobileDeviceId: activeMobileId,
            scopes: ["threads:read"],
            status: "active",
          },
        ],
      },
    ]);

    const widening = await captureFailure(
      grants.narrowGrant(token, grantHostId, activeMobileId, {
        expectedRevision: 5,
        scopes: ["threads:read", "tools:read"],
      }),
    );
    expect(widening.kind).toBe("forbidden");
    expect(widening.status).toBe(403);

    const stale = await captureFailure(
      grants.narrowGrant(token, grantHostId, activeMobileId, {
        expectedRevision: 4,
        scopes: ["threads:read"],
      }),
    );
    expect(stale.kind).toBe("stale_revision");
    expect(stale.status).toBe(409);

    const revoked = await grants.revokeGrant(token, grantHostId, activeMobileId, 5);
    expect(revoked).toMatchObject({
      revision: 6,
      scopes: [],
      status: "revoked",
    });
    await expect(grants.listManagement(token)).resolves.toMatchObject([
      {
        revision: 6,
        grants: [{ scopes: [], status: "revoked" }],
      },
    ]);

    expect(backend.requests).toContain(
      "PATCH /v1/hosts/11111111-1111-4111-8111-111111111111/grants/22222222-2222-4222-8222-222222222222",
    );
    expect(backend.requests).toContain(
      "DELETE /v1/hosts/11111111-1111-4111-8111-111111111111/grants/22222222-2222-4222-8222-222222222222?expectedRevision=5",
    );
  });

  it("keeps cross-account Hosts hidden and does not log the user out on grants 401", async () => {
    const backend = await startGrantsBackend();
    const storage = createMemoryStorage();
    const authStore = createAuthStore({
      client: createCloudAuthClient({ baseUrl: backend.url }),
      storage,
    });

    await authStore.getState().login("pilot", password);
    const token = storage.load()?.sessionToken;
    if (!token) throw new Error("Expected login to persist a Cloud Session");

    const grants = createHostGrantsClient({ baseUrl: backend.url });

    const foreignHost = await captureFailure(
      grants.narrowGrant(token, "99999999-9999-4999-8999-999999999999", activeMobileId, {
        expectedRevision: 4,
        scopes: ["threads:read"],
      }),
    );
    expect(foreignHost.kind).toBe("not_found");
    expect(foreignHost.status).toBe(404);

    backend.expireSessions();
    const expired = await captureFailure(grants.listManagement(token));
    expect(expired.kind).toBe("reauth_required");
    expect(expired.status).toBe(401);

    expect(authStore.getState().status).toBe("authenticated");
    expect(storage.load()?.sessionToken).toBe(token);
  });
});

function bearerToken(request: IncomingMessage): string | null {
  const authorization = request.headers.authorization;
  const match = authorization ? /^Bearer\s+(.+)$/i.exec(authorization) : null;
  return match?.[1] ?? null;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendAuthError(response: ServerResponse, status: number, code: string): void {
  sendJson(response, status, {
    error: { code, message: "Portal integration auth error" },
  });
}

function sendGrantError(response: ServerResponse, status: number, code: string): void {
  sendJson(response, status, {
    error: { code, message: "Portal integration grant error" },
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
