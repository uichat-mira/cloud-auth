import type {
  AccountIdentity,
  CloudSession,
} from "@uichat-mira/cloud-auth-contracts";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { CloudAuthClient } from "./client";
import {
  createAuthFailure,
  toAuthFailure,
  type AuthFailure,
} from "./errors";
import type { SessionStorageAdapter } from "./session-storage";

export type AuthStatus =
  | "idle"
  | "restoring"
  | "authenticated"
  | "unauthenticated"
  | "unavailable";

export type AuthOperation = "login" | "restore" | "renew" | "logout";

export interface AuthStoreState {
  status: AuthStatus;
  account: AccountIdentity | null;
  expiresAt: string | null;
  failure: AuthFailure | null;
  pending: AuthOperation | null;
  login(username: string, password: string): Promise<void>;
  restore(): Promise<void>;
  renew(): Promise<void>;
  logout(): Promise<void>;
  clearFailure(): void;
}

export interface AuthStoreDependencies {
  client: CloudAuthClient;
  storage: SessionStorageAdapter;
}

export type AuthStore = StoreApi<AuthStoreState>;

export function createAuthStore({
  client,
  storage,
}: AuthStoreDependencies): AuthStore {
  return createStore<AuthStoreState>((set, get) => ({
    status: "idle",
    account: null,
    expiresAt: null,
    failure: null,
    pending: null,

    async login(username, password) {
      if (get().pending !== null) return;
      set({ pending: "login", failure: null });

      try {
        const issued = await client.login({ username, password });
        applySession(set, storage, issued.sessionToken, issued);
      } catch (error) {
        const failure = toAuthFailure(error);
        set((state) => ({
          status:
            state.status === "authenticated" ? state.status : "unauthenticated",
          failure,
          pending: null,
        }));
      }
    },

    async restore() {
      if (get().pending !== null) return;

      const persisted = storage.load();
      if (!persisted) {
        setUnauthenticated(set);
        return;
      }

      set({ status: "restoring", pending: "restore", failure: null });

      await runSessionOperation(set, storage, async () => {
        const session = await client.getSession(persisted.sessionToken);
        return { sessionToken: persisted.sessionToken, session };
      });
    },

    async renew() {
      if (get().pending !== null) return;

      const persisted = storage.load();
      if (!persisted) {
        setUnauthenticated(set, createAuthFailure("reauth_required"));
        return;
      }

      set({ pending: "renew", failure: null });

      await runSessionOperation(set, storage, async () => {
        const issued = await client.renewSession(persisted.sessionToken);
        return { sessionToken: issued.sessionToken, session: issued };
      });
    },

    async logout() {
      if (get().pending === "logout") return;

      const persisted = storage.load();
      set({ pending: "logout", failure: null });

      if (!persisted) {
        clearLocalSession(set, storage);
        return;
      }

      try {
        await client.logout(persisted.sessionToken);
      } catch (error) {
        const failure = toAuthFailure(error);

        if (failure.kind !== "reauth_required") {
          set({ failure, pending: null });
          return;
        }
      }

      clearLocalSession(set, storage);
    },

    clearFailure() {
      set({ failure: null });
    },
  }));
}

async function runSessionOperation(
  set: StoreApi<AuthStoreState>["setState"],
  storage: SessionStorageAdapter,
  operation: () => Promise<{ sessionToken: string; session: CloudSession }>,
): Promise<void> {
  try {
    const { sessionToken, session } = await operation();
    applySession(set, storage, sessionToken, session);
  } catch (error) {
    applySessionFailure(set, storage, error);
  }
}

function setUnauthenticated(
  set: StoreApi<AuthStoreState>["setState"],
  failure: AuthFailure | null = null,
): void {
  set({
    status: "unauthenticated",
    account: null,
    expiresAt: null,
    failure,
    pending: null,
  });
}

function applySession(
  set: StoreApi<AuthStoreState>["setState"],
  storage: SessionStorageAdapter,
  sessionToken: string,
  session: CloudSession,
): void {
  storage.save({
    sessionToken,
    expiresAt: session.expiresAt,
  });
  set({
    status: "authenticated",
    account: session.account,
    expiresAt: session.expiresAt,
    failure: null,
    pending: null,
  });
}

function clearLocalSession(
  set: StoreApi<AuthStoreState>["setState"],
  storage: SessionStorageAdapter,
): void {
  storage.clear();
  setUnauthenticated(set);
}

function applySessionFailure(
  set: StoreApi<AuthStoreState>["setState"],
  storage: SessionStorageAdapter,
  error: unknown,
): void {
  const failure = toAuthFailure(error);

  if (failure.kind === "reauth_required") {
    storage.clear();
    setUnauthenticated(set, failure);
    return;
  }

  set({ status: "unavailable", failure, pending: null });
}
