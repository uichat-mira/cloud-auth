import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  createHostGrantsClient,
  type HostGrantsClient,
} from "./client";

const HostGrantsClientContext = createContext<HostGrantsClient | null>(null);

export function HostGrantsProvider({
  children,
  client,
}: {
  children: ReactNode;
  client?: HostGrantsClient;
}) {
  const value = useMemo(
    () => client ?? createHostGrantsClient(),
    [client],
  );

  return (
    <HostGrantsClientContext.Provider value={value}>
      {children}
    </HostGrantsClientContext.Provider>
  );
}

export function useHostGrantsClient(): HostGrantsClient {
  const client = useContext(HostGrantsClientContext);
  if (!client) {
    throw new Error("useHostGrantsClient must be used within HostGrantsProvider");
  }
  return client;
}
