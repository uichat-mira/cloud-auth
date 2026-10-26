import type { HostGrantManagementEntry, MiraDevice } from "@uichat-mira/cloud-auth-contracts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MobileGrantRow } from "@/components/mobile-grant-row";
import type { DeviceGrantsController, HostGrantView } from "@/lib/grants/use-device-grants";

/**
 * One Desktop Host record. Everything the cloud knows is visible without
 * expanding: the header row carries availability + revision, the facts row
 * carries the observation, and the rows below are the per-phone grants.
 */
export function HostGrantCard({
  view,
  grants,
  mobiles,
}: {
  view: HostGrantView;
  grants: DeviceGrantsController;
  mobiles: MiraDevice[];
}) {
  const isAvailable = view.host.availability === "available";
  const mobileById = new Map(mobiles.map((mobile) => [mobile.id, mobile]));
  const hasMobiles = mobiles.length > 0;

  return (
    <Card className="cloud-host">
      <CardHeader className="cloud-host-head">
        <div className="cloud-host-header">
          <div className="cloud-host-title">
            <span className="cloud-host-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
                <path d="M9.5 20h5M12 16.5V20" />
              </svg>
            </span>
            <span className="cloud-host-title-copy">
              <CardTitle
                as="h2"
                className="cloud-host-name"
                aria-label={`${hostLabel(view.host)} · ${hostReference(view.host)}`}
              >
                {hostLabel(view.host)}
              </CardTitle>
              <CardDescription className="cloud-host-meta">
                Mira Desktop · {hostReference(view.host)}
              </CardDescription>
            </span>
          </div>
          <div className="cloud-host-trailing">
            <span className="cloud-host-status" data-state={isAvailable ? "online" : "offline"}>
              <span className="cloud-host-status-dot" aria-hidden="true" />
              {isAvailable ? "最近在线" : "离线"}
            </span>
            <span className="cloud-host-version">云端版本 {view.revision}</span>
          </div>
        </div>
        <p className="cloud-host-facts">{hostFacts(view.host)}</p>
      </CardHeader>

      <CardContent className="cloud-host-body">
        {view.failure ? (
          <p role="alert" className="cloud-host-failure">
            {view.failure.message}
          </p>
        ) : null}

        {!view.failure && !view.policyConfigured ? (
          <div className="cloud-host-block">
            <p className="cloud-host-block-title">Desktop 尚未为此 Host 设置授权范围。</p>
            <p className="cloud-host-block-copy">
              Portal 不能在这里新增权限；请先在 Mira Desktop 登录时选择允许范围。
              {hasMobiles
                ? `账户中的 ${mobiles.length} 台手机设备当前没有此 Host 的权限。`
                : null}
            </p>
          </div>
        ) : null}

        {!view.failure && view.policyConfigured && view.grants.length === 0 ? (
          <p className="cloud-host-empty-row">
            {hasMobiles ? "此 Host 还没有授权给任何手机设备。" : "此账户还没有手机设备。"}
          </p>
        ) : null}

        {!view.failure && view.grants.length > 0 ? (
          <ul className="cloud-grant-list">
            {view.grants.map((grant) => (
              <MobileGrantRow
                key={`${grant.mobileDeviceId}-${view.revision}`}
                grant={grant}
                device={mobileById.get(grant.mobileDeviceId)}
                hostId={view.host.id}
                revision={view.revision}
                grants={grants}
              />
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function hostLabel(host: HostGrantManagementEntry["host"]): string {
  const displayName = host.displayName?.trim();
  if (displayName) return displayName;
  return "Mira Desktop";
}

/**
 * Every Desktop Host registers as `Mira Desktop` (the client name is a shared
 * app label, see docs/auth-v0.md), so a list of records would otherwise read as
 * N identical rows. The Host id is the only stable, factual differentiator the
 * ledger carries: show its first block as a record identifier, like a console.
 */
function hostReference(host: HostGrantManagementEntry["host"]): string {
  return `Host ${host.id.slice(0, 8)}`;
}

/**
 * The management ledger carries availability, not timestamps, so the facts row
 * states the observation the cloud actually has instead of inventing a clock.
 */
function hostFacts(host: HostGrantManagementEntry["host"]): string {
  const facts = [
    host.availability === "available" ? "最近在线" : "未观察到在线",
    host.clientVersion ? `客户端版本 ${host.clientVersion}` : null,
    host.availability === "available"
      ? "云端最近观察到此 Host 在线，不代表网络一定可达"
      : "云端当前没有此 Host 的在线租约",
  ].filter((fact): fact is string => fact !== null);

  return facts.join(" · ");
}
