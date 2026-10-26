# Mira Cloud Account — Current UI Audit (pre-redesign baseline)

Audit date: 2026-10-26 · Auditor: ui-auditor (read-only for `apps/web/src`)
Audited commit: **`b1f358c` (HEAD)**. The working tree is mid-redesign while this audit ran
(other teammate's uncommitted changes: vendored Inter webfont, `--mc-*` tokens, Vite `/v1`
proxy, `dev` script parallelization). **None of those exist at HEAD**; every screenshot and
number below was captured from an isolated HEAD worktree to represent the honest "before".

**Evidence**
- Screenshots (full-page, 3 viewports 1280×800 / 768×1024 / 390×844): `.screenshots/current/`
  - `login-{1280x800,768x1024,390x844}.png`, `login-error-{1280x800,390x844}.png`
  - `account-{...}.png` (authenticated, populated grants), `account-empty-{...}.png`,
    `account-signedout-{1280x800,390x844}.png`
  - `notfound-{...}.png`
- Raw measurements (JSON): `measure-account-1280x800.json`, `measure-account-390x844.json`,
  `measure-account-empty-390x844.json`, `measure-login-1280x800.json`,
  `measure-login-390x844.json`, `measure-notfound-390x844.json`
- CSS/DOM statistics computed from `git show HEAD:…` (no dependency on the redesign branch).

**Environment used for capture (isolated so it never touched the shared dev stack)**
- API `http://127.0.0.1:8799`, DB `apps/api/data/ui-audit.sqlite`
- HEAD web `http://127.0.0.1:5190` (detached worktree, Vite proxy → 8799)
- Account `ui.audit` (password `AuditPass!2026x`, 15 chars — the API minimum), created with
  `pnpm run admin:dev provision ui.audit`, then `reset-password`; seeded 1 Desktop Host,
  2 devices, grant policy + mobile override, then emptied for the empty state.
- Chrome headless; screenshots full-page at CSS pixel scale.

---

## 1. Verdict

The current UI is a **two-design-systems hybrid**, not a single design. A warm,
heavy-letter-spaced editorial shell (`cloud-shell.css` / `cloud-pages.css`) sits on top of
stock shadcn/Tailwind components (`button/card/input.tsx` + `cloud-grants.css` overrides).
The seam is visible in the DOM and measurable: hand-written CSS (877 lines, 26 `!important`)
fights utility classes that in turn silently lose to unlayered CSS under Tailwind v4 layers;
tokens exist but are unused by the custom CSS; the declared font never loads; body copy is
sized for a dense data table, not a utility page. The largest real-world costs are
**illegible small text (65–73 % of text ≤12px, 43/82 nodes below 4.5:1 contrast)**,
**interactive elements with no affordance (14 of 21 across the audited pages)**, and
**a CSS layer nobody can safely change**.

Functional negatives are absent: zero horizontal overflow at 1440/1280/768/390/375/320,
granular error/empty/loading states exist, ARIA structure is present (if shallow), and the
110 existing test cases enforce a lot of copy. Nothing here needs a rewrite to *work*.

---

## 2. Top defects (all numbers measured at HEAD)

