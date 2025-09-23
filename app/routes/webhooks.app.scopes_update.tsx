import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { createWebhookSuccessResponse, verifyWebhookRequest } from "../utils/webhook-verification";

/**
 * App Scopes Update Webhook
 * 
 * This webhook is called when the app's access scopes are updated.
 * The Shopify SDK automatically handles session scope updates with Redis storage.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // First verify HMAC signature
    const { isValid, rawBody } = await verifyWebhookRequest(request);
    
    if (!isValid) {
      console.error("Invalid HMAC signature for app/scopes_update webhook");
      return new Response("Unauthorized", { status: 401 });
    }

    // Create a new request with the raw body for Shopify SDK authentication
    const clonedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: rawBody,
    });

    const { payload, session, topic, shop } = await authenticate.webhook(clonedRequest);
    
    console.log(`Received ${topic} webhook for ${shop} (HMAC verified)`);
    console.log("Scopes update payload:", JSON.stringify(payload, null, 2));

    // Log the scope changes for audit purposes
    const newScopes = payload.api_client_scopes;
    console.log(`App scopes updated for shop ${shop}. New scopes:`, newScopes);

    // With Redis session storage, Shopify SDK automatically manages session scopes.
    // No manual database update is required here.
    
    // If we needed to perform additional actions on scope changes:
    // - Update any cached permissions
    // - Notify the shop owner of scope changes
    // - Update any feature flags based on new scopes
    
    return createWebhookSuccessResponse(`Scopes updated successfully for ${shop}.`);
    
  } catch (error) {
    console.error("Error processing app/scopes_update webhook:", error);
    
    // Still return success to prevent Shopify retries
    return createWebhookSuccessResponse("Scopes update processed.");
  }
};
