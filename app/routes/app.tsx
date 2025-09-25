import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { redirect } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { getPlan } from "../utils/plan.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Ensure OAuth always happens at the TOP level, not inside the embedded iframe.
  // If authenticate.admin throws a redirect Response to /auth, catch it and
  // return an HTML document that sets window.top.location to that URL.
  let session;
  try {
    ({ session } = await authenticate.admin(request));
  } catch (e: unknown) {
    if (e instanceof Response && e.status >= 300 && e.status < 400) {
      // Extract the redirect target from the Location header
      const location = e.headers.get("Location") || "/auth/login";
      const html = `<!DOCTYPE html>
<html>
  <head><meta charset=\"utf-8\"><title>Authorizing…</title></head>
  <body>
    <script>
      (function(){
        var url = ${JSON.stringify(location)};
        try {
          if (window.top) {
            window.top.location.href = url;
          } else {
            window.location.href = url;
          }
        } catch (err) {
          window.location.href = url;
        }
      })();
    </script>
    <noscript>
      JavaScript is required. <a href="${location}">Continue</a>
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

  // Redirect merchants without a stored plan to the plan chooser
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname.startsWith("/app") && pathname !== "/app/choose-plan") {
    const plan = await getPlan(session.shop);
    if (!plan) {
      throw redirect("/app/choose-plan");
    }
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/analytics">Analytics</Link>
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
