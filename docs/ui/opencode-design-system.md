# OpenCode Console — Extracted Design System Reference

Source: the public, unauthenticated compiled CSS bundles of `https://opencode.ai/console/...`, downloaded to `.design-ref/`. Everything below is **extracted fact**, not invention. All token *values* are exact (including the original short-hex / keyword spellings); prose is paraphrased.

| Asset | Size | Parsed blocks | Role |
|---|---|---|---|
| `index-Si8gO7Hd.css` | 159 KB | 1,518 | Design system: tokens, `[data-component=...]` recipes, Tailwind v4 theme + utilities |
| `app-pages-coCkBmOH.css` | 82 KB | 738 | Per-page layouts: `.activity-*`, `.controls-layout`, `.policy-*`, `.onboarding`, command palette |
| `meters-D2Y_HEIr.css` | 12 KB | 68 | `tag` (badge/pill), `switch`, `inline-input-v2`, `console-drawer` |
| `segmented-control-CMw8ymNH.css` | 2.4 KB | 10 | `segmented-control-v2` |
| `select-input-CunYIBeC.css` | 0.9 KB | 5 | Select row variants with icon/description |

Cross-check counts (regex/parser over all five files):

* **`--v2-*`: 240 unique names, 424 definition occurrences, 976 `var()` references.**
* **`--oc-*`: 14 unique names, 14 definitions** (all in `index`, `:root`).
* `--console-*`: 2 names (`--console-skeleton`, `--console-skeleton-shine`), redefined for dark.
* `--menu-v2-*`: 8 component-local vars. `--avatar-*`: 5.
* 434 total custom properties; 2,053 total `var()` uses.
* Token layers found: palette (`:root`, 147), semantic light (`:root`, 94 = 92 + 2 fonts), semantic light again (`[data-color-scheme=light]`, 92), semantic dark (`[data-color-scheme=dark]`, 92), syntax/diff (`html[data-theme=oc-2] body:not([data-new-layout])`, 9).
* Three exact values verified verbatim: `--v2-grey-1100:#161616`; `--oc-bg:var(--v2-background-bg-base)`; `.activity-dashboard{grid-template-columns:minmax(0,960px) 352px;gap:56px;max-width:1368px}`.

---

## 1. Token architecture (3 layers + Tailwind bridge)

1. **Palette** — raw ramps (`--v2-grey-*`, `--v2-alpha-dark-*`, `--v2-alpha-light-*`, `--v2-{red,orange,yellow,green,cyan,blue,purple,pink}-*`). Theme-independent, defined once on `:root`.
2. **Semantic** — role tokens (`--v2-background-bg-*`, `--v2-text-text-*`, `--v2-icon-icon-*`, `--v2-border-border-*`, `--v2-overlay-simple-*`, `--v2-state-*`, `--v2-elevation-*`, `--v2-avatar-*`, `--v2-agent-*`, `--v2-illustration-*`). Authored in **light** on `:root` + `[data-color-scheme=light]`, overridden in **dark** on `[data-color-scheme=dark]`.
3. **App aliases** — `--oc-*` (14) map to v2 semantics and are what page CSS uses; plus a legacy alias island scoped to `.onboarding` (`--bg-base`, `--text-muted`, `--border-faint`, `--elev-raised`, `--hair`, `--radius-xs|sm|md|xl`, `--accent`, `--font-code`, `--w-medium`, `--ease-out|in-out`).
4. **Tailwind v4 bridge** — `:root,:host` declares `--color-background:var(--oc-bg)` … `--color-danger:var(--oc-danger)` (14 color aliases), `--font-sans`, `--font-mono`, `--spacing:.25rem`, `--radius-*`, `--text-*`, `--ease-*`, `--default-transition-duration:.15s`.

Important: the v2 system is **color + elevation only**. There are **no spacing, radius, motion, or size tokens** (`--v2-font-family-sans` is the only non-color token). All sizes are literal px in the recipes.

---

## 2. Palette (exact values)

