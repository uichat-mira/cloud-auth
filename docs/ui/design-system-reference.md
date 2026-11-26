# Design System Reference — Mira ID (cloud-auth web)

Living reference for building UI in `apps/web` on the existing Mira Console system. The
[`frontend-design-system` skill](../../.dsh/skills/frontend-design-system/SKILL.md) holds the
method; this file holds what is true for this codebase. Keep it lean and update it when a
pattern is confirmed.

## Sources & access

- **System source:** local primitives in `apps/web/src/components/ui/` (CVA + Tailwind v4) on shadcn/Radix foundations.
- **Token source:** `apps/web/src/styles/globals.css` — raw `--mc-*` custom properties on `:root`, mapped to Tailwind/shadcn through `@theme inline`.
- **Brand source:** [`docs/branding/mira-id/README.md`](../branding/mira-id/README.md) — navy `#151A2C`, ivory `#FFF6ED`, “Soft Minimalism”.
- **Theming:** light only today. Dark `--mc-*` values exist under `.dark` but nothing toggles them; do not assume a theme switch.
- **Writable area:** `apps/web/src/{styles,components,pages,app}`. `apps/api` and `packages/contracts` are out of scope for UI work.

## Foundations

### Color

Three tiers:

1. **Brand primitives** — `--mc-brand-navy` / `-hover` / `-active`, `--mc-brand-ivory`, `--mc-brand-canvas` (logo artwork only).
2. **Semantic roles** — reach for these first:
   - Surfaces: `--mc-surface-0` page, `-1` panel/card, `-2` inset/track, `-3` chip, `-4` bar.
   - Text: `--mc-text`, `-secondary`, `-faint` (12px meta only), `-disabled`, `-inverse`.
   - Action/emphasis: `--mc-accent` (navy), `--mc-accent-hover`.
   - Selected: `--mc-selected-bg` (the neutral hover wash), `--mc-selected-fg` (primary text), plus `--mc-selection-bg` / `--mc-selection-fg` for text selection.
   - Borders/elevation: `--mc-border-*`, `--mc-hairline*`, `--mc-el-*`.
   - States: `--mc-{success,warning,danger,info}-{fg,bg,border}`.
3. **Tailwind aliases** — `@theme inline` exposes `bg-background`, `text-foreground`, `bg-card`, `bg-primary`, `text-muted-foreground`, `ring-ring`, `border-border`, `bg-accent` (selected neutral by default), etc.

Rules:

- Navy is the only action/link/focus hue. Do not add a second accent colour.
- Ivory is a **brand-asset** colour only; do not use it for UI surfaces, text or selection.
- UI neutrals are achromatic black / white / gray; do not reintroduce warm cream or beige surfaces.
- Status hues (green/amber/red/blue) are the exception and keep their semantic meaning.
- A raw hex belongs in `globals.css` only. Everything else references a token.

### Typography

- Family: self-hosted Inter variable for Latin; CJK falls back to `PingFang SC` / `Microsoft YaHei` / `Noto Sans SC` via `--font-sans`.
- Scale tokens: `--mc-text-{xs,sm,md,lg,xl,display}` with matching `--mc-leading-*`; weights `450 / 550 / 600`.
- Base body is 14/22 at weight 450; dense copy 13/20; section h2 15/22 at 550; page h1 `clamp(22px,3vw,26px)` at 600; meta 12/18.
- No negative letter-spacing on CJK. Do not go below 13px for paragraph copy.

### Spacing · sizing · radius · border

- Spacing: `--mc-space-{1,2,3,4,5,6,8,10,12,16}` = 4…64px.
- Radii: `--mc-r-xs` 4, `-sm` 6, `-md` 8, `-lg` 12, `-xl` 16. Buttons and controls are 4–6px; never pills except dots/avatars.
- Controls: button 24 / 28 / 32 / 36px; input 36px (40px on ≤640px); header 56px (52px mobile).
- Depth: hairlines are `0 0 0 .5px <border>` or `var(--mc-hairline*)`; never `1px solid`.

### Elevation

- `--mc-hairline`, `--mc-hairline-muted` — inset cards/rows.
- `--mc-el-control` — inputs, outline buttons.
- `--mc-el-brand` — navy primary button.
- `--mc-el-raised` — login card.
- `--mc-el-floating` — account menu.
- `--mc-el-overlay` — dialogs.

### Motion

- `--mc-duration-fast` 85ms for hover/focus, `--mc-duration-base` 120ms for disclosure.
- `--mc-ease` = `cubic-bezier(0.23, 1, 0.32, 1)`.
- The global `prefers-reduced-motion` guard is the only place `!important` is allowed.

### Breakpoints / layout

- Public shell: 1280px max, 24px gutters (20px ≤900, 16px ≤640), sticky 56px header; the home uses the full container width with a 3-up card row above 900.
- Account console: 1280px container, `212px + minmax(0,1fr)` with 40px gap, content column up to 1040px. ≤1023px the rail becomes a sticky horizontal tab strip.
- Page rhythm: h1 + 62ch caption, sections separated by a top hairline, 28px vertical padding.

### Icons

