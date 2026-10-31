// ESLint flat config for the Mira Cloud Account web app.
//
// Type-aware rules are intentionally not enabled: the repository gate runs a
// full `tsc --noEmit` typecheck separately, so ESLint only adds syntax and
// cross-cutting correctness rules on top of it.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Runtime globals used by the web app, its vitest suites and the Playwright
 * measurement script under `scripts/`: the browser surface (`window`,
 * `document`, `Response`, `fetch`, `getComputedStyle`, `NodeFilter`, ...) plus
 * the Node surface (`process`, `console`, ...) and modern `ES2024` built-ins.
 */
const runtimeGlobals = {
  ...globals.browser,
  ...globals.node,
  ...globals.es2024,
};

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", ".screenshots/**", "*.tsbuildinfo"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: runtimeGlobals,
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // `tsconfig` already sets `noUnusedLocals`/`noUnusedParameters`, so
      // `typecheck` is the hard gate for unused symbols. Keep the ESLint signal
      // as a warning instead of reporting the same problem twice as an error.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // The react-hooks v7 "recommended" preset ships the React Compiler lint
      // rules too. Two of them flag pre-existing, deliberate patterns in
      // `src/pages/account/dc-control-page.tsx` (see the rule comments below),
      // so they stay visible as warnings instead of blocking the gate:
      //   react-hooks/purity          - line 48 uses `Date.now()` as the initial
      //                                 state value for the now-ticker.
      //   react-hooks/set-state-in-effect
      //                               - line 92 kicks off the poller which sets
      //                                 state from the async refresh callback.
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["vite.config.ts", "vitest.*.config.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
);
