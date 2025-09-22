import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Delete all sessions for this shop from Redis-backed storage (idempotent)
  try {
    // Available in @shopify/shopify-app-session-storage v3+; for older versions this is a no-op
    // @ts-ignore
    if (typeof (sessionStorage as any).deleteShopSessions === "function") {
      // @ts-ignore
      await (sessionStorage as any).deleteShopSessions(shop);
    }
  } catch (e) {
    console.warn("Failed to delete shop sessions on uninstall:", e);
  }

  return new Response();
};
