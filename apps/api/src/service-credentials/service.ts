import {
  CLOUD_RELAY_TRANSPORT_AUDIENCE,
  RELAY_TRANSPORT_SCOPE,
  SHIYAN_AUTHENTICATE_SCOPE,
  type IssuedServiceCredential,
  type ServiceCredentialJwks,
  type ServiceCredentialRequest,
  type ServiceCredentialScope,
} from "@uichat-mira/cloud-auth-contracts";
import type { AuthRepository } from "../auth/auth-repository.js";
import { hashSessionSecret, parseSessionToken } from "../security/session-token.js";
import { ServiceCredentialRequestError } from "./errors.js";
import type { ServiceCredentialKeyRing } from "./keyring.js";
import {
  isRelayTicketAuthorized,
  type RelayRoomOwnership,
} from "./relay-admission.js";
import { issueServiceCredential } from "./signer.js";

export interface RelayRoomOwnershipResolver {
  resolveRoomOwnership(relayRoom: string): RelayRoomOwnership | null;
}

function scopeForRequest(request: ServiceCredentialRequest): ServiceCredentialScope[] {
  return request.audience === CLOUD_RELAY_TRANSPORT_AUDIENCE
    ? [RELAY_TRANSPORT_SCOPE]
    : [SHIYAN_AUTHENTICATE_SCOPE];
}

export class ServiceCredentialService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly keyRing: ServiceCredentialKeyRing | null,
    private readonly relayRoomOwnership: RelayRoomOwnershipResolver,
  ) {}

  issue(token: string, request: ServiceCredentialRequest): IssuedServiceCredential {
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
    const relay =
      request.audience === CLOUD_RELAY_TRANSPORT_AUDIENCE ? request.relay : null;
    const issued = this.repository.issueWithinActiveDeviceSession(
      parsed.id,
      hashSessionSecret(parsed.secret),
      now.toISOString(),
      ({ accountId, deviceId, devicePlatform }) => {
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

        const credential = issueServiceCredential(
          { ...keyRing.signer, now: () => now },
          {
            accountId,
            deviceId,
            audience: request.audience,
            scope: scopeForRequest(request),
            ...(relay ? { relay } : {}),
          },
        );
        return {
          token: credential,
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
      audience: request.audience,
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
