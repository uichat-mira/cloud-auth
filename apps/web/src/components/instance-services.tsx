import { useEffect, useRef, useState } from "react";
import type { ApplicationServiceCatalogEntry } from "@uichat-mira/cloud-auth-contracts";
import { useAuthSession } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { ApplicationRequestError, createApplicationClient } from "@/lib/applications/client";

export function InstanceServices() {
  const { account } = useAuthSession();
  return <InstanceServicesForAccount key={account?.id ?? "none"} />;
}

function InstanceServicesForAccount() {
  const { getSessionToken, invalidateSession } = useAuthSession();
  const [client] = useState(createApplicationClient);
  const [services, setServices] = useState<ApplicationServiceCatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const token = getSessionToken();
    const id = ++generation.current;
    if (token)
      void client
        .services(token)
        .then((result) => {
          if (mounted.current && id === generation.current && token === getSessionToken())
            setServices(result.services);
        })
        .catch((failure) => {
          if (!mounted.current || id !== generation.current || token !== getSessionToken()) return;
          if (failure instanceof ApplicationRequestError && failure.status === 401)
            invalidateSession(token);
          setError("无法读取已授权的应用服务。");
        });
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [client, getSessionToken, invalidateSession]);

  async function refresh() {
    const token = getSessionToken();
    if (!token) return;
    const id = ++generation.current;
    setError("");
    try {
      const result = await client.services(token);
      if (mounted.current && id === generation.current && token === getSessionToken())
        setServices(result.services);
    } catch (failure) {
      if (!mounted.current || id !== generation.current || token !== getSessionToken()) return;
      if (failure instanceof ApplicationRequestError && failure.status === 401)
        invalidateSession(token);
      setError("无法读取已授权的应用服务。");
    }
  }

  async function revoke(service: ApplicationServiceCatalogEntry, wholeApp: boolean) {
    if (
      busy ||
      !window.confirm(
        wholeApp
          ? "解除该应用的全部授权及登录会话？再次使用须主动登录。"
          : "撤销此服务授权？已签发的短期凭据可能在到期前仍有效。",
      )
    )
      return;
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (wholeApp) await client.revokeApplication(token, service.appId);
      else await client.revokeService(token, service);
      if (!mounted.current || token !== getSessionToken()) return;
      setNotice(wholeApp ? "应用授权已解除。" : "服务授权已撤销。");
      await refresh();
    } catch (failure) {
      if (!mounted.current || token !== getSessionToken()) return;
      if (failure instanceof ApplicationRequestError && failure.status === 401)
        invalidateSession(token);
      await refresh();
      if (mounted.current && token === getSessionToken())
        setError("撤权未确认成功，请核对最新授权状态。");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="console-section" aria-label="已授权应用服务">
      <div className="console-section-head">
        <div>
          <h2 className="font-semibold">已授权应用服务</h2>
          <p className="console-section-caption">
            来自你主动登录的应用实例，与应用所有权分开管理。
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
          刷新授权
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {services === null && !error && <p className="console-section-caption">正在读取授权…</p>}
      {services?.length === 0 && !error && (
        <p className="console-section-caption">尚无已授权应用服务。</p>
      )}
      {services?.map((service, index) => (
        <div
          className="cloud-row"
          key={JSON.stringify([service.appId, service.serviceId, service.resource])}
        >
          <span className="cloud-row-copy min-w-0">
            <strong>{service.name}</strong>
            <small className="break-all">
              {service.resource} · {service.appId}
            </small>
            <small>{service.scopes.join("、") || "无声明范围"}</small>
          </span>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" disabled={busy} onClick={() => void revoke(service, false)}>
              撤销服务
            </Button>
            {services.findIndex((item) => item.appId === service.appId) === index && (
              <Button variant="outline" disabled={busy} onClick={() => void revoke(service, true)}>
                解除应用授权
              </Button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
