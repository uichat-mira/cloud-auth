import { createContext, useContext, type ReactNode } from "react";

export interface PlaceholderSession {
  readonly status: "unauthenticated";
  readonly account: null;
}

const placeholderSession: PlaceholderSession = {
  status: "unauthenticated",
  account: null,
};

const SessionContext = createContext<PlaceholderSession | null>(null);

export function SessionPlaceholderProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={placeholderSession}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionPlaceholder(): PlaceholderSession {
  const session = useContext(SessionContext);

  if (!session) {
    throw new Error("useSessionPlaceholder must be used within AppProviders");
  }

  return session;
}
