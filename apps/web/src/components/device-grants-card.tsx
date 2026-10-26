import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HostGrantCard } from "@/components/host-grant-card";
import { useAuthSession } from "@/lib/auth/context";
import { useHostGrantsClient } from "@/lib/grants/context";
import { useDeviceGrants, type HostGrantsNotice } from "@/lib/grants/use-device-grants";

export function DeviceGrantsCard() {
  const client = useHostGrantsClient();
  const { status, account, getSessionToken } = useAuthSession();
  const grants = useDeviceGrants({
    client,
    getSessionToken,
    accountId: account?.id ?? null,
    enabled: status === "authenticated",
  });

  if (status !== "authenticated") return null;

  return (
    <section aria-labelledby="device-grants-heading" className="cloud-grants">
      <header className="cloud-section-title">
        <div className="space-y-1">
          <h2
            id="device-grants-heading"
            className="cloud-section-heading"
          >
            设备与授权
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            查看云端已保存的设备授权。刷新列表不会强制 Desktop 立即同步。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cloud-refresh"
          onClick={() => void grants.refresh({ announce: true })}
          disabled={grants.status === "loading" || grants.refreshing || grants.pending !== null}
        >
          {grants.refreshing ? "读取中…" : "刷新列表"}
        </Button>
      </header>

      {grants.notice ? <GrantsNotice notice={grants.notice} /> : null}

      {grants.loadFailure ? (
        <Card className="gap-3 py-4">
          <CardContent className="space-y-3 px-4">
            <p role="alert" className="text-sm text-destructive">
              {grants.loadFailure.message}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void grants.refresh({ announce: true })}
            >
              重新读取
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {grants.status === "loading" ? (
        <Card className="gap-3 py-4">
          <CardContent className="px-4 text-sm text-muted-foreground">
            正在读取云端设备与授权…
          </CardContent>
        </Card>
      ) : null}

      {grants.status === "ready" &&
      !grants.loadFailure &&
      grants.hosts.length === 0 ? (
        <Card className="gap-3 py-4">
          <CardHeader className="gap-1 px-4">
            <CardTitle className="text-base">没有可管理的 Desktop Host</CardTitle>
            <CardDescription>
              此账户当前没有在云端注册的 Desktop Host。请先在 Mira Desktop
              登录并允许云端授权。
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-xs leading-5 text-muted-foreground">
              此处会保留仍属于本账号、设备尚未撤销的历史 Host 授权。
              设备退出云账号或 Session 过期时也可管理已保存的权限。
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {grants.hosts.map((view) => (
          <HostGrantCard
            key={view.host.id}
            view={view}
            grants={grants}
            mobiles={grants.mobiles}
          />
        ))}
      </div>

      {grants.revokedMobiles.length > 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          账户中有 {grants.revokedMobiles.length}
          台已撤销的手机设备，不会出现在授权列表中。
        </p>
      ) : null}
    </section>
  );
}

function GrantsNotice({ notice }: { notice: HostGrantsNotice }) {
  const classes =
    notice.tone === "success"
      ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : notice.tone === "warning"
        ? "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-destructive/40 bg-destructive/10 text-destructive";

  return (
    <p
      role={notice.tone === "success" ? "status" : "alert"}
      className={`rounded-md border px-3 py-2 text-sm ${classes}`}
    >
      {notice.message}
    </p>
  );
}