- No icon package. Inline SVGs with `stroke="currentColor"`, `strokeWidth` 1.5–1.75, `aria-hidden="true"` (or `focusable="false"` inside decorative wrappers).
- Brand mark: `/brand/mira-id/svg/mira-id-app.svg` in a navy tile. Never recolour/rekey the artwork.

### Token binding

```tsx
// Tailwind utility for semantic roles
<div className="bg-card text-foreground shadow-[var(--mc-hairline-muted)]" />

// Raw token when a recipe needs it
style={{ color: "var(--mc-text-secondary)" }}

// CVA variant mapping
default: "bg-[var(--mc-brand-navy)] text-[var(--mc-text-inverse)] shadow-[var(--mc-el-brand)]"
```

## Components

All primitives accept `className` and forward native props. Import from `@/components/ui/<file>`.

### `button.tsx` — Button

- **Axes:** `variant` default(navy primary) · outline · secondary · ghost · destructive · link; `size` sm 24 · default 28 · lg 32 · xl 36 · icon 28.
- **Notes:** `asChild` for link-shaped actions. Focus ring comes from the global rule; never add `outline-none` styling that defeats it.

### `card.tsx` — Card / CardHeader / CardTitle / CardDescription / CardContent

- Inset panel on `--mc-surface-1` with a hairline. `CardTitle as="h2"` when the card is a landmark subsection.

### `input.tsx` — Input

- 36px, white, control elevation, `aria-invalid` danger treatment. Focus halo is global.

### `badge.tsx` — Badge

- **Axes:** `tone` neutral · success · warning · danger · info · brand.
- 18px-high, 11px label, 4px radius. Use `brand` for ownership labels, not for live status.

### `notice.tsx` — Notice

- **Axes:** `tone` success · danger · warning · info · neutral; `role` auto (`success`/`neutral` → status, others → alert) with `role="none"` to defer to a parent live region.
- One notice per state. Never render two alerts for the same failure.

### `page-head.tsx` — PageHead

- Page h1 (route-entry focus target), optional caption, optional `back` link, optional trailing `actions`.
- Use instead of hand-writing `.console-page-head`; keep the heading `id` stable for tests.

### `section.tsx` — Section / SectionHead

- `Section labelledBy` + `SectionHead id/title/caption/action`. One h2 per section, at most one trailing action.

### `facts.tsx` — Facts

- `items: { label, value, mono?, breakAll? }[]`, `align="end"` for compact numeric panels. Renders `dl/div/dt/dd`.

### `field.tsx` — Field

- Label + control + optional hint/error with the shared 6px rhythm. Pass `htmlFor` matching the control `id`.

### `skeleton.tsx` — Skeleton

- Decorative (`aria-hidden`). Container owns `aria-busy` and the visible loading label.

### `confirm-dialog.tsx` — ConfirmDialog

- Native `<dialog>` confirmation rendered only while open. Replaces `window.confirm`. `busy` blocks cancel and backdrop dismissal.

### Dialog pattern (not yet a primitive)

- `ChangePasswordDialog` and the DC dialogs still own their `<dialog>` lifecycle. Shared CSS: `.cloud-dialog`, `.cloud-dialog-head`, `.cloud-dialog-caption`, `.cloud-dialog-form`, `.cloud-dialog-footer`, `.cloud-dialog-close`.

## Framework & surfaces

- **Public shell:** `PortalShell` in `app/root-layout.tsx` (`cloud-shell.css`). Routes `/`, `/login`, `/open-platform`, `/docs`, public 404.
- **Account shell:** `AccountLayout` in `app/account-layout.tsx` (`console.css` + shared `cloud-shell.css`). Handles auth gate, rail, notices, session recovery.
- **New account page:** add a route under `app/routes.tsx`, export a page from `pages/account/`, start with `<PageHead>`, then `<Section>`s.
- **New rule:** page CSS goes in the matching stylesheet (`cloud-pages`, `dc-control`, `cloud-grants-*`). Reusable visual patterns are promoted to a primitive or a token, not copied between pages.

## Confirmed patterns

- Shell duplication is resolved: `.cloud-*` and `.console-*` share container/header/brand/mobile-hit recipes in `cloud-shell.css`; only navigation differs.
- Active nav (`.cloud-nav-active`, `.console-nav-link[aria-current="page"]`) = the same neutral wash as hover + primary text; no accent fill, hairline or indicator.
- DC node cards render one live region at most: the card-level state pill is not `role="status"`; only action feedback is announced.
- Tables of facts use `Facts`; record lists keep their existing `.cloud-*` row recipes.
- Loading skeletons are decorative; the loading sentence is the announced status.

## Gotchas

- CSS is loaded _after_ Tailwind and is unlayered on purpose: plain page rules beat utility classes. That is how the token layer wins, and why the focus ring lives outside `@layer base`.
- `.console-main h1` is the route-focus target; a page that does not render an h1 breaks focus-on-navigation.
- Tests run with `NODE_ENV=test`. The shell here exports `NODE_ENV=production`, which makes React Testing Library fail with `React.act is not a function`.
- pnpm 10 needs Node ≥24; this machine defaults to Node 20. Run gates through `npx -y -p node@24.19.0 -p pnpm@10.34.7 pnpm ...`; a bare `npx pnpm@10.34.7` still uses the host Node.
- Brand artwork includes its own cream canvas; never key it out or recolour it.
