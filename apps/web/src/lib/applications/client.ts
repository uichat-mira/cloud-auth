import {
  applicationInstanceCatalogSchema,
  applicationOwnershipRemovalResponseSchema,
  applicationRegistrationRequestSchema,
  applicationRegistrationResponseSchema,
} from "@uichat-mira/cloud-auth-contracts";
import type { z } from "zod";
import { bearerHeaders, createHttpTransport } from "@/lib/http/transport";

export type ApplicationCatalog = z.infer<typeof applicationInstanceCatalogSchema>;
export type ApplicationRegistrationRequest = z.infer<typeof applicationRegistrationRequestSchema>;

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
  return {
    list: (token: string) =>
      transport.json(route, { method: "GET", headers: bearerHeaders(token), cache: "no-store" }, applicationInstanceCatalogSchema),
    register: (token: string, body: ApplicationRegistrationRequest) =>
      transport.json(route, {
        method: "POST",
        headers: { ...bearerHeaders(token), "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      }, applicationRegistrationResponseSchema),
    remove: (token: string, appId: string) =>
      transport.json(route + "/" + encodeURIComponent(appId), {
        method: "DELETE",
        headers: bearerHeaders(token),
        cache: "no-store",
      }, applicationOwnershipRemovalResponseSchema),
  };
}
