import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Notice, type NoticeTone } from "@/components/ui/notice";
import { PageHead } from "@/components/ui/page-head";
import { HostGrantCard } from "@/components/host-grant-card";
import { useAuthSession } from "@/lib/auth/context";
import { useHostGrantsClient } from "@/lib/grants/context";
import { useDeviceGrants, type HostGrantsNotice } from "@/lib/grants/use-device-grants";

const noticeTone: Record<HostGrantsNotice["tone"], NoticeTone> = {
  success: "success",
  warning: "warning",
  error: "danger",
};

/**
 * The grants record list and heading. The owning page provides the single
 * execution caveat; this component owns the live controls (refresh, per-record
 * scope narrowing/revocation) and every record/empty/loading/failure state.
 */
export function DeviceGrantsCard() {
  const client = useHostGrantsClient();
  const { status, account, getSessionToken, invalidateSession } = useAuthSession();
  const grants = useDeviceGrants({
    client,
    getSessionToken,
    onSessionExpired: invalidateSession,
    accountId: account?.id ?? null,
    enabled: status === "authenticated",
  });

  if (status !== "authenticated") return null;

  const showEmpty =
    grants.status === "ready" &&
    !grants.refreshing &&
    !grants.loadFailure &&
    grants.hosts.length === 0;
  const activeGrantCount = grants.hosts.reduce(
    (total, view) => total + view.grants.filter((grant) => grant.status === "active").length,
    0,
  );

  return (
    <div className="cloud-grants">
      <PageHead
        id="device-grants-heading"
        title="设备与授权"
        caption="云端保存的授权状态；刷新只读取云端快照，不会强制 Desktop 立即同步。"
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="cloud-grants-refresh"
            aria-label={grants.refreshing ? "读取中…" : "刷新列表"}
            title={grants.refreshing ? "读取中…" : "刷新列表"}
            aria-busy={grants.refreshing}
            onClick={() => void grants.refresh({ announce: true })}
            disabled={grants.status === "loading" || grants.refreshing || grants.pending !== null}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              focusable="false"
            >
              <path d="M21 3v6h-6" />
              <path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.5 2.7L21 9" />
            </svg>
          </Button>
        }
      />
      <div className="cloud-grants-toolbar">
        {grants.status === "loading" ? (
          <p className="cloud-grants-summary" aria-hidden="true">
            <span className="cloud-grants-skeleton cloud-grants-skeleton-summary" />
          </p>
        ) : (
          <p className="cloud-grants-summary">
            Desktop Host {grants.hosts.length} · 手机设备 {grants.mobiles.length} · 有效授权{" "}
            {activeGrantCount}
          </p>
        )}
      </div>

      {grants.notice ? <GrantsNotice notice={grants.notice} /> : null}

      {grants.loadFailure ? (
        <Card className="cloud-grants-failure">
          <CardContent className="cloud-grants-failure-body">
            <Notice role="alert" tone="danger" className="cloud-grants-failure-message">
              {grants.loadFailure.message}
            </Notice>
            <div className="cloud-grants-failure-actions">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void grants.refresh({ announce: true })}
              >
                重新读取
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {grants.status === "loading" ? <GrantsLoading /> : null}

      {showEmpty ? <GrantsEmpty /> : null}

      {grants.hosts.length > 0 ? (
        <div className="cloud-host-list">
          {grants.hosts.map((view) => (
            <HostGrantCard
              key={view.host.id}
              view={view}
              grants={grants}
              mobiles={grants.mobiles}
            />
          ))}
        </div>
      ) : null}

      {grants.revokedMobiles.length > 0 ? (
        <p className="cloud-grants-footnote">
          账户中有 {grants.revokedMobiles.length} 台已撤销的手机设备，不会出现在授权列表中。
        </p>
      ) : null}
    </div>
  );
}

function GrantsNotice({ notice }: { notice: HostGrantsNotice }) {
  return (
    <Notice
      tone={noticeTone[notice.tone]}
      role={notice.tone === "success" ? "status" : "alert"}
      className="cloud-grants-notice"
    >
      <span className="cloud-grants-notice-icon" aria-hidden="true">
        {noticeIcon(notice.tone)}
      </span>
      <span>{notice.message}</span>
    </Notice>
  );
}

function noticeIcon(tone: HostGrantsNotice["tone"]) {
  if (tone === "success") {
    return (
      <svg viewBox="0 0 16 16" focusable="false">
        <circle cx="8" cy="8" r="6.25" />
        <path d="m5.2 8.1 2 2 3.7-4.3" />
      </svg>
    );
  }
  if (tone === "warning") {
    return (
      <svg viewBox="0 0 16 16" focusable="false">
        <path d="M8 2.4 14.1 13H1.9L8 2.4Z" />
        <path d="M8 6.4v3.4" />
        <circle cx="8" cy="11.4" r="0.55" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" focusable="false">
      <circle cx="8" cy="8" r="6.25" />
      <path d="m5.9 5.9 4.2 4.2M10.1 5.9l-4.2 4.2" />
    </svg>
  );
}

function GrantsLoading() {
  return (
    <Card className="cloud-grants-loading" aria-busy="true">
      <div className="cloud-grants-loading-host">
        <span className="cloud-grants-skeleton cloud-grants-skeleton-tile" />
        <span className="cloud-grants-loading-copy">
          <span className="cloud-grants-skeleton cloud-grants-skeleton-title" />
          <span className="cloud-grants-skeleton cloud-grants-skeleton-meta" />
        </span>
      </div>
      <div className="cloud-grants-loading-rows">
        {[0, 1].map((index) => (
          <div className="cloud-grants-loading-row" key={index}>
            <span className="cloud-grants-skeleton cloud-grants-skeleton-name" />
            <span className="cloud-grants-skeleton cloud-grants-skeleton-meta" />
            <span className="cloud-grants-loading-chips">
              <span className="cloud-grants-skeleton cloud-grants-skeleton-chip" />
              <span className="cloud-grants-skeleton cloud-grants-skeleton-chip" />
            </span>
          </div>
        ))}
      </div>
      <p className="cloud-grants-loading-label">正在读取云端设备与授权…</p>
    </Card>
  );
}

function GrantsEmpty() {
  return (
    <Card className="cloud-grants-empty">
      <span className="cloud-grants-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
          <path d="M9.5 20h5M12 16.5V20" />
        </svg>
      </span>
      <CardTitle className="cloud-grants-empty-title">没有可管理的 Desktop Host</CardTitle>
      <CardDescription className="cloud-grants-empty-copy">
        此账户当前没有在云端注册的 Desktop Host。请先在 Mira Desktop 登录并允许云端授权。
      </CardDescription>
      <p className="cloud-grants-empty-note">
        此处会保留仍属于本账号、设备尚未撤销的历史 Host 授权。设备退出 Mira 账号或 Session
        过期时也可管理已保存的权限。
      </p>
    </Card>
  );
}
