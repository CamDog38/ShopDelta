import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { redirect } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import React from "react";

import { authenticate } from "../shopify.server";
import { getPlan } from "../utils/plan.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const search = new URLSearchParams(url.search);
  const host = search.get("host");
  
  // Helper function for top-level redirects that preserve embedding
  function topLevelRedirect(to: string, origin: string) {
    const url = new URL(to, origin).toString();
    const html = `<!DOCTYPE html><html><body>
<script>
  (function(u){ try { (window.top && window.top!==window ? window.top : window).location.href = u; } catch(_) { location.href = u; } })(${JSON.stringify(url)});
</script>
<noscript><a href="${url}">Continue</a></noscript>
</body></html>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" }});
  }

  // If no host parameter, redirect to auth at top level (preserves embedding)
  if (!host) {
    console.log("[app] No host parameter, redirecting to auth at top level");
    return topLevelRedirect("/auth/login", url.origin);
  }

  // Ensure OAuth always happens at the TOP level, not inside the embedded iframe.
  let session;
  try {
    ({ session } = await authenticate.admin(request));
  } catch (e: unknown) {
    if (e instanceof Response && e.status >= 300 && e.status < 400) {
      // Extract the redirect target and preserve host parameter
      const location = e.headers.get("Location") || "/auth/login";
      const authUrl = new URL(location, url.origin);
      
      // Preserve host and shop in auth redirect
      if (host) authUrl.searchParams.set("host", host);
      if (session?.shop) authUrl.searchParams.set("shop", session.shop);
      
      const html = `<!DOCTYPE html>
<html>
  <head><meta charset=\"utf-8\"><title>Authorizing…</title></head>
  <body>
    <script>
      (function(){
        var url = ${JSON.stringify(authUrl.toString())};
        try {
          if (window.top && window.top !== window) {
            window.top.location.href = url;
          } else {
            window.location.href = url;
          }
        } catch (err) {
          console.error('Auth redirect failed:', err);
          window.location.href = url;
        }
      })();
    </script>
    <noscript>
      JavaScript is required. <a href="${authUrl.toString()}">Continue</a>
    </noscript>
  </body>
</html>`;
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    throw e;
  }

  // If shop param is missing, append it from the authenticated session and reload same URL
  if (!search.get("shop")) {
    try {
      const { session } = await authenticate.admin(request);
      if (session?.shop) {
        search.set("shop", session.shop);
        throw redirect(`${url.pathname}?${search.toString()}`);
      }
    } catch (e) {
      // fall through; authenticate.admin may redirect and be handled below
    }
  }

  // Validate host parameter matches authenticated session
  try {
    const hostDecoded = Buffer.from(host, 'base64').toString();
    const expectedHost = `${session.shop}/admin`;
    
    if (hostDecoded !== expectedHost) {
      console.warn(`[app] Host mismatch: ${hostDecoded} !== ${expectedHost}`);
      // Redirect to auth at top level (preserves embedding)
      return topLevelRedirect("/auth/login", url.origin);
    }
  } catch (err) {
    console.error("[app] Invalid host parameter:", err);
    // Redirect to auth at top level (preserves embedding)
    return topLevelRedirect("/auth/login", url.origin);
  }

  const pathname = url.pathname;

  // Redirect merchants without a stored plan to the plan chooser
  if (pathname.startsWith("/app") && pathname !== "/app/choose-plan") {
    const plan = await getPlan(session.shop);
    if (!plan) {
      // Preserve host in plan chooser redirect
      const planUrl = `/app/choose-plan?host=${encodeURIComponent(host)}`;
      throw redirect(planUrl);
    }
  }

  return { 
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    host: host
  };
};

export default function App() {
  const { apiKey, shop, host } = useLoaderData<typeof loader>();

  // Initialize host preservation on mount
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      // Import and initialize the host preservation utility
      import('../utils/app-bridge.client').then(({ preserveShopParamsOnClicks }) => {
        preserveShopParamsOnClicks();
      });
    }
  }, []);

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {/* App Bridge React NavMenu renders left in-app navigation */}
      <NavMenu>
        <a rel="home" href="/app">Home</a>
        <a href="/app/analytics">Analytics</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
