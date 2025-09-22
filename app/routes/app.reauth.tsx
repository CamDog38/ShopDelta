import type { LoaderFunctionArgs } from "@remix-run/node";

// This route forces a TOP-LEVEL redirect to the app's auth flow.
// It reads ?shop=, ?host=, and optional ?reinstall=1 from the query string
// and constructs the correct /auth URL. We respond with minimal HTML that
// navigates window.top to avoid being blocked inside the embedded iframe.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const reinstall = url.searchParams.get("reinstall");

  // Build the absolute auth URL on the APP origin, not the Admin origin
  let target = `${origin}/auth/login`;
  if (shop) {
    const params = new URLSearchParams();
    params.set("shop", shop);
    if (reinstall) params.set("reinstall", reinstall);
    if (host) params.set("host", host);
    target = `${origin}/auth?${params.toString()}`;
  }

  const html = `<!DOCTYPE html>
<html>
  <head><meta charset=\"utf-8\"><title>Reauthorizing…</title></head>
  <body>
    <script>
      (function(){
        var url = ${JSON.stringify(target)};
        try {
          if (window.top) {
            window.top.location.href = url;
          } else {
            window.location.href = url;
          }
        } catch (e) {
          window.location.href = url;
        }
      })();
    </script>
    <noscript>
      JavaScript is required. <a href="${target}">Continue</a>
    </noscript>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
};
