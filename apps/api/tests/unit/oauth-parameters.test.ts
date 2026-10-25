import { describe, expect, it } from "vitest";
import {
  FIRST_PARTY_OAUTH_CLIENTS,
  MIRA_DESKTOP_OAUTH_CLIENT_ID,
  MIRA_DESKTOP_OAUTH_REDIRECT_URI,
  MIRA_MOBILE_OAUTH_CLIENT_ID,
  MIRA_MOBILE_OAUTH_REDIRECT_URI,
  findFirstPartyOAuthClient,
  isRegisteredOAuthRedirectUri,
  oauthAuthorizationCodeSchema,
  oauthAuthorizationRequestSchema,
  oauthPkceCodeChallengeSchema,
  oauthStateSchema,
  oauthTokenRequestSchema,
} from "@uichat-mira/cloud-auth-contracts";

const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const state = "state-0123456789-abcdef";

function request(overrides: Record<string, unknown> = {}) {
  return {
    response_type: "code",
    client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID,
    redirect_uri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...overrides,
  };
}

describe("first-party OAuth client registry", () => {
  it("pins one reviewed desktop and mobile client with exact callbacks", () => {
    expect(FIRST_PARTY_OAUTH_CLIENTS).toHaveLength(2);
    expect(
      FIRST_PARTY_OAUTH_CLIENTS.map((client) => ({
        clientId: client.clientId,
        platform: client.platform,
        redirectUris: client.redirectUris,
      })),
    ).toEqual([
      {
        clientId: MIRA_DESKTOP_OAUTH_CLIENT_ID,
        platform: "desktop",
        redirectUris: [MIRA_DESKTOP_OAUTH_REDIRECT_URI],
      },
      {
        clientId: MIRA_MOBILE_OAUTH_CLIENT_ID,
        platform: "mobile",
        redirectUris: [MIRA_MOBILE_OAUTH_REDIRECT_URI],
      },
    ]);

    for (const client of FIRST_PARTY_OAUTH_CLIENTS) {
      for (const redirectUri of client.redirectUris) {
        const parsed = new URL(redirectUri);
        expect(parsed.protocol).toBe(`${client.platform === "desktop" ? "mira-desktop" : "mira-mobile"}:`);
        expect(parsed.username).toBe("");
        expect(parsed.password).toBe("");
        expect(parsed.search).toBe("");
        expect(parsed.hash).toBe("");
        expect(redirectUri).not.toContain("*");
        expect(isRegisteredOAuthRedirectUri(client.clientId, redirectUri)).toBe(true);
      }
    }

    expect(findFirstPartyOAuthClient("third-party")).toBeUndefined();
    expect(isRegisteredOAuthRedirectUri(MIRA_DESKTOP_OAUTH_CLIENT_ID, "https://evil.example/cb")).toBe(
      false,
    );
    expect(isRegisteredOAuthRedirectUri(MIRA_DESKTOP_OAUTH_CLIENT_ID, MIRA_MOBILE_OAUTH_REDIRECT_URI)).toBe(
      false,
    );
  });
});

