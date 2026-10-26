import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));

// Local `pnpm run dev` serves the API on 127.0.0.1:8788. Proxy the API paths so
// the Portal talks to a same-origin API, matching production behind Caddy.
const apiOrigin = process.env.MIRA_AUTH_DEV_API_ORIGIN ?? "http://127.0.0.1:8788";
const apiProxy = { target: apiOrigin, changeOrigin: true };

export default defineConfig({
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
});
