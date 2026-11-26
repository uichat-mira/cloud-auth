import { useState } from "react";
import type { ApplicationServiceCatalogEntry } from "@uichat-mira/cloud-auth-contracts";
import { useAuthSession } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Section, SectionHead } from "@/components/ui/section";
import { ApplicationRequestError, createApplicationClient } from "@/lib/applications/client";
import { useInstanceServices } from "@/lib/applications/use-instance-services";

/**
 * The account's real service authorizations, read from `GET /v1/application-services`.
 * This list is the only source of truth for 关联服务: a service appears because a
 * successful application OAuth login produced an account grant, and disappears when
 * the grant is revoked. Nothing here is derived from ownership or a static list.
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
      if (token !== getSessionToken()) return;
      setNotice(wholeApp ? "应用授权已解除。" : "服务授权已撤销。");
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
      {services === null && !failure && <p className="console-section-caption">正在读取授权…</p>}
      {services?.length === 0 && !failure && (
        <p className="console-section-caption">
          尚无已授权应用服务。在你的应用里主动 OAuth 登录 Mira ID 后，授权会出现在这里。
        </p>
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
    </Section>
  );
}
