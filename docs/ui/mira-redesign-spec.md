# Mira Cloud Account — UI redesign spec (v1)

Status: authoritative for the redesign. Written by Lead. Implementation must follow the token
names and values here; do not invent parallel tokens.

## 1. Why

The current portal is a flat, warm-grey, 11–12px text wall: hairline borders everywhere, no
elevation, no color accents, buttons reduced to bare underlined text, wide negative
letter-spacing applied to Chinese headings (which makes CJK text cramped), and a hand-rolled
`!important` layer fighting the shadcn primitives.

Target: the **OpenCode Console** look (reference: `opencode.ai/console/.../activity`). The page
itself is login-gated, but its public Vite CSS bundle was downloaded to `.design-ref/` and
analysed, so the values below are measured, not guessed:

| Reference fact | Value |
| --- | --- |
| Console font | `Inter` (variable, weights 440 / 530 / 620), `font-variant-numeric: tabular-nums` |
| Type scale | 13/20 body, 15/20 section h2, 21/24 page h1, 11/16 micro labels, `letter-spacing: -.04px` (≈ -0.003em) |
| Page canvas | `#ffffff`; inset surfaces `#fafafa` / `#f2f2f2` / `#eee` / `#dbdbdb` |
| Text | base `#161616`, secondary `#5c5c5c`, faint `gray(#808080)`, disabled `#aeaeae` |
| Borders | **translucent hairlines**: `rgba(0,0,0,.08)` muted, `.10` base, `.20` strong — drawn as `0 0 0 .5px` shadows, not 1px solid |
| Depth | layered shadows, e.g. control `0 1px 1.5px rgba(0,0,0,.10), 0 0 0 .5px rgba(0,0,0,.14)` |
| Radii | 4 / 6 / 8 / 12px (never pills for cards) |
| Controls | button heights 24 / 28 / 32px, text input 28 / 32px, radius 6 |
| Focus | `outline: 2px solid #7698fd; outline-offset: 2.5px` |
| Dashboard grid | main `minmax(0,960px)` + sidebar `352px`, gap `56px`, max `1368px` |
| Cards | `background: #fafafa`, `.5px` hairline, radius 6, padding 16 |
| Row hover | full-bleed `margin-inline:-8px; padding-inline:8px; border-radius:6px; background:rgba(0,0,0,.04)` |
| Accent | blue `#3b5cf6` for links/focus only; primary buttons are near-black **contrast** buttons |

Mira keeps its own identity: neutral/monochrome surfaces + near-black primary action + blue used
sparingly as the only accent (links, focus ring, selected/active state).

## 2. Non-negotiables

1. **No `!important`** in any stylesheet, with one deliberate exception: the single
   `prefers-reduced-motion` guard in `globals.css`. If a primitive needs different styling,
   change the primitive (`components/ui/*`) — the current override wall is the main thing being
   removed.
2. **Keep every accessible name, `id`, `role`, visible string and `data-slot` attribute** the
   tests rely on (see §9). Class names may be kept/added, structure may change, but text and
   roles must not.
3. **CJK typography**: no negative `em` letter-spacing on headings or body. Use `letter-spacing: 0`
   for Chinese copy, `-0.01em` at most for Latin-only headings.
4. Body/UI text is **≥13px** (14px default), never 11–12px for paragraph copy. 11–12px is only
   allowed for meta labels, pills and footer.
5. Every interactive element keeps a visible affordance (filled/outlined surface or hover
   overlay), a focus ring, and ≥40px hit height on ≤640px viewports.
6. Light theme only (dark token values are defined for future use but nothing switches them).
7. Respect `prefers-reduced-motion`: skip transitions/animations.

## 3. Tokens — `apps/web/src/styles/globals.css`

Add `@font-face` for the vendored variable font and define the raw tokens on `:root`
(`--mc-*` = Mira Console):

```css
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/inter-latin-wght-normal.woff2") format("woff2-variations");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
    U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215,
    U+FEFF, U+FFFD;
}
```

Raw tokens (`:root`):

