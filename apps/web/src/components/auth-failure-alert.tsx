import type { AuthFailure } from "@/lib/auth/errors";

export function AuthFailureAlert({
  failure,
}: {
  failure: AuthFailure | null;
}) {
  if (!failure) return null;

  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {failure.message}
    </p>
  );
}
