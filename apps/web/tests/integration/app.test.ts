import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
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

/**
 * The console routes only render their own h1 behind the auth gate, so the
 * authenticated cases seed a persisted Cloud Session and answer the API the same
 * way the real service does (empty ledger for this fresh account).
 */
const routeCases = [
  { path: "/login", heading: "登录 Mira Cloud", screenshot: "login", authenticated: false },
  { path: "/account", heading: "我的账户", screenshot: "account", authenticated: true },
  {
    path: "/account/devices",
    heading: "设备与授权",
    screenshot: "devices",
    authenticated: true,
  },
  {
    path: "/account/security",
    heading: "账户安全",
    screenshot: "security",
    authenticated: true,
  },
  {
    path: "/account/services",
    heading: "关联服务",
    screenshot: "services",
    authenticated: true,
  },
  { path: "/missing", heading: "页面不存在", screenshot: "not-found", authenticated: false },
] as const;

const sessionKey = "mira.cloud-auth.session.v1";
const consoleNavName = "账户分区";

function futureExpiry(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

function apiBody(pathname: string): { status: number; body: unknown } {
  switch (pathname) {
    case "/v1/auth/session":
      return {
        status: 200,
        body: {
          account: { id: "account-1", username: "pilot" },
          expiresAt: futureExpiry(),
        },
      };
    case "/v1/hosts/grant-management":
      return { status: 200, body: { hosts: [] } };
    case "/v1/hosts":
      return { status: 200, body: { hosts: [] } };
    case "/v1/devices":
      return { status: 200, body: { devices: [] } };
    default:
      return {
        status: 404,
        body: { error: { code: "NOT_FOUND", message: "Unknown endpoint" } },
      };
  }
}

/** Seed the persisted session and stub the API the console calls on mount. */
async function signIn(page: Page): Promise<void> {
  const session = {
    sessionToken: "mcs_v1.e2e.secret",
    expiresAt: futureExpiry(),
  };

  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      window.sessionStorage.setItem(key, value);
    },
    { key: sessionKey, value: JSON.stringify(session) },
  );

  await page.route("**/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const { status, body } = apiBody(pathname);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

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
          if (routeCase.authenticated) {
            await signIn(page);
          }

          await page.goto(`${baseUrl}${routeCase.path}`, {
            waitUntil: "load",
          });
          await page
            .getByRole("heading", {
              level: 1,
              name: routeCase.heading,
            })
            .waitFor();

          if (routeCase.authenticated) {
            // The console shell, not the public shell, owns these routes.
            const rail = page.getByRole("navigation", { name: consoleNavName });
            await rail.waitFor();
            expect(await rail.getByRole("link").count()).toBe(4);
            expect(
              await page.getByRole("navigation", { name: "主导航" }).count(),
            ).toBe(0);
          }

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
  it("keeps the root page separate from login", async () => {
    const page = await browser.newPage();

    try {
      await page.goto(`${baseUrl}/`, { waitUntil: "load" });
      await page
        .getByRole("heading", { level: 1, name: "你的 Mira 云端账户" })
        .waitFor();
      expect(new URL(page.url()).pathname).toBe("/");
      await page.getByRole("main").getByRole("link", { name: "登录 Mira Cloud" }).click();
      await page.waitForURL("**/login");
      await page.getByLabel("密码").waitFor();
    } finally {
      await page.close();
    }
  });

  it("keeps logged-out navigation limited to login", async () => {
    const page = await browser.newPage();

    try {
      await page.goto(`${baseUrl}/login`, { waitUntil: "load" });
      await page.getByRole("link", { name: "登录", exact: true }).waitFor();
      expect(await page.getByRole("link", { name: "账户中心", exact: true }).count()).toBe(0);

      await page.goto(`${baseUrl}/account`, { waitUntil: "load" });
      await page.getByRole("heading", { level: 1, name: "我的账户" }).waitFor();
      await page.getByRole("link", { name: "登录", exact: true }).waitFor();
      expect(await page.getByRole("link", { name: "账户中心", exact: true }).count()).toBe(0);
      expect(await page.getByRole("link", { name: /OAuth|授权/ }).count()).toBe(0);
      // Signed out, the console rail exists but offers no section links.
      expect(
        await page.getByRole("navigation", { name: consoleNavName }).getByRole("link").count(),
      ).toBe(0);
    } finally {
      await page.close();
    }
  });
});
