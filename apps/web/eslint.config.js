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
      // `no-unused-vars` stays a warning because `tsconfig` already makes
      // `noUnusedLocals`/`noUnusedParameters` a hard gate; `typecheck` catches
      // the same problem, so reporting it twice as an error adds no safety.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // The react-hooks v7 "recommended" preset ships the React Compiler rules
    // too. Two of them flag pre-existing, deliberate patterns in the DC control
    // page, so the exception is scoped to exactly that file instead of being
    // downgraded repo-wide -- everywhere else these stay errors, which is what
    // makes the lint gate able to catch a new violation.
    files: ["src/pages/account/dc-control-page.tsx"],
    rules: {
      // `Date.now()` seeds the now-ticker state; the value is intentionally
      // impure at mount.
      "react-hooks/purity": "warn",
      // The polling effect sets state from the async `refresh` callback.
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