| # | Defect | Hard evidence |
|---|---|---|
| D1 | **Typography too small / too many sizes.** Body and labels are set at 10–12px. | Distinct font sizes **14** across pages (10, 11, 12, 13, 14, 15, 17, 18, 20, 21, 30, 36, 47 + 9px on mobile footer): /account 10 sizes, /login 9. **53/82 text nodes (64.6 %) and 777/1059 chars (73.4 %) ≤12px** on /account @1280; 50/77 (64.9 %) @390. Min size 9px (`.cloud-brand-copy small`) and 10px (eyebrow/footer). 13px appears on only 4/82 nodes. |
| D2 | **Declared font never loads.** `font-family: Inter, "SF Pro Display", "PingFang SC", "Microsoft YaHei", …` on `.cloud-shell`, but `document.fonts` has **0 faces**, canvas Inter-vs-fallback shift **0px**, and a width probe of “欢迎回来。Mira Cloud” @47px measured **370.81px = “Microsoft YaHei”** (Inter absent, Segoe UI 355.41). So the brand headline renders in YaHei. Body has a *second* stack (Tailwind `ui-sans-serif, system-ui, …, "Noto Sans SC"`). |
| D3 | **Contrast failures.** 43 of 82 text nodes <4.5:1 on /account @1280 (8 <3:1); 38/77 <4.5 (7 <3) @390. Worst **2.81:1** = `#99968e` on `#faf9f7` (detail `<dt>` labels, `›` chevrons, 12px). Footer 2.91 (`#96938e`), eyebrow 3.03, intro copy 3.41, host meta 3.64, secondary nav 4.33 — all below 4.5. Placeholder `#aaa69e` **2.31** on `#faf9f7` / 2.43 on white. 21 distinct text colors, incl. 8 near-identical grays (`#777671, #807d76, #85827c, #8a8780, #8b8982, #8d8a82, #92908a, #96938e, #99968e, #aaa69e`). |
| D4 | **No interaction affordance.** Across /login, /account, /404: **14 of 21 interactive elements have no fill, border or underline** (account 10/13 in `borderless-row` style, login 2/5, 404 2/3); **0** use underline. Same page mixes three affordance languages (bare 12px text button 刷新列表, 32px bordered 调整范围/撤销授权, 46px black 登录). |
| D5 | **Tap targets below minimum.** /account: **8 of 13 <44px**; **4 <24px** — `<summary>` rows 350×18 and 350×16.5, 调整范围 82×32, 撤销授权 80×32; brand link 143×40 desktop / **127.9×35** @390; dialog/console buttons 32px. |
| D6 | **Border/radius/shadow entropy.** **6 distinct border colors** in two parallel systems: hardcoded hex `#e8e6e1` (×15 on /account, ×11 elsewhere), `#dcd9d2`, `#d5d2cb`, `#e5e1da`, `#22211e`, plus token `oklch(0.917 0.006 85)` (×5). **8 non-zero radii**: 8px (Button), 9px (Input + submit), 10px & 12px (brand mark), 13px (host icon), 14px (`rounded-xl` Card, declared then overridden), 17px (dialog), 50 % (avatar) + 0px (cards). Shadows: exactly **1** uses `shadow-xs` (0 1px 2px rgba(0,0,0,.05)) while the dialog uses `0 36px 110px` — everything else flat. |
| D7 | **Over-spaced chrome.** Header 87px (73 @≤800, 64 @≤480); account hero padding **77px top / 54px bottom**; section padding 41px/62px; login grid padding **108px top / 130px bottom**, column gap 75px, form column 439px wide with 70px left padding + 1px border; account grid gap 60px (desktop) / 39px (mobile). Result: account page is 1720px tall @1280×800 (2.15 viewports) and 2268px @390×844 (2.69); login is 893px @844 despite being a 2-field form. |
| D8 | **CSS layer is unmaintainable.** 877 lines of hand-written CSS in 4 files (`globals` 96 + `shell` 118 + `pages` 289 + `grants` 374); **26 `!important` declarations in 7 rules** (cloud-pages 7/3: signout, primary, primary:hover; cloud-grants 19/4: refresh, grant-action, grant-action.danger, reduced-motion); **14 `[data-slot]` overrides** (5 hit `[data-slot="card"]`); **10 of 60 `.cloud-*` classes have no consumer** at HEAD (`cloud-grant-action`, `cloud-grant-edit`, `cloud-grant-warning`, `cloud-grants-alert`, `cloud-grants-empty`, `cloud-mobile-header|icon|info|heading`, `cloud-status-text`) ≈ 130 dead lines; **0 `var(--token)` references** in 877 custom lines although 23 are defined; brittle selectors: `button[variant="outline"]` (React prop never becomes a DOM attribute → can never match), `[class*="rounded-full"]` pill reset, `dialog[aria-labelledby="change-password-heading"]`. Conversely 30 `text-muted-foreground`, 9 `rounded-md`, 6 `text-destructive`, 3 `bg-primary` utilities are silently overridden by unlayered CSS. Dead component variants: `secondary`/`link` unused; all 4 CSS files are imported in `main.tsx` in order, so cascade depends on file order. |
| D9 | **Inconsistent states.** Empty state: title “没有可管理的 Desktop Host” is a `<div>` (CardTitle), not a heading — /account has **0 h3/h4**; outline is h1 + 3 h2 only. Loading: plain 12–14px text, **no `role="status"`**, no skeleton → silent for SR and a layout jump. Load failure: plain text in flat card vs login failure: bordered pink alert (368×38 @1280, 350×38 @390, radius 8px, 14px). 404/route-error are a third language (Tailwind only, h1 30/36px vs 47px elsewhere). Dialog is a fourth (17px radius, 0 36px 110px shadow). |
| D10 | **shadcn components are hollowed out.** Card DOM keeps `rounded-xl border bg-card shadow-sm` but computes border 1px `rgb(232,230,225)`, **radius 0px, transparent background, no shadow** (2 cards on /account). Inputs keep `rounded-md` but render 9px radius/white; Button 8px/46px vs 32px in grants. The class attribute advertises a design that is not rendered. |

