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
  const hasScopes = grant.scopes.length > 0;
  const statusLabel = isRevoked ? "已撤销" : hasScopes ? "授权中" : "无有效权限";
  const statusTone = isRevoked ? "muted" : hasScopes ? "success" : "neutral";

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
    <li className="cloud-grant-row" data-state={isRevoked ? "revoked" : "active"}>
      <div className="cloud-grant-main">
        <p className="cloud-grant-name">{mobileLabel(device)}</p>
        <p className="cloud-grant-meta">
          {device?.clientVersion
            ? `客户端版本 ${device.clientVersion}`
            : "手机设备"}
        </p>

        {hasScopes ? (
          <ul className="cloud-grant-scopes">
            {grant.scopes.map((scope) => (
              <li key={scope} className="cloud-grant-scope">
                {remoteScopeLabels[scope]}
              </li>
            ))}
          </ul>
        ) : isRevoked ? null : (
          <p className="cloud-grant-no-scopes">无有效权限</p>
        )}

        {isRevoked ? (
          <p className="cloud-grant-note">
            此授权已在云端撤销，不能在此恢复。Desktop 会在下次同步后停止使用这些权限。
          </p>
        ) : null}
      </div>

      <div className="cloud-grant-side">
        <span className="cloud-grant-pill" data-tone={statusTone}>
          {statusLabel}
        </span>
        {!isRevoked && !editing && !confirmingRevoke ? (
          <div className="cloud-grant-actions">
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
      </div>

      {editing ? (
        <div className="cloud-grant-editor">
          <fieldset className="cloud-grant-editor-fieldset">
            <legend className="cloud-grant-editor-legend">保留的权限</legend>
            <div className="cloud-grant-scope-options">
              {grant.scopes.map((scope) => (
                <label key={scope} className="cloud-grant-scope-option">
                  <input
                    type="checkbox"
                    className="cloud-grant-checkbox"
                    checked={selected.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    disabled={isPending}
                  />
                  <span className="cloud-grant-scope-label">{remoteScopeLabels[scope]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="cloud-grant-editor-hint">只能取消已有权限，不能新增或扩大权限。</p>
          {selectedScopes.length === 0 ? (
            <p className="cloud-grant-editor-warning">如需完全收回权限，请使用“撤销授权”。</p>
          ) : null}
          <div className="cloud-grant-editor-actions">
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
        <div className="cloud-grant-confirm">
          <p className="cloud-grant-confirm-text">
            撤销后，此手机设备将不再获得此 Desktop
            的权限。Desktop 会在下次同步后生效。确定撤销？
          </p>
          <div className="cloud-grant-confirm-actions">
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
