import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  
  // Redirect to entry with parameters to restart auth flow at top level
  const params = new URLSearchParams();
  if (shop) params.set("shop", shop);
  if (host) params.set("host", host);
  
  const redirectUrl = `/entry?${params.toString()}`;
  
  // Return HTML that breaks out of iframe and redirects
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Redirecting...</title>
  </head>
  <body>
    <script>
      (function() {
        var url = ${JSON.stringify(redirectUrl)};
        try {
          if (window.top && window.top !== window) {
            window.top.location.href = url;
          } else {
            window.location.href = url;
          }
        } catch (err) {
          console.error('Iframe breakout failed:', err);
          window.location.href = url;
        }
      })();
    </script>
    <noscript>
      <p>JavaScript is required. <a href="${redirectUrl}">Continue</a></p>
    </noscript>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