```
/* surfaces */
--mc-surface-0: #ffffff;   /* page canvas */
--mc-surface-1: #fafafa;   /* panel / card on white */
--mc-surface-2: #f2f2f2;   /* inset / control track */
--mc-surface-3: #eeeeee;   /* chips, bars */
--mc-surface-4: #dbdbdb;   /* bar tracks */
--mc-brand-canvas: #fcecd7; /* logo artwork canvas — part of the mark, never keyed out */
/* text */
--mc-text: #161616;
--mc-text-secondary: #5c5c5c;
--mc-text-faint: #6b6b6b;   /* 5.11:1 on #fafafa — 12px meta labels stay AA */
--mc-text-disabled: #aeaeae;
--mc-text-inverse: #ffffff;
--mc-accent: #3b5cf6;
--mc-accent-hover: #3250df;
/* borders (translucent hairlines) */
--mc-border-muted: rgba(0, 0, 0, 0.08);
--mc-border: rgba(0, 0, 0, 0.10);
--mc-border-strong: rgba(0, 0, 0, 0.20);
--mc-border-focus: #7698fd;
/* states — AA-checked against their own backgrounds */
--mc-success-fg: #14703a;   --mc-success-bg: #e7f9ea;   --mc-success-border: #b8e9c1;
--mc-success-dot: #2eaf5a;
--mc-warning-fg: #7a6229;   --mc-warning-bg: #fefaec;   --mc-warning-border: #f7e5b5;
--mc-danger-fg: #b82d35;    --mc-danger-bg: #fceceb;    --mc-danger-border: #f2bbb7;
--mc-info-fg: #2c47c8;      --mc-info-bg: #ecf1fe;      --mc-info-border: #c3d4fd;
/* elevation */
--mc-hairline: 0 0 0 0.5px var(--mc-border);
--mc-hairline-muted: 0 0 0 0.5px var(--mc-border-muted);
--mc-el-control: 0 1px 1.5px 0 rgba(0,0,0,.10), 0 0 0 0.5px rgba(0,0,0,.14);
--mc-el-raised: 0 2px 4px 0 rgba(0,0,0,.04), 0 1px 2px -1px rgba(0,0,0,.08), 0 0 0 0.5px rgba(0,0,0,.12);
--mc-el-floating: 0 8px 16px 0 rgba(0,0,0,.04), 0 4px 8px 0 rgba(0,0,0,.08), 0 0 0 0.5px rgba(0,0,0,.12);
--mc-el-overlay: 0 16px 32px 0 rgba(0,0,0,.04), 0 8px 16px 0 rgba(0,0,0,.08), 0 0 0 0.5px rgba(0,0,0,.12);
--mc-el-contrast: 0 1px 1.5px 0 rgba(0,0,0,.20), 0 0 0 0.5px #3a3a3a, inset 0 1px 2px 0 rgba(255,255,255,.14), inset 0 -1px 2px 0 rgba(0,0,0,.06);
--mc-overlay-hover: rgba(0, 0, 0, 0.04);
--mc-overlay-pressed: rgba(0, 0, 0, 0.08);
/* geometry */
--mc-r-xs: 4px; --mc-r-sm: 6px; --mc-r-md: 8px; --mc-r-lg: 12px;
--mc-ease: cubic-bezier(0.23, 1, 0.32, 1);
```

Map the shadcn/Tailwind theme (`@theme inline`) onto these tokens so existing `bg-card`,
`text-muted-foreground`, `border` utilities become correct without touching pages:

```
--background: var(--mc-surface-0)   --foreground: var(--mc-text)
--card: var(--mc-surface-1)         --card-foreground: var(--mc-text)
--popover: var(--mc-surface-0)      --muted: var(--mc-surface-2)
--muted-foreground: var(--mc-text-secondary)
--secondary: var(--mc-surface-2)    --accent: var(--mc-surface-2)
--primary: #242424                  --primary-foreground: #ffffff
--destructive: var(--mc-danger-fg)  --border: var(--mc-border)
--input: var(--mc-border-strong)    --ring: var(--mc-border-focus)
--radius: 6px
--font-sans: "Inter", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB",
             "Microsoft YaHei", "Noto Sans SC", ui-sans-serif, system-ui, sans-serif
```

