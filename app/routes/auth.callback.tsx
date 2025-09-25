import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Complete the OAuth flow
    const { session } = await authenticate.admin(request);
    
    const url = new URL(request.url);
    let host = url.searchParams.get("host");
    
    // If no host in callback, generate it from the authenticated shop
    if (!host && session?.shop) {
      host = Buffer.from(`${session.shop}/admin`).toString("base64");
      console.log(`[auth.callback] Generated host for ${session.shop}: ${host}`);
    }
    
    // Always redirect to app with host parameter
    if (host) {
      const targetUrl = `/app?host=${encodeURIComponent(host)}&shop=${encodeURIComponent(session.shop)}`;
      console.log(`[auth.callback] Redirecting to: ${targetUrl}`);
      return redirect(targetUrl, 302);
    }
    
    // Fallback: redirect to entry if we somehow don't have host
    console.warn(`[auth.callback] No host available, redirecting to entry`);
    return redirect("/entry", 302);
    
  } catch (error) {
    console.error("[auth.callback] Authentication failed:", error);
    
    // On auth failure, redirect to entry to restart the flow
    return redirect("/entry", 302);
  }
}
