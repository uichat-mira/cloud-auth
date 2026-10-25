const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

export interface ParsedCompactJwt {
  headerSegment: string;
  payloadSegment: string;
  signatureSegment: string;
  signingInput: string;
  signature: Buffer;
}

export function encodeJsonSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeJsonSegment(segment: string): unknown {
  if (!BASE64URL_SEGMENT.test(segment)) {
    throw new Error("JWT segment is not canonical base64url");
  }
  const bytes = Buffer.from(segment, "base64url");
  if (bytes.toString("base64url") !== segment) {
    throw new Error("JWT segment is not canonical base64url");
  }
  return JSON.parse(bytes.toString("utf8"));
}

export function parseCompactJwt(token: string): ParsedCompactJwt {
  if (typeof token !== "string") {
    throw new Error("JWT must be a string");
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("JWT must have exactly three segments");
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  if (
    headerSegment === undefined ||
    payloadSegment === undefined ||
    signatureSegment === undefined ||
    !BASE64URL_SEGMENT.test(headerSegment) ||
    !BASE64URL_SEGMENT.test(payloadSegment) ||
    !BASE64URL_SEGMENT.test(signatureSegment)
  ) {
    throw new Error("JWT segments are malformed");
  }
  const signature = Buffer.from(signatureSegment, "base64url");
  if (signature.toString("base64url") !== signatureSegment) {
    throw new Error("JWT signature is not canonical base64url");
  }
  return {
    headerSegment,
    payloadSegment,
    signatureSegment,
    signingInput: `${headerSegment}.${payloadSegment}`,
    signature,
  };
}
