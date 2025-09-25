import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const shop = url.searchParams.get("shop");

  console.log(`[entry] host=${host}, shop=${shop}`);

  // Case A: Already embedded (has host) → go to app shell
  if (host) {
    console.log(`[entry] Redirecting to app with host: ${host}`);
    return redirect(`/app?host=${encodeURIComponent(host)}`, 302);
  }

  // Case B: Deep link with shop only → start top-level OAuth to get host
  if (shop) {
    const normalizedShop = shop.toLowerCase().replace(/^https?:\/\//, '');
    console.log(`[entry] Starting OAuth for shop: ${normalizedShop}`);
    return redirect(`/auth?shop=${encodeURIComponent(normalizedShop)}`, 302);
  }

  // Case C: Nothing → show safe button that ALWAYS yields host
  // This ensures users always access through Shopify Admin
  const adminLink = `https://admin.shopify.com/store/{store-handle}/apps/shopdelta`;
  
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ShopDelta - Access Required</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 500px;
        margin: 100px auto;
        padding: 40px 20px;
        text-align: center;
        background: #f6f6f7;
        color: #202223;
      }
      .card {
        background: white;
        border-radius: 12px;
        padding: 40px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .logo {
        width: 60px;
        height: 60px;
        background: #5c6ac4;
        border-radius: 12px;
        margin: 0 auto 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 24px;
      }
      h1 {
        margin: 0 0 16px;
        font-size: 24px;
        font-weight: 600;
      }
      p {
        margin: 0 0 24px;
        color: #6d7175;
        line-height: 1.5;
      }
      .btn {
        display: inline-block;
        background: #008060;
        color: white;
        padding: 12px 24px;
        border-radius: 6px;
        text-decoration: none;
        font-weight: 500;
        transition: background 0.2s;
      }
      .btn:hover {
        background: #006b4f;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="logo">SD</div>
      <h1>ShopDelta</h1>
      <p>Please access this app through your Shopify Admin to continue.</p>
      <p style="font-size: 14px;">If you're a merchant, open the app from your Shopify Admin dashboard.</p>
      <a href="${adminLink}" class="btn">Open in Shopify Admin</a>
    </div>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
