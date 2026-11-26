import {
  CLOUD_GUANLAN_AUDIENCE,
  CLOUD_RELAY_TRANSPORT_AUDIENCE,
  GUANLAN_READ_SCOPE,
  GUANLAN_WRITE_SCOPE,
  RELAY_TRANSPORT_SCOPE,
  SHIYAN_AUTHENTICATE_SCOPE,
  type ApplicationServiceCredential,
  type ApplicationServiceResource,
  type ApplicationServiceScope,
  type IssuedServiceCredential,
  type ServiceCredentialJwks,
  type ServiceCredentialRequest,
  type ServiceCredentialScope,
} from "@uichat-mira/cloud-auth-contracts";
import type { AuthRepository } from "../auth/auth-repository.js";
import { hashSessionSecret, parseSessionToken } from "../security/session-token.js";
import { ServiceCredentialRequestError } from "./errors.js";
import type { GuanlanSpaceReadiness } from "./guanlan-space-readiness.js";
import type { ServiceCredentialKeyRing } from "./keyring.js";
import {
  isRelayTicketAuthorized,
  type RelayRoomOwnership,
} from "./relay-admission.js";
import { issueServiceCredential } from "./signer.js";

type ApplicationResolvedRequest = {
  audience: ApplicationServiceResource;
  application: { appId: string; serviceId: string; resource: string };
  applicationScopes: ApplicationServiceScope[];
};

type ResolvedRequest = ServiceCredentialRequest | ApplicationResolvedRequest;

export interface RelayRoomOwnershipResolver {
  resolveRoomOwnership(relayRoom: string): RelayRoomOwnership | null;
}

/**
 * The signed scope tuple is derived from the requested set, never copied from
 * the request: Guanlan read-only stays read-only and write is only added when
 * the caller asked for it explicitly.
 */
function scopeForRequest(
  request: ResolvedRequest,
): (ServiceCredentialScope | ApplicationServiceScope)[] {
  if ("application" in request) return request.applicationScopes;
  if (request.audience === CLOUD_RELAY_TRANSPORT_AUDIENCE) return [RELAY_TRANSPORT_SCOPE];
  if (request.audience === CLOUD_GUANLAN_AUDIENCE) {
    const requested = request.scopes ?? [GUANLAN_READ_SCOPE];
    return requested.includes(GUANLAN_WRITE_SCOPE)
      ? [GUANLAN_READ_SCOPE, GUANLAN_WRITE_SCOPE]
      : [GUANLAN_READ_SCOPE];
  }
  return [SHIYAN_AUTHENTICATE_SCOPE];
}

