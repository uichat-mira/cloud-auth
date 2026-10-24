import {
  authErrorEnvelopeSchema,
  cloudSessionSchema,
  issuedCloudSessionSchema,
  loginRequestSchema,
} from "@uichat-mira/cloud-auth-contracts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { createTestAuth } from "../helpers/auth.js";

const cleanup: string[] = [];
const password = "correct horse battery staple";

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("Cloud Auth HTTP compatibility with shared contracts", () => {
  it("returns login, restore, renewal and public error payloads accepted by the shared schemas", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-shared-contract-"));
    cleanup.push(dir);
    const context = createTestAuth(join(dir, "auth.sqlite"));
    await context.service.provisionAccount("Alice", password);
    const app = buildApp({ db: context.db, authService: context.service });

    const request = loginRequestSchema.parse({ username: "alice", password });
    const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: request });
    expect(login.statusCode).toBe(200);
    const issued = issuedCloudSessionSchema.parse(login.json());

    const restored = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${issued.sessionToken}` },
    });
    expect(restored.statusCode).toBe(200);
    expect(cloudSessionSchema.safeParse(restored.json()).success).toBe(true);

    const renewed = await app.inject({
      method: "POST",
      url: "/v1/auth/session/renew",
      headers: { authorization: `Bearer ${issued.sessionToken}` },
    });
    expect(renewed.statusCode).toBe(200);
    const rotated = issuedCloudSessionSchema.parse(renewed.json());

    const stale = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${issued.sessionToken}` },
    });
    expect(stale.statusCode).toBe(401);
    expect(authErrorEnvelopeSchema.safeParse(stale.json()).success).toBe(true);

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${rotated.sessionToken}` },
    });
    expect(logout.statusCode).toBe(204);

    await app.close();
    context.db.close();
  });

  it("keeps the existing Fastify request boundary aligned with the canonical login schema", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mira-shared-request-"));
    cleanup.push(dir);
    const context = createTestAuth(join(dir, "auth.sqlite"));
    const app = buildApp({ db: context.db, authService: context.service });

    for (const payload of [
      {},
      { username: "alice" },
      { username: "", password },
      { username: "alice", password: "" },
      { username: "a".repeat(129), password },
      { username: "alice", password: "p".repeat(257) },
      { username: "alice", password, extra: true },
    ]) {
      expect(loginRequestSchema.safeParse(payload).success).toBe(false);
      const response = await app.inject({ method: "POST", url: "/v1/auth/login", payload });
      expect(response.statusCode).toBe(400);
    }

    await app.close();
    context.db.close();
  });
});
