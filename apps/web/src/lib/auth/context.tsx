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
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void restore();
  }, [restore]);

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
