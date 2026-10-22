export function normalizeUsername(username: string): string {
  const normalized = username.trim().normalize("NFKC").toLowerCase();
  const length = [...normalized].length;
  if (length < 3 || length > 64) {
    throw new Error("Username must contain between 3 and 64 characters");
  }
  if (!/^[\p{L}\p{N}._-]+$/u.test(normalized)) {
    throw new Error("Username contains unsupported characters");
  }
  return normalized;
}
