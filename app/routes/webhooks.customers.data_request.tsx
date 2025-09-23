import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { createGDPRResponse, verifyWebhookRequest } from "../utils/webhook-verification";

/**
 * GDPR Data Request Webhook
 * 
 * This webhook is called when a customer requests their data.
 * Since ShopDelta doesn't store customer PII, we respond that no data is retained.
 * 
 * Required by Shopify for GDPR compliance.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // First verify HMAC signature
    const { isValid, rawBody } = await verifyWebhookRequest(request);
    
    if (!isValid) {
      console.error("Invalid HMAC signature for customers/data_request webhook");
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
    console.log("Customer data request payload:", JSON.stringify(payload, null, 2));

    // Log the request for audit purposes
    const customerId = payload.customer?.id;
    const customerEmail = payload.customer?.email;
    
    console.log(`GDPR Data Request - Customer ID: ${customerId}, Email: ${customerEmail}, Shop: ${shop}`);

    // Since ShopDelta only processes analytics data and doesn't store customer PII,
    // we respond that no customer data is retained
    return createGDPRResponse("No customer data retained. ShopDelta only processes anonymized analytics data.");
    
  } catch (error) {
    console.error("Error processing customers/data_request webhook:", error);
    
    // Still return success to prevent Shopify retries for legitimate requests
    return createGDPRResponse("No customer data retained. Nothing to delete.");
  }
};
