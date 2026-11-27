import { useCallback, useEffect, useRef, useState } from "react";
import type { ApplicationServiceCatalogEntry } from "@uichat-mira/cloud-auth-contracts";
import { useAuthSession } from "@/lib/auth/context";
import { ApplicationRequestError, createApplicationClient } from "@/lib/applications/client";

export interface InstanceServicesState {
  services: ApplicationServiceCatalogEntry[] | null;
  error: string;
  refresh: () => Promise<void>;
}

/**
 * Read the account's real V1 application-service catalog. Requests are scoped by
 * generation and session token so stale responses cannot overwrite a newer
 * account/session, including StrictMode remounts and refresh-after-revoke.
 */
export function useInstanceServices(): InstanceServicesState {
  const { account, getSessionToken, invalidateSession } = useAuthSession();
  const [client] = useState(createApplicationClient);
  const [services, setServices] = useState<ApplicationServiceCatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const token = getSessionToken();
    if (!token) return;
    const id = ++generation.current;
    setError("");

    try {
      const result = await client.services(token);
      if (id !== generation.current || token !== getSessionToken()) return;
      setServices(result.services);
    } catch (failure) {
      if (id !== generation.current || token !== getSessionToken()) return;
      if (failure instanceof ApplicationRequestError && failure.status === 401)
        invalidateSession(token);
      setError("无法读取已授权的应用服务。");
    }
  }, [client, getSessionToken, invalidateSession]);

  useEffect(() => {
    const token = getSessionToken();
    if (!token) return;

    const id = ++generation.current;
    let cancelled = false;
    setServices(null);
    setError("");

    void client
      .services(token)
      .then((result) => {
        if (cancelled || id !== generation.current || token !== getSessionToken()) return;
        setServices(result.services);
      })
      .catch((failure) => {
        if (cancelled || id !== generation.current || token !== getSessionToken()) return;
        if (failure instanceof ApplicationRequestError && failure.status === 401)
          invalidateSession(token);
        setError("无法读取已授权的应用服务。");
      });

    return () => {
      cancelled = true;
      if (generation.current === id) generation.current += 1;
    };
  }, [account?.id, client, getSessionToken, invalidateSession]);

  return { services, error, refresh };
}
