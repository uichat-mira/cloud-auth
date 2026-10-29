import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { AuthFailureAlert } from "@/components/auth-failure-alert";
import { ConsoleNav } from "@/components/console-nav";
import { ModalOpenProvider, useModalOpen } from "@/components/modal-open-context";
import { SessionBlock } from "@/components/session-block";
import { SessionRecovery } from "@/components/session-recovery";
import { useAuthSession } from "@/lib/auth/context";
import { loginUrlForAccount } from "@/lib/auth/return-location";
import { SessionExpiryNotice } from "@/components/session-expiry-notice";

/**
 * Account console shell: sticky header, section rail, session block and the
 * routed page in a single 960px content column.
 *
 * Auth gate: while the session is unknown the page body is a skeleton; when the
 * visitor is signed out or the session cannot be confirmed, the outlet is not
 * rendered at all — recovery copy replaces it and no page (and no grant fetch)
 * mounts. Only a confirmed session gets the console sections and routed pages.
 */
export function AccountLayout() {
  return (
    <ModalOpenProvider>
      <AccountConsole />
    </ModalOpenProvider>
  );
}

function AccountConsole() {
  const { status, account, failure, notice } = useAuthSession();
  const authenticated = status === "authenticated";
  const checking = status === "idle" || status === "restoring";
  const modalOpen = useModalOpen();
  const { pathname, search, hash } = useLocation();
  const loginHref = loginUrlForAccount(pathname + search + hash);

  useRouteEntryFocus(pathname);

  return (
    <div className="console-shell">
      <header className="console-header">
        <div className="console-container console-header-inner">
          <Link to={authenticated ? "/account" : loginHref} className="console-brand">
            <span aria-hidden="true" className="console-brand-mark">M.</span>
            <span className="console-brand-copy">
              <strong>Mira Cloud</strong>
              <small>Your account</small>
            </span>
          </Link>

          {authenticated ? (
            <div className="console-identity">
              <span aria-hidden="true" className="console-avatar">
                {initialOf(account?.username)}
              </span>
              <span className="console-identity-copy">
                <strong>{account?.username ?? "Mira Cloud"}</strong>
              </span>
            </div>
          ) : (
            <Link to={loginHref} className="console-header-action">
              登录
            </Link>
          )}
        </div>
      </header>

      <div className="console-container console-body">
        <aside className="console-rail">
          <ConsoleNav />
          {authenticated ? <SessionBlock /> : null}
        </aside>

        <main className="console-main">
          <div className="console-notices">
            {authenticated ? <SessionExpiryNotice /> : null}
            <AuthFailureAlert failure={modalOpen ? null : failure} />
            {notice === "session_renewed" ? (
              <p role="status" className="cloud-notice cloud-notice-success">
                Cloud Session 已续期，当前登录状态保持不变。
              </p>
            ) : null}
            {notice === "password_changed" ? (
              <p role="status" className="cloud-notice cloud-notice-success">
                密码已修改，请重新登录。
              </p>
            ) : null}
          </div>

          {authenticated ? (
            <Outlet />
          ) : (
            <>
              {checking ? null : (
                <header className="console-page-head">
                  <h1 id="account-recovery-heading" tabIndex={-1}>
                    我的账户
                  </h1>
                  <p className="console-page-caption">
                    登录 Mira Cloud 后即可管理设备授权与账户安全。
                  </p>
                </header>
              )}
              <SessionRecovery />
            </>
          )}

          <p className="console-note">
            Mira Cloud Account · 独立云身份 · 本地 Mira 依然可用
          </p>
        </main>
      </div>
    </div>
  );
}

/**
 * On a section change, return to the top of the document and move focus to the
 * new page heading so keyboard and screen-reader users land in the new content.
 * The first render is skipped (the browser already starts at the top), and every
 * DOM API is feature-guarded because this also runs under jsdom.
 */
function useRouteEntryFocus(pathname: string) {
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0 });
    }

    const heading = document.querySelector<HTMLElement>(".console-main h1");
    if (!heading) return;

    if (!heading.hasAttribute("tabindex")) {
      heading.setAttribute("tabindex", "-1");
    }
    heading.scrollIntoView?.({ block: "start" });
    heading.focus({ preventScroll: true });
  }, [pathname]);
}

function initialOf(username: string | undefined): string {
  return username?.trim().slice(0, 1).toUpperCase() || "M";
}