---

## 3. Page inventory & reachability

| Page | Reachable at HEAD | Notes |
|---|---|---|
| `/login` | yes, signed out | h1 “欢迎回来。” + h2 “登录 Mira Cloud”; brand + 1 nav link |
| `/account` signed out | yes | h1 carries `aria-label="我的账户"`, content shows 未登录 + 前往登录 |
| `/account` authenticated, populated grants | yes (account `ui.audit`, seeded 1 host / 2 devices) | main target of audit |
| `/account` empty grants | yes (DB rows deleted) | docH 1459 @390 |
| `/account` loading / load-error | code paths in `device-grants-card.tsx` (not captured; copy verified in source) | no skeleton, no role=status |
| `/` | redirects to `/login` | no home surface |
| 404 `/missing` | yes | “404 / 页面不存在 / … / 返回账户中心” |
| Route error | not URL-addressable; rendered only when a route throws (`RouteErrorPage`) | Tailwind-only styling |
| Change-password dialog | yes (button 修改密码 → native `<dialog>`) | 17px radius, large shadow |
| Login failure state | yes (wrong password) | 14px alert, radius 8px, red 10 % tint |

Authenticated `/account` **was reachable**; all populated numbers come from that state.

---

## 4. Structure outline (authenticated /account @1280×800)

```
body > .cloud-shell (flex column, min-height 100vh, bg #faf9f7, font 16px)
├─ header.cloud-header (h 87)
│  └─ .cloud-header-inner.cloud-container (x105 w1070, pad 0 34px, flex, gap 18)
│     ├─ a.cloud-brand (h1-level brand: “M.” mark 40px radius 12 + strong “Mira Cloud” 15px + small “YOUR ACCOUNT” 9px)
│     └─ nav.cloud-navigation[aria-label="主导航"] (1 a: 登录 / 账户中心, 11px)
├─ main.cloud-container.w-full.flex-1 (x105 w1070, pad 0 34px, y87 h1563.7)
│  ├─ header.cloud-account-hero (x139 w1002, pad 77 0 54, h290.2, position:relative)
│  │  ├─ p.cloud-eyebrow “Mira Cloud / Account” 10px #92908a
│  │  ├─ h1[aria-label="我的账户"] (y196, 47px/54, letter-spacing −3.055px, weight 640)
│  │  ├─ p status/verification line (12px)
│  │  └─ div[aria-label="账户身份"].cloud-identity (avatar 50% + username + id chip, y308)
│  ├─ div.cloud-account-grid (y389.2 h1164.5, pad 41 0 62, grid cols 606.1 / 60gap / 335.9)
│  │  ├─ div.cloud-main-column
│  │  │  ├─ section.cloud-grants[aria-labelledby="device-grants-heading"] (x139 w606.1 h977)
│  │  │  │  ├─ header.cloud-section-title: h2 设备与授权 18px/25.2 ls −0.72 + subtitle 12px #8b8982 + button 刷新列表
│  │  │  │  ├─ Card[data-slot=card] (flat: 1px #e8e6e1, radius 0, transparent) per Desktop Host → host header 13/10px,
│  │  │  │  │   status pill rendered as plain 11px #60866d text, scopes list “读取会话 / 查看工具” 11px,
│  │  │  │  │   actions 撤销授权 (destructive 80×32) / 调整范围 (outline 82×32),
│  │  │  │  │   details “云端版本 N · 查看授权细节” (summary 350×18)
│  │  │  │  ├─ Card per mobile device (Pixel 手机, 离线/最近在线, 已撤销) — same flat treatment
│  │  │  │  └─ details 设备与授权 empty/grant history text
│  │  │  ├─ details.cloud-account-technical “账户及会话详情” (summary 350×18) → dl dt 12px #99968e / dd
│  │  │  ├─ section[aria-labelledby="future-services-heading"]: h2 关联服务 14px + 2 rows (Cloud Shiyan, Hosted Relay, 12px)
│  │  │  └─ details “关联服务 · 尚未接入” (summary 350×16.5)
│  │  └─ aside.cloud-security[aria-labelledby="account-security-heading"] (x805 w335.9 h380.9, border-ish top only, pad 0)
│  │     ├─ h2 账户安全 18px
│  │     ├─ button.cloud-action-row 修改密码 (row 12px + small 11px + ›)
│  │     ├─ details.cloud-session-details “当前登录会话” (row 80.2) → 续期 Session button
│  │     ├─ button.cloud-action-row[aria-label="退出登录"] (row)
│  │     └─ details 账户及会话详情 → dl
│  └─ details “关联服务 · 尚未接入”
└─ footer.cloud-footer.cloud-container (pad 21 34 31, 11px #96938e, 2 spans, h 69.5)
```

