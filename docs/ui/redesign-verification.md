# Redesign verification — measured before / after

Reference design: OpenCode Console activity page (see `opencode-design-system.md`).
Target: `apps/web` (Mira Cloud Account portal, React 19 + Vite + Tailwind v4).

Two rounds, both measured the same way — computed styles, geometry and accessibility
properties read from a real Chromium against the running app (dev server for the "before"
passes, the production `vite preview` bundle for the "after" passes), never by eye.

* **Round 1 — visual language.** Adopted the reference's tokens, type scale, elevation,
  component recipes. Baseline: commit `b1f358c`.
* **Round 2 — information architecture.** Adopted the reference's *organisation*: console
  shell with a section rail, four routes, page heads, section heading rows, fact lists,
  record rows, one footer note. Baseline: the round-1 build.

Round-1 numbers are kept below so the two rounds stay separable.

## Round 2 — information architecture

### Structure (production bundle, 1440×900)

| | Before (round 1) | After |
| --- | --- | --- |
| Account routes | 1 (`/account`, one scroll) | 4 (`/account`, `/account/devices`, `/account/security`, `/account/services`) |
| Section navigation | none (a single header link) | `nav[aria-label="账户分区"]`, 4 links, `aria-current="page"` on the active section |
| `<details>` disclosures on the account page | 4 (账户及会话详情, 关联服务, 当前登录会话 ×2) | 0 — every fact is on the page that owns it |
| Primary action visibility | 修改密码 / 续期 Session / 退出登录 behind disclosures or in a sidebar card | rail session block (退出登录), `/account/security` (修改密码, 续期 Session) — visible without expanding anything |
| 退出登录 controls in the DOM | 1 (but the page had two "session" surfaces) | exactly 1 on every account route, 0 outside the console |
| Long disclaimer occurrences | 3 (host card footer, section caption, page footnote) | 1 (devices page footer) |
| Page h1 | marketing greeting `你好，{username}。` | factual route title per page |
| 404 inside the account area | fell back to the public shell | `页面不存在` inside the console shell (rail + session kept) |
| Text left-edge clusters on `/account` (1280) | 21 | 10 (overview) / 14 (devices) / 8 (security) / 6 (services) |
| DOM nodes, account page (1440) | — | 89 overview / 114 devices / 69 security / 60 services / 42 recovery |
| Host records are headings | no (card title was a div) | yes — one `h2` per record, accessible name disambiguated with the Host id (`Mira Desktop · Host 66666666`) |
| Console errors during the whole 40-shot pass | — | 0 |

Route/state atlas measured (8 states × 5 viewports = 40 renders):

| State | h1 | rail links | `aria-current` | 退出登录 | `<details>` | overflow |
| --- | --- | --- | --- | --- | --- | --- |
| `/login` | 欢迎回来。 | 0 | — | 0 | 0 | 0 |
| `/account` | 我的账户 | 4 | 概览 | 1 | 0 | 0 |
| `/account/devices` | 设备与授权 | 4 | 设备与授权 | 1 | 0 | 0 |
| `/account/security` | 账户安全 | 4 | 账户安全 | 1 | 0 | 0 |
| `/account/services` | 关联服务 | 4 | 关联服务 | 1 | 0 | 0 |
| `/account/unknown-section` | 页面不存在 | 4 | — | 1 | 0 | 0 |
| `/account` signed out (recovery) | 我的账户 | 0 | — | 0 | 0 | 0 |
| `/missing-route` (public shell) | 页面不存在 | 0 (主导航 1 link 登录) | — | 0 | 0 | 0 |

The signed-out deep link `/account/devices` renders the recovery state at that URL, with zero
rail links and **zero** grants requests (asserted in `console-navigation.test.tsx`).

### Type and colour (per route, 1440×900)

| Metric | Round-1 account page | After (range over the four routes) |
| --- | --- | --- |
| Distinct font sizes | 7 | 5–6 per route (union across the console: `11/12/13/13.5/14/15/18` + h1 `26`) |
| Text nodes < 13px | 9 of 47 (19%, metadata) | 61 of 152 across the four routes (40%) — **all** of them 11–12px captions: scope pills, `云端版本`/status/observation lines, expiry, footnotes. The share rises because record metadata that used to hide behind `<details>` is now visible on the devices page (31 of 56 there); every data value is 13–15px |
| Text nodes below WCAG AA | 0 | 0 (150 sampled nodes across the four routes) |
| Worst contrast ratio | 6.41:1 | 5.11:1 (`--mc-text-faint` 12px metadata on `#fafafa`), body/secondary ≥ 7:1 |
| h1 | 26/32, weight 600 | 26/32 weight 600 (desktop), 23.04 at 768, 22/30 at 390 |
| Page caption | — | 13/20, weight 450, `max-width:64ch`, one line |
| Colour source | `--mc-*` tokens | unchanged: 0 raw hex in `console.css`, `cloud-pages.css`, `cloud-grants.css` |
| `!important` | 0 | 0 outside the reduced-motion guard (4 declarations in `globals.css`) |
| `1px solid` borders | 0 | 0 (only in comments) |

### Interaction and accessibility

| Metric | Round-1 account page | After |
| --- | --- | --- |
| Focus ring (rail link) | 2px `#3b5cf6` offset 2 | unchanged: `2px solid rgb(59,92,246)`, offset `2px`; inside the mobile tab strip offset `-2px` so the scroll container cannot clip it |
| Focus ring (inputs) | 2px offset 0 | unchanged: `2px solid rgb(59,92,246)`, offset `0px` |
| Tap targets < 40×40 at 390px | 0 | 0 (brand, section links, inputs and dialog close were raised to 40px in this round) |
| Tap targets < 40×40 at 320px | — | 0 |
| Horizontal overflow | none | none at 320 / 390 / 768 / 1024 / 1280 / 1440 |
| `role="status"` / `role="alert"` per state | 1 / 1 | 1 / 1 — the layout owns the notice region; the password dialog takes over the alert region while open (`ModalOpenProvider`), so a failed submit never produces two alerts |
| Mobile session block | duplicate logout surfaces | one node: rail column ≥1024, one compact line under the tab strip below 1024 |
| Keyboard route entry | not handled | on every route change the page scrolls to top and focus moves to the new `h1` |