Base layer:

```css
html { color-scheme: light; }
body {
  background: var(--mc-surface-0);
  color: var(--mc-text);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 22px;
  font-weight: 450;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
::selection { background: color-mix(in srgb, var(--mc-accent) 18%, transparent); }
*:focus-visible { outline: 2px solid var(--mc-border-focus); outline-offset: 2.5px; }
```

## 4. Type scale

| Role | Size/leading | Weight | Tracking |
| --- | --- | --- | --- |
| Page h1 | 24/32 (`clamp(22px,3vw,26px)`), ≤480: 22/30 | 600 | 0 |
| Section h2 | 15/22 | 550 | 0 |
| Card title / row title | 14/20 | 550 | 0 |
| Body / paragraph | 14/22 | 450 | 0 |
| Dense body, captions | 13/20 | 450 | 0 |
| Label | 13/20 | 550 | 0 |
| Meta / pill / footer | 12/18 | 450–550 | 0 |
| Micro label (11px only for Latin caps eyebrow) | 11/16 | 550 | 0.08em uppercase |
| Big number (totals) | 21/28 | 550 | 0 |

`strong`/`b` keep 550. Never use `font-weight` below 400 or above 650.

## 5. Components (primitives — `components/ui/*`)

**Button** (`cva`), height / padding / radius:

| size | height | padding | radius |
| --- | --- | --- | --- |
| `sm` | 24px | 0 9px | 4px |
| `default` | 28px | 0 11px | 6px |
| `lg` | 32px | 0 15px | 6px |
| `xl` (new, used by auth submit) | 36px | 0 16px | 6px |
| `icon` | 28×28 | 0 | 6px |

Variants:
- `default` (primary): `background:#242424; color:#fff; box-shadow: var(--mc-el-contrast); border-radius inherit`; hover `#2e2e2e` + brightness; active inset shadow; disabled `opacity:.45`.
- `outline`: `background:#fff; color:var(--mc-text); box-shadow: var(--mc-el-control)`; hover `background:var(--mc-surface-1)`.
- `secondary`: `background:var(--mc-surface-2); color:var(--mc-text); box-shadow: var(--mc-hairline-muted)`; hover `#ececec`.
- `ghost`: transparent, `color:var(--mc-text-secondary)`; hover `background:var(--mc-overlay-hover); color:var(--mc-text)`.
- `destructive`: `background:#fff; color:var(--mc-danger-fg); box-shadow: var(--mc-el-control)`; hover `background:var(--mc-danger-bg)`.
- `link`: accent color, underline on hover.

All: `font-size:13px; font-weight:550; line-height:20px; letter-spacing:0; gap:6px; transition: background-color 85ms var(--mc-ease), box-shadow 85ms var(--mc-ease), color 85ms var(--mc-ease)`.
Focus-visible: base `*:focus-visible` ring (do not remove `outline`).

**Input**: `height:36px` (`sm` 32, `lg` 40), `padding:0 10px`, `border:0`, `border-radius:6px`,
`background:#fff`, `box-shadow: var(--mc-el-control)`, `font-size:14px`, placeholder
`var(--mc-text-faint)`; focus-visible `box-shadow: var(--mc-el-control), 0 0 0 3px rgba(118,152,253,.35), 0 0 0 0.5px var(--mc-border-focus)`; `[aria-invalid="true"]` → danger fg + `0 0 0 1px var(--mc-danger-fg)`.

**Card** (`data-slot="card"`): `display:flex; flex-direction:column; gap:0; background:var(--mc-surface-1);
border:0; border-radius:var(--mc-r-md); box-shadow: var(--mc-hairline-muted); padding:0`.
Header `padding:16px 16px 0`; content `padding:16px`. Title 14/20 550; description 13/20 secondary.

**Pill / status**: `height:18px; padding:0 6px; border-radius:4px; font-size:11px; line-height:16px; font-weight:550; background:var(--mc-surface-3); color:var(--mc-text-secondary)`.
Tones: success `bg var(--mc-success-bg) color var(--mc-success-fg)`; danger likewise; live status
= 6px dot + 12px text instead of a pill.

