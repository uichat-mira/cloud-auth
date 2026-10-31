/** Keep return destinations on the protected account console only.
 * Never accept an absolute URL, protocol-relative URL or auth callback path.
 * No token, secret or raw referrer is stored in this redirect.
 */
export function safeAccountReturnTo(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\r\n]/.test(value)
  ) {
    return "/account";
  }
  try {
    const destination = new URL(value, "https://mira.invalid");
    if (destination.origin !== "https://mira.invalid") return "/account";
    if (destination.pathname !== "/account" && !destination.pathname.startsWith("/account/")) {
      return "/account";
    }
    return destination.pathname + destination.search + destination.hash;
  } catch {
    return "/account";
  }
}

export function loginUrlForAccount(accountLocation: string): string {
  const returnTo = safeAccountReturnTo(accountLocation);
  if (returnTo === "/account") return "/login";
  const params = new URLSearchParams({ returnTo });
  return "/login?" + params.toString();
}

export function returnToFromLoginSearch(search: string): string {
  return safeAccountReturnTo(new URLSearchParams(search).get("returnTo"));
}
