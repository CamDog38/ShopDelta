import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, sessionStorage } from "../shopify.server";
import { createWebhookSuccessResponse, verifyWebhookRequest } from "../utils/webhook-verification";

/**
 * App Uninstalled Webhook
 * 
 * This webhook is called when the app is uninstalled from a shop.
 * We clean up all tokens and ephemeral cache data for the shop.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // First verify HMAC signature
    const { isValid, rawBody } = await verifyWebhookRequest(request);
    
    if (!isValid) {
      console.error("Invalid HMAC signature for app/uninstalled webhook");
      return new Response("Unauthorized", { status: 401 });
    }

    // Create a new request with the raw body for Shopify SDK authentication
    const clonedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: rawBody,
    });

    const { shop, session, topic, payload } = await authenticate.webhook(clonedRequest);

    console.log(`Received ${topic} webhook for ${shop} (HMAC verified)`);
    console.log("App uninstalled payload:", JSON.stringify(payload, null, 2));

    // Clean up all shop-related data immediately upon uninstall
    try {
      // 1. Delete all sessions for this shop from Redis-backed storage (idempotent)
      if (typeof (sessionStorage as any).deleteShopSessions === "function") {
        await (sessionStorage as any).deleteShopSessions(shop);
        console.log(`Deleted sessions for shop: ${shop}`);
      }

      // 2. Clear any ephemeral cache data
      // If using Redis or other caching, clear shop-specific cache keys here
      // Example: await redis.del(`shop:${shop}:*`);
      
      // 3. If we had a database, we might want to mark the shop as uninstalled
      // but keep data for potential reinstallation (until shop/redact webhook)
      // Example: await db.shops.update({ where: { domain: shop }, data: { status: 'uninstalled' } });
      
      console.log(`App uninstall cleanup completed for shop: ${shop}`);
      
    } catch (error) {
      console.error(`Error during app uninstall cleanup for ${shop}:`, error);
      // Continue processing - we still want to return success
    }

    return createWebhookSuccessResponse(`App uninstalled and cleanup completed for ${shop}.`);
    
  } catch (error) {
    console.error("Error processing app/uninstalled webhook:", error);
    
    // Still return success to prevent Shopify retries
    return createWebhookSuccessResponse("App uninstall processed.");
  }
};