**Notice** (inline alert): `border-radius:6px; padding:8px 12px; font-size:13px; line-height:20px;
box-shadow: 0 0 0 0.5px <tone-border>; background:<tone-bg>; color:<tone-fg>`.

**Dialog**: `::backdrop { background:rgba(29,28,25,.40); backdrop-filter: blur(2px) }`;
panel `background:#fff; border-radius:12px; box-shadow: var(--mc-el-overlay); padding:20px;
width:min(420px, calc(100vw - 32px))`.

**Skeleton**: `background:var(--mc-surface-2); border-radius:4px; animation: mc-pulse 1.6s ease-in-out infinite`.
Keyframes `50% { opacity:.55 }`. Used instead of blank space for loading states.

## 6. Information architecture

The reference page is not a settings form; it is a console: one page title with a factual
caption, section heading rows (title + one-line caption + trailing action), records that read
as rows, and secondary context pushed to a rail. Our portal copies that *organisation*, not
just its tokens. Full build contract: `console-ia-contract.md`.

### Routes

| Route | h1 | Rail label | Reading order |
| --- | --- | --- | --- |
| `/` | `Mira Cloud 账户` | — | page head + entry action → destination rows (设备与授权 / 账户安全 / 关联服务) → local-boundary note |
| `/account` | `我的账户` | 概览 | caption (账号 · 状态) → 账户 facts (账号/Account ID/登录状态/会话到期 + 管理会话) → 设备与授权 counts (Desktop Host / 手机设备 / 有效授权 + 管理) → 关联服务 summary (2 项 · 尚未接入 + 查看) |
| `/account/devices` | `设备与授权` | 设备与授权 | caption → toolbar (counts strip + 刷新列表) → notices → host records (name + status chip + 云端版本 → facts → policy/empty inset → grant rows) → single footer note |
| `/account/security` | `账户安全` | 账户安全 | caption → 密码 (修改密码 row) → 当前登录会话 (状态/到期 facts + 续期 Session) → dialog |
| `/account/services` | `关联服务` | 关联服务 | caption → one row per service (名称 + 尚未接入 + 描述 + 边界说明) |
| `/account/*` | `页面不存在` | — | 404 inside the console shell |
| `/login`, `*` | `欢迎回来。` / `页面不存在` | — | public shell, unchanged |

### Shell roles

- **Header** (56px, sticky): brand → `/account` or `/login`; right side is either the identity
  chip (avatar + username + status dot + 已登录) or a single `登录` link.
- **Rail** (≥1024px, 212px column + 40 gap): `nav[aria-label="账户分区"]` with the four section
  links (`aria-current="page"` drives the active state) and the *only* session block
  (状态 · 到期 + 退出登录). The same `aside` becomes a horizontal block below the header under
  1024px: scrollable tab row (40px targets) then one compact session line.
- **Content column**: max 960px; every route starts with a page head (h1 + one-line caption);
  sections use a heading row, facts use a `dt/dd` list, counts use a summary strip.
- **Notices**: one region above the routed page, owned by the layout, so navigation never drops
  a `role="status"`/`role="alert"`. While the password dialog is open it owns the alert
  (`ModalOpenProvider`), keeping exactly one alert per state.
- **Auth gate**: the layout renders page content only when `status === "authenticated"`.
  `idle/restoring` → skeleton; `unauthenticated/unavailable` → `我的账户` head + recovery card
  (`前往登录` / `重新检查登录状态`), and no routed page mounts, so no grant fetch happens.

### Why this replaces the old single page

The old account page put a marketing greeting above the app, hid the account facts and the
per-host metadata inside `<details>`, repeated the same disclaimer in three places, and had no
notion of "where am I" — one long scroll with two unrelated cards side by side. The console
shell gives each information class a home: identity facts on the overview, records on
devices, actions on security, status-only information on services.

## 7. Page blueprints

### Public shell (`app/root-layout.tsx` + `styles/cloud-shell.css`)