export class ServiceCredentialService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly keyRing: ServiceCredentialKeyRing | null,
    private readonly relayRoomOwnership: RelayRoomOwnershipResolver,
    private readonly guanlanSpace: GuanlanSpaceReadiness,
  ) {}

  issue(token: string, request: ServiceCredentialRequest): IssuedServiceCredential {
    return this.issueResolved(token, () => request);
  }

  /**
   * Issues one short-lived credential for an exact instance-scoped binding.
   * `resolve` runs inside the session/device/account authority transaction and
   * must re-read the grant and current declaration there; its returned scopes
   * are the only authority copied into the signed claims.
   */
  issueApplicationService(
    token: string,
    resolve: (accountId: string) => {
      appId: string;
      serviceId: string;
      resource: string;
      revision: number;
      scopes: ApplicationServiceScope[];
    },
  ): ApplicationServiceCredential {
    let binding:
      | ReturnType<typeof resolve>
      | undefined;
    const credential = this.issueResolved(token, (accountId) => {
      binding = resolve(accountId);
      return {
        audience: binding.resource,
        application: {
          appId: binding.appId,
          serviceId: binding.serviceId,
          resource: binding.resource,
        },
        applicationScopes: binding.scopes,
      };
    });
    if (!binding) {
      throw new ServiceCredentialRequestError(
        "SERVICE_CREDENTIAL_REAUTH_REQUIRED",
        401,
        "Re-authentication is required",
      );
    }
    return {
      token: credential.token,
      tokenType: "Bearer",
      appId: binding.appId,
      serviceId: binding.serviceId,
      resource: binding.resource,
      revision: binding.revision,
      scopes: binding.scopes,
      expiresAt: credential.expiresAt,
    };
  }

  private issueResolved(token: string, resolve: (accountId: string) => ResolvedRequest): IssuedServiceCredential {
    const keyRing = this.keyRing;
    if (!keyRing) {
      throw new ServiceCredentialRequestError(
        "SERVICE_CREDENTIAL_UNAVAILABLE",
        503,
        "Service credential issuance is not configured",
      );
    }

    const parsed = parseSessionToken(token);
    if (!parsed) {
      throw new ServiceCredentialRequestError(
        "SERVICE_CREDENTIAL_REAUTH_REQUIRED",
        401,
        "Re-authentication is required",
      );
    }

    const now = new Date();
    const issued = this.repository.issueWithinActiveDeviceSession(
      parsed.id,
      hashSessionSecret(parsed.secret),
      now.toISOString(),
      ({ accountId, deviceId, devicePlatform }) => {
        const request = resolve(accountId);
        const relay = "relay" in request ? request.relay : null;
        const guanlan = request.audience === CLOUD_GUANLAN_AUDIENCE;
        if (relay) {
          // This query shares the issuance BEGIN IMMEDIATE transaction, so a
          // Host lease, room binding, or device revoke cannot interleave.
          const ownership = this.relayRoomOwnership.resolveRoomOwnership(relay.room);
          if (
            !isRelayTicketAuthorized(
              relay,
              { accountId, deviceId, devicePlatform },
              ownership,
            )
          ) {
            throw new ServiceCredentialRequestError(
              "SERVICE_CREDENTIAL_RELAY_NOT_AUTHORIZED",
              403,
              "Relay transport ticket is not authorized for this device",
            );
          }
        }

        if (guanlan) {
          // Fail closed: a disabled/denied account is already rejected by the
          // surrounding authority check, and a missing or non-delivered GLN-012
          // registration must not be treated as permission.
          if (this.guanlanSpace.status(accountId) !== "ready") {
            throw new ServiceCredentialRequestError(
              "SERVICE_CREDENTIAL_PRINCIPAL_NOT_READY",
              409,
              "The account is not registered for the requested service",
            );
          }
        }

        const credential = issueServiceCredential(
          { ...keyRing.signer, now: () => now },
          {
            accountId,
            deviceId,
            audience: request.audience,
            scope: scopeForRequest(request),
            ...("application" in request ? { application: request.application } : {}),
            ...(relay ? { relay } : {}),
            // The Guanlan consumer is derived from the verified account.
            ...(guanlan ? { consumerId: accountId } : {}),
          },
        );
        return {
          token: credential,
          audience: request.audience,
          expiresAt: new Date(
            (Math.floor(now.getTime() / 1000) + keyRing.ttlSeconds) * 1000,
          ).toISOString(),
        };
      },
    );

    if (!issued.ok) {
      if (issued.reason === "device_required") {
        throw new ServiceCredentialRequestError(
          "SERVICE_CREDENTIAL_DEVICE_REQUIRED",
          403,
          "A device-bound Mira Cloud Session is required",
        );
      }
      throw new ServiceCredentialRequestError(
        "SERVICE_CREDENTIAL_REAUTH_REQUIRED",
        401,
        "Re-authentication is required",
      );
    }

    return {
      token: issued.value.token,
      tokenType: "Bearer",
      audience: issued.value.audience,
      expiresAt: issued.value.expiresAt,
    };
  }

  getJwks(): ServiceCredentialJwks {
    if (!this.keyRing) {
      throw new ServiceCredentialRequestError(
        "SERVICE_CREDENTIAL_UNAVAILABLE",
        503,
        "Service credential verification keys are not configured",
      );
    }
    return this.keyRing.jwks;
  }
}
