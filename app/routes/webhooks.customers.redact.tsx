import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { createGDPRResponse, verifyWebhookRequest } from "../utils/webhook-verification";

/**
 * GDPR Customer Redaction Webhook
 * 
 * This webhook is called when a customer requests data deletion (right to be forgotten).
 * Since ShopDelta doesn't store customer PII, we respond that no data needs to be deleted.
 * 
 * Required by Shopify for GDPR compliance.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // First verify HMAC signature
    const { isValid, rawBody } = await verifyWebhookRequest(request);
    
    if (!isValid) {
      console.error("Invalid HMAC signature for customers/redact webhook");
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
    console.log("Customer redaction payload:", JSON.stringify(payload, null, 2));

    // Log the request for audit purposes
    const customerId = payload.customer?.id;
    const customerEmail = payload.customer?.email;
    
    console.log(`GDPR Customer Redaction - Customer ID: ${customerId}, Email: ${customerEmail}, Shop: ${shop}`);

    // Since ShopDelta only processes analytics data and doesn't store customer PII,
    // there's no customer data to redact. However, we should log this for compliance.
    
    // If we stored any customer-related data in the future, we would delete it here:
    // - Remove any cached customer data
    // - Delete any customer-specific analytics records
    // - Clear any customer preferences or settings
    
    console.log(`Customer data redaction completed for customer ${customerId} in shop ${shop}`);

    return createGDPRResponse("No customer data retained. Nothing to delete.");
    
  } catch (error) {
    console.error("Error processing customers/redact webhook:", error);
    
    // Still return success to prevent Shopify retries for legitimate requests
    return createGDPRResponse("No customer data retained. Nothing to delete.");
  }
};
