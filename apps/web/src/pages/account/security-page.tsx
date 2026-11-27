import { useState } from "react";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { Button } from "@/components/ui/button";
import { Facts } from "@/components/ui/facts";
import { PageHead } from "@/components/ui/page-head";
import { Section, SectionHead } from "@/components/ui/section";
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
      <PageHead
        id="account-security-heading"
        title="账户安全"
        caption="密码与此浏览器的云端会话。"
      />

      <Section labelledBy="security-password">
        <SectionHead id="security-password" title="密码" />
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
      </Section>

      <Section labelledBy="security-session">
        <SectionHead
          id="security-session"
          title="当前登录会话"
          caption="仅管理此浏览器的会话。"
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void renew()}
              disabled={pending !== null}
            >
              {pending === "renew" ? "续期中…" : "续期 Session"}
            </Button>
          }
        />
        <Facts
          items={[
            { label: "状态", value: sessionLabels[status] },
            { label: "到期时间", value: formatExpiry(expiresAt) },
          ]}
        />
      </Section>

      <ChangePasswordDialog open={passwordOpen} onClose={closePasswordDialog} />
    </section>
  );
}
