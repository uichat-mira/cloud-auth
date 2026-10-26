import type { AuthFailure } from "@/lib/auth/errors";

/**
 * Inline auth failure notice — Mira Console notice recipe with danger tones.
 * role="alert" is part of the test contract, keep it on the outermost element.
 */
export function AuthFailureAlert({
  failure,
}: {
  failure: AuthFailure | null;
}) {
  if (!failure) return null;

  return (
    <p role="alert" className="cloud-notice cloud-notice-danger">
      {failure.message}
      {failure.retryAfterSeconds !== null
        ? `（约 ${failure.retryAfterSeconds} 秒后可重试）`
        : null}
    </p>
  );
}