`/login` structure: same shell; `main > .cloud-auth-grid` (pad 108 0 130, grid 488 / 75gap / 439) with
`.cloud-auth-intro` (eyebrow 10px, h1 47px, 3 bullet points, 12px caption) and
`.cloud-auth-form-col` (pad-left 70, border-left 1px #e8e6e1: h2 21px/31.5 “登录 Mira Cloud”,
caption 12px, 2 fields 368×46 (input 13px, pad 12 13, radius 9), submit 368×46 13px radius 9,
footnote 11px), footer at y730.5.

`/404`: Tailwind-only centered `section.max-w-xl` (h1 30px @390 → 36px @≥640, mono “404” 14px,
body 14px, Button asChild link 116×36); no custom shell typography → visibly different page.

---

## 5. Accessibility detail

- Focus: inputs/button suppress `outline` and use a focus ring = `oklab(0.708 0 0 / 0.5)`;
  composited on `#faf9f7` it is **#d4d3d2 = 1.42:1** (WCAG 2.4.11 non-text needs 3:1). Inputs
  additionally change border to `#79766e` (5.1:1) so they stay visible; submit button and the
  brand link rely on the 1.42:1 ring only. Nav link falls back to UA `outline: auto 1px`.
  Tab order at /login: 账号 → 密码 → 登录 → (body) → brand → nav link; no focus trap issue
  (dialog uses native `<dialog>` + `showModal`).
- Semantics: nav `aria-label="主导航"`, hero h1 `aria-label="我的账户"`, identity block
  `aria-label="账户身份"`, actions group `aria-label="会话操作"`, card `aria-labelledby`,
  dialog `aria-labelledby/-describedby`, alert `role="alert"`, notices `role="status"`.
- Gaps: no `h3` for host/mobile cards; the empty/loading cards use `<div>` titles; loading has
  no live region; status chips (授权中/已撤销) are color-only 11px text after the
  `[class*="rounded-full"]` override drops background/border; 44px tap targets absent;
  focus indicators 1.42:1; the `›` chevrons and detail labels at 2.81:1 are aria-hidden or not.

---

## 6. Preserve-list (tests are the hard contract; 110 `it()` cases in 15 files)

The redesign may change markup, but the following are asserted through DOM queries in
`apps/web/tests`. Source of truth per row is the test file; grade = fragility of the
assertion (`HIGH` = real browser, exact accessible name, single-element query).

