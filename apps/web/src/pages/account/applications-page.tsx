import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/context";
import {
  ApplicationRequestError,
  createApplicationClient,
  type ApplicationCatalog,
  type AppSecret,
} from "@/lib/applications/client";

type Operation = { action: "create" } | { action: "rotate" | "disable" | "enable"; id: string };
const actionLabel = {
  create: "创建应用",
  rotate: "重置密钥",
  disable: "停用应用",
  enable: "启用应用",
};
const errorMessage = (error: unknown) => {
  if (!(error instanceof ApplicationRequestError)) return "操作未完成，请刷新确认状态后重试。";
  if (error.code === "AUTH_INVALID_CREDENTIALS") return "当前密码不正确。";
  if (error.code === "APPLICATION_DECLARATION_FORBIDDEN")
    return "项目或地址不在当前账号已核验的授权范围内。";
  if (error.code === "APPLICATION_IDENTITY_CONFLICT")
    return "此项目或回调地址已登记，不能重复创建。";
  if (error.code === "APPLICATION_DEVELOPER_REQUIRED") return "当前账号没有应用开发权限。";
  if (error.status === 429) return "尝试次数过多，请稍后重试。";
  if (error.status === 401) return "登录已失效，请重新登录。";
  if (error.status === 400) return "请输入有效项目标识、名称与 HTTPS 地址。";
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
  const [operation, setOperation] = useState<Operation | null>(null);
  const [secret, setSecret] = useState<AppSecret | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [callback, setCallback] = useState("");
  const [origins, setOrigins] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const mounted = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const token = getSessionToken();
    if (!token) return;
    const request = ++generation.current;
    void client
      .list(token)
      .then((result) => {
        if (mounted.current && request === generation.current && getSessionToken() === token)
          setCatalog(result);
      })
      .catch((failure) => {
        if (!mounted.current || request !== generation.current || getSessionToken() !== token)
          return;
        if (failure instanceof ApplicationRequestError && failure.status === 401)
          invalidateSession(token);
        setError(errorMessage(failure));
      });
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
      if (mounted.current && request === generation.current && token === getSessionToken())
        setCatalog(result);
    } catch (failure) {
      if (!mounted.current || request !== generation.current || token !== getSessionToken()) return;
      if (failure instanceof ApplicationRequestError && failure.status === 401)
        invalidateSession(token);
      setError(errorMessage(failure));
    }
  }

  function start(op: Operation) {
    setSecret(null);
    setNotice("");
    setError("");
    setPassword("");
    if (op.action === "create") {
      setName("");
      setProjectId("");
      setCallback("");
      setOrigins([]);
    }
    setOperation(op);
  }
  useEffect(() => {
    if (!operation) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, [operation]);
  function close() {
    if (busy) return;
    setPassword("");
    setOperation(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !operation || !password) return;
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    setError("");
    setSecret(null);
    const currentPassword = password;
    setPassword("");
    try {
      const result =
        operation.action === "create"
          ? await client.create(token, {
              projectId: projectId.trim(),
              displayName: name.trim(),
              redirectUri: callback.trim(),
              endpointOrigins: origins,
              currentPassword,
            })
          : await client[operation.action](token, operation.id, currentPassword);
      if (!mounted.current || getSessionToken() !== token) return;
      if ("managementToken" in result) setSecret(result);
      else setNotice("应用已停用。");
      setOperation(null);
      await refresh();
    } catch (failure) {
      if (!mounted.current || getSessionToken() !== token) return;
      if (failure instanceof ApplicationRequestError && failure.status === 401)
        invalidateSession(token);
      setError(errorMessage(failure));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function copy(value: string, kind: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(kind + " 已复制。");
    } catch {
      setNotice("无法自动复制，请手动选择并复制。");
    }
  }
  const canCreate = !!catalog?.developer;
  return (
    <section className="console-page">
      <header className="console-page-head">
        <h1 tabIndex={-1}>应用管理</h1>
        <p className="console-page-caption">
          管理归属于当前 Mira 账号的应用、服务端凭据与服务声明。
        </p>
      </header>
      {error && !operation ? (
        <p role="alert" className="cloud-notice">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="cloud-notice cloud-notice-success">
          {notice}
        </p>
      ) : null}
      {secret ? (
        <section className="console-section" aria-labelledby="issued-secret">
          <div className="console-section-head">
            <div>
              <h2 id="issued-secret">应用凭据已签发</h2>
              <p className="console-section-caption">
                AppSecret 只显示本次。请保存到应用服务端的秘密管理环境，关闭后无法再次查看。
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => setSecret(null)}>
              关闭
            </Button>
          </div>
          <div className="cloud-field">
            <label htmlFor="issued-app-id">AppID</label>
            <div className="flex items-center gap-2">
              <Input id="issued-app-id" readOnly value={secret.clientId} />
              <Button variant="outline" onClick={() => void copy(secret.clientId, "AppID")}>
                复制 AppID
              </Button>
            </div>
          </div>
          <div className="cloud-field">
            <label htmlFor="issued-app-secret">AppSecret</label>
            <div className="flex items-center gap-2">
              <Input
                id="issued-app-secret"
                readOnly
                value={secret.managementToken}
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                variant="outline"
                onClick={() => void copy(secret.managementToken, "AppSecret")}
              >
                复制 AppSecret
              </Button>
            </div>
          </div>
        </section>
      ) : null}
      <section className="console-section" aria-labelledby="my-apps">
        <div className="console-section-head">
          <div>
            <h2 id="my-apps">我的应用</h2>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void refresh()}>
              刷新
            </Button>
            {canCreate ? (
              <Button type="button" disabled={busy} onClick={() => start({ action: "create" })}>
                创建应用
              </Button>
            ) : null}
          </div>
        </div>
        {!catalog ? (
          <p className="console-section-caption">{error ? "无法加载应用。" : "正在加载应用…"}</p>
        ) : !canCreate && !catalog.applications.length ? (
          <p className="console-section-caption">当前账号尚未开通应用开发权限。</p>
        ) : !catalog.applications.length ? (
          <p className="console-section-caption">尚未创建应用。</p>
        ) : null}
        {catalog?.applications.map((app) => (
          <section key={app.clientId} className="console-section">
            <div className="console-section-head">
              <div>
                <h3 className="font-semibold">{app.displayName}</h3>
                <p className="console-section-caption">
                  {app.disabled ? "已停用" : "已启用"} · {app.projectId}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {!app.disabled ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => start({ action: "rotate", id: app.clientId })}
                    >
                      重置密钥
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={busy}
                      onClick={() => start({ action: "disable", id: app.clientId })}
                    >
                      停用
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => start({ action: "enable", id: app.clientId })}
                  >
                    重新启用
                  </Button>
                )}
              </div>
            </div>
            <dl className="console-facts">
              <div>
                <dt>AppID</dt>
                <dd className="break-all">
                  {app.clientId}{" "}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void copy(app.clientId, "AppID")}
                  >
                    复制
                  </Button>
                </dd>
              </div>
              <div>
                <dt>AppSecret</dt>
                <dd>{app.disabled ? "已失效" : "••••••••••••••••"}</dd>
              </div>
              <div>
                <dt>OAuth 回调</dt>
                <dd className="break-all">{app.redirectUri}</dd>
              </div>
              <div>
                <dt>服务来源</dt>
                <dd className="break-all">{app.endpointOrigins.join("、")}</dd>
              </div>
            </dl>
            <h4 className="font-medium text-sm mt-3">已登记服务</h4>
            {!app.services.length ? (
              <p className="console-section-caption">
                尚未登记。请在应用服务端配置凭据后调用服务登记 API。
              </p>
            ) : null}
            {app.services.map((service) => (
              <div className="cloud-row" key={service.definition.serviceId}>
                <span className="cloud-row-copy min-w-0">
                  <strong>{service.definition.displayName}</strong>
                  <small className="break-all">
                    {service.definition.protocol.name} · {service.definition.protocol.version} ·{" "}
                    {service.definition.protocol.endpoint}
                  </small>
                  <small className="break-all">{service.definition.scopes.join("、")}</small>
                </span>
                <span className="text-sm shrink-0">
                  {app.disabled ? "应用停用" : service.retired ? "已下架" : "已登记"}
                </span>
              </div>
            ))}
          </section>
        ))}
      </section>
      {operation ? (
        <dialog
          ref={dialogRef}
          className="cloud-dialog"
          aria-labelledby="app-operation"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <div className="cloud-dialog-head">
            <div>
              <h2 id="app-operation">{actionLabel[operation.action]}</h2>
              <p className="cloud-dialog-caption">
                {operation.action === "disable"
                  ? "停用会阻止新登录、签发并撤销现有服务授权。"
                  : operation.action === "rotate"
                    ? "重置后旧 AppSecret 立即失效。"
                    : operation.action === "enable"
                      ? "重新启用将签发新密钥，不恢复旧用户授权。"
                      : "仅可登记当前账号已获准的项目与 HTTPS 地址。"}
              </p>
            </div>
          </div>
          <form onSubmit={(event) => void submit(event)} className="cloud-dialog-form">
            {operation.action === "create" ? (
              <>
                <div className="cloud-field">
                  <label htmlFor="app-name">应用名称</label>
                  <Input
                    id="app-name"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="cloud-field">
                  <label htmlFor="app-project">项目标识</label>
                  <Input
                    id="app-project"
                    required
                    pattern="[a-z][a-z0-9-]{0,63}"
                    placeholder="who-you"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  />
                </div>
                <div className="cloud-field">
                  <label htmlFor="app-callback">OAuth 回调地址</label>
                  <Input
                    id="app-callback"
                    required
                    type="url"
                    value={callback}
                    onChange={(e) => setCallback(e.target.value)}
                  />
                </div>
                <fieldset>
                  <legend>允许的服务来源</legend>
                  {catalog?.developer?.endpointOrigins.map((origin) => (
                    <label key={origin} className="flex items-center gap-2 py-1 break-all">
                      <input
                        type="checkbox"
                        checked={origins.includes(origin)}
                        onChange={(e) =>
                          setOrigins((old) =>
                            e.target.checked ? [...old, origin] : old.filter((o) => o !== origin),
                          )
                        }
                      />
                      {origin}
                    </label>
                  ))}
                </fieldset>
              </>
            ) : null}
            <div className="cloud-field">
              <label htmlFor="app-current-password">当前密码</label>
              <Input
                id="app-current-password"
                required
                maxLength={256}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="cloud-notice">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" disabled={busy} onClick={close}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={busy || !password || (operation.action === "create" && !origins.length)}
                variant={operation.action === "disable" ? "destructive" : "default"}
              >
                {busy ? "提交中…" : actionLabel[operation.action]}
              </Button>
            </div>
          </form>
        </dialog>
      ) : null}
    </section>
  );
}
