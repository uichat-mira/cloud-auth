export {
  ServiceCredentialIssuanceError,
  ServiceCredentialVerificationError,
} from "./errors.js";
export type {
  ServiceCredentialIssuanceErrorCode,
  ServiceCredentialVerificationErrorCode,
} from "./errors.js";
export {
  DEFAULT_SERVICE_CREDENTIAL_TTL_SECONDS,
  MAX_SERVICE_CREDENTIAL_TTL_SECONDS,
  issueServiceCredential,
} from "./signer.js";
export type {
  Ed25519PrivateKeyInput,
  IssueServiceCredentialInput,
  ServiceCredentialSignerConfig,
} from "./signer.js";
export { verifyServiceCredential } from "./verifier.js";
export type {
  Ed25519PublicKeyInput,
  ExpectedRelayContext,
  ServiceCredentialVerifierConfig,
  VerifiedServiceCredential,
} from "./verifier.js";