Used by `/`, `/login` and the public 404.
- Header: 56px, `background:rgba(255,255,255,.85)`, `backdrop-filter: blur(8px)`, sticky top 0,
  hairline bottom (`box-shadow: inset 0 -0.5px 0 var(--mc-border-muted)`).
  Brand: 28px square logo chip — `/brand/mira-logo-mark.png` (96×96 artwork, `alt=""`,
  `aria-hidden` wrapper) in a 7px-radius `--mc-brand-canvas` box with `--mc-hairline-muted`;
  no text glyph, no recolor and no keyed-out background. Copy: a single `strong`
  `Mira Cloud` at 13/18 600 — no secondary line under the brand.
  Nav (`主导航`): a single contextual entry — `登录` when signed out, `账户中心` when signed in
  (only reachable on the public 404), 28px tall items, 13px 550, radius 6, `padding:0 10px`;
  idle secondary, hover overlay, active `background:var(--mc-surface-2)`.
- Container: `max-width:1120px`, `padding-inline:24px` (`16px` ≤640).
- Footer: `padding-block:20px 28px`, 12/18 secondary, hairline top, flex space-between, stack ≤640.

### Home (`pages/home-page.tsx` + `styles/cloud-home.css`)

Public entry at `/`. Console language, not a landing page: one screen at 1440×900, no
hero, no illustration, no marketing paragraphs.
- Page head: `console-page-head` recipe (h1 26/32 600, `clamp(22px,3vw,26px)`, tracking 0)
  + `console-page-caption` 13/20 secondary. Copy is factual: `Mira Cloud 账户` /
  `登录后查看 Mira 设备、调整访问授权，并管理账户安全。` Column `max-width:720px`.
- Entry action: exactly one contextual `xl` button from `getAccountEntry()`
  (`登录 Mira Cloud` / `进入账户中心` / `检查登录状态`), `gap:8px`, 36px tall.
  While the saved session restores, a `role="status"` line (`正在检查登录状态…`, 13/20)
  replaces the button, so no destination is guessed and no layout jumps.
- Destinations: a `ul` of record rows — 32px icon tile (white, hairline, radius 6,
  16px icon), 14/20 550 title, 13/20 secondary caption, faint `→`. Rows use the
  full-bleed hover recipe (`margin-inline:-12px; padding-inline:12px; radius 8;
  background:var(--mc-overlay-hover)`), hairline between rows, 14px block padding.
  `设备与授权` → `/account/devices`, `账户安全` → `/account/security`. `关联服务` is a
  **static** row (no link, no chevron) with a `尚未接入` pill (11/16 550, surface-3,
  radius 4) — no fake entry for a service that is not connected.
- Boundary note: 13/20 secondary, `max-width:62ch`, hairline top, 32px above.
- ≤640: `padding-block:32px 24px`, rows `14px 8px`; still one column. The page must stay
  under one viewport at 1440×900 and under ~1.2 viewports at 390×844.

### Console shell (`app/account-layout.tsx` + `styles/console.css`)

- Header: same recipe as the public shell (same 28px logo chip), but the right slot is the identity chip
  (28px avatar, name 13/18 550, `status dot + 已登录` 11/16) when authenticated, otherwise
  a single `登录` link.
- Body: `grid-template-columns: 212px minmax(0,1fr)`, gap 40, container 1120 + 24 gutters.
- Rail: sticky (`top:72px`), nav rows 32px radius 6 (hover overlay, `aria-current="page"` →
  surface-2 + 550), then the session block (status · expiry, hairline top, 退出登录 ghost sm).
- Content: `max-width:960px`. Page head = h1 26/32 600 + caption 13/20 secondary
  (`margin-top:6px`, `max-width:64ch`).
- Section heading row: flex space-between, `min-height:44px`, gap 16; h2 15/22 550; caption
  13/20 secondary; trailing link 13/20 550 with underline on hover.
- Facts: `dl` rows, `padding:10px 0`, hairline bottom (`0 -0.5px` inset), `dt` 13/20 secondary,
  `dd` 13/20 base, right-aligned when values are short.