Neutral ramp — note `grey-50` is pure white and `grey-600` is the CSS keyword `gray` (#808080):

| step | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000 | 1100 | 1200 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grey | `#fff` | `#fafafa` | `#f2f2f2` | `#eee` | `#dbdbdb` | `#aeaeae` | `gray` | `#5c5c5c` | `#3a3a3a` | `#2e2e2e` | `#242424` | `#161616` | `#080808` |

Alpha ramps (used for every overlay/ring; they are theme-relative by design):

| step | 100 | 90 | 80 | 70 | 60 | 50 | 40 | 30 | 24 | 20 | 16 | 14 | 12 | 10 | 8 | 6 | 4 | 2 | 0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dark | `#000` | `#000000e5` | `#000c` | `#000000b2` | `#0009` | `#00000080` | `#0006` | `#0000004d` | `#0000003d` | `#0003` | `#00000029` | `#00000024` | `#0000001f` | `#0000001a` | `#00000014` | `#0000000f` | `#0000000a` | `#00000005` | `#0000` |
| light | `#fff` | `#ffffffe5` | `#fffc` | `#ffffffb2` | `#fff9` | `#ffffff80` | `#fff6` | `#ffffff4d` | `#ffffff3d` | `#fff3` | `#ffffff29` | `#ffffff24` | `#ffffff1f` | `#ffffff1a` | `#ffffff14` | `#ffffff0f` | `#ffffff0a` | `#ffffff05` | `#fff0` |

Accent ramps (200/300/400 = dark-mode text, 500/600 = focus/brand, 700/800 = light-mode text, 1200 = dark-mode tinted surfaces):

| ramp | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000 | 1100 | 1200 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| red | `#fceceb` | `#f6d5d3` | `#f2bbb7` | `#f29b96` | `#f17471` | `#f1484f` | `#d92e3c` | `#b82d35` | `#97252b` | `#7a1f23` | `#5f1a1c` | `#461516` |
| orange | `#fdf2ed` | `#ffe7dc` | `#ffd8c6` | `#ffc1a4` | `#ffa478` | `#ff8648` | `#ee7330` | `#d16427` | `#b35624` | `#954c27` | `#723d22` | `#5a2c14` |
| yellow | `#fefaec` | `#fcefd0` | `#f7e5b5` | `#f3da9b` | `#f2cf76` | `#f6c251` | `#e7af36` | `#cb9f34` | `#ac8833` | `#8e7231` | `#68552b` | `#4b4025` |
| green | `#e7f9ea` | `#d0f0d5` | `#b8e9c1` | `#96e3a6` | `#6bd586` | `#49c970` | `#2eaf5a` | `#198b43` | `#1d783c` | `#196130` | `#164c26` | `#14361d` |
| cyan | `#e2f7fb` | `#c4edf4` | `#a3e4ef` | `#65d9eb` | `#00c5df` | `#00abcf` | `#0096b8` | `#007d9b` | `#006c85` | `#005a6e` | `#004756` | `#00353f` |
| blue | `#ecf1fe` | `#d7e2fc` | `#c3d4fd` | `#a2bcff` | `#7698fd` | `#3b5cf6` | `#3250df` | `#2c47c8` | `#263fa9` | `#22388f` | `#1c2e70` | `#1b2852` |
| purple | `#ebecfe` | `#d5d5fc` | `#b9b8f5` | `#9e99f7` | `#8271f8` | `#7152f4` | `#623be2` | `#5230c2` | `#442aa1` | `#361f83` | `#2b1b6a` | `#221358` |
| pink | `#fdecf3` | `#f7d5e4` | `#fabcd8` | `#f799c6` | `#f26cb2` | `#f64aab` | `#e4429e` | `#c83d8b` | `#aa3576` | `#8c2d61` | `#6f284f` | `#5c1d3f` |

---

## 3. Semantic tokens — light and dark (exact)

Dark values are the `[data-color-scheme=dark]` overrides. Where light/dark differ only by ramp direction, both are given.

### 3.1 Background

| token | light | dark |
|---|---|---|
| `--v2-background-bg-base` | `var(--v2-grey-50)` → `#fff` | `var(--v2-grey-1100)` → `#161616` |
| `--v2-background-bg-deep` | `var(--v2-grey-100)` → `#fafafa` | `var(--v2-grey-1200)` → `#080808` |
| `--v2-background-bg-layer-01` | `var(--v2-grey-100)` → `#fafafa` | `var(--v2-grey-1000)` → `#242424` |
| `--v2-background-bg-layer-02` | `var(--v2-grey-200)` → `#f2f2f2` | `var(--v2-grey-900)` → `#2e2e2e` |
| `--v2-background-bg-layer-03` | `var(--v2-grey-300)` → `#eee` | `var(--v2-grey-800)` → `#3a3a3a` |
| `--v2-background-bg-layer-04` | `var(--v2-grey-400)` → `#dbdbdb` | `var(--v2-grey-700)` → `#5c5c5c` |
| `--v2-background-bg-inverse` | `var(--v2-grey-1100)` → `#161616` | `var(--v2-grey-50)` → `#fff` |
| `--v2-background-bg-contrast` | `var(--v2-grey-1000)` → `#242424` | `var(--v2-grey-700)` → `#5c5c5c` |
| `--v2-background-bg-button-neutral` | `var(--v2-grey-50)` → `#fff` | `var(--v2-alpha-light-6)` → `#ffffff0f` |
| `--v2-background-bg-accent` | `var(--v2-blue-600)` → `#3b5cf6` | same `#3b5cf6` |

### 3.2 Text and icon

| token | light | dark |
|---|---|---|
| `--v2-text-text-base` | `grey-1100` `#161616` | `grey-100` `#fafafa` |
| `--v2-text-text-muted` | `grey-700` `#5c5c5c` | `grey-500` `#aeaeae` |
| `--v2-text-text-faint` | `grey-600` `gray` | `grey-600` `gray` |
| `--v2-text-text-inverse` | `grey-50` `#fff` | `grey-1100` `#161616` |
| `--v2-text-text-contrast` | `grey-50` `#fff` | `grey-50` `#fff` |
| `--v2-text-text-accent` | `blue-600` `#3b5cf6` | `blue-400` `#a2bcff` |
| `--v2-text-text-accent-hover` | `blue-700` `#3250df` | `blue-300` `#c3d4fd` |
| `--v2-text-text-code-accent` | `blue-900` `#263fa9` | `blue-400` `#a2bcff` |
| `--v2-icon-icon-base` | `grey-800` `#3a3a3a` | `grey-400` `#dbdbdb` |
| `--v2-icon-icon-muted` | `grey-600` `gray` | `grey-600` `gray` |
| `--v2-icon-icon-inverse` | `grey-50` `#fff` | `grey-1100` `#161616` |
| `--v2-icon-icon-contrast` | `grey-100` `#fafafa` | `grey-100` `#fafafa` |
| `--v2-icon-icon-accent` | `blue-600` `#3b5cf6` | `blue-400` `#a2bcff` |
| `--v2-icon-icon-accent-hover` | `blue-700` `#3250df` | `blue-300` `#c3d4fd` |

### 3.3 Border

| token | light | dark |
|---|---|---|
| `--v2-border-border-muted` | `alpha-dark-8` `#00000014` | `alpha-light-8` `#ffffff14` |
| `--v2-border-border-base` | `alpha-dark-10` `#0000001a` | `alpha-light-10` `#ffffff1a` |
| `--v2-border-border-strong` | `alpha-dark-20` `#0003` | `alpha-light-20` `#fff3` |
| `--v2-border-border-inverse` | `grey-1000` `#242424` | `grey-100` `#fafafa` |
| `--v2-border-border-focus` | `blue-500` `#7698fd` | `blue-500` `#7698fd` |

### 3.4 Overlay (all interaction states are overlay layers, never new colors)

| token | light | dark |
|---|---|---|
| `--v2-overlay-simple-overlay-hover` | `alpha-dark-4` `#0000000a` | `alpha-light-6` `#ffffff0f` |
| `--v2-overlay-simple-overlay-pressed` | `alpha-dark-8` `#00000014` | `alpha-light-10` `#ffffff1a` |
| `--v2-overlay-simple-overlay-contrast-hover` | `alpha-light-12` `#ffffff1f` | `alpha-dark-24` `#0000003d` |
| `--v2-overlay-simple-overlay-contrast-pressed` | `alpha-light-24` `#ffffff3d` | `alpha-dark-40` `#0006` |
| `--v2-overlay-simple-overlay-scrim` | `alpha-dark-40` `#0006` | `alpha-dark-60` `#0009` |
| `--v2-overlay-gradient-depth-overlay-depth-top` | `alpha-light-100` `#fff` | `alpha-light-100` `#fff` |
| `--v2-overlay-gradient-depth-overlay-depth-bot` | `alpha-light-0` `#fff0` | `alpha-light-0` `#fff0` |
| `--v2-overlay-simple-tab-active-scrim` | `#fafafa00` | `#24242400` |
| `--v2-overlay-simple-tab-hover-scrim` | `#eee0` | `#3a3a3a00` |
| `--v2-overlay-simple-tab-scrim` | `#fafafa00` | `#08080800` |

### 3.5 Status / state

| token | light | dark |
|---|---|---|
| `--v2-state-bg-success` | `green-100` `#e7f9ea` | `green-1200` `#14361d` |
| `--v2-state-fg-success` | `green-800` `#198b43` | `green-500` `#6bd586` |
| `--v2-state-border-success` | `green-300` `#b8e9c1` | `green-900` `#1d783c` |
| `--v2-state-bg-warning` | `yellow-100` `#fefaec` | `yellow-1200` `#4b4025` |
| `--v2-state-fg-warning` | `yellow-800` `#cb9f34` | `yellow-500` `#f2cf76` |
| `--v2-state-border-warning` | `yellow-300` `#f7e5b5` | `yellow-900` `#ac8833` |
| `--v2-state-bg-danger` | `red-100` `#fceceb` | `red-1200` `#461516` |
| `--v2-state-fg-danger` | `red-800` `#b82d35` | `red-500` `#f17471` |
| `--v2-state-border-danger` | `red-300` `#f2bbb7` | `red-900` `#97252b` |
| `--v2-state-bg-info` | `blue-100` `#ecf1fe` | `blue-1200` `#1b2852` |
| `--v2-state-fg-info` | `blue-800` `#2c47c8` | `blue-500` `#7698fd` |
| `--v2-state-border-info` | `blue-300` `#c3d4fd` | `blue-900` `#263fa9` |

### 3.6 Agent identity colors

| token | light | dark |
|---|---|---|
| `--v2-agent-plan-solid` | `pink-800` `#c83d8b` | `pink-400` `#f799c6` |
| `--v2-agent-plan-border` | `#c83d8b33` | `#f799c633` |
| `--v2-agent-plan-background` | `#fdecf31a` | `#aa35760d` |
| `--v2-agent-build-solid` | `blue-800` `#2c47c8` | `blue-300` `#c3d4fd` |
| `--v2-agent-build-border` | `#2c47c81a` | `#a2bcff33` |
| `--v2-agent-build-background` | `#ecf1fe1a` | `#263fa90d` |
| `--v2-agent-explore-solid` | `yellow-900` `#ac8833` | `yellow-300` `#f7e5b5` |
| `--v2-agent-explore-border` | `#cb9f3433` | `#f3da9b33` |
| `--v2-agent-explore-background` | `#fefaec1a` | `#ac88330d` |
| `--v2-agent-review-solid` | `green-800` `#198b43` | `green-300` `#b8e9c1` |
| `--v2-agent-writer-solid` | `purple-700` `#623be2` | `purple-400` `#9e99f7` |

### 3.7 Avatar

`--v2-avatar-fg` = `#fff` in both themes.

| pair | light bg / border | dark bg / border |
|---|---|---|
| orange | `#ee7330` / `#d16427` | `#723d22` / `#ff8648` |
| yellow | `#e7af36` / `#cb9f34` | `#68552b` / `#e7af36` |
| cyan | `#0096b8` / `#007d9b` | `#005a6e` / `#0096b8` |
| green | `#2eaf5a` / `#198b43` | `#196130` / `#49c970` |
| red | `#d92e3c` / `#b82d35` | `#7a1f23` / `#d92e3c` |
| pink | `#e4429e` / `#c83d8b` | `#8c2d61` / `#e4429e` |
| blue | `#3250df` / `#2c47c8` | `#263fa9` / `#7698fd` |
| purple | `#623be2` / `#5230c2` | `#361f83` / `#7152f4` |
| gray | `#5c5c5c` / `#3a3a3a` | `#5c5c5c` / `#aeaeae` |

### 3.8 Illustration layers (empty-state art)

| token | light | dark |
|---|---|---|
| `--v2-illustration-illustration-layer-01` | `grey-300` `#eee` | `grey-900` `#2e2e2e` |
| `--v2-illustration-illustration-layer-02` | `grey-400` `#dbdbdb` | `grey-800` `#3a3a3a` |
| `--v2-illustration-illustration-layer-03` | `grey-500` `#aeaeae` | `grey-700` `#5c5c5c` |

### 3.9 App aliases `--oc-*` (what page CSS actually consumes)

| alias | maps to | light resolved | dark resolved |
|---|---|---|---|
| `--oc-bg` | `--v2-background-bg-base` | `#fff` | `#161616` |
| `--oc-surface` | `--v2-background-bg-layer-01` | `#fafafa` | `#242424` |
| `--oc-elevated` | `--v2-background-bg-base` | `#fff` | `#161616` |
| `--oc-text` | `--v2-text-text-base` | `#161616` | `#fafafa` |
| `--oc-text-secondary` | `--v2-text-text-muted` | `#5c5c5c` | `#aeaeae` |
| `--oc-text-muted` | `--v2-text-text-faint` | `gray` `#808080` | `gray` `#808080` |
| `--oc-text-disabled` | `--v2-grey-500` | `#aeaeae` | `#aeaeae` |
| `--oc-accent` | `--v2-text-text-accent` | `#3b5cf6` | `#a2bcff` |
| `--oc-accent-hover` | `--v2-text-text-accent-hover` | `#3250df` | `#c3d4fd` |
| `--oc-border` | `--v2-border-border-base` | `#0000001a` | `#ffffff1a` |
| `--oc-border-muted` | `--v2-border-border-muted` | `#00000014` | `#ffffff14` |
| `--oc-success` | `--v2-state-fg-success` | `#198b43` | `#6bd586` |
| `--oc-warning` | `--v2-state-fg-warning` | `#cb9f34` | `#f2cf76` |
| `--oc-danger` | `--v2-state-fg-danger` | `#b82d35` | `#f17471` |

### 3.10 Syntax/diff island

Scoped to `html[data-theme=oc-2] body:not([data-new-layout])`: `--text-diff-add-base:light-dark(#167517,#c4ffc0)`, `--text-diff-delete-base:light-dark(#fa3012,#ec2f14)`, `--syntax-comment:light-dark(#7a7a7a,#8f8f8f)`, `--syntax-keyword:light-dark(#a753ae,#edb2f1)`, `--syntax-string:#00ceb9`, `--syntax-primitive:light-dark(#034cff,#8cb0ff)`, `--syntax-property:light-dark(#a753ae,#fab283)`, `--syntax-type:light-dark(#8a6f00,#fcd53a)`, `--syntax-critical:light-dark(#ff8c00,#fab283)`.

### 3.11 Skeleton

`--console-skeleton:var(--v2-alpha-dark-6)` (`#0000000f`) and `--console-skeleton-shine:var(--v2-alpha-light-50)` (`#ffffff80`) on `:root`; dark (`:root[data-color-scheme=dark]`) = `var(--v2-alpha-light-6)` (`#ffffff0f`) and `var(--v2-alpha-light-4)` (`#ffffff0a`).

---

## 4. Elevation recipes (multi-layer shadows — reproduce layer-for-layer)

Every elevation is a 3–5 layer stack: a soft drop shadow, a tighter drop shadow, a **0.5px hairline ring authored as a 0-offset shadow** (`0 0 0 .5px`), sometimes an inset highlight, and a trailing `0 0 0 0 transparent` layer so transitions can interpolate.

| token | light | dark |
|---|---|---|
| `--v2-elevation-raised` | `0 2px 4px 0 #0000000a, 0 1px 2px -1px #00000014, 0 0 0 .5px #0000001f, 0 0 0 0 #0000` | `0 2px 4px 0 #0000004d, 0 1px 2px 0 #0000004d, 0 0 0 .5px #ffffff29, 0 -.5px 0 0 #ffffff0f` |
| `--v2-elevation-floating` | `0 8px 16px 0 #0000000a, 0 4px 8px 0 #00000014, 0 0 0 .5px #0000001f, 0 0 0 0 #0000` | `0 8px 16px 0 #0000004d, 0 4px 8px 0 #0000004d, 0 0 0 .5px #ffffff29, 0 -.5px 0 0 #ffffff0f` |
| `--v2-elevation-overlay` | `0 16px 32px 0 #0000000a, 0 8px 16px 0 #00000014, 0 0 0 .5px #0000001f, 0 0 0 0 #0000` | `0 16px 32px 0 #0000004d, 0 8px 16px 0 #0000004d, 0 0 0 .5px #ffffff29, 0 -.5px 0 0 #ffffff0f` |
| `--v2-elevation-button-neutral` | `0 1px 1.5px 0 #0000001a, 0 0 0 .5px #00000024, 0 0 0 0 #0000` | `0 1px 2px 0 #0006, 0 0 0 .5px #fff3, 0 -.5px 0 0 #ffffff1a` |
| `--v2-elevation-button-contrast` | `0 1px 1.5px 0 #0003, 0 0 0 .5px #3a3a3a, inset 0 1px 2px 0 #ffffff24, inset 0 -1px 2px 0 #0000000f, 0 0 0 0 #0000` | `0 1px 2px 0 #0006, 0 0 0 .5px #fff6, inset 0 0 0 0 #fff0, inset 0 0 0 0 #fff0, 0 -.5px 0 0 #ffffff4d` |
| `--v2-elevation-elements` | `0 .5px .5px 0 #0006` | identical: `0 .5px .5px 0 #0006` |
| `--v2-elevation-switch-off` | `inset 0 1px 1px 0 #00000014, inset 0 .5px .5px 0 #00000014, inset 0 0 0 .5px #0000001a` | `inset 0 -.5px 0 0 #ffffff1a, inset 0 0 0 0 #fff0, inset 0 0 0 .5px #ffffff29` |
| `--v2-elevation-switch-on` | `inset 0 2px 2px 0 #0000001a, inset 0 1px 1px 0 #0000001a, inset 0 0 0 .5px #0003` | same as dark switch-off |

Where the elevation tokens are **used** (so depth is applied consistently):

* `raised` — the "card on sheet" tier: `.policy-builder-card` (radius 12px, padding 6px, bg-base), `.policy-builder-card-row` / `.policy-builder-number` (36px rows, radius 6px), `.control-route-summary` (radius 6px, `padding:12px 16px`), `.control-list-icon` (pill), `.policy-members-pane` (radius 10px, `inset:8px` when floating), `.policy-builder-tool [data-component=text-input-v2]`. This is what makes a white card visibly lift off the `bg-deep` canvas without a border.
* `floating` — `menu-v2-content`, `select-v2-content`, `tooltip-v2`, `toast-v2`, `.console-command-palette`.
* `overlay` — `dialog-container`, `console-drawer-panel`.
* `button-neutral` — `button-v2` / `icon-button-v2` neutral+danger+warning variants, `segmented-control-v2-indicator`, `text-input-v2`, `textarea-v2`, `select-v2`, `inline-input-v2`.
* `button-contrast` — `button-v2[data-variant=contrast]`, `icon-button-v2[data-variant=contrast]`.
* `elements` — switch thumb, `radio-v2-item-indicator`.
* `switch-off` / `switch-on` — switch track.
* Inside components, extra rings are written inline: `inset 0 0 0 1px` (outline button), `inset 0 0 0 .5px` (loading button, radio control), `0 0 0 .5px` (segmented container).

---

## 5. Radius, spacing, sizing (literal px — no tokens)

Radius scale evidenced by the legacy alias block and by usage: **2 / 4 / 6 / 8 / 12 / 9999**.

| radius | used for |
|---|---|
| 2px | `tag`/badges, `menu-item-badge`, activity status chip, kbd, switch thumb, progress track, focus-ring on tiny icon buttons |
| 4px | small button, menu/select item, tooltip, input inner icon button, toast close, radio control stack, avatar-org small |
| 6px | standard button, input, select, card, dialog, menu content, segmented control + its indicator, drawer, activity row hover, avatar-org default |
| 8px | toast, `.activity-card-inset`, table header blocks |
| 10px | `.policy-members-pane` |
| 12px | `.console-command-palette`, `.policy-builder-card` |
| 9999px | avatar (default), pill/progress fills, switch radius variants |

Spacing is literal too. Recurring values: 2, 4, 6, 8, 12, 16, 24, 32, 40, 56, 64 px. The Tailwind theme exposes `--spacing:.25rem` (4px grid) but the design-system recipes do not use it.

Type/size anchors: control heights **24 / 28 / 32**; icon buttons **20 / 24 / 28**; avatars **16 / 20 / 28**; hairline = **0.5px** everywhere (authored as `.5px` borders or `0 0 0 .5px` shadows; `divider-v2` uses `height:1px; transform:scaleY(.5)`).

---

## 6. Typography

### 6.1 Families

* `@font-face` **Inter** — `/console/assets/Inter-c8O0ljhh.ttf`, `format("truetype")`, `font-weight:100 900`, `font-display:swap`.
* `@font-face` **"Console Controls Inter"** — `/console/assets/inter-variable-DiVDrmQJ.woff2`, `format("woff2")`, `font-weight:100 900`, `font-display:swap`.
* `--font-family-text:"Inter", sans-serif` and `--v2-font-family-sans:"Inter", sans-serif` on `:root` (these two are the only non-color `--v2-` token).
* `body` uses `var(--v2-font-family-sans)`; utility pages swap in the optical-size build: `.controls-layout, .policy-builder, .policy-picker, .policy-delete-dialog, .control-font, body:has(.policy-picker) [data-slot=select-v2-content] { --font-family-sans: "Console Controls Inter", sans-serif; font-family: var(--font-family-sans); font-optical-sizing: none; font-weight: 440 }`.
* Mono: `--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`; legacy `--font-code: "IBM Plex Mono", monospace` inside `.onboarding`.
* Sans fallback stack: `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`.

### 6.2 Rendering defaults

`body` = `font-size:13px; font-weight:440; line-height:1.25; letter-spacing:-.04px; -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision`. Component text additionally sets `font-variation-settings:"slnt" 0` and `font-synthesis:none` (toast/labels/buttons). Numbers use `font-variant-numeric:tabular-nums` (buttons, tooltips, menu items, tags, numeric inputs, chart text).

### 6.3 Weights actually used

`440` body/default · `530` medium (headings, buttons, labels, tabular metrics, active menu item) · `500` kbd/mono · `400` code · token scale also defines 400/500/600 (`--font-weight-normal|medium|semibold`), 600 is effectively unused in these chunks.

### 6.4 Scale (size / line-height / weight / tracking, with usage)

| size | line-height | weight | tracking | usage |
|---|---|---|---|---|
| 21px | 24px | 530 | inherited | page `h1` in `.activity-dashboard` |
| 21px | 28px | 530 | inherited | big metric numbers (`.activity-personal-total>strong`, `.activity-credit>strong`) |
| 15px | 20px | 530 | `-.13px` | `h2`, dialog title, `.policy-builder-sentence` at 440 |
| 15px | 20px | 530 | `0` | `.onboarding .title`, `.policy-members-header>h2` |
| 13px | 20px | 440 | `-.04px` | body copy, descriptions, table cells |
| 13px | 20px | 530 | `-.04px` | button label, toast title, section labels |
| 13px | 16px | 530 | `-.04px` | dialog small title, command-palette title, picker table heading |
| 13px | 1 | 440 | `-.04px` | input/select value text, field label (530, `line-height:1`) |
| 13px | 100% | 530 | `-.04px` | segmented-control item |
| 11px | 16px | 440 | `+.05px` | captions, metadata, coverage note |
| 11px | 16px | 530 | `+.05px` | chart axis, menu shortcut, labels |
| 11px | 12px | 530 | `+.05px` | tooltip |
| 11px | 1 | 530 | `+.05px` | `tag`/badge, avatar initials (uppercase) |
| `.9375rem` | `1.75rem` | 440 | — | `.changelog-markdown` body |

---

## 7. Component recipes

All components are attribute-driven: `[data-component=x]`, `[data-size=…]`, `[data-variant=…]`, `[data-state=hover|pressed|focus|disabled]`. There is **no `primary` button variant** — the filled CTA is `contrast`.

### 7.1 `button-v2`

Base: `inline-flex`, centered, `gap:6px`, `border-radius:6px`, `font-weight:530`, `font-size:13px`, `line-height:20px`, `letter-spacing:-.04px`, `tabular-nums`, `color:var(--v2-text-text-base)`, `text-shadow:none`, user-select none, `outline:none`.

| size | height | padding | radius |
|---|---|---|---|
| small | 24px | `0 9px` | 4px |
| normal | 28px | `0 11px` | 6px |
| large | 32px | `0 15px` | 6px |

Icon-leading variants keep the same left padding (`data-icon` does not shrink it). Icons inherit `currentColor`.

| variant | idle | hover | active/pressed | disabled |
|---|---|---|---|---|
| `neutral` (default) | `bg-button-neutral`, text base, `elevation-button-neutral` | overlay-hover gradient stacked over the neutral gradient | overlay-pressed stack | `opacity:.5`, `not-allowed` |
| `contrast` (filled CTA) | top-lit gradient (`light-20`→`light-0`) over `bg-contrast`, text `text-contrast`, `text-shadow:0 .5px .5px rgba(0,0,0,.3)`, `elevation-button-contrast` | prepend overlay-contrast-hover | prepend overlay-contrast-pressed | `opacity:.4` |
| `outline` | transparent, `inset 0 0 0 1px border-muted` | overlay-hover bg | overlay-pressed bg | `opacity:.5` |
| `ghost` | transparent | overlay-hover bg (unless `[data-expanded]`) | overlay-pressed bg | `opacity:.5` |
| `ghost-muted` | transparent, text muted, icon muted | overlay-hover | overlay-pressed; expanded → text base | `opacity:.5` |
| `danger` | neutral bg + `state-fg-danger` text + button-neutral elevation | overlay-hover | overlay-pressed | `opacity:.5` |
| `warning` | neutral bg + `state-fg-warning` | overlay-hover | overlay-pressed | `opacity:.5` |
| `loading` | `bg-layer-02`, text base, `inset 0 0 0 .5px border-muted`, `pointer-events:none` | — | — | — |

Focus: `:focus-visible` (or `[data-state=focus]`) → `outline:2px solid var(--v2-border-border-focus); outline-offset:2.5px`.

### 7.2 `icon-button-v2`

Sizes: small `20×20` r4, normal `24×24` r6, large `28×28` r6. Variants: `neutral` (same as button, incl. elevation), `contrast`, `ghost`, `ghost-muted` (idle icon muted, pressed/expanded → icon base). Focus ring identical to buttons.

### 7.3 Text input / textarea / field

`text-input-v2`: width 280px, height 28px (large 32px), radius 6, padding-inline `0 8px`, row flex `gap:8px`; background = `linear-gradient(180deg, --v2-alpha-light-2 0%, --v2-alpha-light-0 100%)` over `bg-base`; `box-shadow:elevation-button-neutral`; `outline:1px solid transparent`; transitions `background, outline-color, box-shadow 85ms ease-out`.

States: hover → overlay-hover stacked over the same gradient (only when not focus/invalid/disabled); focus → `outline-color:border-focus`, `box-shadow:none` (**note: inputs use a 1px outline at `outline-offset:0`, not the 2px/2.5px button ring**); invalid → outline `state-fg-danger`, and value text/placeholder/caret turn danger; disabled → `opacity:.5`. Placeholder = `text-faint`.

Inner value text 13px/1 440 `-.04px`. Leading icon slot 8px inline padding, muted. Trailing icon button 20×20 r4 with overlay hover/pressed and 2px ring at offset 1. Clear-variant button is 28×28 r6, `margin-inline-end:-8px`. Numeric inputs get `tabular-nums`.

`textarea-v2`: width 280, min-height 80, radius 6, padding `0 2px 2px 0`, textarea padding 8, `line-height:1.35`, resizable vertical, same background/elevation/state model.

`field-v2`: column, `gap:8px`; label row `min-height:16px`, 13px/1 530 `-.04px`, info trigger 16×16 (ring 2px at offset 1, radius 2); prefix/suffix 11px/1 440 `+.05px` muted, `min-height:11px`.

### 7.4 `select-v2`

Trigger = same box as text input but width 280, padding-inline `0 6px`, value text 13/16 440 with 8px start padding, placeholder → `text-faint`, chevron 20×20 r4 muted, `rotate(180deg)` when closed and `rotate(0)` when `[data-expanded]`. Expanded keeps overlay background and clears the outline. `data-appearance=inline` = `fit-content`, 24px tall, padding `4px 8px 4px 4px`, gap 4, radius 4, transparent, no shadow, value weight 530, chevron 16×16. Listbox: `padding:4px`, `max-height:12rem`, hidden scrollbars, items separated by 2px; selected item = 530 weight + accent text/icon.

### 7.5 `menu-v2` (popover / dropdown / command menus)

Content: padding 2px, min-width 160px, radius 6, `bg-layer-01`, `elevation-floating`, z-index 60, animation `menu-v2-in .12s ease-out`, `transform-origin` from popper var; `console-nav-menu` uses `.15s cubic-bezier(.23,1,.32,1)` and a `console-reveal` animation; separator = `height:.5px` `border-base`.

Item: height 28px, padding `0 12px`, radius 4, `gap:8px`, `tabular-nums`, hover via `--menu-v2-hover` (= overlay-hover), checked → content/indicator accent + weight 530, disabled → `opacity:.5` + no pointer events. Content text 13px/100% 440 `-.04px`. Shortcut 11px/11px 530 `+.05px` faint. Badge slot (`menu-v2-item-badge`) = the canonical small pill: height 16, padding `0 4px`, radius 2, `.5px` border `border-base`, bg `layer-02`, 11px/100% 530 `+.05px`, muted text, nowrap. Chevron 16×16 faint, indicator 16×16.

Dropdown with rich rows (`.inline-radio-menu-content`, width 232): rows become `height:fit-content; padding:8px 12px; align-items:flex-start; white-space:normal`, content stacks column with `line-height:1.25`; title 13/16 440 (530 when checked), description 11/16 440 muted.

### 7.6 `segmented-control-v2`

Container: `display:flex; height:28px; width:232px; padding:0; radius:6px; background:bg-layer-02; box-shadow:0 0 0 .5px var(--v2-background-bg-layer-02)`; full-width modifier sets 100%.
Item: `flex:1 1 0; height:28px; padding:0 12px; radius:6px; transparent`; 13px/100% 530 `-.04px` `tabular-nums`; idle color `text-muted`, hover → base, pressed → base (z-index 1), disabled → `opacity:.45`, focus-visible → 2px ring `outline-offset:1px` z-index 2; transition `color .15s ease`.
Indicator (sliding thumb): absolute, inset-y 0, radius 6, `linear-gradient(180deg, light-6, light-0)` over `bg-button-neutral`, `elevation-button-neutral`, `will-change:transform,width`.
Fallback before measurement (`:not([data-ready])`): pressed item gets the indicator styling directly.

### 7.7 `tag` — badges / pills (from `meters-*.css`)

height 16, padding `0 4px`, `gap:4px`, radius 2, `.5px` border `border-base`, bg `layer-02`, 11px/1 530 `+.05px`, `tabular-nums`, text muted. `[data-high-contrast]` → border strong; `[data-variant=accent]` → no border, bg accent, text contrast.

Other badge-like surfaces: menu badge (7.5), activity status chip (11/18, min-width 36, centered, bg layer-03, radius 2, secondary text), activity chart legend swatch (3×12, radius 6), kbd chip (18px tall, padding `0 3px`, radius 2, gradient `#ffffff0f→#fff0` over layer-02, inset ring `.5px` border-base, mono 13/16 weight 500).

### 7.8 `switch`

Track (`switch-control`): 24×16, padding 2, radius 4, `linear-gradient(180deg, light-0, light-20)` over `bg-layer-04`, `elevation-switch-off`, transitions 90ms. Thumb: 12×12, radius 2, `.5px` border `overlay-depth-top`, `linear-gradient(180deg, depth-top, depth-bot)` over `grey-200`, `elevation-elements`, `translate(0)`.
Hover: track prepends overlay-hover; thumb grows to 13px / radius 3. Checked: track = `linear-gradient(180deg, light-0, light-10)` over `bg-accent` + `elevation-switch-on`; thumb `translate(8px)`, over `grey-300`; hover → `translate(7px)`; RTL mirrors to `-8px`/`-7px`. Label 11/16 440 faint `+.05px`. Disabled track `opacity:.5`. Invalid → border danger. Console density (`data-console-toggle-size=md`): track 32×20, thumb 16×16 (`translate(12px)`, hover 11px).

### 7.9 `radio-v2`

Row `gap:8px`, items column `gap:12px`. Control 16×16 circle, `inset 0 0 0 .5px border-strong`, `linear-gradient(180deg, light-6, light-0)` over `bg-base`; checked → `light-20` gradient over `bg-accent`; indicator 6×6 circle `grey-300` with `inset 0 0 0 .5px depth-top, 0 .5px .5px #0006`; invalid unchecked → `state-bg-danger` + danger ring; focus ring 2px offset 1; label 13/20 base `-.04px`; description 11px/1 440 muted `+.05px`; control stack 16×20 (`top:calc(50% - 8px)`).

### 7.10 `avatar-v2`

Default 28×28 (normal 20, small 16). Radius 9999 (org: 6, org small/normal: 4). Border `.5px border-base`. 11px 530 uppercase `+.05px`, `--avatar-bg` default `layer-02`, `--avatar-fg` default muted, plus a `::before` top-light gradient `light-16→light-0` (hidden when an image is present). Colored variants use the bg/border pairs in 3.7.

### 7.11 Dialogs, drawers, popovers, tooltips

`dialog-v2`: fixed inset 0 flex-center, pointer-events none, z-index 50; overlay = scrim. Container: **480×368** (`large` 640×480; `x-large` `min(100vw-32px,980px)` × `min(100vh-92px,600px)`), `bg-layer-01`, `elevation-overlay`, radius 6, overflow hidden, pointer-events auto. Header padding 16 (title-group column gap 4; title 15/20 530 `-.13px`; description 13/20 440 muted); footer padding 16 gap 8 justify-end; body flex 1 overflow hidden; content scrolls with hidden scrollbars. Close 20×20 r4, `margin-top:-2px`, `margin-inline-end:-2px`, hover overlay.

`console-drawer` (meters): overlay fixed scrim + fade `.16s/.12s`; panel inset `8px 8px 8px auto`, width `min(var(--side-drawer-width,560px), calc(100vw - 16px))`, height `calc(100dvh - 16px)`, radius 6, `bg-layer-01`, `elevation-overlay`, in `.18s cubic-bezier(.2,.8,.2,1)` / out `.12s`; inner focus ring 2px offset **3px**.

`tooltip-v2`: inline-flex, padding `5px 6px`, gap 6, radius 4, `bg-layer-01`, `elevation-floating`, 11px/12 530 `+.05px`, `tabular-nums`, z-index 1000, pointer-events none, in `.12s ease-out` / out `80ms ease-in`; `.truncated-text-tooltip` max-width 360px.

`toast-v2`: grid `minmax(0,1fr) 20px`, `column-gap:12px; row-gap:12px`, width 320, padding 12, radius 8, `bg-layer-01`, `elevation-floating`, `max-height:min(420px, calc(100dvh - 96px))`; with icon → `16px minmax(0,1fr) 20px`. Title 13/20 530 `-.04px`, description 13/20 440 muted, icon 16×20 slot, close 20×20 r4. Stacked collapsed toasts: `translateY(calc(-1 * var(--toasts-before) * 9.5px)) scale(calc(1 - var(--toasts-before) * .05))`, non-front content `opacity:0`. Focus-visible ring comes from an extra `0 0 0 2px border-focus` shadow on top of the floating elevation.

`divider-v2`: `height:1px; transform:scaleY(.5); background:border-strong` (crisp hairline).

`loader-v2`: spin `.9s linear infinite`, `color:icon-muted`, track `opacity:.2`, round-capped progress arc (`rotate(-90deg)` origin center).

`console-skeleton`: `height:.7em`, radius 4, base `--console-skeleton`, `linear-gradient(100deg, transparent 30%, --console-skeleton-shine 50%, transparent 70%)`, `background-size:100vw 100%`, fixed-position sweep animation `.36s` in + `2.4s cubic-bezier(.45,.05,.55,.95)` infinite shimmer; reduced-motion → no shimmer.

---

## 8. Activity page (`.activity-dashboard`) — ordered layout outline

Root rule (verbatim values): `display:grid; grid-template-columns:minmax(0,960px) 352px; gap:56px; width:100%; max-width:1368px; margin:0 auto; position:relative; left:4px; font-size:13px; line-height:20px; font-weight:440; font-variant-numeric:tabular-nums`. Children get `min-width:0`.

Note the **4px optical nudge** (`left:4px`, removed at ≤1279 and ≥768–1440 ranges) and that `1368 = 960 + 352 + 56` — the columns exactly fill the max width, no page padding.

Ordered regions:

1. **Main column** `.activity-main` (min-width 0; `padding-bottom:32px` only at ≥1441px).
   1. **Page header** — `h1` 21px/24px 530; supporting `p` margin 0, secondary color, `margin-top:4px`.
   2. **Section heading rows** `.activity-section-heading` — flex, `space-between`, `gap:16px`, **`min-height:50px`**; optional caption `.activity-caption` below title: flex wrap, `gap:6px`, `margin-top:2px`, `line-height:24px`, secondary color. `h2` 15/20 530. Titles in links underline on hover/focus with `text-underline-offset:3px`.
   3. **Workspace** `.activity-workspace` — `min-height:380px` (chart host; 0 at ≤767).
      1. **Chart** `.activity-chart` — `margin-top:16px`; `>svg` `width:100%; height:245px; overflow:visible`; SVG text = `530 11px Inter` filled `--oc-text-muted`; usage line stroke `--oc-success` 1.5; forecast line stroke `--oc-warning` 1.5; limit line `--oc-text-muted`, dash `3 4`, width `.75`; guides `--oc-border`, width `.5`, dash `3 4`; dots fill `--oc-bg`, stroke 1.5, plus `drop-shadow(0 0 5px …)` in success/warning; forecast label fill warning.
      2. **Axis strip** `.activity-chart-axis` — height **21px**, flex space-between centered, `margin-top:16px`, `padding:0 8px 0 35px`, `border:.5px solid border-muted`, radius 6, `background:bg-layer-01`, 11px/16px **530**, muted color; crossing marker `.activity-crossing` absolute `top:2px`, translate(-50%), warning color on layer-01 bg.
      3. **Chart footer** `.activity-chart-footer` — flex space-between, `gap:24px`, `margin-top:16px`, 11px/16px secondary. Left `.activity-model-insight` (link flex gap 8, truncated text underlined with `text-decoration-color:border-base`, `underline-offset:3px`, `strong` base color). Right `.activity-chart-legend`: flex `gap:24px`, items `gap:8px`, swatch `3px × 12px` radius 6 (usage = success, forecast = warning, limit = `repeating-linear-gradient(to bottom, text-muted 0 2px, transparent 2px 4px)`).
   4. **Card grid** `.activity-cards` — `display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; margin-top:64px` (40px at ≤1279, 32px at ≤767).
      1. **Card** `.activity-card` — flex column, `min-width:0; min-height:320px; padding:16px; border:.5px solid border-muted; border-radius:6px; background:bg-layer-01`.
      2. **Card heading** `.activity-card-heading` — flex space-between, `align-items:flex-start`, `min-height:44px`; subtitle `p` `white-space:nowrap`, `margin-top:4px`; trailing detail link icon 16×16 (`filter:brightness(.4)` in light), `margin-right:-4px`.
      3. **Metric block** `.activity-personal-total` — flex center `gap:8px`, `margin-top:24px`, nowrap; number 21px/28px 530; comparison 11px secondary.
      4. **Bar sparkline** `.activity-personal-bars` — flex space-between, `gap:4px`, `height:32px`, `margin:20px 0 16px`; each bar `flex:1; max-width:5px; height:32px; border-radius:1px` with striped track `repeating-linear-gradient(to top, layer-04 0 20px, transparent 20px 23px, layer-04 23px 32px)`; fill span absolute bottom 0, success color, radius 1.
      5. **Facts list** `.activity-facts` — rows flex space-between `gap:8px`, `padding:12px 0`, `border-bottom:.5px solid border-base`; last row no border, `padding-bottom:0`; `dt` secondary; `dd` right-aligned nowrap, margin 0.
      6. **Inset panel** `.activity-card-inset` — block, `padding:12px`, `border:.5px solid border-muted`, `border-radius:8px`, `background:bg-layer-02`; limited state swaps to danger/warning state trio (`data-tone=warning` for warning).
      7. **Footer-ish blocks** — `.activity-average` flex space-between `margin-top:auto`; `.activity-credit` flex space-between baseline `gap:8px`, `margin-top:52px`, `padding-bottom:8px`, hairline underline; `.activity-budget` `margin-top:auto` (track height 8, radius 2, bg layer-04, `margin:12px 0`; fill = success + `linear-gradient(180deg, rgba(255,255,255,.2), transparent)` and a `4px` right border in layer-02); `.activity-no-limit` `margin-top:auto`, secondary.
   5. **Ranking/list rows** `.activity-ranking` (`margin-top:24px`) and `.activity-ranking-row` — flex center `gap:12px`, `padding-block:12px`, `border-bottom:.5px solid border-base`; first row `padding-top:8px`; last row no border; row hit-area uses `margin-inline:-8px; padding-inline:8px; border-radius:6px`; hover → `overlay-hover`; focus-visible → 2px focus outline at offset **2.5px**. Avatar cell 28px with an 18×18 badge overlaid at `-5px/-5px`; name truncates with ellipsis.
   6. **Recent requests** `.activity-recent-requests` — column `gap:12px`, `margin-top:24px`; row flex center `gap:12px` (same -8px hover/focus treatment); status chip `min-width:36px`, centered, `bg-layer-03`, radius 2, 11px/18px secondary; description truncates; `time` secondary nowrap.
      1. **Request bar strip** `.activity-request-bars` — flex stretch space-between, `gap:4px`, `height:32px`, `margin-top:24px`; each link width 4px (min 3), column gap 2; upper span `flex:1` layer-04 radius 1, lower span height 12px; failed → danger lower span, rejected → warning.
   7. **Empty / error / loading** — `.activity-empty`, `.activity-coverage` secondary (`margin-top:16px!important`; coverage 11px); `.activity-error` danger, `margin:12px 0!important`, underlined retry button; `.activity-loading` column `gap:16px`, `padding:24px 0`; `-empty-*` variants swap tracks to layer-02/03 and center dummy art; `.activity-empty-dashboard .activity-card{min-height:344px}`.
2. **Sidebar** `.activity-sidebar` — `display:flex; flex-direction:column; gap:24px`; `min-width:0`. Sections separated by hairlines rather than card borders: `.activity-sidebar > .getting-started` `padding-top:0; padding-bottom:25px` + `::after` `0.5px` line at `bottom:.25px` in `border-base`; `.activity-sidebar > .activity-audit` `margin-top:0; padding-top:25px; border-top:0` + `::before` line at `top:.25px`.
   1. **Leaderboard / ranking card** — same `.activity-card` shell; empty state (`.activity-leaderboard-empty`) absolutely positions the heading at `top:16px; right:16px; min-height:0`, hides the title block, centers an illustration (`column, gap:4px`, `img` margin-bottom 8, caption secondary), dummy medal 28×28 circle with avatar bg overridden to `layer-03`.
   2. **Audit timeline** `.activity-audit` — `margin-top:24px; padding-top:24px; border-top:.5px solid border-base`; `.activity-audit-events` `margin-top:24px`; `.activity-audit-event` `display:grid; grid-template-columns:18px minmax(0,1fr); gap:24px; min-height:60px`; marker rail drawn as a `0.5px × 32px` line at `top:24px; left:8.75px` in `border-base`; title row flex baseline space-between `gap:12px`; actor row flex center gap 8, `margin-top:4px`, secondary; hover/focus same row treatment as ranking rows; `time` secondary.
3. **Onboarding callout** `.activity-onboarding-callout` — flex wrap, `gap:0 6px`, centered, radius 6, `margin-top:8px`, secondary color, underlined link with `text-decoration-color:border-strong`; when present, `.activity-credit` pins to `margin-top:auto` and `.activity-facts` gets `margin-bottom:16px`.

### 8.1 Responsive behaviour (exact breakpoints)

There is a subtle cascade: the `@media(min-width:768px) and (max-width:1440px)` block is authored **after** the `max-width:1279px` block, so it wins in the 768–1279 overlap.

| breakpoint | effect |
|---|---|
| default (≥1441px) | `grid-template-columns:minmax(0,960px) 352px; gap:56px; max-width:1368px; left:4px`; `.activity-main{padding-bottom:32px}` |
| `@media(min-width:1441px)` | main bottom padding 32px; onboarding callout variant gets sidebar `padding-top:16px` |
| `@media(min-width:768px) and (max-width:1440px)` | **single column**: `grid-template-columns:minmax(0,960px); justify-content:center; left:0; gap:24px`; sidebar flows below (`.activity-sidebar{display:flex}`), cards `margin-top:64px` |
| `@media(max-width:1279px)` | fallback two-column `minmax(0,1fr) 300px; gap:32px; left:0`; card grid → 1 column, `margin-top:40px`; card `min-height:280px`; inset `margin-top:16px`; chart footer stacks (`column`, `gap:12px`, `align-items:flex-start`) |
| `@media(max-width:767px)` | single column `minmax(0,1fr); gap:32px`; sidebar becomes `grid` `repeat(auto-fit,minmax(280px,1fr))` `gap:24px`; audit `margin-top:0`; chart svg `height:auto; min-height:180px`; cards `margin-top:32px`; workspace `min-height:0`; legend `gap:16px` wrap; caption `gap:4px` |
| `@media(max-width:720px)` | `left:0`; sidebar back to `flex`; cards `minmax(0,1fr)` |

---

## 9. Console shell evidence (what exists, what does not)

**Present in these five chunks:**

* **Canvas**: `html{background:var(--v2-background-bg-deep); -webkit-tap-highlight-color:transparent; -webkit-text-size-adjust:100%; line-height:1}` + `body{min-height:100dvh; font-family:var(--v2-font-family-sans); background:var(--oc-bg); color:var(--oc-text); letter-spacing:-.04px; font-size:13px; font-weight:440; line-height:1.25; -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision}` → light: canvas `#fafafa`, content sheet `#fff`; dark: canvas `#080808`, sheet `#161616`.
* **Evidence of the "8px floating panel" app frame** — `.policy-builder` (a full-app builder route): `position:fixed; inset:0; display:flex; height:100svh; gap:8px; padding:8px; overflow:hidden; background:var(--v2-background-bg-deep)`. Inside it: `.policy-builder-main` (flex 1, `padding:16px`), `.policy-builder-header` (`min-height:48px`, space-between, `gap:24px`), `.policy-builder-footer` (`min-height:28px`), `.policy-builder-viewport` (`margin-block:24px`). That is the closest thing to a topbar/main/footer shell in these assets.
* **Two-column page template used by sibling routes** — `.controls-layout`: `grid-template-columns:minmax(0,960px) 352px; gap:56px; max-width:1424px; margin-inline:auto; padding-inline:32px 24px`, 13/20 `-.04px`, `font-family:var(--font-family-sans)` with `"Console Controls Inter"`. Variant `.controls-layout-expanded` = single `minmax(0,960px)`, `max-width:1024px`, `padding-inline:32px`. `≤1100px` → `minmax(0,1fr) 300px; gap:32px`; `≤760px` → single column, `padding-inline:0`, `gap:40px`. Focus convention for plain links/buttons on these pages: 2px focus outline at offset 2.5px.
* **Scrolling**: `.scroll-view` / `__viewport` (hidden native scrollbars, `flex:1`, `overflow-y:auto`) / `__thumb` (12px wide rail, 4px pill, `border-muted`, `backdrop-filter:blur(4px)`, hover `border-strong`, opacity transition .2s).
* **Nav popover fragment**: `.console-nav-menu` (menu content, `.15s cubic-bezier(.23,1,.32,1)`, hairline separators), `.organization-nav-menu-content{width:200px}`, `[data-component=menu-v2-content].console-nav-menu [data-slot=menu-v2-item-indicator] svg{width:16px;height:16px}`.
* **Command palette** (dialog-like shell surface): fixed, `top:max(48px,calc((100dvh - 480px)/2))`, horizontally centered, `width:min(calc(100vw - 24px),640px)`, `min-height:min(280px,calc(100dvh - 96px))`, `max-height:min(480px,calc(100dvh - 96px))`, radius 12, `bg-base`, `elevation-floating`, in `.14s cubic-bezier(.23,1,.32,1)`.
* **Global link affordance**: `.console-inline-link` — underlined with `0.5px` thickness, `text-decoration-color:border-strong`, `text-underline-offset:2px`; hover → text base and decoration `border-inverse`.

**Not present / not determinable:** there is **no CSS for a top bar, left icon rail, workspace switcher, breadcrumb bar, or user menu chrome** in these five chunks — only fragments (`.console-nav-menu` popover, `.console-command-palette`, `.scroll-view`). The shell is most likely built from Tailwind utility classes in the JSX plus chunks that were not downloaded (e.g. a `layout-*.css`). Colors/sizing for that chrome therefore cannot be harvested here; only the canvas tokens in 3.1–3.4 and the 8px-gutter panel pattern above are safe evidence.

---

## 10. Transferable design rules (for our React 19 + Tailwind v4 app)

Naming below is **ours**; values are theirs (exact). Map them in a single `@theme` block and never hardcode hex in components.

1. **Two-tone canvas, not one flat background.** App shell = "canvas" (`#fafafa` light / `#080808` dark); content sheet = "surface" (`#fff` / `#161616`). Cards sit on the sheet using `--v2-background-bg-layer-01` = `#fafafa` / `#242424`. Result: the page reads as a white sheet on a warm-grey canvas, and cards read as slightly recessed.
2. **Every interaction state is a translucent overlay, never a new color.** hover = `#0000000a` light / `#ffffff0f` dark; pressed = `#00000014` / `#ffffff1a`; on dark-contrast surfaces hover = `#ffffff1f` / `#0000003d`. Implement as `background-image: linear-gradient(overlay, overlay), <existing background>` so overlays compose over gradients without recomputing colors.
3. **Hairlines are 0.5px, expressed as box-shadows.** Border token base = `#0000001a` light / `#ffffff1a` dark; muted = 8% (recessed dividers); strong = 20%. Use `0 0 0 .5px <token>` for rings and `transform:scaleY(.5)` on a 1px element for crisp dividers; never 1px solid borders on cards.
4. **Four elevation tiers, each a 3–5 layer shadow recipe.** Raised card on sheet = `0 2px 4px 0 <4%>, 0 1px 2px -1px <8%>, 0 0 0 .5px <12%>`; control/button tier = `0 1px 1.5px 0 <10%>, 0 0 0 .5px <14%>`; floating (menus, tooltips, toasts, palette) = `0 8px 16px 0 <4%>, 0 4px 8px 0 <8%>, 0 0 0 .5px <12%>`; overlay (dialogs, drawers) = `0 16px 32px 0 <4%>, 0 8px 16px 0 <8%>, 0 0 0 .5px <12%>`. Dark mode flips to 30% black shadows **plus a bottom-edge light line** `0 -.5px 0 0 #ffffff0f` so panels separate from the dark canvas.
5. **Control geometry is fixed**: 24 / 28 / 32px heights, radius 6px (small controls 4px), label = 13px at weight 530, `line-height:20px`. Default row/button height is 28px with `padding:0 11px` and `gap:6px`.
6. **Typography: 13px body at weight 440, letter-spacing -0.04px; UI labels at weight 530.** Scale: 21/24 (page title, metric numbers 21/28), 15/20 (section title, dialog title, tracking `-.13px`), 13/20 body, 13/16 compact rows, 11/16 metadata with **positive** tracking `+.05px`, 11/12 tooltip. Numbers always `tabular-nums`. Use Inter with `font-optical-sizing:none` and `font-variation-settings:"slnt" 0`.
7. **Focus ring = 2px `#7698fd` at `outline-offset:2.5px`** for buttons/links/rows; 2px at offset 1px for small controls (checkbox/radio/switch/menu icon buttons); inputs instead use a **1px outline at offset 0** and drop their shadow. Never use the browser default focus ring.
8. **Primary CTA is the "contrast" recipe, not a blue button.** Brand blue `#3b5cf6` is reserved for accents/focus/selection; the strongest action is a dark/ink button (`bg-contrast` = `#242424` light) with a top-light gradient (`#ffffff1f → transparent`), `text-shadow:0 .5px .5px rgba(0,0,0,.3)`, and an inset highlight/shadow pair. A filled blue button does not exist in this system.
9. **Inputs are "raised plates", not outlined boxes.** Background = 2% white gradient over surface, hairline via `0 1px 1.5px rgba(0,0,0,.1), 0 0 0 .5px rgba(0,0,0,.14)`; hover darkens via overlay; focus swaps to a 1px blue outline and removes the shadow. Same recipe for text inputs, textareas, selects (width 280px default).
10. **List rows use negative-margin hit areas.** Row content is inset 8px, but the hover/focus background extends 8px outside the text column (`margin-inline:-8px; padding-inline:8px; border-radius:6px`) — gives a comfortable hit area without shifting text. Same trick everywhere (ranking rows, request rows, timeline events).
11. **Section rhythm**: heading row `min-height:50px`, card heading `min-height:44px`, gaps of 8/12/16 inside cards, 24px between list items, 24px before secondary sections, 64px before the main card grid, 56px column gap. Borders, not shadows, separate stacked sections in the sidebar (`padding-top:25px` + hairline at `.25px`).
12. **Cards are quiet**: `.5px` hairline, radius 6px, `min-height:320px`, padding 16px, background = layer-01, **no shadow**, `display:flex; flex-direction:column` with the bottom block pinned by `margin-top:auto`. Nested panels inside a card step up one layer (`layer-02`) and use radius 8px + 12px padding.
13. **Badges are tiny and square-ish**: 16px tall, `0 4px` padding, radius 2px, 11px/1 at weight 530, tracking `+.05px`, hairline border, layer-02 background. Never pill-shaped unless it is a status *dot* or progress fill (radius 9999).
14. **Menus/popovers**: radius 6px, 2px inset padding, `min-width:160px`, floating elevation, 28px items with radius 4px, hover overlay, selected = accent text + weight 530. Tooltips: 11/12 530 `+.05px`, radius 4px, `5px 6px` padding, floating elevation, 120ms in / 80ms out.
15. **Motion**: enters 120–180ms `ease-out` / `cubic-bezier(.23,1,.32,1)`; exits 80ms `ease-in`; control micro-transitions 85–90ms; toasts/sheets `cubic-bezier(.2,0,0,1)` 280ms. Respect `prefers-reduced-motion` by disabling skeleton shimmer, tooltip animations and drawer transitions.
16. **Breakpoints to reuse**: page two-column collapses at **1440px** (their activity page is single-column 960px centered between 768 and 1440), sidebar-to-grid reflow at **767px**, dense controls at **≤1100px**. Mobile gutters drop to 0 because the 1368px max-width already implies 32/24px padding on desktop.

---

## 11. Open questions / gaps

1. Console **top bar, left rail, workspace switcher, user menu** styles are absent from the downloaded chunks (only popover/palette/scroll fragments exist) — do not assume their dimensions.
2. No spacing/radius/motion tokens exist in the v2 layer; sizing was harvested from literal declarations, so any "scale" in this doc is derived, not authored.
3. The `raised` tier is used almost exclusively by builder/policy routes; the activity page uses hairline-bordered cards instead. Both surface models coexist — pick one per page, not per component.
4. `checkbox-v2` receiver styles are missing (only the global `cursor:pointer` rule references it), so checkbox geometry is unknown.
5. `.onboarding` uses a legacy alias island with different names (`--bg-*`, `--text-*`, `--border-*`, `--font-code`, `--w-medium`) — migration intent unclear; treat as historical.
6. Chart internals (SVG path data, tick values, tooltip behaviour) are data/JS concerns; CSS only fixes sizes, stroke widths and colors.
7. Activity page copy/labels (section titles, card titles, legend text) are not in CSS — only class names imply regions.
8. Whether `data-theme=oc-2` and `data-new-layout` are active in production cannot be verified without the live DOM; the syntax-color block is scoped to `body:not([data-new-layout])`.

---

## Appendix — reproducible extraction method

The CSS is minified to a single line, so `grep`/editor reads are unusable; brace-aware parsing is required. Scripts live in `.design-ref/scratch/` (not shipped): a block parser that records at-rule chains (`@layer`, `@media`), a flat splitter that emits `selector { decls }` one per line, and formatters.

* Block count / rule count: 1,518 blocks in `index`, 738 in `app-pages`, 68 in `meters`, 10 in `segmented-control`, 5 in `select-input`.
* Token totals: `--v2-` 240 unique names / 424 definitions / 976 references; `--oc-` 14 / 14; total custom properties 434; total `var()` uses 2,053.
* Three spot-checked literal values quoted from source: `--v2-grey-1100:#161616`; `--oc-bg:var(--v2-background-bg-base)`; `.activity-dashboard{…grid-template-columns:minmax(0,960px) 352px;gap:56px;max-width:1368px…}`.
* Elevation was cross-checked in both themes by locating the `[data-color-scheme=light]` and `[data-color-scheme=dark]` semantic blocks and diffing them token-by-token (light 92 vs dark 92 declarations; the `:root` light block has 94 = the same 92 plus `--font-family-text` and `--v2-font-family-sans`).
