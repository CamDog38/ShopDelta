import type { LoaderFunctionArgs } from "@remix-run/node";

// Embedded fallback: when opened inside Admin, this route will top-level
// redirect the browser to the public /connect flow so OAuth can start cleanly.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  const params = new URLSearchParams();
  if (shop) params.set("shop", shop);
  if (host) params.set("host", host);

  const target = `${origin}/connect${params.toString() ? `?${params.toString()}` : ""}`;

  const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Connecting…</title></head>
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
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
