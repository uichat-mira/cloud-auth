import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import { createCloudAuthClient } from "./client";
import { createBrowserSessionStorage } from "./session-storage";
import { createAuthStore, type AuthStore, type AuthStoreState } from "./store";

const AuthStoreContext = createContext<AuthStore | null>(null);

export function AuthProvider({
  children,
  store,
}: {
  children: ReactNode;
  store?: AuthStore;
}) {
  const [defaultStore] = useState<AuthStore | null>(() =>
    store
      ? null
      : createAuthStore({
          client: createCloudAuthClient(),
          storage: createBrowserSessionStorage(),
        }),
  );
  const activeStore = store ?? defaultStore;

  if (!activeStore) {
    throw new Error("AuthProvider could not create an auth store");
  }

  const restore = useStore(activeStore, (state) => state.restore);
  const status = useStore(activeStore, (state) => state.status);
  const expiresAt = useStore(activeStore, (state) => state.expiresAt);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void restore();
  }, [restore]);

  // The backend remains authoritative for every request; this local deadline
  // prevents an already-expired session from leaving privileged UI interactive.
  useEffect(() => {
    if (status !== "authenticated" || !expiresAt) return;
    const deadline = Date.parse(expiresAt);
    if (!Number.isFinite(deadline)) return;
    const enforce = () => {
      if (Date.now() >= deadline) void activeStore.getState().getSessionToken();
    };
    enforce();
    const delay = Math.max(0, Math.min(deadline - Date.now(), 2_147_483_647));
    const timer = window.setTimeout(enforce, delay);
    window.addEventListener("focus", enforce);
    document.addEventListener("visibilitychange", enforce);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", enforce);
      document.removeEventListener("visibilitychange", enforce);
    };
  }, [activeStore, status, expiresAt]);

  return (
    <AuthStoreContext.Provider value={activeStore}>
      {children}
    </AuthStoreContext.Provider>
  );
}

export function useAuthSession(): AuthStoreState {
  return useStore(useAuthStore());
}

function useAuthStore(): AuthStore {
  const store = useContext(AuthStoreContext);
  if (!store) {
    throw new Error("useAuthSession must be used within AppProviders");
  }
  return store;
}
