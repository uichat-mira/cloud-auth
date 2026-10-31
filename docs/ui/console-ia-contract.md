# Console IA contract (implementation source of truth)

This is the build contract for the account-console restructure. The design rationale is in
`mira-redesign-spec.md` § Information architecture; this file pins the *names* so parallel
work stays compatible. Do not rename routes, exports, ids, copy or CSS classes listed here.

## 1. Route tree

```tsx
// src/app/routes.tsx
[
  { element: <PublicLayout />, errorElement: <RouteErrorPage />, children: [
      { index: true, element: <PortalHome /> },        // redirects by auth status
      { path: "login", element: <LoginPage /> },
      { path: "*", element: <NotFoundPage /> },
  ]},
  { path: "account", element: <AccountLayout />, errorElement: <RouteErrorPage />, children: [
      { index: true, element: <OverviewPage /> },      // /account
      { path: "devices", element: <DevicesPage /> },   // /account/devices
      { path: "security", element: <SecurityPage /> }, // /account/security
      { path: "services", element: <ServicesPage /> }, // /account/services
      { path: "*", element: <NotFoundPage /> },        // inside the console shell
  ]},
]
```

`PublicLayout` lives in `src/app/root-layout.tsx` (keeps exporting `PortalShell` for the
existing test that mounts it directly). `AccountLayout` lives in `src/app/account-layout.tsx`.

## 2. Page exports (each default-free, named)

| Module | Export |
| --- | --- |
| `@/pages/account/overview-page` | `OverviewPage` |
| `@/pages/account/devices-page` | `DevicesPage` |
| `@/pages/account/security-page` | `SecurityPage` |
| `@/pages/account/services-page` | `ServicesPage` |
| `@/app/account-layout` | `AccountLayout` |
| `@/app/root-layout` | `PortalShell`, `PublicLayout` |
| `@/components/console-nav` | `ConsoleNav`, `consoleSections` |
| `@/components/session-block` | `SessionBlock` |
| `@/components/session-recovery` | `SessionRecovery` |

Shared labels: `@/lib/auth/session-labels` exports `sessionLabels`.

## 3. Shell markup (desktop ≥1024: rail; below: tab strip; single session node)

```tsx
<div className="console-shell">
  <header className="console-header">
    <div className="console-container console-header-inner">
      <Link className="console-brand" to={authenticated ? "/account" : "/login"}>…brand…</Link>
      {authenticated ? <div className="console-identity">avatar + username + status dot + 已登录</div>
                     : <Link className="console-header-action" to="/login">登录</Link>}
    </div>
  </header>
  <div className="console-container console-body">
    <aside className="console-rail">
      <ConsoleNav />                    {/* authenticated: 4 links, else zero links */}
      <SessionBlock />                  {/* authenticated only: 状态 · 到期 + 退出登录 */}
    </aside>
    <main className="console-main">
      <Outlet />                        {/* or <SessionRecovery /> when not authenticated */}
      <p className="console-note">Mira Cloud Account · 独立云身份 · 本地 Mira 依然可用</p>
    </main>
  </div>
</div>
```

* `ConsoleNav` — `<nav aria-label="账户分区" className="console-nav">`, one `NavLink` per
  section, `aria-current` from NavLink automatically. Items (`consoleSections`):
  `/account` 概览 (`end`), `/account/devices` 设备与授权, `/account/security` 账户安全,
  `/account/services` 关联服务. When status is not `authenticated`, render `<nav>` with no
  links (or a 12px muted line).
* `SessionBlock` — single instance: `状态 · 到期 {formatExpiry} · 退出登录`（Button variant
  ghost size sm, text exactly `退出登录`, `disabled` when pending). This is the **only**
  退出登录 control in the app.
* Notices live in `AccountLayout` (above `<Outlet/>`): `AuthFailureAlert` + the
  `session_renewed` / `password_changed` `role="status"` paragraphs, unchanged copy.
* Gate: `idle|restoring` → skeleton (no nav links); `unauthenticated|unavailable` →
  page head `我的账户` + `SessionRecovery`; never fetch grants in those states.
* Route change: `window.scrollTo({ top: 0 })` and focus the page `h1` (`tabIndex={-1}`),
  both feature-guarded (`scrollIntoView?.`, `typeof window !== "undefined"`), skip first render.

## 4. Page markup + copy (authoritative)

Every page root: `<section className="console-page">` with
`<header className="console-page-head"><h1 id=…>…</h1><p className="console-page-caption">…</p></header>`.

