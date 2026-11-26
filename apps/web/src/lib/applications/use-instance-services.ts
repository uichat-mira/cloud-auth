import { useCallback, useEffect, useRef, useState } from "react";
import type { ApplicationServiceCatalogEntry } from "@uichat-mira/cloud-auth-contracts";
import { useAuthSession } from "@/lib/auth/context";
import { ApplicationRequestError, createApplicationClient } from "@/lib/applications/client";

export interface InstanceServicesState {
  /** `null` until the first catalog read settles. */
  services: ApplicationServiceCatalogEntry[] | null;
  error: string;
  /** Re-read the catalog; used after a revoke to confirm the new state. */
  refresh: () => Promise<void>;
}

/**
 * Reads `GET /v1/application-services` for the signed-in account: the account's
 * real service grants. This is the only source for 关联服务 and for the overview
 * count — ownership, registration and static entry lists never feed it.
 */
export function useInstanceServices(): InstanceServicesState {
  const { account, getSessionToken, invalidateSession } = useAuthSession();
  const [client] = useState(createApplicationClient);
  const [services, setServices] = useState<ApplicationServiceCatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const generation = useRef(0);

  /** Claims the next request identity, or `null` without a session token. */
  const claim = useCallback(() => {
    const token = getSessionToken();
    if (!token) return null;
    return { token, id: (generation.current += 1) };
  }, [getSessionToken]);

  const isCurrent = useCallback(
    (token: string, id: number) =>
      mounted.current && id === generation.current && token === getSessionToken(),
    [getSessionToken],
  );

  const read = useCallback(
    async (token: string) => {
      try {
        const result = await client.services(token);
        return result.services;
      } catch (failure) {
        if (failure instanceof ApplicationRequestError && failure.status === 401)
          invalidateSession(token);
        return null;
      }
    },
    [client, invalidateSession],
  );

  const refresh = useCallback(async () => {
    const ticket = claim();
    if (!ticket) return;
    const next = await read(ticket.token);
    if (!isCurrent(ticket.token, ticket.id)) return;
    if (next === null) setError("无法读取已授权的应用服务。");
    else {
      setServices(next);
      setError("");
    }
  }, [claim, isCurrent, read]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  useEffect(() => {
    const ticket = claim();
    if (!ticket) return;
    void read(ticket.token).then((next) => {
      if (!isCurrent(ticket.token, ticket.id)) return;
      if (next === null) setError("无法读取已授权的应用服务。");
      else {
        setServices(next);
        setError("");
      }
    });
  }, [account?.id, claim, isCurrent, read]);

  return { services, error, refresh };
}
