const ACCEPTANCE_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Mira Cloud Auth · Test Acceptance</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #0b0d10; color: #f5f7fa; display: grid; place-items: center; padding: 24px; }
    main { width: min(560px, 100%); background: #15181d; border: 1px solid #2a2f36; border-radius: 18px; padding: 28px; box-shadow: 0 18px 60px rgba(0,0,0,.35); }
    .eyebrow { color: #a7b0bd; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 8px 0 6px; font-size: 28px; }
    .subtle { color: #a7b0bd; line-height: 1.6; margin: 0 0 22px; }
    form { display: grid; gap: 12px; }
    label { display: grid; gap: 7px; font-size: 14px; color: #cbd2da; }
    input { width: 100%; border: 1px solid #343a43; background: #0f1216; color: #fff; border-radius: 10px; padding: 12px 13px; font: inherit; }
    input:focus { outline: 2px solid #6b8afd; outline-offset: 1px; border-color: transparent; }
    button { border: 0; border-radius: 10px; padding: 12px 14px; font: inherit; font-weight: 650; cursor: pointer; }
    button.primary { background: #eef2ff; color: #10131a; }
    button.secondary { background: #252a31; color: #f5f7fa; }
    button:disabled { opacity: .5; cursor: wait; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .panel { margin-top: 20px; border-top: 1px solid #2a2f36; padding-top: 18px; }
    .status { border-radius: 10px; padding: 11px 12px; background: #101318; color: #cbd2da; white-space: pre-wrap; word-break: break-word; }
    .status.ok { background: #102017; color: #b8f1ca; }
    .status.error { background: #261416; color: #ffb9bf; }
    dl { display: grid; grid-template-columns: 100px 1fr; gap: 7px 12px; margin: 14px 0 0; font-size: 14px; }
    dt { color: #8f99a7; }
    dd { margin: 0; word-break: break-all; }
    .hidden { display: none; }
    footer { margin-top: 20px; color: #788391; font-size: 12px; line-height: 1.55; }
  </style>
</head>
<body>
<main>
  <div class="eyebrow">Mira Cloud Auth · Test only</div>
  <h1>登录验收</h1>
  <p class="subtle">这个页面只验证 OPS-006 的用户链路：登录、刷新恢复 Session、退出和错误状态。它不是管理员后台，也不是正式客户端。</p>

  <form id="login-form">
    <label>账号
      <input id="username" name="username" autocomplete="username" required maxlength="128">
    </label>
    <label>密码
      <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256">
    </label>
    <button id="login-button" class="primary" type="submit">登录 Mira Cloud</button>
  </form>

  <div class="panel">
    <div id="status" class="status">正在检查当前 Session…</div>
    <dl id="account" class="hidden">
      <dt>账号</dt><dd id="account-name"></dd>
      <dt>Account ID</dt><dd id="account-id"></dd>
      <dt>到期</dt><dd id="expires-at"></dd>
    </dl>
    <div class="row">
      <button id="restore-button" class="secondary" type="button">重新检查 Session</button>
      <button id="logout-button" class="secondary" type="button">退出登录</button>
    </div>
  </div>

  <footer>
    Session 只保存在本标签页的 sessionStorage，用于验收刷新恢复；正式 Desktop/Mobile 仍应使用各自的安全存储。Cloud 不可达不会自动删除本地 Session，只有服务明确返回 401 才视为需要重新登录。
  </footer>
</main>
<script src="./acceptance.js" defer></script>
</body>
</html>`;

const ACCEPTANCE_JS = String.raw`(() => {
  const key = "mira-cloud-auth-test-session";
  const form = document.querySelector("#login-form");
  const username = document.querySelector("#username");
  const password = document.querySelector("#password");
  const loginButton = document.querySelector("#login-button");
  const restoreButton = document.querySelector("#restore-button");
  const logoutButton = document.querySelector("#logout-button");
  const status = document.querySelector("#status");
  const account = document.querySelector("#account");
  const accountName = document.querySelector("#account-name");
  const accountId = document.querySelector("#account-id");
  const expiresAt = document.querySelector("#expires-at");

  const endpoint = (path) => "./" + path.replace(/^\\/+/, "");

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = "status" + (kind ? " " + kind : "");
  }

  function showAccount(data) {
    accountName.textContent = data.account.username;
    accountId.textContent = data.account.id;
    expiresAt.textContent = new Date(data.expiresAt).toLocaleString();
    account.classList.remove("hidden");
  }

  function hideAccount() {
    account.classList.add("hidden");
    accountName.textContent = "";
    accountId.textContent = "";
    expiresAt.textContent = "";
  }

  async function restore() {
    const token = sessionStorage.getItem(key);
    if (!token) {
      hideAccount();
      setStatus("当前没有保存的测试 Session。");
      return;
    }

    try {
      const response = await fetch(endpoint("v1/auth/session"), {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store"
      });

      if (response.status === 401) {
        sessionStorage.removeItem(key);
        hideAccount();
        setStatus("Session 已失效，需要重新登录。", "error");
        return;
      }

      if (!response.ok) {
        setStatus("Cloud Auth 当前不可用（HTTP " + response.status + "）。本地 Session 已保留。", "error");
        return;
      }

      const data = await response.json();
      showAccount(data);
      setStatus("Session 有效，刷新页面后仍可恢复。", "ok");
    } catch {
      setStatus("无法连接 Cloud Auth。本地 Session 已保留，不视为退出登录。", "error");
    }
  }

  async function login(event) {
    event.preventDefault();
    loginButton.disabled = true;
    setStatus("正在登录…");

    try {
      const response = await fetch(endpoint("v1/auth/login"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.value, password: password.value }),
        cache: "no-store"
      });
      const data = await response.json();

      if (!response.ok) {
        hideAccount();
        setStatus((data.error && data.error.message) || ("登录失败（HTTP " + response.status + "）"), "error");
        return;
      }

      sessionStorage.setItem(key, data.sessionToken);
      password.value = "";
      showAccount(data);
      setStatus("登录成功。现在可以刷新页面验证 Session 恢复。", "ok");
    } catch {
      setStatus("无法连接 Cloud Auth。没有修改本地 Session。", "error");
    } finally {
      loginButton.disabled = false;
    }
  }

  async function logout() {
    const token = sessionStorage.getItem(key);
    if (!token) {
      hideAccount();
      setStatus("当前没有可退出的 Session。");
      return;
    }

    logoutButton.disabled = true;
    try {
      const response = await fetch(endpoint("v1/auth/logout"), {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store"
      });

      if (!response.ok && response.status !== 401) {
        setStatus("退出请求失败（HTTP " + response.status + "），本地 Session 暂时保留。", "error");
        return;
      }

      sessionStorage.removeItem(key);
      hideAccount();
      setStatus("已退出。旧 Session 不应再被接受。", "ok");
    } catch {
      setStatus("Cloud Auth 当前不可用；为避免把网络故障误判成退出，本地 Session 已保留。", "error");
    } finally {
      logoutButton.disabled = false;
    }
  }

  form.addEventListener("submit", login);
  restoreButton.addEventListener("click", restore);
  logoutButton.addEventListener("click", logout);
  void restore();
})();`;

export function registerAcceptanceUi(app: import("fastify").FastifyInstance): void {
  app.get("/", async (_request, reply) => {
    return reply
      .header("cache-control", "no-store")
      .header(
        "content-security-policy",
        "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      )
      .type("text/html; charset=utf-8")
      .send(ACCEPTANCE_HTML);
  });

  app.get("/acceptance.js", async (_request, reply) => {
    return reply
      .header("cache-control", "no-store")
      .type("application/javascript; charset=utf-8")
      .send(ACCEPTANCE_JS);
  });
}