- Summary strip: flex gap 32, `strong` 21/28 530 + `span` 12/18 secondary; hairline top/bottom.
- ≤1023px: body becomes a single column; the rail turns into a horizontal block — scrollable
  nav tabs (40px targets, no scrollbar) above a one-line session block.

### Account routes (`pages/account/*` + `styles/{cloud-pages,cloud-grants}.css`)

- **Overview**: page head → 3 sections, each `console-section` (heading row + caption + trailing
  link). 账户 uses a facts list; 设备与授权 uses a counts strip (Desktop Host / 手机设备 /
  有效授权) fed by the same grants hook; 关联服务 is a one-line summary (`2 项能力 · 尚未接入`).
- **Devices**: page head → card toolbar (counts strip + `刷新列表`) → notices → host records
  (`background:var(--mc-surface-1)`, radius 8, hairline-muted, padding 16; header row with
  name (h2) + `Mira Desktop · Host {id}` + status chip + trailing `云端版本 {revision}`; facts
  line; policy / empty inset; grant rows with scope pills and right-aligned actions) → one
  footer note.
- **Security**: page head → 密码 row (inset plate, 14px padding, chevron) → 当前登录会话
  (facts + inline `续期 Session`).
- **Services**: page head → one inset row per service (name 13.5/20 550 + `尚未接入` pill +
  two lines of secondary copy).
- Empty/loading/error: every state keeps the section footprint — skeleton rows for loading,
  an icon tile + title + one-line caption for empty, `role="alert"` + `重新读取` for failure.
- Notices: `--mc-success-*` / `--mc-danger-*` tones per §5, rendered once by the layout.

### Login (`pages/login-page.tsx` + `styles/cloud-pages.css`)
- Canvas: full-bleed `background:var(--mc-surface-1)` (negative-margin bleed inside `main`),
  grid `minmax(0,1fr) 384px`, gap `72px`, `padding-block:64px 80px`, align start.
- Left: eyebrow 11/16 uppercase secondary; h1 32/40 600 `margin-top:12px`; paragraph 14/24
  secondary `max-width:36ch; margin-top:16px`. Footnote 12/20 faint with hairline top,
  `margin-top:40px; padding-top:16px; max-width:40ch`.
- Right: white card, radius 10, `box-shadow: var(--mc-el-raised)`, padding 24.
  h2 15/22 550; caption 13/20 secondary; field gap 16 (label 13/20 550, `margin-bottom:6px`);
  inputs 36; submit full-width 36 contrast; card footnote 12/20 faint.
- ≤900px: single column, card `max-width:420px`, order unchanged, `padding-block:40px 56px`.

### Account (`pages/account-page.tsx` + `styles/cloud-pages.css`)
- Page header: `padding:32px 0 24px`, hairline bottom, flex space-between align-end gap 24.
  h1 24/32 600; summary 13/20 secondary, `margin-top:6px`, `max-width:44ch`.
  Identity: avatar 28px circle, hairline; name 13/18 550; meta 11/16 secondary.
- Grid: `minmax(0,1fr) 320px`, gap 32, `padding-block:24px 48px`. ≤1024 → 1 column, gap 24.
- Section head: h2 15/22 550 + caption 13/20 secondary; trailing small `outline` button.
- Host card: `background:var(--mc-surface-1)`, radius 8, hairline-muted, padding 16.
  Header row: 32px icon tile (`background:#fff`, hairline, radius 6, 16px icon, secondary),
  title 14/20 550, description 12/18 secondary, status = dot + 12px.
  Inner rows: 12px block padding, hairline separators, hover overlay with -8px bleed, radius 6.
  Row title 13.5/20 550, meta 12/18 secondary, scope chips 11px pills.
  Row actions: right-aligned `sm` gap 8 on ≥640, wrap below content on mobile.
- Sidebar: card as above with rows (12px padding, hairline between, chevron 14px faint,
  hover overlay + -8px bleed). Detail text 12/18 secondary; `dl` grid `96px 1fr` gap 8.
