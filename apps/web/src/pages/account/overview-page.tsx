import { Link } from "react-router-dom";
import { associatedServicesCount, unconnectedServicesCount } from "@/components/associated-services";
import { useAuthSession } from "@/lib/auth/context";
import { sessionLabels } from "@/lib/auth/session-labels";
import { useHostGrantsClient } from "@/lib/grants/context";
import { useDeviceGrants } from "@/lib/grants/use-device-grants";
import { formatExpiry } from "@/lib/format";

/**
 * /account — the account at a glance. Three sections, each one screenful:
 * who you are, what is authorised, and associated services. Every section
 * links to the page that owns the detail instead of duplicating it.
 */
export function OverviewPage() {
  const { status, account, expiresAt, getSessionToken } = useAuthSession();
  const client = useHostGrantsClient();
  const grants = useDeviceGrants({
    client,
    getSessionToken,
    accountId: account?.id ?? null,
    enabled: status === "authenticated",
  });

  const hostCount = grants.hosts.length;
  const mobileCount = grants.mobiles.length;
  const activeGrantCount = grants.hosts.reduce(
    (total, view) => total + view.grants.filter((grant) => grant.status === "active").length,
    0,
  );
  const grantsReady = grants.status === "ready" && !grants.loadFailure;

  return (
    <section className="console-page">
      <header className="console-page-head">
        <h1 id="overview-title" tabIndex={-1}>
          我的账户
        </h1>
        <p className="console-page-caption">
          {account?.username ?? "—"} · Mira Cloud Account · {sessionLabels[status]}
        </p>
      </header>

      <section className="console-section" aria-labelledby="overview-account">
        <div className="console-section-head">
          <div>
            <h2 id="overview-account">账户</h2>
            <p className="console-section-caption">登录方式与账户标识。</p>
          </div>
          <Link className="console-section-link" to="/account/security">
            管理会话
          </Link>
        </div>
        <dl className="console-facts">
          <div>
            <dt>账号</dt>
            <dd>{account?.username ?? "—"}</dd>
          </div>
          <div>
            <dt>Account ID</dt>
            <dd className="cloud-mono cloud-break-all">{account?.id ?? "—"}</dd>
          </div>
          <div>
            <dt>登录状态</dt>
            <dd>{sessionLabels[status]}</dd>
          </div>
          <div>
            <dt>会话到期</dt>
            <dd>{formatExpiry(expiresAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="console-section" aria-labelledby="overview-devices">
        <div className="console-section-head">
          <div>
            <h2 id="overview-devices">设备与授权</h2>
            <p className="console-section-caption">云端保存的授权与设备数量。</p>
          </div>
          <Link className="console-section-link" to="/account/devices">
            管理
          </Link>
        </div>
        {grants.status === "loading" ? (
          <p className="console-skeleton-line" aria-hidden="true" />
        ) : null}
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
      </section>

      <section className="console-section" aria-labelledby="overview-services">
        <div className="console-section-head">
          <div>
            <h2 id="overview-services">关联服务</h2>
            <p className="console-section-caption">Mira Cloud 的服务与子系统。</p>
          </div>
          <Link className="console-section-link" to="/account/services">
            查看
          </Link>
        </div>
        <p className="console-inline-note">{associatedServicesCount} 项服务 · {unconnectedServicesCount} 项尚未接入</p>
      </section>
    </section>
  );
}