describe("OAuth authorization request parameters", () => {
  it("accepts exact S256 authorization code requests for both clients", () => {
    expect(oauthAuthorizationRequestSchema.parse(request())).toEqual(request());
    expect(
      oauthAuthorizationRequestSchema.parse(
        request({
          client_id: MIRA_MOBILE_OAUTH_CLIENT_ID,
          redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI,
        }),
      ),
    ).toEqual(
      request({
        client_id: MIRA_MOBILE_OAUTH_CLIENT_ID,
        redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI,
      }),
    );
  });

  it("rejects unsupported flows, PKCE downgrade and unknown fields", () => {
    for (const invalid of [
      request({ response_type: "token" }),
      request({ response_type: "id_token" }),
      request({ response_type: undefined }),
      request({ code_challenge_method: "plain" }),
      request({ code_challenge_method: "s256" }),
      request({ code_challenge_method: undefined }),
      request({ client_id: "third-party" }),
      request({ state: undefined }),
      request({ scope: "openid" }),
      request({ username: "alice" }),
      request({ device_id: "device-1" }),
      request({ account_id: "account-1" }),
      request({ redirect_uri: "https://evil.example/cb" }),
      request({ redirect_uri: `${MIRA_DESKTOP_OAUTH_REDIRECT_URI}?extra=1` }),
      request({
        client_id: MIRA_MOBILE_OAUTH_CLIENT_ID,
        redirect_uri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
      }),
    ]) {
      expect(oauthAuthorizationRequestSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("bounds state without allowing callback or header injection characters", () => {
    expect(oauthStateSchema.parse(state)).toBe(state);
    expect(oauthStateSchema.parse("abcdefghijklmnop")).toBe("abcdefghijklmnop");
    for (const invalid of [
      "short",
      "a".repeat(513),
      `${state} with spaces`,
      `${state}&code=injected`,
      `${state}#fragment`,
      `${state}\r\nlocation: https://evil.example`,
      `${state}中文`,
      "",
    ]) {
      expect(oauthStateSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("accepts only a 43-character non-degenerate S256 challenge", () => {
    expect(oauthPkceCodeChallengeSchema.parse(challenge)).toBe(challenge);
    for (const invalid of [
      "",
      "a".repeat(42),
      "a".repeat(44),
      `${challenge}=`,
      `${challenge}+`,
      `${challenge}/`,
      "a".repeat(43),
      "A".repeat(43),
    ]) {
      expect(oauthPkceCodeChallengeSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("recognizes only the issued opaque code shape", () => {
    const code = `mca_v1.${"a".repeat(22)}.${"b".repeat(43)}`;
    expect(oauthAuthorizationCodeSchema.parse(code)).toBe(code);
    for (const invalid of [
      "",
      `mcs_v1.${"a".repeat(22)}.${"b".repeat(43)}`,
      `mca_v1.${"a".repeat(21)}.${"b".repeat(43)}`,
      `mca_v1.${"a".repeat(22)}.${"b".repeat(42)}`,
      `mca_v1.${"a".repeat(22)}`,
    ]) {
      expect(oauthAuthorizationCodeSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe("OAuth token exchange parameters", () => {
  const installationId = "01890f6e-4f3c-4cc8-9dbc-55116c2f3a8a";
  function tokenRequest(overrides: Record<string, unknown> = {}) {
    return {
      grant_type: "authorization_code",
      client_id: MIRA_DESKTOP_OAUTH_CLIENT_ID,
      code: `mca_v1.${"a".repeat(22)}.${"b".repeat(43)}`,
      redirect_uri: MIRA_DESKTOP_OAUTH_REDIRECT_URI,
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      installation_id: installationId,
      platform: "desktop",
      ...overrides,
    };
  }

  it("accepts the exact authorization_code + S256 device-binding exchange", () => {
    expect(oauthTokenRequestSchema.parse(tokenRequest())).toEqual(tokenRequest());
    expect(
      oauthTokenRequestSchema.parse(
        tokenRequest({
          client_id: MIRA_MOBILE_OAUTH_CLIENT_ID,
          redirect_uri: MIRA_MOBILE_OAUTH_REDIRECT_URI,
          platform: "mobile",
        }),
      ).platform,
    ).toBe("mobile");
  });

  it("rejects plain, unsupported grants, weak verifiers and caller-supplied ownership", () => {
    for (const invalid of [
      tokenRequest({ grant_type: "client_credentials" }),
      tokenRequest({ grant_type: "refresh_token" }),
      tokenRequest({ code_challenge_method: "plain" }),
      tokenRequest({ scope: "openid" }),
      tokenRequest({ account_id: "account-1" }),
      tokenRequest({ device_id: "device-1" }),
      tokenRequest({ code_verifier: "plain" }),
      tokenRequest({ code_verifier: "a".repeat(43) + "!" }),
      tokenRequest({ installation_id: "not-a-uuid" }),
      tokenRequest({ platform: "server" }),
      tokenRequest({ code: "mcs_v1.abc.def" }),
      tokenRequest({ client_id: "third-party" }),
    ]) {
      expect(oauthTokenRequestSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
