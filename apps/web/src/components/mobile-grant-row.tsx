import { canonicalRemoteDeviceScopes, type MiraDevice, type RemoteDeviceScope } from "@uichat-mira/cloud-auth-contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { remoteScopeLabels } from "@/lib/grants/scope-labels";
import type { DeviceGrantsController, HostGrantItem } from "@/lib/grants/use-device-grants";

export function MobileGrantRow({
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

  // Prevent stale GET results from racing with a new grant mutation.
  const busy = grants.pending !== null || grants.refreshing;
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
    <li className="cloud-mobile-row">
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
        <ul className="cloud-permissions">
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
        <div className="mt-3 flex flex-wrap gap-5">
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

function mobileLabel(device: MiraDevice | undefined): string {
  if (!device) return "手机设备";
  const name = device.clientName?.trim();
  if (name) return name;
  return device.clientVersion ? `Mira Mobile · ${device.clientVersion}` : "Mira Mobile";
}
