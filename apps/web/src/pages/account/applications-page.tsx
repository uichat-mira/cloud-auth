import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/context";
import {
  ApplicationRequestError,
  createApplicationClient,
  type ApplicationCatalog,
} from "@/lib/applications/client";

const errorMessage = (error: unknown) => {
  if (!(error instanceof ApplicationRequestError)) return "操作未完成，请刷新确认状态后重试。";
  if (error.code === "APPLICATION_SECRET_REJECTED") return "AppSecret 验证失败。";
  if (error.code === "APPLICATION_ALREADY_OWNED") return "这个应用实例已归属于其他 Mira 账号。";
  if (error.code === "APPLICATION_ID_MISMATCH") return "APP_ID 与应用声明不一致。";
  if (error.code === "APPLICATION_UNSAFE_ORIGIN")
    return "应用地址不是可安全访问的公网 HTTPS Origin。";
  if (error.code === "APPLICATION_INVALID_MANIFEST") return "应用元信息格式不符合 Mira ID V1。";
  if (error.code.startsWith("APPLICATION_METADATA_ORIGIN_MISMATCH"))
    return "应用声明包含尚未验证的跨域地址。";
  if (error.status === 401) return "登录已失效，请重新登录。";
  if (error.status === 400) return "请检查应用地址、APP_ID 与 AppSecret。";
  if (error.status === 502) return "无法读取或验证应用，请确认应用服务已上线。";
  return "请求未完成，请刷新应用列表确认状态后重试。";
};

export function ApplicationsPage() {
  const { account } = useAuthSession();
  return <ApplicationsForAccount key={account?.id ?? "none"} />;
}

