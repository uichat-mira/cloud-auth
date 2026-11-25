import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const MAX_RESPONSE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;

export interface ApplicationRegistrationHttpResponse {
  status: number;
  body: unknown;
}

export interface ApplicationRegistrationTransport {
  get(url: string): Promise<ApplicationRegistrationHttpResponse>;
  post(url: string, body: unknown): Promise<ApplicationRegistrationHttpResponse>;
}

export class ApplicationTransportError extends Error {
  constructor(readonly code: "INVALID_TARGET" | "UNSAFE_TARGET" | "NETWORK_ERROR" | "INVALID_RESPONSE") {
    super(code);
  }
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const a = octets[0]!;
  const b = octets[1]!;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0) return true;
  return false;
}

export function isPublicNetworkAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !isPrivateIpv4(address);
  if (family !== 6) return false;
  const value = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped) return !isPrivateIpv4(mapped[1]!);
  if (value === "::" || value === "::1") return false;
  if (value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff")) return false;
  if (value.startsWith("2001:db8:")) return false;
  return value.startsWith("2") || value.startsWith("3");
}

async function resolvePublicTarget(hostname: string) {
  if (isIP(hostname)) {
    if (!isPublicNetworkAddress(hostname)) throw new ApplicationTransportError("UNSAFE_TARGET");
    return { address: hostname, family: isIP(hostname) as 4 | 6 };
  }
  let records: Array<{ address: string; family: 4 | 6 }>;
  try {
    records = await lookup(hostname, { all: true, verbatim: true }) as Array<{ address: string; family: 4 | 6 }>;
  } catch {
    throw new ApplicationTransportError("NETWORK_ERROR");
  }
  if (!records.length || records.some((record) => !isPublicNetworkAddress(record.address))) {
    throw new ApplicationTransportError("UNSAFE_TARGET");
  }
  return records[0]!;
}

function parseTarget(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApplicationTransportError("INVALID_TARGET");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) {
    throw new ApplicationTransportError("INVALID_TARGET");
  }
  return url;
}

async function requestJson(method: "GET" | "POST", value: string, body?: unknown): Promise<ApplicationRegistrationHttpResponse> {
  const target = parseTarget(value);
  const resolved = await resolvePublicTarget(target.hostname);
  const payload = body === undefined ? undefined : JSON.stringify(body);

  return await new Promise<ApplicationRegistrationHttpResponse>((resolve, reject) => {
    const request = httpsRequest({
      protocol: "https:",
      hostname: resolved.address,
      port: target.port ? Number(target.port) : 443,
      method,
      path: target.pathname + target.search,
      servername: target.hostname,
      headers: {
        accept: "application/json",
        host: target.host,
        ...(payload === undefined ? {} : {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload).toString(),
        }),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          request.destroy(new ApplicationTransportError("INVALID_RESPONSE"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          const parsed = text.length ? JSON.parse(text) : null;
          resolve({ status: response.statusCode ?? 0, body: parsed });
        } catch {
          reject(new ApplicationTransportError("INVALID_RESPONSE"));
        }
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new ApplicationTransportError("NETWORK_ERROR"));
    });
    request.on("error", (error) => {
      reject(error instanceof ApplicationTransportError ? error : new ApplicationTransportError("NETWORK_ERROR"));
    });
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}

export class HttpsApplicationRegistrationTransport implements ApplicationRegistrationTransport {
  get(url: string) {
    return requestJson("GET", url);
  }

  post(url: string, body: unknown) {
    return requestJson("POST", url, body);
  }
}
