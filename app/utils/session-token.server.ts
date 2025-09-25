import jwt, { JwtHeader, JwtPayload } from "jsonwebtoken";

export interface VerifiedSession {
  shop: string; // foo-bar.myshopify.com
  payload: JwtPayload & {
    dest?: string;  // https://foo-bar.myshopify.com/admin
    iss?: string;   // https://foo-bar.myshopify.com/admin
    aud?: string;   // your API key
    jti?: string;   // token id (optional)
  };
}

export class SessionAuthError extends Error {
  code:
    | "NO_TOKEN"
    | "BAD_FORMAT"
    | "INVALID_SIG"
    | "EXPIRED"
    | "NO_SHOP"
    | "INVALID_SHOP"
    | "AUD_MISMATCH"
    | "HEADER_MISMATCH"
    | "HOST_MISMATCH";
  status: number;
  constructor(code: SessionAuthError["code"], message: string, status = 401) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const SHOPIFY_HOST_SUFFIX = ".myshopify.com";

function normaliseShopFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const host = u.host.toLowerCase();
    if (!host.endsWith(SHOPIFY_HOST_SUFFIX)) return null;
    const [sub] = host.split(SHOPIFY_HOST_SUFFIX);
    if (!sub || sub.endsWith(".")) return null;
    return host;
  } catch {
    return null;
  }
}

function decodeHostParam(hostParam?: string | null): string | null {
  if (!hostParam) return null;
  try {
    const decoded = atob(hostParam);
    // decoded looks like "{shop}.myshopify.com/admin"
    const u = new URL(`https://${decoded}`);
    return u.host.toLowerCase();
  } catch {
    return null;
  }
}

/** Convert auth errors into a proper 401 Bearer challenge */
export function toUnauthorizedResponse(err: SessionAuthError): Response {
  const params =
    err.code === "EXPIRED"
      ? 'error="invalid_token", error_description="expired"'
      : 'error="invalid_token"';
  return new Response(err.message, {
    status: err.status,
    headers: { "WWW-Authenticate": `Bearer ${params}` },
  });
}

export function verifySessionToken(
  token: string,
  {
    apiSecret = process.env.SHOPIFY_API_SECRET!,
    apiKey = process.env.SHOPIFY_API_KEY!,
    clockToleranceSec = 5,
    onLog = (msg: string) => console.warn(msg),
  }: {
    apiSecret?: string;
    apiKey?: string;
    clockToleranceSec?: number;
    onLog?: (msg: string) => void;
  } = {}
): VerifiedSession {
  if (!token) throw new SessionAuthError("NO_TOKEN", "Missing session token");
  if (!apiSecret) throw new Error("Missing SHOPIFY_API_SECRET");
  if (!apiKey) throw new Error("Missing SHOPIFY_API_KEY");

  const decodedHeader = jwt.decode(token, { complete: true }) as { header: JwtHeader } | null;
  if (!decodedHeader || decodedHeader.header.alg !== "HS256") {
    throw new SessionAuthError("BAD_FORMAT", "Unexpected JWT algorithm");
  }

  let payload: JwtPayload & { dest?: string; iss?: string; aud?: string; jti?: string };
  try {
    const verified = jwt.verify(token, apiSecret, {
      algorithms: ["HS256"],
      audience: apiKey,
      clockTolerance: clockToleranceSec,
    });
    payload = verified as JwtPayload & { dest?: string; iss?: string; aud?: string; jti?: string };
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") throw new SessionAuthError("EXPIRED", "Session token expired");
    if (err?.name === "JsonWebTokenError" && /audience/.test(err.message)) {
      throw new SessionAuthError("AUD_MISMATCH", "Audience mismatch");
    }
    throw new SessionAuthError("INVALID_SIG", "Invalid session token");
  }

  const shop =
    (payload.dest && normaliseShopFromUrl(payload.dest)) ||
    (payload.iss && normaliseShopFromUrl(payload.iss));

  if (!shop) throw new SessionAuthError("NO_SHOP", "No shop in token");

  if (payload.jti) onLog(`[shopify-session] jti=${payload.jti} shop=${shop}`);

  return { shop, payload };
}

/** Full HTTP guard: verifies token + header + host param */
export function requireSession(request: Request): VerifiedSession {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) throw new SessionAuthError("NO_TOKEN", "Missing Authorization header");
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) throw new SessionAuthError("BAD_FORMAT", "Expected Bearer token");

  const verified = verifySessionToken(m[1]);

  // 1) Cross-check Shopify’s authenticated shop header if present
  const hdrShop =
    request.headers.get("X-Shopify-Authenticated-Shop-Domain") ??
    request.headers.get("x-shopify-authenticated-shop-domain");
  if (hdrShop && hdrShop.toLowerCase() !== verified.shop) {
    throw new SessionAuthError(
      "HEADER_MISMATCH",
      `Header shop mismatch: ${hdrShop} !== ${verified.shop}`
    );
  }

  // 2) Cross-check the host query param if present
  const url = new URL(request.url);
  const hostParam = url.searchParams.get("host");
  const hostShop = decodeHostParam(hostParam);
  if (hostShop && hostShop !== verified.shop) {
    throw new SessionAuthError("HOST_MISMATCH", `Host param mismatch: ${hostShop} !== ${verified.shop}`);
  }

  return verified;
}
