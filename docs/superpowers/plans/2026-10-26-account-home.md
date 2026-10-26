# Account Home Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persistent account portal at `/`, distinct from `/login`.

**Architecture:** A new HomePage reads the existing auth context for its entry action. Public branding returns home. Account and login flows retain their own routes.

**Tech Stack:** React, React Router, existing CSS tokens and Button, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-account-home-design.md`

## Global Constraints

No new authentication methods, registration, dependencies or service promises. Preserve local independence and the existing session boundary.

## Review Focus

Check unavailable and restoring sessions, authenticated home visits, brand navigation, narrow screens, and unsupported service descriptions.

## Task 1: Home route and entry behavior

Files: create `apps/web/src/pages/home-page.tsx`; modify `apps/web/src/app/routes.tsx`, `apps/web/src/app/root-layout.tsx`, and `apps/web/tests/unit/portal-navigation.test.tsx`.

- [x] Replace root redirect tests with assertions that `/` persists for signed-out, authenticated and unavailable sessions; check contextual entry destinations, no password form, and brand destination `/`.
- [x] Add restoring-session coverage with pending entry feedback and no guessed account destination.
- [x] Run `pnpm --filter @uichat-mira/cloud-auth-web run test:unit -- tests/unit/portal-navigation.test.tsx` and confirm expected failures.
- [x] Implement `HomePage()` with headline, contextual action, and three capability descriptions. Import in routes; point public brand home.
- [x] Re-run targeted tests and confirm success.

## Task 2: Presentation and verification

Files: create `apps/web/src/styles/cloud-home.css`; modify `apps/web/src/main.tsx` and `apps/web/tests/integration/portal-flow.test.ts`.

- [x] Build responsive hero and capability sections using existing tokens, meaningful icons and restrained black/white styling; mark associated services as not yet connected.
- [x] Add browser coverage for home entry, brand return and desktop/mobile overflow; capture screenshots with existing integration harness.
- [x] Run `pnpm run check`, web build and web integration tests. Inspect desktop/mobile screenshots and correct visible defects.

Execution is inline as authorized by the user's instruction to implement. Preserve pre-existing uncommitted work; do not commit it as part of this task.

## Execution record

- Root behavior tests failed against the original redirect as expected, then passed with the new page. Updated remaining unit/browser expectations for the retired redirect.
- Ruling: synchronize the browser logout expectation with the previously requested `/login` redirect; this is test maintenance for existing behavior.
- `pnpm run check`: passed, 163 API tests and 95 web tests.
- `pnpm --filter @uichat-mira/cloud-auth-web run build`: passed; Vite reports a bundle size advisory above 500 kB.
- `pnpm --filter @uichat-mira/cloud-auth-web run test:integration`: passed, 32 tests.
- Inspected `portal-home-desktop.png` and `portal-home-mobile.png`: no clipped text, overlapping elements, or horizontal overflow; entry actions and capability content are visible.
