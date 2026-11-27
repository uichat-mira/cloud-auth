import { useState } from "react";
import type { ApplicationServiceCatalogEntry } from "@uichat-mira/cloud-auth-contracts";
import { useAuthSession } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Section, SectionHead } from "@/components/ui/section";
import { ApplicationRequestError, createApplicationClient } from "@/lib/applications/client";
import { useInstanceServices } from "@/lib/applications/use-instance-services";

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

/**
 * Real account authorizations from the V1 catalog. The visual treatment comes
 * from the Mira ID redesign, while application identity/grouping follows the
 * current V1 contract.
 */
export function InstanceServices() {
  const { account } = useAuthSession();
  return <InstanceServicesForAccount key={account?.id ?? "none"} />;
}

function InstanceServicesForAccount() {
  const { getSessionToken, invalidateSession } = useAuthSession();
  const { services, error: readError, refresh } = useInstanceServices();
  const [client] = useState(createApplicationClient);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const failure = error || readError;
  const applications = services ? groupByApplication(services) : null;

  async function performRevocation(
    confirmText: string,
    action: (token: string) => Promise<unknown>,
    successNotice: string,
  ) {
    if (busy || !window.confirm(confirmText)) return;
    const token = getSessionToken();
    if (!token) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action(token);
      if (token !== getSessionToken()) return;
      setNotice(successNotice);
      await refresh();
    } catch (failure) {
      if (token !== getSessionToken()) return;
      if (failure instanceof ApplicationRequestError && failure.status === 401)
        invalidateSession(token);
      await refresh();
      if (token === getSessionToken()) setError("撤权未确认成功，请核对最新授权状态。");
    } finally {
      setBusy(false);
    }
  }

  function revokeService(service: ApplicationServiceCatalogEntry) {
    return performRevocation(
      "撤销“" + service.name + "”服务授权？已签发的短期凭据可能在到期前仍有效。",
      (token) => client.revokeService(token, service),
      "服务授权已撤销。",
    );
  }

  function revokeApplication(application: ApplicationAuthorization) {
    return performRevocation(
      "解除“" + application.appName + "”的全部授权及登录会话？再次使用须主动登录。",
      (token) => client.revokeApplication(token, application.appId),
      "应用授权已解除。",
    );
  }

  return (
    <Section labelledBy="authorized-services">
      <SectionHead
        id="authorized-services"
        title="已授权应用服务"
        caption="来自你主动登录的应用实例，与应用所有权分开管理。撤销后不再出现在这里。"
        action={
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
            刷新授权
          </Button>
        }
      />

      {failure && <Notice tone="danger">{failure}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {applications === null && !failure && (
        <p className="console-section-caption">正在读取授权…</p>
      )}
      {applications?.length === 0 && !failure && (
        <p className="console-section-caption">
          尚无已授权应用服务。在你的应用里主动 OAuth 登录 Mira ID 后，授权会出现在这里。
        </p>
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
    </Section>
  );
}
