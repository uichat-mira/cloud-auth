import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const webRoot = fileURLToPath(new URL("../..", import.meta.url));
const screenshotDir = join(webRoot, "coverage", "screenshots");

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
] as const;

const routeCases = [
  { path: "/login", heading: "登录 Mira Cloud", screenshot: "login" },
  { path: "/account", heading: "账户概览", screenshot: "account" },
  { path: "/missing", heading: "页面不存在", screenshot: "not-found" },
] as const;

beforeAll(async () => {
  mkdirSync(screenshotDir, { recursive: true });

  server = await createServer({
    root: webRoot,
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
    logLevel: "error",
  });
  await server.listen();

  const localUrl = server.resolvedUrls?.local[0];
  if (!localUrl) {
    throw new Error("Vite dev server did not expose a local URL");
  }
  baseUrl = localUrl.replace(/\/$/, "");

  browser = await chromium.launch(
    process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : { channel: "chrome" },
  );
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

for (const viewport of viewports) {
  describe(`${viewport.name} viewport`, () => {
    for (const routeCase of routeCases) {
      it(`renders ${routeCase.path} without horizontal overflow`, async () => {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
        });

        try {
          await page.goto(`${baseUrl}${routeCase.path}`, {
            waitUntil: "load",
          });
          await page
            .getByRole("heading", {
              level: 1,
              name: routeCase.heading,
            })
            .waitFor();

          const hasHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
          );

          expect(hasHorizontalOverflow).toBe(false);
          await page.screenshot({
            path: join(
              screenshotDir,
              `${routeCase.screenshot}-${viewport.name}.png`,
            ),
            fullPage: true,
          });
        } finally {
          await page.close();
        }
      }, 30_000);
    }
  });
}

describe("browser navigation", () => {
  it("redirects the root route to login", async () => {
    const page = await browser.newPage();

    try {
      await page.goto(`${baseUrl}/`, { waitUntil: "load" });
      await page.waitForURL("**/login");
      await page
        .getByRole("heading", { level: 1, name: "登录 Mira Cloud" })
        .waitFor();
    } finally {
      await page.close();
    }
  });

  it("moves between login and account through the primary navigation", async () => {
    const page = await browser.newPage();

    try {
      await page.goto(`${baseUrl}/login`, { waitUntil: "load" });
      await page.getByRole("link", { name: "账户", exact: true }).click();
      await page.waitForURL("**/account");
      await page
        .getByRole("heading", { level: 1, name: "账户概览" })
        .waitFor();
    } finally {
      await page.close();
    }
  });
});