### Accessible names / roles that must survive

| Query | Required | Used by |
|---|---|---|
| `heading level 1` | `欢迎回来。` (/login), `我的账户` (/account, currently via `aria-label` on h1), `页面不存在` (/404), `页面暂时无法显示` (error) | `integration/app.test.ts`, `unit/app-routes.test.tsx`, `integration/portal-flow.test.ts` |
| `heading level 2` | `登录 Mira Cloud`, `关联服务`, `设备与授权` | `app-routes`, `auth-pages`, `device-grants`, `portal-flow` |
| `navigation`, name `主导航` | `<nav aria-label="主导航">` containing **exactly one** link | `portal-navigation`, `app-routes` |
| links | `登录` (href `/login`, exact), `账户中心` (href `/account`, signed in only), `前往登录` (href `/login`), and **no link matching `/OAuth|授权/`** | all DOM tests |
| buttons | `登录`, `登录中…`, `退出登录`, `修改密码`, `确认修改`, `修改中…`, `取消`, `续期 Session`, `刷新列表`, `读取中…`, `重新读取`, `调整范围`, `保存收窄`, `撤销授权`, `确认撤销` | `auth-pages`, `device-grants`, `grant-refresh-*`, `portal-flow`, `app-routes` |
| dialog | `role=dialog` with accessible name `修改密码` (via `aria-labelledby` → `#change-password-heading`) | `auth-pages`, `portal-flow` |
| labels | `账号`, `密码`, `当前密码`, `新密码`, `查看工具` (scope checkbox) | several |
| `role=status` | single element whose `textContent` contains `正在检查登录状态`, `Cloud Session 已续期`, `已读取最新云端设备与授权`, `Desktop 的实际授权执行`, `云端已保存`, `云端已撤销`, `云端拒绝此操作`, `Cloud Session 已失效`, … | `portal-navigation`, `grant-refresh-*`, `device-grants` |
| `role=alert` | single element containing `无法连接云端授权服务`, `云端授权服务暂时不可用`, `云端授权服务出现异常`, `账号或密码不正确。`, `无法连接认证服务，请检查网络后重试。`, `尝试次数过多，请稍后再试。（约 30 秒后可重试）`, `新密码不符合密码策略，请使用至少 15 个字符的新密码。`, `手机设备名称暂时无法读取`, `Desktop Host 或手机设备已不存在或已撤销。` | several |
| text (exact/substring) | `pilot` (username), `当前登录会话` (must be clickable element), `账户及会话详情`, `关联服务 · 尚未接入` (exact, incl. middle dot/spaces), `Cloud Shiyan`, `Hosted Relay`, `尚未接入`, `没有可管理的 Desktop Host`, `此账户还没有手机设备。`, `Desktop 尚未为此 Host 设置授权范围。`, `读取会话`, `查看工具`, `云端版本 5`/`云端版本 6`, `最近在线`, `离线`, `已撤销`, `工作 Desktop`, `Pixel 手机`, `账号或密码不正确。`, `密码已修改，请重新登录。`, `登录状态已失效或已过期，请重新登录。`, `认证服务暂时不可用，请稍后重试。`, `pilot` identity text | all |
| regex text | `/仅用于 Mira 运营的云端服务/`, `/本地、直连与 Tailscale/`, `/设备退出云账号或 Session 过期时也可管理已保存的权限/`, `/云端保存成功不等于 Desktop 已立即执行/`, `/此授权已在云端撤销，不能在此恢复/`, `/台已撤销的手机设备/`, `/确定撤销/` | `auth-pages`, `device-grants` |

### IDs / attributes used indirectly
`#username`, `#password` (labels via `htmlFor`), `#login-title` (aria-labelledby of form col),
`#change-password-heading`, `#change-password-description`, `#current-password`,
`#new-password`, `#device-grants-heading`, `#account-security-heading`,
`#future-services-heading`; `aria-label` on h1 `我的账户`, buttons `修改密码` / `退出登录` /
`关闭弹窗`, identity block `账户身份`, actions `会话操作`; `data-slot` is **not** queried by tests
(only CSS depends on it) and `data-testid` is nowhere used.

