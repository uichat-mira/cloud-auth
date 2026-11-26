import { useEffect, useRef, useState } from "react";
import type { ApplicationServiceCatalogEntry } from "@uichat-mira/cloud-auth-contracts";
import { useAuthSession } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { ApplicationRequestError, createApplicationClient } from "@/lib/applications/client";

type ApplicationAuthorization = {
  appId: string;
  appName: string;
  projectId: string;
  services: ApplicationServiceCatalogEntry[];
};

function groupByApplication(
  services: ApplicationServiceCatalogEntry[],
): ApplicationAuthorization[] {
  const groups = new Map<string, ApplicationAuthorization>();
  for (const service of services) {
    const current = groups.get(service.appId);
    if (current) {
      current.services.push(service);
      continue;
    }
    groups.set(service.appId, {
      appId: service.appId,
      appName: service.appName,
      projectId: service.projectId,
      services: [service],
    });
  }
  return [...groups.values()];
}

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

  async function revokeService(service: ApplicationServiceCatalogEntry) {
    if (
      busy ||
      !window.confirm("撤销“" + service.name + "”服务授权？已签发的短期凭据可能在到期前仍有效。")
    )
      return;
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await client.revokeService(token, service);
      if (!mounted.current || token !== getSessionToken()) return;
      setNotice("服务授权已撤销。");
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

  async function revokeApplication(application: ApplicationAuthorization) {
    if (
      busy ||
      !window.confirm("解除“" + application.appName + "”的全部授权及登录会话？再次使用须主动登录。")
    )
      return;
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await client.revokeApplication(token, application.appId);
      if (!mounted.current || token !== getSessionToken()) return;
      setNotice("应用授权已解除。");
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

  const applications = services ? groupByApplication(services) : null;

  return (
    <section className="console-section" aria-label="已授权应用">
      <div className="console-section-head">
        <div>
          <h2 className="font-semibold">已授权应用</h2>
          <p className="console-section-caption">
            来自你主动登录的应用实例；应用授权与“我的应用”所有权分开管理。
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
          刷新授权
        </Button>
      </div>
      {error && (
        <p role="alert" className="cloud-notice">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="cloud-notice cloud-notice-success">
          {notice}
        </p>
      )}
      {applications === null && !error && <p className="console-section-caption">正在读取授权…</p>}
      {applications?.length === 0 && !error && (
        <p className="console-section-caption">尚无已授权应用。</p>
      )}
      {applications?.map((application) => (
        <section
          className="cloud-application-group"
          aria-label={"应用授权 " + application.appName + " " + application.appId}
          key={application.appId}
        >
          <div className="cloud-application-group-head">
            <div className="min-w-0">
              <h3>{application.appName}</h3>
              <p className="console-section-caption break-all">
                {application.projectId} · {application.appId}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void revokeApplication(application)}
            >
              解除应用授权
            </Button>
          </div>

          <div className="cloud-application-service-list">
            {application.services.map((service) => (
              <div
                className="cloud-service-row"
                key={JSON.stringify([service.appId, service.serviceId, service.resource])}
              >
                <div className="cloud-service-row-head">
                  <span className="cloud-service-name">{service.name}</span>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void revokeService(service)}
                  >
                    撤销服务
                  </Button>
                </div>
                {service.description ? (
                  <p className="cloud-service-description">{service.description}</p>
                ) : null}
                <p className="cloud-service-detail break-all">
                  {service.protocol.name} · {service.protocol.version} · {service.resource}
                </p>
                <p className="cloud-service-detail">
                  {service.scopes.length
                    ? "授权范围：" + service.scopes.join("、")
                    : "未声明授权范围"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
