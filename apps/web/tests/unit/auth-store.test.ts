import { describe, expect, it } from "vitest";
import type { CloudSession } from "@uichat-mira/cloud-auth-contracts";
import type { CloudAuthClient } from "@/lib/auth/client";
import { CloudAuthError, createAuthFailure } from "@/lib/auth/errors";
import type { PersistedCloudSession } from "@/lib/auth/session-storage";
import { createMemoryStorage } from "../helpers/session-storage";
import {
  account,
  expiresAt,
  expectLoggedOutState,
  expectUnavailableState,
  issuedSession,
} from "../helpers/auth-fixtures";
import { createAuthStore, type AuthStore } from "@/lib/auth/store";

function cloudSession(): CloudSession {
  return { account, expiresAt };
}

function createClient(overrides: Partial<CloudAuthClient> = {}): CloudAuthClient {
  return {
    login: async () => issuedSession("token-1"),
    getSession: async () => cloudSession(),
    renewSession: async () => issuedSession("token-2"),
    logout: async () => undefined,
    ...overrides,
  };
}

async function createAuthenticatedLogoutStore(
  logout: CloudAuthClient["logout"] = async () => undefined,
): Promise<{
  store: AuthStore;
  storage: ReturnType<typeof createMemoryStorage>;
  stored: PersistedCloudSession;
}> {
  const storage = createMemoryStorage();
  const store = createAuthStore({
    client: createClient({ logout }),
    storage,
  });

  await store.getState().login("pilot", "password");
  const stored = storage.load();
  if (!stored) throw new Error("Expected login to persist a Cloud Session");

  return { store, storage, stored };
}

function createRestoreFailureStore(
  storage: ReturnType<typeof createMemoryStorage>,
  kind: "reauth_required" | "service_unavailable",
): AuthStore {
  return createAuthStore({
    client: createClient({
      getSession: async () => {
        throw new CloudAuthError(createAuthFailure(kind));
      },
    }),
    storage,
  });
}

describe("auth store", () => {
  it("stores the issued session after login without exposing token in state", async () => {
    const storage = createMemoryStorage();
    const store = createAuthStore({ client: createClient(), storage });

    await store.getState().login("pilot", "correct horse battery staple");

    expect(store.getState()).toMatchObject({
      status: "authenticated",
      account,
      expiresAt,
      failure: null,
      pending: null,
    });
    expect(storage.load()).toEqual({ sessionToken: "token-1", expiresAt });
    expect(JSON.stringify(store.getState())).not.toContain("token-1");
  });

  it("keeps a stable failure state for invalid credentials", async () => {
    const storage = createMemoryStorage();
    const store = createAuthStore({
      client: createClient({
        login: async () => {
          throw new CloudAuthError(createAuthFailure("invalid_credentials"));
        },
      }),
      storage,
    });

    await store.getState().login("pilot", "wrong");

    expect(store.getState()).toMatchObject({
      status: "unauthenticated",
      account: null,
      pending: null,
      failure: { kind: "invalid_credentials", message: "账号或密码不正确。" },
    });
    expect(storage.load()).toBeNull();
  });

  it("clears the stored session when restore returns 401", async () => {
    const storage = createMemoryStorage({
      sessionToken: "token-1",
      expiresAt,
    });
    const store = createRestoreFailureStore(storage, "reauth_required");

    await store.getState().restore();

    expect(store.getState()).toMatchObject({
      status: "unauthenticated",
      account: null,
      failure: { kind: "reauth_required" },
      pending: null,
    });
    expect(storage.load()).toBeNull();
  });

  it("preserves the stored session when restore is transiently unavailable", async () => {
    const stored = { sessionToken: "token-1", expiresAt };
    const storage = createMemoryStorage(stored);
    const store = createRestoreFailureStore(storage, "service_unavailable");

    await store.getState().restore();

    expectUnavailableState(store);
    expect(storage.load()).toEqual(stored);
  });

  it("rotates the stored token after renewal", async () => {
    const storage = createMemoryStorage({
      sessionToken: "token-1",
      expiresAt,
    });
    const store = createAuthStore({ client: createClient(), storage });

    await store.getState().renew();

    expect(store.getState()).toMatchObject({
      status: "authenticated",
      account,
      expiresAt,
      notice: "session_renewed",
    });
    expect(storage.load()).toEqual({ sessionToken: "token-2", expiresAt });
  });

  it("clears the stored session after an explicit logout", async () => {
    let logoutToken: string | null = null;
    const { store, storage } = await createAuthenticatedLogoutStore(async (token) => {
      logoutToken = token;
    });

    await store.getState().logout();

    expect(logoutToken).toBe("token-1");
    expectLoggedOutState(store);
    expect(storage.load()).toBeNull();
  });

  it("clears the stored session when logout reports re-authentication required", async () => {
    const { store, storage } = await createAuthenticatedLogoutStore(async () => {
      throw new CloudAuthError(
        createAuthFailure("reauth_required", {
          status: 401,
          code: "AUTH_REAUTH_REQUIRED",
        }),
      );
    });

    await store.getState().logout();

    expectLoggedOutState(store);
    expect(storage.load()).toBeNull();
  });

  it.each([
    "network_unavailable",
    "service_unavailable",
    "malformed_response",
    "unexpected_response",
  ] as const)(
    "preserves the stored session and surfaces a retryable failure when logout fails with %s",
    async (kind) => {
      const failure = createAuthFailure(kind);
      const { store, storage, stored } = await createAuthenticatedLogoutStore(
        async () => {
          throw new CloudAuthError(failure);
        },
      );

      await store.getState().logout();

      expect(store.getState()).toMatchObject({
        status: "authenticated",
        account,
        expiresAt,
        pending: null,
        failure,
      });
      expect(storage.load()).toEqual(stored);
    },
  );

  it("turns malformed and rate-limited failures into stable state", async () => {
    const malformedStore = createAuthStore({
      client: createClient({
        login: async () => {
          throw new CloudAuthError(createAuthFailure("malformed_response"));
        },
      }),
      storage: createMemoryStorage(),
    });
    await malformedStore.getState().login("pilot", "password");

    expect(malformedStore.getState().failure?.kind).toBe("malformed_response");

    const rateLimitedStore = createAuthStore({
      client: createClient({
        login: async () => {
          throw new CloudAuthError(
            createAuthFailure("rate_limited", { retryAfterSeconds: 15 }),
          );
        },
      }),
      storage: createMemoryStorage(),
    });
    await rateLimitedStore.getState().login("pilot", "password");

    expect(rateLimitedStore.getState().failure).toMatchObject({
      kind: "rate_limited",
      retryAfterSeconds: 15,
    });
  });
});
