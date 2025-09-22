import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, BlockStack, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json({
    shop: session.shop,
    // The scopes granted to this session by Shopify
    grantedScopes: session.scope?.split(",") ?? [],
    // The scopes your server is requesting from .env
    requestedScopes: (process.env.SCOPES || "").split(",").map((s) => s.trim()).filter(Boolean),
    appUrl: process.env.SHOPIFY_APP_URL || "",
  });
};

export default function DebugScopes() {
  const data = useLoaderData<typeof loader>();
  return (
    <Page>
      <TitleBar title="Debug: Scopes" />
      <BlockStack gap="400">
        <Text as="p" variant="bodyMd">Shop: <code>{data.shop}</code></Text>
        <Text as="p" variant="bodyMd">App URL: <code>{data.appUrl}</code></Text>
        <Text as="h3" variant="headingMd">Requested scopes (.env SCOPES)</Text>
        <pre style={{margin:0}}><code>{JSON.stringify(data.requestedScopes)}</code></pre>
        <Text as="h3" variant="headingMd">Granted scopes (session.scope)</Text>
        <pre style={{margin:0}}><code>{JSON.stringify(data.grantedScopes)}</code></pre>
      </BlockStack>
    </Page>
  );
}
