import createApp, { ClientApplication } from "@shopify/app-bridge";
import { Redirect } from "@shopify/app-bridge/actions";
import { getSessionToken } from "@shopify/app-bridge-utils";

const SHOP_SUFFIX = ".myshopify.com";
let _app: ClientApplication<any> | null = null;
let _tokenPromise: Promise<string> | null = null;

// -- Host helpers -------------------------------------------------------------

export function decodeHost(hostParam?: string | null): string | null {
  if (!hostParam) return null;
  try {
    const decoded = atob(hostParam); // "{shop}.myshopify.com/admin"
    const u = new URL(`https://${decoded}`);
    const host = u.host.toLowerCase();
    return host.endsWith(SHOP_SUFFIX) ? host : null;
  } catch {
    return null;
  }
}

export function ensureHostInUrl(): { host: string; shop: string } {
  const url = new URL(window.location.href);
  let hostParam = url.searchParams.get("host");
  let host = decodeHost(hostParam);

  if (!host) {
    // Try recover from storage
    const cached = sessionStorage.getItem("shopify_host_b64");
    host = decodeHost(cached);
    if (host && !hostParam) {
      url.searchParams.set("host", cached!);
      history.replaceState(null, "", url.toString());
      hostParam = cached!;
    }
  }

  if (!host || !hostParam) {
    // Last resort: break out to your /auth to re-init
    // Caller should catch and avoid rendering the app shell.
    throw new Error("Missing or invalid host param; need top-level auth");
  }

  sessionStorage.setItem("shopify_host_b64", hostParam);
  return { host, shop: host };
}

// -- App Bridge ---------------------------------------------------------------

export function getAppBridge(apiKey: string): ClientApplication<any> {
  if (_app) return _app;
  const { host } = ensureHostInUrl();
  const hostParam = new URLSearchParams(location.search).get("host")!;
  _app = createApp({ apiKey, host: hostParam, forceRedirect: true });
  return _app!;
}

export function forceTopLevelAuth(app: ClientApplication<any>, shop: string) {
  const redirect = Redirect.create(app);
  redirect.dispatch(Redirect.Action.REMOTE, `/auth?shop=${shop}`);
}

// -- Token fetch with de-dupe -------------------------------------------------

async function getFreshToken(app: ClientApplication<any>): Promise<string> {
  if (_tokenPromise) return _tokenPromise;
  _tokenPromise = getSessionToken(app).finally(() => (_tokenPromise = null));
  return _tokenPromise;
}

// -- Authed fetch -------------------------------------------------------------

export async function authedFetch(
  app: ClientApplication<any>,
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const { shop } = ensureHostInUrl();
  const doFetch = async (): Promise<Response> => {
    const token = await getFreshToken(app);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Shopify-Shop-Domain", shop);
    headers.set("Cache-Control", "no-store");
    return fetch(input, { ...init, headers, credentials: "omit" });
  };

  // First attempt
  let res = await doFetch();

  // If server says token is bad/expired, retry once with a new token
  if (res.status === 401) {
    const www = res.headers.get("www-authenticate") || "";
    const invalid = /error="?invalid_token"?/i.test(www);
    if (invalid) {
      // Clear cached token to force fresh token on retry
      _tokenPromise = null;
      res = await doFetch();
      if (res.status === 401) {
        // Final fallback: top-level auth
        forceTopLevelAuth(app, shop);
      }
    }
  }

  return res;
}

// -- Utilities ----------------------------------------------------------------

// Keep host/shop on internal navigations (call once on boot)
export function preserveShopParamsOnClicks() {
  const params = new URLSearchParams(location.search);
  const host = params.get("host");
  const shop = params.get("shop"); // optional if you carry it

  if (!host && !shop) return;

  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.origin);
    if (url.origin !== location.origin) return;
    if (host && !url.searchParams.get("host")) url.searchParams.set("host", host);
    if (shop && !url.searchParams.get("shop")) url.searchParams.set("shop", shop);
    a.href = url.toString();
  });
}

// Derive shop from host param if you need the string
export function shopFromHostB64(hostB64: string): string {
  const host = decodeHost(hostB64);
  if (!host) throw new Error("Invalid host param");
  return host;
}
