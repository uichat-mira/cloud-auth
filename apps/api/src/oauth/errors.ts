export type OAuthErrorCode =
  | "OAUTH_INVALID_REQUEST"
  | "OAUTH_UNAUTHORIZED_CLIENT"
  | "OAUTH_REAUTH_REQUIRED";

export class OAuthError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