### Layout guarantees asserted by tests
- `integration/app.test.ts`: no horizontal overflow at **1440×900 and 375×812** for
  `/login`, `/account` (signed out), `/missing`, and headings waitFor-able (fails if content
  is lazy/behind animation).
- `integration/portal-flow.test.ts`: no horizontal overflow at **1440×900 and 390×844**;
  full journey login → account → reload → renew → change password → re-login → sign out.
- Both integration tests launch a real Chrome and write screenshots to
  `apps/web/coverage/screenshots/` (they do not compare pixels).

### Do-not-break rules for the redesign
1. Keep h1/h2 **levels and exact text** (h1 `/login` = `欢迎回来。`; `/account` h1 must keep
   `aria-label="我的账户"` or the tests fail even if the visible text changes).
2. Keep **exactly one `role="status"`** and **one `role="alert"`** per state — extra live
   regions break every `getByRole("status"/"alert")` (it is singular, not `getAll`).
3. Keep the nav as `<nav aria-label="主导航">` with exactly **one** `<a>` (label 登录 or
   账户中心 by auth state) and no link whose name matches 授权/OAuth.
4. Keep labels programmatically associated (`htmlFor`/`id` or `aria-label`), keep the dialog's
   `aria-labelledby` pointing at an element whose text is `修改密码`.
5. Keep `当前登录会话` as a clickable element that opens the session details containing the
   `续期 Session` button; keep the `云端版本 N` details summary.
6. Preserve the Chinese copy verbatim (including `·`, `…`, `，`, `。` and parentheses) for all
   strings in the table above; the tests compare exact text.
7. Do not add horizontal overflow at 375/390/1440, and do not hide asserted content behind
   animation/transition delays (tests wait 5s then fail).
8. Keep `apps/web/tests/**` untouched (read-only in this task) so the contract stays honest.

### Fragility ranking (fix-first order if tests must be updated with the redesign)
1. `tests/integration/portal-flow.test.ts` — HIGH: real browser, exact roles/names, single
   status/alert, 2 viewports, overflow assertions, dialog naming, copy of 4 error strings.
2. `tests/integration/app.test.ts` — HIGH: exact h1 names via `getByRole(level 1)`, exact link
   names, no-overflow at 375/1440.
3. `tests/unit/device-grants.test.tsx` — HIGH: 19 cases; exact grant copy, checkbox
   `getByLabelText("查看工具")`, button names, singular alert/status.
4. `tests/unit/auth-pages.test.tsx` — MED-HIGH: dialog role/name, hero h1, summaries, heading
   levels, 8 exact status/alert strings.
5. `tests/unit/app-routes.test.tsx` — MED: heading levels + nav + link hrefs.
6. `tests/unit/grant-refresh-{feedback,interleavings}.test.tsx` — MED: button names and
   status/alert copy.
7. `tests/unit/portal-navigation.test.tsx` — MED: nav aria-label, exactly 1 link,
   single `role=status` while checking.
8. `tests/contract/*`, `tests/unit/{auth-errors,auth-store,session-storage}.test.ts`,
   `tests/integration/{auth-session-flow,host-grants-flow}.test.ts` — SAFE: no DOM queries.

---

## 7. How to reproduce / caveats
- Headless Chromium, no OS font smoothing differences for layout numbers; CJK renders in
  Microsoft YaHei here because Inter/PingFang/SF are absent — on macOS the same CSS would fall
  back to PingFang, so **D2 is worse on Windows than macOS** (and the audit machine is Windows).
- Contrast/font-size numbers are computed from visible text nodes with an effective-background
  walk-up (handles transparent/none backgrounds); italic/weight not factored into WCAG size
  thresholds (all counted against the 4.5:1 normal-text rule).
- Sizes are CSS pixels at page zoom 1.
- "Current" means HEAD `b1f358c`. The working tree already diverges (see header); re-capturing
  "after" screenshots must use the implementer's final build, not this baseline.
- The dev stack used for capture has been shut down; DB `apps/api/data/ui-audit.sqlite` is a
  throwaway audit artifact and was deleted.
