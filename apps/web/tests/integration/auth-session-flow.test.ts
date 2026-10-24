import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createCloudAuthClient } from "@/lib/auth/client";
import type {
  PersistedCloudSession,
  SessionStorageAdapter,
} from "@/lib/auth/session-storage";
import { createAuthStore, type AuthStore } from "@/lib/auth/store";

const account = { id: "account-1", username: "pilot" };
const expiresAt = "2026-11-01T00:00:00.000Z";
const password = "correct horse battery staple";

const servers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function createMemoryStorage(initial: PersistedCloudSession | null = null) {
  let current = initial;
  return {
    load: () => current,
    save: (session: PersistedCloudSession) => {
      current = session;
    },
    clear: () => {
      current = null;
    },
  } satisfies SessionStorageAdapter;
}

type LogoutFailure = "none" | "reauth" | "busy" | "malformed";

async function startAuthServer() {
  let activeToken: string | null = null;
  let tokenSequence = 0;
  let unavailable = false;
  let logoutFailure: LogoutFailure = "none";
  const requests: string[] = [];

  const server = createServer(async (request, response) => {
    requests.push(`${request.method ?? "GET"} ${request.url ?? "/"}`);

    if (unavailable) {
      sendAuthError(response, 503, "AUTH_BUSY", "Authentication is temporarily busy");
      return;
    }

    if (request.method === "POST" && request.url === "/v1/auth/login") {
      const body = await readJson(request);
      if (body.username !== "pilot" || body.password !== password) {
        sendAuthError(response, 401, "AUTH_INVALID_CREDENTIALS", "Invalid account or password");
        return;
      }

      tokenSequence += 1;
      activeToken = `mcs_v1.session-${tokenSequence}.secret`;
      sendJson(response, 200, {
        sessionToken: activeToken,
        account,
        expiresAt,
      });
      return;
    }

    const token = bearerToken(request);
    if (!token || token !== activeToken) {
      sendAuthError(response, 401, "AUTH_REAUTH_REQUIRED", "Re-authentication is required");
      return;
    }

    if (request.method === "GET" && request.url === "/v1/auth/session") {
      sendJson(response, 200, { account, expiresAt });
      return;
    }

    if (request.method === "POST" && request.url === "/v1/auth/session/renew") {
      tokenSequence += 1;
      activeToken = `mcs_v1.session-${tokenSequence}.secret`;
      sendJson(response, 200, {
        sessionToken: activeToken,
        account,
        expiresAt,
      });
      return;
    }

    if (request.method === "POST" && request.url === "/v1/auth/logout") {
      if (logoutFailure === "reauth") {
        sendAuthError(response, 401, "AUTH_REAUTH_REQUIRED", "Re-authentication is required");
        return;
      }
      if (logoutFailure === "busy") {
        sendAuthError(response, 503, "AUTH_BUSY", "Authentication is temporarily busy");
        return;
      }
      if (logoutFailure === "malformed") {
        sendJson(response, 200, { unexpected: true });
        return;
      }

      activeToken = null;
      response.writeHead(204);
      response.end();
      return;
    }

    sendAuthError(response, 404, "AUTH_INTERNAL_ERROR", "Not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock auth server did not expose a TCP port");
  }

  const handle = {
    url: `http://127.0.0.1:${address.port}`,
    setUnavailable(value: boolean) {
      unavailable = value;
    },
    setLogoutFailure(value: LogoutFailure) {
      logoutFailure = value;
    },
    requests,
    async close() {
      if (!server.listening) return;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
  servers.push(handle);
  return handle;
}

type AuthServer = Awaited<ReturnType<typeof startAuthServer>>;

interface AuthHarness {
  server: AuthServer;
  storage: ReturnType<typeof createMemoryStorage>;
  store: AuthStore;
  issued: PersistedCloudSession;
}

async function createAuthenticatedHarness(): Promise<AuthHarness> {
  const server = await startAuthServer();
  const storage = createMemoryStorage();
  const store = createAuthStore({
    client: createCloudAuthClient({ baseUrl: server.url }),
    storage,
  });

  await store.getState().login("pilot", password);
  const issued = storage.load();
  if (!issued) throw new Error("Expected login to persist a Cloud Session");

  return { server, storage, store, issued };
}

function expectAuthenticated(
  store: AuthStore,
  failureKind: string | null = null,
): void {
  expect(store.getState()).toMatchObject({
    status: "authenticated",
    account,
    expiresAt,
    pending: null,
    failure: failureKind ? { kind: failureKind } : null,
  });
}

function expectLoggedOut(store: AuthStore): void {
  expect(store.getState()).toMatchObject({
    status: "unauthenticated",
    account: null,
    expiresAt: null,
    failure: null,
    pending: null,
  });
}

describe("web Cloud Session flow with a mocked HTTP boundary", () => {
  it("logs in, restores, renews, and logs out through the client and store", async () => {
    const { server, storage, store } = await createAuthenticatedHarness();

    expectAuthenticated(store);
    expect(storage.load()).toEqual({
      sessionToken: "mcs_v1.session-1.secret",
      expiresAt,
    });

    await store.getState().restore();
    expectAuthenticated(store);

    await store.getState().renew();
    expectAuthenticated(store);
    expect(storage.load()).toEqual({
      sessionToken: "mcs_v1.session-2.secret",
      expiresAt,
    });

    await store.getState().logout();
    expectLoggedOut(store);
    expect(storage.load()).toBeNull();
    expect(server.requests).toEqual([
      "POST /v1/auth/login",
      "GET /v1/auth/session",
      "POST /v1/auth/session/renew",
      "POST /v1/auth/logout",
    ]);
  });

  it("clears the local session when logout returns explicit re-authentication required", async () => {
    const { server, storage, store } = await createAuthenticatedHarness();

    server.setLogoutFailure("reauth");
    await store.getState().logout();

    expectLoggedOut(store);
    expect(storage.load()).toBeNull();
  });

  it("preserves the local session on a 503 logout and allows retrying", async () => {
    const { server, storage, store, issued } = await createAuthenticatedHarness();

    server.setLogoutFailure("busy");
    await store.getState().logout();

    expectAuthenticated(store, "service_unavailable");
    expect(storage.load()).toEqual(issued);

    server.setLogoutFailure("none");
    await store.getState().logout();

    expectLoggedOut(store);
    expect(storage.load()).toBeNull();
  });

  it("preserves the local session when logout returns a malformed response", async () => {
    const { server, storage, store, issued } = await createAuthenticatedHarness();

    server.setLogoutFailure("malformed");
    await store.getState().logout();

    expectAuthenticated(store, "malformed_response");
    expect(storage.load()).toEqual(issued);
  });

  it("preserves the local session when logout has a network failure", async () => {
    const { server, storage, store, issued } = await createAuthenticatedHarness();

    await server.close();
    await store.getState().logout();

    expectAuthenticated(store, "network_unavailable");
    expect(storage.load()).toEqual(issued);
  });

  it("preserves the local session when restore hits transient unavailability", async () => {
    const { server, storage, store, issued } = await createAuthenticatedHarness();

    server.setUnavailable(true);
    await store.getState().restore();

    expect(store.getState()).toMatchObject({
      status: "unavailable",
      failure: { kind: "service_unavailable" },
      pending: null,
    });
    expect(storage.load()).toEqual(issued);

    server.setUnavailable(false);
    await store.getState().restore();
    expectAuthenticated(store);
    expect(storage.load()).toEqual(issued);
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

function sendAuthError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  sendJson(response, status, { error: { code, message } });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
