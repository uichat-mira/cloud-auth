import { useState } from "react";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/context";
import { sessionLabels } from "@/lib/auth/session-labels";
import { formatExpiry } from "@/lib/format";

/**
 * /account/security — password and the one session this browser holds. The
 * renew action is visible without expanding anything: it is the only action
 * that keeps the current session alive.
 */
export function SecurityPage() {
  const { status, expiresAt, pending, renew, clearFailure } = useAuthSession();
  const [passwordOpen, setPasswordOpen] = useState(false);

  function openPasswordDialog() {
    clearFailure();
    setPasswordOpen(true);
  }

  function closePasswordDialog() {
    clearFailure();
    setPasswordOpen(false);
  }

  return (
    <section className="console-page">
      <header className="console-page-head">
        <h1 id="account-security-heading" tabIndex={-1}>
          账户安全
        </h1>
        <p className="console-page-caption">密码与此浏览器的云端会话。</p>
      </header>

      <section className="console-section" aria-labelledby="security-password">
        <div className="console-section-head">
          <div>
            <h2 id="security-password">密码</h2>
          </div>
        </div>
        <button
          type="button"
          aria-label="修改密码"
          className="cloud-row"
          onClick={openPasswordDialog}
        >
          <span className="cloud-row-copy">
            <strong>修改密码</strong>
            <small>修改后，云端会话需要重新登录。</small>
          </span>
          <span aria-hidden="true" className="cloud-row-chevron" />
        </button>
      </section>

      <section className="console-section" aria-labelledby="security-session">
        <div className="console-section-head">
          <div>
            <h2 id="security-session">当前登录会话</h2>
            <p className="console-section-caption">仅管理此浏览器的会话。</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void renew()}
            disabled={pending !== null}
          >
            {pending === "renew" ? "续期中…" : "续期 Session"}
          </Button>
        </div>
        <dl className="console-facts">
          <div>
            <dt>状态</dt>
            <dd>{sessionLabels[status]}</dd>
          </div>
          <div>
            <dt>到期时间</dt>
            <dd>{formatExpiry(expiresAt)}</dd>
          </div>
        </dl>
      </section>

      <ChangePasswordDialog open={passwordOpen} onClose={closePasswordDialog} />
    </section>
  );
}
