import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation, useSearchParams } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Button, TextField } from "@shopify/polaris";
import { useEffect, useState } from "react";

function normaliseShop(shop: string): string | null {
  let s = shop.trim().toLowerCase();
  if (!s) return null;
  // Allow either full domain or just the prefix
  if (!s.endsWith(".myshopify.com")) {
    s = `${s}.myshopify.com`;
  }
  const valid = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s);
  return valid ? s : null;
}

// Build Shopify Admin install deep link for a cleaner UX
// Values derived from shopify.app.toml
const CLIENT_ID = "1bfb615d6837e45ae34fb39a820c62ca";
const REDIRECT_URI = encodeURIComponent("https://shopdelta.vercel.app/auth/callback");
const SCOPES = encodeURIComponent("read_orders,read_all_orders,write_products");

function buildAdminInstallUrl(shopDomain: string) {
  return `https://${shopDomain}/admin/oauth/install?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPES}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  // If a shop param is present, we can 302 directly on the server to the Admin install link
  // to avoid rendering the page at all.
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const normalised = shopParam ? normaliseShop(shopParam) : null;
  if (normalised) {
    const target = buildAdminInstallUrl(normalised);
    // Use a 302 server redirect for the cleanest hop
    throw redirect(target);
  }
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const shop = String(form.get("shop") || "");
  const normalised = normaliseShop(shop);
  if (!normalised) {
    return json({ error: "Please enter a valid shop domain (e.g. example.myshopify.com)." }, { status: 400 });
  }
  // Deep link straight to Shopify Admin install flow
  const target = buildAdminInstallUrl(normalised);
  throw redirect(target);
}

export default function ConnectShop() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const [params] = useSearchParams();
  const [shop, setShop] = useState("");
  const submitting = nav.state === "submitting";

  // If a shop param is present, perform a TOP-LEVEL redirect to start OAuth.
  useEffect(() => {
    const p = params.get("shop");
    if (p) {
      const normalised = normaliseShop(p);
      if (normalised) {
        const target = buildAdminInstallUrl(normalised);
        if (typeof window !== "undefined") {
          // Ensure redirect happens at the top window, not the Admin iframe.
          (window.top || window).location.href = target;
        }
      }
    }
  }, [params]);

  return (
    <Page title="Connect your shop">
      <Card>
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Enter your Shopify shop domain to continue with secure authorisation.
          </Text>
          {actionData && (actionData as any).error ? (
            <Text as="p" tone="critical">{(actionData as any).error}</Text>
          ) : null}
          <Form method="post" target="_top">
            <BlockStack gap="300">
              <TextField
                label="Shop domain"
                name="shop"
                value={shop}
                onChange={setShop}
                placeholder="example.myshopify.com"
                autoComplete="off"
              />
              <Button submit variant="primary" loading={submitting}>Continue</Button>
            </BlockStack>
          </Form>
        </BlockStack>
      </Card>
    </Page>
  );
}
