/** Shared human-facing formatters. */
export function formatExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "—";
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
}
