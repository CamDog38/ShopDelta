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

export async function loader({ request }: LoaderFunctionArgs) {
  // Render the page; if a shop param is present, the client component will
  // perform a top-level redirect to avoid accounts.shopify.com within an iframe.
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const shop = String(form.get("shop") || "");
  const normalised = normaliseShop(shop);
  if (!normalised) {
    return json({ error: "Please enter a valid shop domain (e.g. example.myshopify.com)." }, { status: 400 });
  }
  throw redirect(`/auth?shop=${encodeURIComponent(normalised)}`);
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
        const target = `/auth?shop=${encodeURIComponent(normalised)}`;
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
