import {
  CLOUD_GUANLAN_AUDIENCE,
  CLOUD_RELAY_TRANSPORT_AUDIENCE,
  CLOUD_WHO_YOU_AUDIENCE,
  GUANLAN_READ_SCOPE,
  GUANLAN_WRITE_SCOPE,
  RELAY_TRANSPORT_SCOPE,
  SHIYAN_AUTHENTICATE_SCOPE,
  WHOYOU_MAIL_SEND_SCOPE,
  WHOYOU_MAIL_WRITE_SCOPE,
  WHOYOU_READ_SCOPE,
  type IssuedServiceCredential,
  type ServiceCredentialJwks,
  type ServiceCredentialRequest,
  type ServiceCredentialScope,
  type RegisteredServiceCredential,
  type RegisteredServiceAudience,
  type RegisteredServiceScope,
  registeredServiceScopeSchema,
  registeredServiceCredentialSchema,
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
import type { ServiceRegistryRepository } from "../service-registry/repository.js";

type ResolvedRequest = ServiceCredentialRequest | {
  audience: RegisteredServiceAudience;
  registeredScopes: RegisteredServiceScope[];
};

export interface RelayRoomOwnershipResolver {
  resolveRoomOwnership(relayRoom: string): RelayRoomOwnership | null;
}

/**
 * The signed scope tuple is derived from the requested set, never copied from
 * the request: Guanlan read-only stays read-only and write is only added when
 * the caller asked for it explicitly.
 */
function scopeForRequest(request: ResolvedRequest): ServiceCredentialScope[] {
  if ("registeredScopes" in request) return request.registeredScopes;
  if (request.audience === CLOUD_RELAY_TRANSPORT_AUDIENCE) return [RELAY_TRANSPORT_SCOPE];
  if (request.audience === CLOUD_GUANLAN_AUDIENCE) {
    const requested = request.scopes ?? [GUANLAN_READ_SCOPE];
    return requested.includes(GUANLAN_WRITE_SCOPE)
      ? [GUANLAN_READ_SCOPE, GUANLAN_WRITE_SCOPE]
      : [GUANLAN_READ_SCOPE];
  }
  if (request.audience === CLOUD_WHO_YOU_AUDIENCE) {
    // Confirmations are standalone authorities, never general MCP bearers.
    // Draft-bound send gets mail.send; identity link/unlink gets write-only,
    // which cannot satisfy Who You's global whoyou.read MCP gate.
    if (request.confirmation !== undefined) {
      return "action" in request.confirmation
        ? [WHOYOU_MAIL_WRITE_SCOPE]
        : [WHOYOU_MAIL_SEND_SCOPE];
    }
    const requested = request.scopes ?? [WHOYOU_READ_SCOPE];
    return requested.includes(WHOYOU_MAIL_WRITE_SCOPE)
      ? [WHOYOU_READ_SCOPE, WHOYOU_MAIL_WRITE_SCOPE]
      : [WHOYOU_READ_SCOPE];
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
    return this.issueResolved(token, accountId => {
      if (request.audience === CLOUD_WHO_YOU_AUDIENCE && !this.repository.permitsLegacyWhoYouCredential(accountId)) {
        throw new ServiceCredentialRequestError("SERVICE_CREDENTIAL_PRINCIPAL_NOT_READY", 409, "The account is not authorized for the requested service");
      }
      return request;
    });
  }

  issueRegistered(token: string, registry: ServiceRegistryRepository, serviceId: string, revision: number): RegisteredServiceCredential {
    const credential = this.issueResolved(token, accountId => {
      const definition = registry.require(accountId, serviceId, revision).definition;
      switch (definition.audience) {
        case CLOUD_WHO_YOU_AUDIENCE:
          return { audience: CLOUD_WHO_YOU_AUDIENCE, scopes: [WHOYOU_READ_SCOPE] };
        case CLOUD_GUANLAN_AUDIENCE:
          return { audience: CLOUD_GUANLAN_AUDIENCE, scopes: [GUANLAN_READ_SCOPE] };
        case "mira:cloud-shiyan":
          return { audience: "mira:cloud-shiyan" };
        default:
          return { audience: definition.audience, registeredScopes: definition.scopes.map(scope => registeredServiceScopeSchema.parse(scope)) };
      }
    });
    return registeredServiceCredentialSchema.parse({ ...credential, serviceId, revision });
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
        const relay = request.audience === CLOUD_RELAY_TRANSPORT_AUDIENCE ? request.relay : null;
        const guanlan = request.audience === CLOUD_GUANLAN_AUDIENCE;
        const whoYou = request.audience === CLOUD_WHO_YOU_AUDIENCE;
        const confirmation = request.audience === CLOUD_WHO_YOU_AUDIENCE ? request.confirmation : undefined;
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
            ...(relay ? { relay } : {}),
            // The Guanlan consumer and the Who You consumer are both derived
            // from the verified session, never from the request body. One
            // account is one stable consumer for each service.
            ...(guanlan || whoYou ? { consumerId: accountId } : {}),
            ...(confirmation === undefined ? {} : { confirmation }),
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