### Layout geometry (production bundle)

| Element | 1440×900 | 390×844 | 320×640 |
| --- | --- | --- | --- |
| Header | 56px, sticky, hairline | 52px | 52px |
| Body grid | `212px + 40px gap + content` (container 1120, gutters 24) | single column, rail → tab strip | single column |
| Rail | 212px wide, sticky `top:72px`, 240px tall | horizontal block: nav 40px + session 52px | nav strip 40px, scrolls (`scrollWidth 303 > 288`) |
| Rail link | 212×32, 13/20 weight 550 | 40px tall tab, `padding-inline:12px` | 40px tall tab |
| Content column | 820px (max 960) | 358px | 288px |
| Page head | 58px tall (h1 26/32 + caption 13/20) | 56px (h1 22/30) | 56px |
| Section heading row | 46px (`min-height:44px`) | 46px | 46px |
| Fact row | 820×38 (`dt/dd` 12px padding + hairline) | 358×38 | 288×38 |
| Dialog | 420×338, radius 12, `--mc-el-overlay` | 358×342, radius 12, padding 16 | — |

**One viewport, one route.** At 1440×900 `/account` renders all three sections with no
document scroll (`scrollHeight = 900`: 账户 154→425, 设备与授权 425→611, 关联服务 611→729).
`/account/devices` fits two host records plus its footer note in the same 900px.

### Pixel composition (PNG colour census, 1280×800)

`/account` after round 2: `#ffffff` 91.43% + `#fafafa` 5.12% — the overview is facts and
counts on the canvas, no card chrome. `/account/devices`: `#ffffff` 59.99% + `#fafafa` 34.55% —
two record panels on the canvas, which is the same white-on-canvas ratio the round-1 account
page had (`#ffffff` 65.30% / `#fafafa` 29.73%), now carrying records instead of a marketing hero.

## Round 1 — visual language (baseline `b1f358c`)

| Metric | Before | After |
| --- | --- | --- |
| Distinct font sizes on `/login` | 14 | 6 |
| Text nodes ≤ 12px (portal) | 64.6% | 9 of 47 (metadata only) |
| Text nodes below WCAG AA 4.5:1 | 43 of 82 | 0 |
| Worst contrast ratio | 2.81:1 | 6.41:1 |
| Inter variable self-hosted | no (fell back to YaHei) | yes, `document.fonts.check` = true |
| Body copy | 12px, mixed weights | 14/22, weight 450, `tabular-nums` |
| H1 | 47px, letter-spacing −3.055px | 26/32, weight 600, tracking normal |
| Colour source | 0 tokens, 50+ literals | `--mc-*` tokens (`#ffffff` on the brand mark documented) |
| `!important` | 26 | 0 (+ reduced-motion guard) |
| Focus ring | 1px, 1.42:1 (invisible) | 2px `#3b5cf6` (5.0:1), offset 2/0 |
| Controls without affordance | 14 of 21 | 0 |
| Tap targets < 44px | 8 of 13 | 0 below 40px at 390 |
| Dead `.cloud-*` classes | 10 defined, never rendered | 0 |
| Login card / grid | — | 384px wide, 616px + 384px, gap 72 |
| Closed `<details>` leaking content | n/a | fixed — closed bodies `display: none` |

## Test contract preserved

`pnpm run test:unit` → 10 files / 94 tests (web), `pnpm run test:integration` → 4 files / 32
tests, `pnpm run check` → green (contracts + API + web typecheck + tests).

Preserved copy/roles after the IA change: route h1s `我的账户` / `设备与授权` / `账户安全` /
`关联服务`, `欢迎回来。`, `页面不存在`, `登录 Mira Cloud`; rail `账户分区` vs public `主导航`;
`退出登录`, `修改密码`, `续期 Session`, `刷新列表`, `重新读取`, `调整范围`, `撤销授权`,
`确认撤销`, `前往登录`, `重新检查登录状态`; `云端版本 {n}`, `最近在线`, `离线`,
`没有可管理的 Desktop Host`, `尚未接入`; ids `login-title`, `change-password-heading`,
`device-grants-heading`, `account-security-heading`, `future-services-heading`; all `data-slot`
attributes; exactly one `role="status"` and one `role="alert"` per state.

## Screenshots

- Before round 1: `.screenshots/current/` (login, account, account-empty, account-signedout,
  login-error, notfound at 1280/768/390 + `measure-*.json`)
- After round 1: `.screenshots/after/` (12 PNGs at 1280/768/390)
- After round 2 (`console IA`): `.screenshots/after-ia/` — 8 states × 5 viewports
  (1440×900, 1280×800, 1024×768, 768×1024, 390×844), full-page at 1440/390, plus
  `security-dialog-1440x900.png`, `devices-focus-1440x900.png` and `metrics.json` with every
  number above (per-node font sizes, contrast, geometry, tap targets, aria state).
- Generated by the test suite each run: `apps/web/coverage/screenshots/`.

Reproduce the measurement pass: run the API against a seeded database, build the web app,
`vite preview`, then drive Chromium with Playwright (`channel: "chrome"`) over the 8 states and
record `getComputedStyle` / `getBoundingClientRect` for the tables above.
