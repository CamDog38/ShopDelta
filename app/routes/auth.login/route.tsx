import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { login } from "../../shopify.server";

import { loginErrorMessage } from "./error.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const hostParam = url.searchParams.get("host");

  // Helper: send a top-level redirect to keep embedding
  const topLevelRedirect = (to: string) => {
    const abs = new URL(to, url.origin).toString();
    const html = `<!DOCTYPE html><html><body>
<script>
  (function(u){ try { (window.top && window.top!==window ? window.top : window).location.href = u; } catch(_) { location.href = u; } })(${JSON.stringify(abs)});
</script>
<noscript><a href="${abs}">Continue</a></noscript>
</body></html>`;
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  };

  // If shop is already present, jump straight to /auth at the top level
  if (shopParam) {
    return topLevelRedirect(`/auth?shop=${encodeURIComponent(shopParam)}`);
  }

  // If host is present, try to derive the shop domain from it
  if (hostParam) {
    try {
      const decoded = Buffer.from(hostParam, "base64").toString();
      let shopFromHost: string | null = null;

      if (decoded.includes("admin.shopify.com")) {
        // admin.shopify.com/store/<handle>
        const m = decoded.match(/admin\.shopify\.com\/store\/([^/?#]+)/i);
        if (m && m[1]) shopFromHost = `${m[1]}.myshopify.com`;
      } else if (decoded.includes(".myshopify.com")) {
        const m = decoded.match(/([a-z0-9-]+)\.myshopify\.com/i);
        if (m && m[1]) shopFromHost = `${m[1]}.myshopify.com`;
      }

      if (shopFromHost) {
        return topLevelRedirect(`/auth?shop=${encodeURIComponent(shopFromHost)}`);
      }
    } catch (_) {
      // Fall through to showing the manual form
    }
  }

  // Default: show the manual login form
  const errors = loginErrorMessage(await login(request));
  return { errors, polarisTranslations };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;
  const fallbackHref = `/app/connect${shop ? `?shop=${encodeURIComponent(shop)}` : ""}`;

  return (
    <PolarisAppProvider i18n={loaderData.polarisTranslations}>
      <Page>
        <Card>
          {/* Force OAuth to occur at the TOP level to avoid iframe blocking by accounts.shopify.com */}
          <Form
            method="post"
            onSubmit={(e) => {
              try {
                // Prevent in-iframe form post; send the top window to /auth?shop=...
                e.preventDefault();
                const params = new URLSearchParams();
                if (shop) params.set("shop", shop);
                const target = `/auth?${params.toString()}`;
                if (window.top) {
                  (window.top as Window).location.href = target;
                } else {
                  window.location.href = target;
                }
              } catch (_) {
                // Fallback in case of any runtime issues
                const target = `/auth?shop=${encodeURIComponent(shop)}`;
                window.location.href = target;
              }
            }}
          >
            <FormLayout>
              <Text variant="headingMd" as="h2">
                Log in
              </Text>
              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="example.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="on"
                error={errors.shop}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <Button submit>Log in</Button>
                <Button
                  onClick={() => {
                    const target = fallbackHref;
                    try {
                      if (window.top) {
                        (window.top as Window).location.href = target;
                      } else {
                        window.location.href = target;
                      }
                    } catch (_) {
                      window.location.href = target;
                    }
                  }}
                >
                  Use fallback connect
                </Button>
              </div>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