- Collapsible technical block: inset panel `background:var(--mc-surface-1); radius 6;
  padding:12px 16px`; `summary` 12/18 550 secondary; body 12/18 secondary, `dl` grid.
- Empty/loading/error: card-like rows on `--mc-surface-1`; loading uses skeletons; empty has
  centered 320px copy with 32px muted icon tile.
- Notices: `--mc-success-*` / `--mc-danger-*` tones per §5.

### 404 / route error (`pages/not-found-page.tsx`, `pages/route-error-page.tsx`)
- Centered column, `padding-block:96px`, h1 24/32 600, body 14/22 secondary, actions row gap 8.

## 8. Breakpoints
`1024px` (rail → horizontal tab strip + session line), `900px` (auth split→stack),
`768px` (header/identity compaction), `640px` (gutters 16px, tap targets ≥40px, footer stack),
`480px` (h1 22/30, tighter blocks).

## 9. File ownership
- Tokens/primitives: `styles/globals.css`, `components/ui/{button,input,card}.tsx`,
  `styles/console.css` (shell + info primitives), `index.html` (font preload).
- Shell/routing: `app/{routes,root-layout,account-layout}.tsx`,
  `components/{console-nav,session-block,session-recovery,modal-open-context}.tsx`.
- Pages: `pages/account/{overview,devices,security,services}-page.tsx`,
  `pages/{login,not-found,route-error}-page.tsx`.
- Records: `styles/{cloud-pages,cloud-grants}.css`,
  `components/{device-grants-card,host-grant-card,mobile-grant-row,future-services,
  change-password-dialog,auth-failure-alert}.tsx`.
- `apps/web/tests/**` changes only alongside an IA change; `apps/api/**` untouched.

## 10. Must-preserve contract (from the test suite)
Accessible names/strings that tests query (do not rename, retranslate or remove):

- headings: `Mira Cloud 账户` (home h1), `欢迎回来。` (login h1), `登录 Mira Cloud` (h2), `我的账户` (overview h1),
  `设备与授权` (devices h1), `账户安全` (security h1), `关联服务` (services h1),
  `页面不存在` (h1)
- labels/inputs: `账号`, `密码`, `当前密码`, `新密码`; placeholders unchanged
- buttons/links: `登录`, `退出登录`, `修改密码`, `取消`, `确认修改`, `续期 Session`,
  `刷新列表`, `重新读取`, `调整范围`, `保存收窄`, `撤销授权`, `确认撤销`, `前往登录`,
  `重新检查登录状态`, `账户中心`, `管理会话`, `管理`, `查看`
- nav landmarks: `主导航` (public shell), `账户分区` (console rail)
- status text: `正在检查登录状态`, `读取中…`, `登录中…`, `退出中…`, `续期中…`,
  `云端版本 {n}`, `最近在线`, `离线`, `已撤销`, `授权中`, `无有效权限`,
  `没有可管理的 Desktop Host`, `尚未接入`
- roles/ids in use: `role=status`, `role=alert` (exactly one per state), `role=dialog`
  (`aria-labelledby="change-password-heading"`), `id=login-title`,
  `id=change-password-heading`, `id=device-grants-heading`, `id=account-security-heading`,
  `id=future-services-heading`
- long-form copy: `云端保存成功不等于 Desktop 已立即执行…本地、直连与 Tailscale 路径不受影响。`
  appears **once**, on the devices page footer
- `data-slot` attributes: `card`, `card-header`, `card-content`, `card-title`, `card-description`, `button`

## 11. Verification protocol
1. `pnpm --filter @uichat-mira/cloud-auth-web run build` (tsc + vite) must pass.
2. `pnpm --filter @uichat-mira/cloud-auth-web run test:unit` must pass (T1).
3. `pnpm run check` before hand-off (root gate).
4. Screenshots of every account route at 1440×900 and 390×844, plus computed-style
   assertions: no body text <13px, h1 tracking 0 for CJK, every button has non-transparent
   surface or hairline, contrast ≥4.5 for body/secondary text, no horizontal overflow at 390px.
5. No `!important` anywhere in `apps/web/src/styles` (`rg -c '!important'` = 0).
