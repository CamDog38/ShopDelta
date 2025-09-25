import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireSession, toUnauthorizedResponse, SessionAuthError } from "../utils/session-token.server";

// Example protected API route that uses session token validation
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { shop, payload } = requireSession(request);
    
    return json({
      success: true,
      shop,
      message: "Successfully authenticated with session token",
      tokenInfo: {
        aud: payload.aud,
        iss: payload.iss,
        exp: payload.exp,
        iat: payload.iat,
      }
    });
    
  } catch (err) {
    if (err instanceof SessionAuthError) {
      throw toUnauthorizedResponse(err);
    }
    
    console.error("[api.protected] Unexpected error:", err);
    throw new Response("Internal Server Error", { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { shop, payload } = requireSession(request);
    
    // Your protected API logic here
    const data = await request.json();
    
    return json({
      success: true,
      shop,
      message: "Action completed successfully",
      receivedData: data,
    });
    
  } catch (err) {
    if (err instanceof SessionAuthError) {
      throw toUnauthorizedResponse(err);
    }
    
    console.error("[api.protected] Action error:", err);
    throw new Response("Internal Server Error", { status: 500 });
  }
}
