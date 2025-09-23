import crypto from "crypto";

/**
 * Extract raw body from Remix request for HMAC verification
 * @param request - Remix request object
 * @returns Promise<string> - Raw body as string
 */
export async function getRawBody(request: Request): Promise<string> {
  const body = await request.text();
  return body;
}

/**
 * Verify Shopify webhook HMAC signature
 * @param rawBody - Raw request body as string
 * @param signature - HMAC signature from X-Shopify-Hmac-Sha256 header
 * @param secret - Webhook secret from environment
 * @returns boolean indicating if signature is valid
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    console.error("Missing signature or secret for webhook verification");
    return false;
  }

  try {
    // Remove 'sha256=' prefix if present
    const cleanSignature = signature.replace(/^sha256=/, '');
    
    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');

    // Use timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(cleanSignature, 'base64'),
      Buffer.from(expectedSignature, 'base64')
    );

    if (!isValid) {
      console.error("Webhook HMAC verification failed");
    }

    return isValid;
  } catch (error) {
    console.error("Error during HMAC verification:", error);
    return false;
  }
}

/**
 * Verify webhook request with proper HMAC validation
 * @param request - Remix request object
 * @returns Promise<{isValid: boolean, rawBody: string}> - Verification result and raw body
 */
export async function verifyWebhookRequest(request: Request): Promise<{
  isValid: boolean;
  rawBody: string;
}> {
  const rawBody = await getRawBody(request);
  const signature = request.headers.get('X-Shopify-Hmac-Sha256');
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET;

  if (!secret) {
    console.error("Missing SHOPIFY_WEBHOOK_SECRET or SHOPIFY_API_SECRET environment variable");
    return { isValid: false, rawBody };
  }

  const isValid = signature ? verifyWebhookSignature(rawBody, signature, secret) : false;
  
  return { isValid, rawBody };
}

/**
 * Standard GDPR compliance response for webhooks
 */
export function createGDPRResponse(message: string = "No customer data retained. Nothing to delete.") {
  return new Response(
    JSON.stringify({
      status: "ok",
      message
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

/**
 * Standard success response for webhooks
 */
export function createWebhookSuccessResponse(message: string = "Webhook processed successfully") {
  return new Response(
    JSON.stringify({
      status: "ok",
      message
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
