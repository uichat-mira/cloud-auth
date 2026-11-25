import {
  developerApplicationCatalogSchema,
  developerApplicationSecretSchema,
  developerApplicationDisabledSchema,
  developerApplicationCreateSchema,
} from "@uichat-mira/cloud-auth-contracts";
import type { z } from "zod";
import { bearerHeaders, createHttpTransport } from "@/lib/http/transport";

export type ApplicationCatalog = z.infer<typeof developerApplicationCatalogSchema>;
export type ApplicationCreate = z.infer<typeof developerApplicationCreateSchema>;
export type AppSecret = z.infer<typeof developerApplicationSecretSchema>;

export class ApplicationRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export function createApplicationClient() {
  const transport = createHttpTransport({
    hooks: {
      networkUnavailable: () => new ApplicationRequestError(0, "NETWORK_UNAVAILABLE"),
      malformedResponse: () => new ApplicationRequestError(0, "MALFORMED_RESPONSE"),
      responseFailed: ({ status, body }) => {
        const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
        return new ApplicationRequestError(
          status,
          typeof code === "string" ? code : "APPLICATION_REQUEST_FAILED",
        );
      },
    },
  });
  const route = "/v1/account/applications";
  const init = (token: string, body?: unknown): RequestInit => ({
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...bearerHeaders(token),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    redirect: "error",
  });
  return {
    list: (token: string) => transport.json(route, init(token), developerApplicationCatalogSchema),
    create: (token: string, body: ApplicationCreate) =>
      transport.json(route, init(token, body), developerApplicationSecretSchema),
    rotate: (token: string, id: string, currentPassword: string) =>
      transport.json(
        route + "/" + encodeURIComponent(id) + "/rotate",
        init(token, { currentPassword }),
        developerApplicationSecretSchema,
      ),
    enable: (token: string, id: string, currentPassword: string) =>
      transport.json(
        route + "/" + encodeURIComponent(id) + "/enable",
        init(token, { currentPassword }),
        developerApplicationSecretSchema,
      ),
    disable: (token: string, id: string, currentPassword: string) =>
      transport.json(
        route + "/" + encodeURIComponent(id) + "/disable",
        init(token, { currentPassword }),
        developerApplicationDisabledSchema,
      ),
  };
}