function ApplicationsForAccount() {
  const { getSessionToken, invalidateSession } = useAuthSession();
  const [client] = useState(createApplicationClient);
  const [catalog, setCatalog] = useState<ApplicationCatalog | null>(null);
  const [error, setError] = useState("");
  const [registrationError, setRegistrationError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const token = getSessionToken();
    if (token) {
      const request = ++generation.current;
      void client
        .list(token)
        .then((result) => {
          if (mounted.current && request === generation.current && getSessionToken() === token) {
            setCatalog(result);
          }
        })
        .catch((failure) => {
          if (!mounted.current || request !== generation.current || getSessionToken() !== token) {
            return;
          }
          if (failure instanceof ApplicationRequestError && failure.status === 401) {
            invalidateSession(token);
          }
          setError(errorMessage(failure));
        });
    }
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [client, getSessionToken, invalidateSession]);

  async function refresh() {
    const token = getSessionToken();
    if (!token) return;
    const request = ++generation.current;
    setError("");
    try {
      const result = await client.list(token);
      if (mounted.current && request === generation.current && token === getSessionToken()) {
        setCatalog(result);
      }
    } catch (failure) {
      if (!mounted.current || request !== generation.current || token !== getSessionToken()) {
        return;
      }
      if (failure instanceof ApplicationRequestError && failure.status === 401) {
        invalidateSession(token);
      }
      setError(errorMessage(failure));
    }
  }

  function openRegister() {
    setRegistrationError("");
    setOrigin("");
    setAppId("");
    setAppSecret("");
    setError("");
    setNotice("");
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeRegister(force = false) {
    if (busy && !force) return;
    setAppSecret("");
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const token = getSessionToken();
    if (!token) return;
    const secret = appSecret;
    setBusy(true);
    setRegistrationError("");
    setNotice("");
    setAppSecret("");
    try {
      const result = await client.register(token, {
        origin: origin.trim().replace(/\/+$/, ""),
        appId: appId.trim(),
        appSecret: secret,
      });
      if (!mounted.current || token !== getSessionToken()) return;
      setNotice("已登记 " + result.application.manifest.name + "。");
      closeRegister(true);
      await refresh();
    } catch (failure) {
      if (!mounted.current || token !== getSessionToken()) return;
      if (failure instanceof ApplicationRequestError && failure.status === 401) {
        invalidateSession(token);
      }
      setRegistrationError(errorMessage(failure));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function changeStatus(id: string, name: string, disabled: boolean) {
    if (
      busy ||
      (disabled &&
        !window.confirm(
          "停用“" + name + "”？现有应用登录与服务授权将撤销，重新启用后需要用户主动登录。",
        ))
    )
      return;
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await client.setDisabled(token, id, disabled);
      if (!mounted.current || token !== getSessionToken()) return;
      setNotice(disabled ? "应用已停用。" : "应用已启用。");
      await refresh();
    } catch (failure) {
      if (!mounted.current || token !== getSessionToken()) return;
      if (failure instanceof ApplicationRequestError && failure.status === 401)
        invalidateSession(token);
      setError(errorMessage(failure));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function remove(appIdToRemove: string, name: string) {
    if (
      busy ||
      !window.confirm("从“我的应用”移除“" + name + "”？这不会自动撤销你对该服务的使用授权。")
    ) {
      return;
    }
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await client.remove(token, appIdToRemove);
      if (!mounted.current || token !== getSessionToken()) return;
      setNotice("已移除应用管理关系。");
      await refresh();
    } catch (failure) {
      if (!mounted.current || token !== getSessionToken()) return;
      if (failure instanceof ApplicationRequestError && failure.status === 401) {
        invalidateSession(token);
      }
      setError(errorMessage(failure));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(label + " 已复制。");
    } catch {
      setNotice("无法自动复制，请手动选择并复制。");
    }
  }

  return (
    <section className="console-page">
      <header className="console-page-head">
        <h1 tabIndex={-1}>我的应用</h1>
        <p className="console-page-caption">
          登记你控制的应用实例。只需要应用地址、APP_ID 和 AppSecret，其余信息由 Mira ID 自动读取。
        </p>
      </header>

      {error ? (
        <p role="alert" className="cloud-notice">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="cloud-notice cloud-notice-success">
          {notice}
        </p>
      ) : null}

      <section className="console-section" aria-labelledby="application-list">
        <div className="console-section-head">
          <div>
            <h2 id="application-list">应用实例</h2>
            <p className="console-section-caption">
              “我的应用”是管理关系，不等于“关联服务”的使用授权。
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void refresh()}>
              刷新
            </Button>
            <Button type="button" disabled={busy} onClick={openRegister}>
              登记应用
            </Button>
          </div>
        </div>

        {!catalog ? (
          <p className="console-section-caption">{error ? "无法加载应用。" : "正在加载应用…"}</p>
        ) : !catalog.applications.length ? (
          <p className="console-section-caption">尚未登记应用。</p>
        ) : null}

        {catalog?.applications.map((application) => (
          <section key={application.appId} className="console-section">
            <div className="console-section-head">
              <div>
                <h3 className="font-semibold">{application.manifest.name}</h3>
                <p className="console-section-caption">
                  {application.manifest.projectId} · revision{" "}
                  {application.manifest.manifestRevision} ·{" "}
                  {application.disabledAt ? "已停用" : "已启用"}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void changeStatus(
                      application.appId,
                      application.manifest.name,
                      !application.disabledAt,
                    )
                  }
                >
                  {application.disabledAt ? "启用" : "停用"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void remove(application.appId, application.manifest.name)}
                >
                  移除
                </Button>
              </div>
            </div>
            <dl className="console-facts">
              <div>
                <dt>应用地址</dt>
                <dd className="break-all">{application.origin}</dd>
              </div>
              <div>
                <dt>APP_ID</dt>
                <dd className="break-all">
                  {application.appId}{" "}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void copy(application.appId, "APP_ID")}
                  >
                    复制
                  </Button>
                </dd>
              </div>
              <div>
                <dt>OAuth 回调</dt>
                <dd className="break-all">{application.manifest.oauth.redirectUris.join("、")}</dd>
              </div>
            </dl>
            <h4 className="font-medium text-sm mt-3">自动发现的服务</h4>
            {!application.manifest.services.length ? (
              <p className="console-section-caption">这个实例当前没有声明服务。</p>
            ) : (
              application.manifest.services.map((service) => (
                <div className="cloud-row" key={service.serviceId}>
                  <span className="cloud-row-copy min-w-0">
                    <strong>{service.name}</strong>
                    <small className="break-all">
                      {service.protocol.name} · {service.protocol.version} ·{" "}
                      {service.protocol.endpoint}
                    </small>
                    <small className="break-all">{service.resource}</small>
                  </span>
                  <span className="text-sm shrink-0">{service.type}</span>
                </div>
              ))
            )}
          </section>
        ))}
      </section>

      <dialog
        ref={dialogRef}
        className="cloud-dialog"
        aria-labelledby="register-application"
        onCancel={(event) => {
          event.preventDefault();
          closeRegister();
        }}
      >
        <div className="cloud-dialog-head">
          <div>
            <h2 id="register-application">登记应用</h2>
            <p className="cloud-dialog-caption">
              Mira ID 会从应用地址读取元信息，并用 APP_ID + AppSecret 验证你对这个实例的控制。
            </p>
          </div>
        </div>
        <form onSubmit={(event) => void submit(event)} className="cloud-dialog-form">
          {registrationError ? (
            <p role="alert" className="cloud-notice">
              {registrationError}
            </p>
          ) : null}
          <div className="cloud-field">
            <label htmlFor="application-origin">应用地址</label>
            <Input
              id="application-origin"
              required
              type="url"
              placeholder="https://who-you.tomz.io"
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
            />
          </div>
          <div className="cloud-field">
            <label htmlFor="application-id">APP_ID</label>
            <Input
              id="application-id"
              required
              minLength={8}
              maxLength={160}
              autoComplete="off"
              spellCheck={false}
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
            />
          </div>
          <div className="cloud-field">
            <label htmlFor="application-secret">AppSecret</label>
            <Input
              id="application-secret"
              required
              minLength={16}
              maxLength={512}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={appSecret}
              onChange={(event) => setAppSecret(event.target.value)}
            />
          </div>
          <p className="console-section-caption">
            AppSecret 仅用于本次服务端登记验证，不会显示在应用列表，也不会下发给 Mira 终端。
          </p>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" disabled={busy} onClick={() => closeRegister()}>
              取消
            </Button>
            <Button type="submit" disabled={busy || !origin || !appId || !appSecret}>
              {busy ? "验证中…" : "验证并登记"}
            </Button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
