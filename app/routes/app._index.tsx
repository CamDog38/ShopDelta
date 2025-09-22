import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Text, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppIndex() {
  return (
    <Page>
      <TitleBar title="Hello World" />
      <BlockStack gap="400">
        <Text as="p" variant="bodyMd">
          Your embedded Shopify app home is working.
        </Text>
      </BlockStack>
    </Page>
  );
}
