import {
  canonicalRemoteDeviceScopes,
  type HostGrantManagementEntry,
  type MiraDevice,
  type RemoteDeviceScope,
} from "@uichat-mira/cloud-auth-contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthSession } from "@/lib/auth/context";
import { useHostGrantsClient } from "@/lib/grants/context";
import { remoteScopeLabels } from "@/lib/grants/scope-labels";
import {
  useDeviceGrants,
  type DeviceGrantsController,
  type HostGrantItem,
  type HostGrantView,
  type HostGrantsNotice,
} from "@/lib/grants/use-device-grants";

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
    <section aria-labelledby="device-grants-heading" className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2
            id="device-grants-heading"
            className="text-lg font-semibold tracking-tight"
          >
            设备与授权
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            查看此账户的 Desktop Host 与手机设备授权。这里只能收窄或撤销已有权限，不能新增或扩大权限。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void grants.refresh()}
          disabled={grants.status === "loading" || grants.pending !== null}
        >
          刷新授权
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
              onClick={() => void grants.refresh()}
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

function HostGrantCard({
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
    <Card className="gap-4 py-4">
      <CardHeader className="gap-2 px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {hostLabel(view.host)}
            </CardTitle>
            <CardDescription>{hostDescription(view.host)}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span
              className={
                isAvailable
                  ? "rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300"
                  : "rounded-full border px-2 py-0.5 text-muted-foreground"
              }
            >
              {isAvailable ? "最近在线" : "离线"}
            </span>
            {view.revision > 0 ? (
              <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                云端版本 {view.revision}
              </span>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4">
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

function MobileGrantRow({
  grant,
  device,
  hostId,
  revision,
  grants,
}: {
  grant: HostGrantItem;
  device: MiraDevice | undefined;
  hostId: string;
  revision: number;
  grants: DeviceGrantsController;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<RemoteDeviceScope[]>(grant.scopes);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  const busy = grants.pending !== null;
  const pending = grants.pending;
  const isPending =
    pending?.hostId === hostId &&
    pending.mobileDeviceId === grant.mobileDeviceId;
  const isRevoked = grant.status === "revoked";
  const canNarrow = !isRevoked && grant.scopes.length > 0;
  const selectedScopes = canonicalRemoteDeviceScopes(selected);
  const unchanged =
    selectedScopes.length === grant.scopes.length &&
    selectedScopes.every((scope, index) => scope === grant.scopes[index]);

  function toggleScope(scope: RemoteDeviceScope) {
    setSelected((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope],
    );
  }

  async function saveNarrowing() {
    if (selectedScopes.length === 0) return;
    const succeeded = await grants.narrow({
      hostId,
      mobileDeviceId: grant.mobileDeviceId,
      expectedRevision: revision,
      scopes: selectedScopes,
    });
    if (succeeded) setEditing(false);
  }

  async function revokeGrant() {
    const succeeded = await grants.revoke({
      hostId,
      mobileDeviceId: grant.mobileDeviceId,
      expectedRevision: revision,
    });
    if (succeeded) setConfirmingRevoke(false);
  }

  return (
    <li className="space-y-3 rounded-lg border px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{mobileLabel(device)}</p>
          <p className="text-xs text-muted-foreground">
            {device?.clientVersion
              ? `客户端版本 ${device.clientVersion}`
              : "手机设备"}
          </p>
        </div>
        <span
          className={
            isRevoked
              ? "rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
              : "rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300"
          }
        >
          {isRevoked
            ? "已撤销"
            : grant.scopes.length > 0
              ? "授权中"
              : "无有效权限"}
        </span>
      </div>

      {grant.scopes.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {grant.scopes.map((scope) => (
            <li
              key={scope}
              className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs"
            >
              {remoteScopeLabels[scope]}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">无有效权限</p>
      )}

      {isRevoked ? (
        <p className="text-xs leading-5 text-muted-foreground">
          此授权已在云端撤销，不能在此恢复。Desktop 会在下次同步后停止使用这些权限。
        </p>
      ) : null}

      {!isRevoked && !editing && !confirmingRevoke ? (
        <div className="flex flex-wrap gap-2">
          {canNarrow ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSelected(grant.scopes);
                setEditing(true);
              }}
              disabled={busy}
            >
              调整范围
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => setConfirmingRevoke(true)}
            disabled={busy}
          >
            撤销授权
          </Button>
        </div>
      ) : null}

      {editing ? (
        <div className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">保留的权限</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {grant.scopes.map((scope) => (
                <label
                  key={scope}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    disabled={isPending}
                  />
                  <span>{remoteScopeLabels[scope]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            只能取消已有权限，不能新增或扩大权限。
          </p>
          {selectedScopes.length === 0 ? (
            <p className="text-xs text-destructive">
              如需完全收回权限，请使用“撤销授权”。
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void saveNarrowing()}
              disabled={busy || selectedScopes.length === 0 || unchanged}
            >
              {isPending && pending?.action === "narrow" ? "保存中…" : "保存收窄"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSelected(grant.scopes);
                setEditing(false);
              }}
              disabled={isPending}
            >
              取消
            </Button>
          </div>
        </div>
      ) : null}

      {confirmingRevoke ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3">
          <p className="text-sm">
            撤销后，此手机设备将不再获得此 Desktop
            的权限。Desktop 会在下次同步后生效。确定撤销？
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void revokeGrant()}
              disabled={busy}
            >
              {isPending && pending?.action === "revoke" ? "撤销中…" : "确认撤销"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmingRevoke(false)}
              disabled={isPending}
            >
              取消
            </Button>
          </div>
        </div>
      ) : null}
    </li>
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

function mobileLabel(device: MiraDevice | undefined): string {
  if (!device) return "手机设备";
  const name = device.clientName?.trim();
  if (name) return name;
  return device.clientVersion ? `Mira Mobile · ${device.clientVersion}` : "Mira Mobile";
}
