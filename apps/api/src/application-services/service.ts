import {
  applicationIdSchema,
  applicationServiceBindingRequestSchema,
  applicationServiceCatalogSchema,
  serviceIdSchema,
  type ApplicationServiceCatalog,
  type ApplicationServiceCredential,
} from "@uichat-mira/cloud-auth-contracts";
import type { ServiceCredentialService } from "../service-credentials/service.js";
import {
  ApplicationServiceError,
  ApplicationServiceRepository,
} from "./repository.js";

export class ApplicationServiceService {
  constructor(
    private readonly repository: ApplicationServiceRepository,
    private readonly credentials: ServiceCredentialService | undefined,
  ) {}

  catalog(accountId: string): ApplicationServiceCatalog {
    return applicationServiceCatalogSchema.parse({
      services: this.repository.list(accountId),
    });
  }

  revoke(
    accountId: string,
    appId: string,
    serviceId: string,
    input: unknown,
  ): { revision: number } {
    const binding = this.parseBinding(appId, serviceId, input);
    return {
      revision: this.repository.revoke(
        accountId,
        binding.appId,
        binding.serviceId,
        binding.resource,
        binding.expectedRevision,
      ),
    };
  }

  issue(
    token: string,
    appId: string,
    serviceId: string,
    input: unknown,
  ): ApplicationServiceCredential {
    const binding = this.parseBinding(appId, serviceId, input);
    if (!this.credentials) {
      throw new ApplicationServiceError("APPLICATION_SERVICE_UNAVAILABLE", 503);
    }
    return this.credentials.issueApplicationService(token, (accountId) =>
      this.repository.requireBinding(
        accountId,
        binding.appId,
        binding.serviceId,
        binding.resource,
        binding.expectedRevision,
      ),
    );
  }

  private parseBinding(appId: string, serviceId: string, input: unknown) {
    const id = applicationIdSchema.safeParse(appId);
    const service = serviceIdSchema.safeParse(serviceId);
    const body = applicationServiceBindingRequestSchema.safeParse(input);
    if (!id.success || !service.success || !body.success) {
      throw new ApplicationServiceError("APPLICATION_SERVICE_INVALID_REQUEST", 400);
    }
    return {
      appId: id.data,
      serviceId: service.data,
      resource: body.data.resource,
      expectedRevision: body.data.expectedRevision,
    };
  }
}
