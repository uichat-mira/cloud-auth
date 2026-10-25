import type { ServiceCredentialErrorCode } from "@uichat-mira/cloud-auth-contracts";

export type ServiceCredentialVerificationErrorCode =
  | "MALFORMED_TOKEN"
  | "INVALID_HEADER"
  | "UNKNOWN_KEY"
  | "INVALID_SIGNATURE"
  | "INVALID_CLAIMS"
  | "ISSUER_MISMATCH"
  | "AUDIENCE_MISMATCH"
  | "IAT_IN_FUTURE"
  | "NOT_YET_VALID"
  | "EXPIRED"
  | "TTL_EXCEEDED"
  | "RELAY_CONTEXT_MISMATCH"
  | "INVALID_VERIFIER_CONFIG";

export class ServiceCredentialVerificationError extends Error {
  readonly code: ServiceCredentialVerificationErrorCode;

  constructor(code: ServiceCredentialVerificationErrorCode, message: string) {
    super(message);
    this.name = "ServiceCredentialVerificationError";
    this.code = code;
  }
}

export type ServiceCredentialRequestErrorCode = Exclude<
  ServiceCredentialErrorCode,
  "SERVICE_CREDENTIAL_INTERNAL_ERROR"
>;

export class ServiceCredentialRequestError extends Error {
  readonly code: ServiceCredentialRequestErrorCode;
  readonly statusCode: number;

  constructor(code: ServiceCredentialRequestErrorCode, statusCode: number, message: string) {
    super(message);
    this.name = "ServiceCredentialRequestError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type ServiceCredentialIssuanceErrorCode =
  | "INVALID_SIGNING_KEY"
  | "INVALID_TTL"
  | "INVALID_KID"
  | "INVALID_INPUT";

export class ServiceCredentialIssuanceError extends Error {
  readonly code: ServiceCredentialIssuanceErrorCode;

  constructor(code: ServiceCredentialIssuanceErrorCode, message: string) {
    super(message);
    this.name = "ServiceCredentialIssuanceError";
    this.code = code;
  }
}
