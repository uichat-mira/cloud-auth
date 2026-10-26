# Mira Cloud Account — UI design system

The Account portal was redesigned against a measured reference (the OpenCode Console
activity page). Everything here is derived from that reference's shipped CSS, not from
memory, and every value is checked against the running app.

Round 1 adopted the reference's *visual* language (tokens, type scale, elevation, components).
Round 2 adopted its *information organisation*: the account area is now a console — a left
section rail, four routes, page heads with one-line captions, fact lists and record rows —
instead of one long marketing scroll.

The delivered portal also has a persistent public home at `/` and a centered login form
at `/login`. The console rail keeps only the logout action; the header identity no
longer repeats the login status. These refinements supersede the initial layouts in
the design and IA documents below.

## Documents

| File | What it is |
| --- | --- |
| [`opencode-design-system.md`](./opencode-design-system.md) | Factual harvest of the reference console: 240 `--v2-*` + 14 `--oc-*` tokens, elevation recipes, type scale, component recipes (button-v2, inputs, menus, dialogs, tags…), the `.activity-dashboard` layout and breakpoint cascade. Evidence, not a plan. |
| [`current-ui-audit.md`](./current-ui-audit.md) | Objective audit of the **old** UI (measured at commit `b1f358c`): font-size histogram, WCAG contrast failures, affordance/tap-target counts, CSS entropy, plus the must-preserve test contract. |
| [`console-ia-contract.md`](./console-ia-contract.md) | The build contract for the console IA: route tree, page exports, shell markup, per-route copy and heading ids, component changes, CSS class list, file ownership, invariants. Read this before touching `app/`, `pages/account/` or the grants components. |
| [`mira-redesign-spec.md`](./mira-redesign-spec.md) | The design system we adopted ("Mira Console"): information architecture, token tables, type scale, component recipes, page blueprints, breakpoints, accessibility rules and the verification protocol. |
| [`redesign-verification.md`](./redesign-verification.md) | Before/after measurements taken from the running app (type histogram, contrast, tap targets, focus rings, layout geometry), with the command used for each number. |

## Where it lives in code

```
apps/web/src/app/routes.tsx          two layout routes: PublicLayout (/, /login, *) + /account/*
apps/web/src/app/root-layout.tsx     PortalShell (public header + nav + footer), PublicLayout
apps/web/src/app/account-layout.tsx  console shell: header, rail, session block, notices, auth gate
apps/web/src/lib/auth/session-labels.ts  AuthStatus → 中文 label (rail, overview, recovery)
apps/web/src/lib/format.ts           formatExpiry (shared account facts)
apps/web/src/lib/auth/account-entry.ts  shared public entry destinations and labels
apps/web/src/pages/home-page.tsx     persistent account portal home
apps/web/src/styles/globals.css      --mc-* raw tokens, shadcn bridge, base layer, focus ring
apps/web/src/styles/cloud-shell.css  public header / container / footer / brand / nav
apps/web/src/styles/console.css      console shell + info primitives (rail, page head, facts, summary)
apps/web/src/styles/cloud-pages.css  login canvas+card, account sections, rows, dialog, states
apps/web/src/styles/cloud-home.css   public home hero, capabilities and responsive layout
apps/web/src/styles/cloud-grants.css device/host grants, scope pills, editor, confirm block
apps/web/src/components/ui/          button, input, card recipes (CVA)
apps/web/public/fonts/               Inter variable (latin subset, OFL) + licence
```

Load order matters: `globals → cloud-shell → console → cloud-pages → cloud-home → cloud-grants`. Plain CSS
(no `@layer`) always beats Tailwind utilities — that is deliberate, it is how the
token layer wins over stray component utilities, and it is also why the focus ring lives
outside `@layer base` (a ring declared in `base` is erased by `outline-none`).

## Routes

| Route | Page | h1 |
| --- | --- | --- |
| `/` | `HomePage` | 你的 Mira 云端账户 |
| `/login` | `LoginPage` | 登录 Mira Cloud |
| `/account` | `OverviewPage` | 我的账户 |
| `/account/devices` | `DevicesPage` | 设备与授权 |
| `/account/security` | `SecurityPage` | 账户安全 |
| `/account/services` | `ServicesPage` | 关联服务 |
| `/account/*` | `NotFoundPage` inside the console shell | 页面不存在 |
| `*` | `NotFoundPage` in the public shell | 页面不存在 |

## Rules that are easy to break

- Colours and elevation come from `--mc-*` only. A raw hex belongs in `globals.css`, nowhere else
  (`#ffffff` on the near-black brand mark is the one documented exception).
- Depth is a `0 0 0 .5px` hairline or a multi-layer elevation token — never `1px solid`.
- No `!important` (the single `prefers-reduced-motion` guard is the exception).
- Body copy is 13px minimum (14px default); 11–12px is reserved for metadata captions.
- No negative letter-spacing on CJK copy; eyebrows may use positive tracking.
- One `role="status"` and one `role="alert"` per rendered state. The layout owns the notice
  region; a modal dialog suppresses it while open (`ModalOpenProvider`).
- `退出登录` exists exactly once (rail session block); `修改密码` and `续期 Session` exist only on
  `/account/security`.
- Section headings are h2 inside a page h1; every section carries a one-line caption and at most
  one trailing action. Prose lives in a single footer note per page, not under every record.
- Touch targets: 40px minimum below 640px (`[data-slot="button"]`, rail tabs, brand).

## Verifying a change

```bash
pnpm --filter @uichat-mira/cloud-auth-web run typecheck
pnpm --filter @uichat-mira/cloud-auth-web run test:unit          # T1
pnpm --filter @uichat-mira/cloud-auth-web run test:integration   # T3, renders real pages
pnpm run check                                                   # fast repository gate
```

`test:integration` writes full-page screenshots to `apps/web/coverage/screenshots/`
(desktop + mobile for login, the four account routes, the password dialog, 404). Those are the
quickest way to eyeball a regression. The app also supports `pnpm run dev` (API
`127.0.0.1:8788`, Vite `127.0.0.1:5173` proxying `/v1`, `/health`, `/ready`, `/.well-known`) and
`pnpm --filter @uichat-mira/cloud-auth-web run preview` for the production bundle.

The measured numbers in `redesign-verification.md` come from
[`apps/web/scripts/measure-console.mjs`](../../apps/web/scripts/measure-console.mjs): build the
app, run `preview`, point it at an API with a provisioned account, then

```bash
$env:MEASURE_USER="<account>"; $env:MEASURE_PASS="<password>"
node apps/web/scripts/measure-console.mjs   # → .screenshots/after-ia/ + metrics.json
```

It logs in once per viewport and records, for every route and viewport, the computed font
sizes, WCAG contrast, tap-target sizes, geometry, ARIA state, horizontal overflow and DOM
counts, alongside full-page screenshots.