### /account — `我的账户`
```tsx
<h1 id="overview-title">我的账户</h1>
<p>{account.username} · Mira Cloud Account · {sessionLabels[status]}</p>

<section aria-labelledby="overview-account">           // 分区 1
  <div className="console-section-head">
    <div><h2 id="overview-account">账户</h2>
      <p className="console-section-caption">登录方式与账户标识。</p></div>
    <Link to="/account/security" className="console-section-link">管理会话</Link>
  </div>
  <dl className="console-facts">
    <div><dt>账号</dt><dd>{username}</dd></div>
    <div><dt>Account ID</dt><dd className="cloud-mono">{account.id}</dd></div>
    <div><dt>登录状态</dt><dd>{sessionLabels[status]}</dd></div>
    <div><dt>会话到期</dt><dd>{formatExpiry(expiresAt)}</dd></div>
  </dl>
</section>

<section aria-labelledby="overview-devices">           // 分区 2, counts via useDeviceGrants
  heading 设备与授权 + caption 「云端保存的授权与设备数量。」 + link 管理 →
  <ul className="console-summary">
    <li><strong>{hosts}</strong><span>Desktop Host</span></li>
    <li><strong>{mobiles}</strong><span>手机设备</span></li>
    <li><strong>{activeGrants}</strong><span>有效授权</span></li>
  </ul>
  // loading: one `.console-skeleton-line`; failure: <p className="console-inline-note">
  // 「暂时无法读取设备授权，请前往设备与授权页重试。」 with link 前往设备与授权
</section>

<section aria-labelledby="overview-services">          // 分区 3
  heading 关联服务 + caption 「以下能力尚未接入此 Portal。」 + link 查看 →
  <p className="console-inline-note">2 项能力 · 尚未接入</p>
</section>
```

### /account/devices — `设备与授权`
```tsx
<h1 id="device-grants-heading">设备与授权</h1>
<p>云端保存的授权状态；刷新只读取云端快照，不会强制 Desktop 立即同步。</p>
<DeviceGrantsCard />            // owns 刷新列表 + summary + records + empty/loading/error
<p className="console-note-block">…单一页脚说明：生效时机 + 本地/直连/Tailscale 不受影响…</p>
```

### /account/security — `账户安全`
```tsx
<h1 id="account-security-heading">账户安全</h1>
<p>密码与此浏览器的云端会话。</p>

<section aria-labelledby="security-password">
  <div className="console-section-head"><div><h2 id="security-password">密码</h2>
    <p className="console-section-caption">修改后，云端会话需要重新登录。</p></div></div>
  <button type="button" aria-label="修改密码" className="cloud-row" onClick={open}>
    修改密码 + caption 修改后，云端会话需要重新登录
  </button>
</section>

<section aria-labelledby="security-session">
  heading 当前登录会话 + caption 「仅管理此浏览器的会话。」 + action <Button>续期 Session</Button>
  <dl className="console-facts">状态 / 到期时间</dl>
</section>
<ChangePasswordDialog … />
```
`续期 Session` must be visible without expanding anything.

### /account/services — `关联服务`
```tsx
<h1 id="future-services-heading">关联服务</h1>
<p>以下能力尚未接入此 Portal，不影响当前账号及设备授权。</p>
<FutureServices />        // rows only, no internal h2
```

## 5. Component changes

* `device-grants-card.tsx` — no `<section aria-labelledby>` header, no h2; keeps 刷新列表,
  summary strip, host records, empty/loading/failure, footnote. Its copy that tests rely on:
  `没有可管理的 Desktop Host`, `刷新列表`, `重新读取`, `云端版本 {revision}`, `最近在线`, `离线`.
* `host-grant-card.tsx` — drop `查看授权细节` `<details>`; `云端版本 {n}` becomes part of the
  host header row; the prose description becomes a facts row (`最近在线 …` / `在线租约至 …` /
  `未观察到在线`); the long disclaimer moves out to the devices page footer note.
* `future-services.tsx` — rows only (name + `尚未接入` pill + description + detail).
* `mobile-grant-row.tsx` — keep aria-labels exactly: `调整范围`, `撤销授权`, `确认撤销`.
* `change-password-dialog.tsx`, `auth-failure-alert.tsx` — untouched.

## 6. CSS contract (`src/styles/console.css`, new)

Load order in `src/main.tsx`: `globals → cloud-shell → console → cloud-pages → cloud-grants`.
Console classes: `.console-shell`, `.console-container` (max 1120, 24px gutters),
`.console-header`, `.console-header-inner`, `.console-brand`, `.console-header-action`,
`.console-identity`, `.console-identity-copy`, `.console-status-dot`,
`.console-body` (grid `212px minmax(0,1fr)`, gap 40; ≤1023: block),
`.console-rail` (sticky, 24px top), `.console-nav`, `.console-nav-link`,
`.console-nav-link[aria-current="page"]`, `.console-session`, `.console-session-copy`,
`.console-session-expiry`, `.console-main` (max-width 960), `.console-page`,
`.console-page-head`, `.console-page-caption`, `.console-page-action`, `.console-section`,
`.console-section-head`, `.console-section-title`, `.console-section-caption`,
`.console-section-link`, `.console-facts` / `.console-facts > div` / `dt` / `dd`,
`.console-summary` / `.console-summary li`, `.console-inline-note`, `.console-note`,
`.console-note-block`, `.console-skeleton-line`.

Rules: tokens only (`--mc-*`), no `!important` (reduced-motion guard excepted), no
`1px solid`, data text 13px+, metadata 11–12px max, hairline hairlines via
`box-shadow: 0 0 0 .5px`, focus ring from the global unlayered rule, rail rows 32px,
mobile tabs 40px min-height and horizontally scrollable (`overflow-x:auto`,
`scrollbar-width:none`).

