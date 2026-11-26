import { Link } from "react-router-dom";
import { Facts } from "@/components/ui/facts";
import { PageHead } from "@/components/ui/page-head";
import { Section, SectionHead } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthSession } from "@/lib/auth/context";
import { sessionLabels } from "@/lib/auth/session-labels";
import { useHostGrantsClient } from "@/lib/grants/context";
import { useDeviceGrants } from "@/lib/grants/use-device-grants";
import { useInstanceServices } from "@/lib/applications/use-instance-services";
import { formatExpiry } from "@/lib/format";

/**
 * /account — the account at a glance. Three sections, each one screenful:
 * who you are, what is authorised, and associated services. Every section
 * links to the page that owns the detail instead of duplicating it.
 */
export function OverviewPage() {
  const { status, account, expiresAt, getSessionToken, invalidateSession } = useAuthSession();
  const client = useHostGrantsClient();
  const grants = useDeviceGrants({
    client,
    getSessionToken,
    onSessionExpired: invalidateSession,
    accountId: account?.id ?? null,
    enabled: status === "authenticated",
  });
  const services = useInstanceServices();

  const hostCount = grants.hosts.length;
  const mobileCount = grants.mobiles.length;
  const activeGrantCount = grants.hosts.reduce(
    (total, view) => total + view.grants.filter((grant) => grant.status === "active").length,
    0,
  );
  const grantsReady = grants.status === "ready" && !grants.loadFailure;

  return (
    <section className="console-page">
      <PageHead
        id="overview-title"
        title="我的账户"
        caption={`${account?.username ?? "—"} · Mira ID · ${sessionLabels[status]}`}
      />

      <Section labelledBy="overview-account">
        <SectionHead
          id="overview-account"
          title="账户"
          caption="登录方式与账户标识。"
          action={
            <Link className="console-section-link" to="/account/security">
              管理会话
            </Link>
          }
        />
        <Facts
          items={[
            { label: "账号", value: account?.username ?? "—" },
            { label: "Account ID", value: account?.id ?? "—", mono: true, breakAll: true },
            { label: "登录状态", value: sessionLabels[status] },
            { label: "会话到期", value: formatExpiry(expiresAt) },
          ]}
        />
      </Section>

      <Section labelledBy="overview-devices">
        <SectionHead
          id="overview-devices"
          title="设备与授权"
          caption="云端保存的授权与设备数量。"
          action={
            <Link className="console-section-link" to="/account/devices">
              管理
            </Link>
          }
        />
        {grants.status === "loading" ? <Skeleton className="h-3.5 w-[58%]" /> : null}
        {grants.loadFailure ? (
          <p className="console-inline-note">
            暂时无法读取设备授权，请
            <Link to="/account/devices">前往设备与授权</Link>
            页重试。
          </p>
        ) : null}
        {grantsReady ? (
          <ul className="console-summary">
            <li>
              <strong>{hostCount}</strong>
              <span>Desktop Host</span>
            </li>
            <li>
              <strong>{mobileCount}</strong>
              <span>手机设备</span>
            </li>
            <li>
              <strong>{activeGrantCount}</strong>
              <span>有效授权</span>
            </li>
          </ul>
        ) : null}
      </Section>

      <Section labelledBy="overview-services">
        <SectionHead
          id="overview-services"
          title="关联服务"
          caption="你的账号已获得使用授权的服务。"
          action={
            <Link className="console-section-link" to="/account/services">
              查看
            </Link>
          }
        />
        {services.error ? (
          <p className="console-inline-note">
            暂时无法读取已授权的应用服务，请
            <Link to="/account/services">前往关联服务</Link>
            页重试。
          </p>
        ) : null}
        {!services.error ? (
          <p className="console-inline-note">
            {services.services === null
              ? "正在读取已授权服务…"
              : `${services.services.length} 项已授权应用服务`}
          </p>
        ) : null}
      </Section>
    </section>
  );
}
