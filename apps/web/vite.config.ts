import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));
// `pnpm run dev` loads the repository-root `.env` into the API process, so the
// Portal reads that same file instead of keeping a second, divergent
// `apps/web/.env`.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// DC is a separate host-local controller; only proxy its fixed API path.
// The controller still validates the Cloud Session, administrator and Origin.
const dcProxy = { target: "http://127.0.0.1:8792", changeOrigin: false };

export default defineConfig(({ mode }) => {
  // Vite's default env dir is this app, but the root `.env` is what the API and
  // the seed script read. Resolve it explicitly so `MIRA_AUTH_DEV_API_ORIGIN`
  // set only in the root file still reaches the proxy. The third argument `""`
  // opts out of the `VITE_` prefix filter: these are dev-server settings, never
  // inlined into client code.
  const rootEnv = loadEnv(mode, repoRoot, "");
  // Local `pnpm run dev` serves the API on 127.0.0.1:8788. Proxy the API paths so
  // the Portal talks to a same-origin API, matching production behind Caddy.
  // An exported shell variable wins over the file so a one-off override works.
  const apiOrigin =
    process.env.MIRA_AUTH_DEV_API_ORIGIN ??
    rootEnv.MIRA_AUTH_DEV_API_ORIGIN ??
    "http://127.0.0.1:8788";
  const apiProxy = { target: apiOrigin, changeOrigin: true };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": sourceRoot,
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/v1": apiProxy,
        "/dc/api": dcProxy,
        "/health": apiProxy,
        "/ready": apiProxy,
        "/.well-known": apiProxy,
      },
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      proxy: {
        "/v1": apiProxy,
        "/dc/api": dcProxy,
        "/health": apiProxy,
        "/ready": apiProxy,
        "/.well-known": apiProxy,
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["tests/unit/**/*.test.{ts,tsx}"],
    },
  };
});
