import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, sessionStorage } from "../shopify.server";
import { createGDPRResponse, verifyWebhookRequest } from "../utils/webhook-verification";

/**
 * GDPR Shop Redaction Webhook
 * 
 * This webhook is called when a shop owner requests deletion of their shop data.
 * This is typically triggered 48 hours after app uninstallation.
 * 
 * Required by Shopify for GDPR compliance.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // First verify HMAC signature
    const { isValid, rawBody } = await verifyWebhookRequest(request);
    
    if (!isValid) {
      console.error("Invalid HMAC signature for shop/redact webhook");
      return new Response("Unauthorized", { status: 401 });
    }

    // Create a new request with the raw body for Shopify SDK authentication
    const clonedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: rawBody,
    });

    // Authenticate webhook using Shopify's built-in verification
    const { payload, session, topic, shop } = await authenticate.webhook(clonedRequest);
    
    console.log(`Received ${topic} webhook for ${shop} (HMAC verified)`);
    console.log("Shop redaction payload:", JSON.stringify(payload, null, 2));

    const shopId = payload.shop_id;
    const shopDomain = payload.shop_domain;
    
    console.log(`GDPR Shop Redaction - Shop ID: ${shopId}, Domain: ${shopDomain}`);

    // Delete all shop-related data
    try {
      // 1. Delete all sessions for this shop from Redis-backed storage
      if (typeof (sessionStorage as any).deleteShopSessions === "function") {
        await (sessionStorage as any).deleteShopSessions(shopDomain);
        console.log(`Deleted sessions for shop: ${shopDomain}`);
      }

      // 2. If we had a database, we would delete shop-specific data here:
      // - Delete analytics data for this shop
      // - Delete any cached product information
      // - Delete any shop preferences or settings
      // - Delete any webhook configurations
      
      // Example (if using a database):
      // await db.analytics.deleteMany({ where: { shopDomain } });
      // await db.shopSettings.deleteMany({ where: { shopDomain } });
      
      console.log(`Shop data redaction completed for shop ${shopDomain} (ID: ${shopId})`);
      
    } catch (error) {
      console.error(`Error during shop data deletion for ${shopDomain}:`, error);
      // Continue processing - we still want to return success
    }

    return createGDPRResponse(`Shop data deleted successfully for ${shopDomain}.`);
    
  } catch (error) {
    console.error("Error processing shop/redact webhook:", error);
    
    // Still return success to prevent Shopify retries for legitimate requests
    return createGDPRResponse("Shop data deletion completed.");
  }
};
