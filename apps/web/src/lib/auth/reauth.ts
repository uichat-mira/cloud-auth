/**
 * The single place that reacts to a 401 from a privileged Portal request.
 *
 * Two rules, learned the hard way, live here so no call site can drift:
 *
 * 1. Only the token that actually failed is invalidated. A background request
 *    that started before a re-login or a renewal must never end the *newer*
 *    session it never saw.
 * 2. Invalidation is followed by a token read, because the store may already
 *    hold a replacement. Callers use `rotated` to decide whether a read-only
 *    retry is safe; a privileged mutation is never replayed.
 */
export interface ReauthOutcome {
  /** The session token in effect after the cleanup; `null` when signed out. */
  currentToken: string | null;
  /**
   * True when the failed token had already been replaced, so the caller may
   * retry a *read* with the new token.
   */
  rotated: boolean;
}

export function revokeFailedSession(
  failedToken: string,
  getSessionToken: () => string | null,
  invalidateSession: (sessionToken: string) => void,
): ReauthOutcome {
  invalidateSession(failedToken);
  const currentToken = getSessionToken();

  return {
    currentToken,
    rotated: currentToken !== null && currentToken !== failedToken,
  };
}
