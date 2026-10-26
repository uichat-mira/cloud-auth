import type { HostGrantManagementEntry, MiraDevice } from "@uichat-mira/cloud-auth-contracts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MobileGrantRow } from "@/components/mobile-grant-row";
import type { DeviceGrantsController, HostGrantView } from "@/lib/grants/use-device-grants";

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
              <svg viewBox="0 0 24 24"><rect x="4" y="4.5" width="16" height="12" rx="2" /><path d="M9 20h6M12 16.5V20"/></svg>
            </span>
            <span>
              <CardTitle>{hostLabel(view.host)}</CardTitle>
              <CardDescription>Mira Desktop</CardDescription>
            </span>
          </div>
          <span className={isAvailable ? "cloud-host-status" : "cloud-host-status offline"}>
            {isAvailable ? "最近在线" : "离线"}
          </span>
        </div>
        <p className="cloud-host-description">{hostDescription(view.host)}</p>
      </CardHeader>

      <CardContent className="space-y-3 px-4">
        <details className="cloud-account-technical"><summary>查看授权细节</summary><p>云端版本 {view.revision}</p></details>
        {view.failure ? (
          <p role="alert" className="text-sm text-destructive">
            {view.failure.message}
          </p>
        ) : null}

        {!view.failure && !view.policyConfigured ? (
          <div className="space-y-1 text-sm leading-6">
            <p>Desktop 尚未为此 Host 设置授权范围。</p>
            <p className="text-muted-foreground">
              Portal 不能在这里新增权限；请先在 Mira Desktop
              登录时选择允许范围。
              {hasMobiles
                ? `账户中的 ${mobiles.length} 台手机设备当前没有此 Host 的权限。`
                : null}
            </p>
          </div>
        ) : null}

        {!view.failure &&
        view.policyConfigured &&
        view.grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {hasMobiles
              ? "此 Host 还没有授权给任何手机设备。"
              : "此账户还没有手机设备。"}
          </p>
        ) : null}

        {!view.failure && view.grants.length > 0 ? (
          <ul className="space-y-3">
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

        {view.policyConfigured && !view.failure ? (
          <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">
            云端保存成功不等于 Desktop 已立即执行。Desktop
            会在下次同步或授权快照过期后按新范围生效。本地、直连与 Tailscale
            路径不受影响。
          </p>
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

function hostDescription(host: HostGrantManagementEntry["host"]): string {
  const details = [
    host.clientVersion ? `客户端版本 ${host.clientVersion}` : null,
    host.availability === "available"
      ? "云端最近观察到此 Host 在线；这不代表网络一定可达"
      : "云端当前没有此 Host 的在线租约",
  ].filter((detail): detail is string => detail !== null);

  return details.join(" · ");
}