## 7. File ownership (avoid concurrent writes)

| Owner | Files |
| --- | --- |
| impl-shell | `src/app/routes.tsx`, `src/app/root-layout.tsx`, `src/app/account-layout.tsx`, `src/app/account-shell.tsx` (optional split), `src/components/console-nav.tsx`, `src/components/session-block.tsx`, `src/components/session-recovery.tsx`, `src/styles/console.css`, `src/main.tsx` |
| impl-console-pages | `src/pages/account/*.tsx`, delete `src/pages/account-page.tsx`, `src/components/device-grants-card.tsx`, `src/components/host-grant-card.tsx`, `src/components/future-services.tsx`, `src/components/mobile-grant-row.tsx`, `src/styles/cloud-pages.css`, `src/styles/cloud-grants.css` |
| impl-tests | `tests/**` |
| lead | docs, verification, gates |

## 8. Invariants that must not regress
* Exactly one `role="status"` and one `role="alert"` per rendered state (existing contract).
* h1 per route: `我的账户` / `设备与授权` / `账户安全` / `关联服务`; `页面不存在` for 404s.
* `data-slot` attributes on Button/Input/Card stay.
* Copy that tests assert stays: `我的账户`, `设备与授权`, `账户安全`, `关联服务`, `密码`,
  `当前登录会话`, `续期 Session`, `修改密码`, `退出登录`, `刷新列表`, `重新读取`,
  `调整范围`, `撤销授权`, `确认撤销`, `前往登录`, `重新检查登录状态`,
  `没有可管理的 Desktop Host`, `云端版本`, `最近在线`, `离线`, `尚未接入`.
* No horizontal overflow at 320 / 375 / 390 / 768 / 1024 / 1280 / 1440.

## 9. As built — adjudicated deviations from this contract

Recorded after implementation so the next reader does not treat them as drift.

1. **Rail sticky offset is `top:72px`**, not 24px: with a 56px translucent sticky header a
   24px offset parks the rail underneath it. Headings get `scroll-margin-top:72px`, so the
   route-entry focus jump also clears the header.
2. **Public shell keeps its `账户中心` link for signed-in visitors.** The console is not reached
   through the public shell any more, but a signed-in user's `*` 404 still renders there, so the
   single link stays as the way back. `portal-navigation.test.tsx` covers it.
3. **Host facts do not include `在线租约至`.** The management ledger exposes only
   id / displayName / clientVersion / availability (no lease timestamps), so each record prints
   an honest observation line instead: `最近在线 · 客户端版本 X · 云端最近观察到此 Host 在线，
   不代表网络一定可达` or `未观察到在线 · 客户端版本 X · 云端当前没有此 Host 的在线租约`.
   The status chip keeps the exact `最近在线` / `离线` text nodes.
4. **Modal alert arbitration is React state, not CSS.** `components/modal-open-context.tsx`
   (`ModalOpenProvider` / `useModalOpen` / `useRegisterModalOpen`) lets the layout drop its own
   `AuthFailureAlert` while the password dialog is open, so the dialog's alert is the only one.
   A `:has(dialog[open])` rule was tried first and rejected: it hides the node visually but leaves
   it in the accessible tree for tests and non-browser clients.
5. **`formatExpiry` lives in `src/lib/format.ts`**, shared by the rail and the account facts
   (the temporary per-directory copies were removed).
6. **One grant fetch per route.** The overview, devices page and any future surface call
   `useDeviceGrants` independently — no cross-route cache. Accepted: each fetch is a single
   read-only snapshot, and a shared cache would need invalidation semantics the API does not
   define yet. Revisit when the API grows a snapshot version/etag.
7. **Security section caption appears once** (on the 修改密码 row), not twice as drafted; the
   section heading row keeps only the h2.
8. **Mobile hit areas** were finished in the verification pass: brand link, section links
   (`min-width:44px; min-height:40px`), login inputs (40px) and the dialog close button (40px)
   were raised to the 40px minimum below 640px.
9. **Each host record is a heading.** `CardTitle` gained an `as` prop; the records page renders
   `h2` per record, so the page outline is h1 → one h2 per Host. Every Desktop Host registers
   with `clientName: "Mira Desktop"` (see `docs/auth-v0.md`), so records would otherwise read as
   N identical rows: the vendor line now carries `Mira Desktop · Host {first 8 of host id}` and
   the heading's accessible name repeats it, while the visible title stays the display name.

10. **2026-10-31 mobile console navigation.** The four-section nav remains the only rail content.
    At widths below 1024px it becomes a compact sticky tab row immediately below the sticky
    account header; normal page content scrolls underneath it. The sole logout action now
    lives in a dropdown opened from the upper-right account identity on all screen sizes.
    The `SessionBlock` export remains for compatibility, but it renders the header account
    menu rather than a second rail row. The prior rail logout markup in §3 is superseded
    by this intentional mobile usability change.
