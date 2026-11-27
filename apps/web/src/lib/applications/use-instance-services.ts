import { useCallback, useEffect, useRef, useState } from "react";
import type { ApplicationServiceCatalogEntry } from "@uichat-mira/cloud-auth-contracts";
import { useAuthSession } from "@/lib/auth/context";
import { ApplicationRequestError, createApplicationClient } from "@/lib/applications/client";

export interface InstanceServicesState {
  services: ApplicationServiceCatalogEntry[] | null;
  error: string;
  refresh: () => Promise<void>;
}

type CatalogState = {
  accountId: string | null;
  services: ApplicationServiceCatalogEntry[] | null;
  error: string;
};

/**
 * Read the account's real V1 application-service catalog. Requests are scoped by
 * generation, account and session token so stale responses cannot overwrite a
 * newer account/session, including StrictMode remounts and refresh-after-revoke.
 */
export function useInstanceServices(): InstanceServicesState {
  const { account, getSessionToken, invalidateSession } = useAuthSession();
  const [client] = useState(createApplicationClient);
  const [state, setState] = useState<CatalogState>({
    accountId: null,
    services: null,
    error: "",
  });
  const generation = useRef(0);
  const accountId = account?.id ?? null;

  const refresh = useCallback(async () => {
    const token = getSessionToken();
    if (!token) return;
    const id = ++generation.current;
    const targetAccountId = accountId;

    try {
      const result = await client.services(token);
      if (id !== generation.current || token !== getSessionToken()) return;
      setState({ accountId: targetAccountId, services: result.services, error: "" });
    } catch (failure) {
      if (id !== generation.current || token !== getSessionToken()) return;
      if (failure instanceof ApplicationRequestError && failure.status === 401)
        invalidateSession(token);
      setState({
        accountId: targetAccountId,
        services: null,
        error: "无法读取已授权的应用服务。",
      });
    }
  }, [accountId, client, getSessionToken, invalidateSession]);

  useEffect(() => {
    const token = getSessionToken();
    if (!token) return;

    const id = ++generation.current;
    const targetAccountId = accountId;
    let cancelled = false;

    void client
      .services(token)
      .then((result) => {
        if (cancelled || id !== generation.current || token !== getSessionToken()) return;
        setState({ accountId: targetAccountId, services: result.services, error: "" });
      })
      .catch((failure) => {
        if (cancelled || id !== generation.current || token !== getSessionToken()) return;
        if (failure instanceof ApplicationRequestError && failure.status === 401)
          invalidateSession(token);
        setState({
          accountId: targetAccountId,
          services: null,
          error: "无法读取已授权的应用服务。",
        });
      });

    return () => {
      cancelled = true;
      if (generation.current === id) generation.current += 1;
    };
  }, [accountId, client, getSessionToken, invalidateSession]);

  return state.accountId === accountId
    ? { services: state.services, error: state.error, refresh }
    : { services: null, error: "", refresh };
}
