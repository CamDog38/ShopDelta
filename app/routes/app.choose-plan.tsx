import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useNavigation, Form } from "@remix-run/react";
import { Page, Layout, Card, Text, Button, InlineStack, BlockStack, Badge } from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { setPlan } from "../utils/plan.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Must be an authenticated admin to choose a plan
  await authenticate.admin(request);
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = String(formData.get("plan") || "");

  if (plan === "free") {
    await setPlan(session.shop, "free");
    throw redirect("/app");
  }

  return json({ error: "Paid plans require a subscription. Please choose Free for now." }, { status: 400 });
}

export default function ChoosePlan() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <Page title="Choose your plan">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="p" variant="bodyMd">
                Please select a plan to continue. You can start on the Free plan and upgrade later.
              </Text>
              {actionData && (actionData as any).error ? (
                <Text as="p" tone="critical">{(actionData as any).error}</Text>
              ) : null}

              <InlineStack gap="400" wrap>
                <Card roundedAbove="sm">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg">Free</Text>
                    <Text as="p" variant="bodyMd">£0 per month</Text>
                    <Badge tone="success">No trial</Badge>
                    <Text as="p" variant="bodyMd">Feature limits apply. No billing required.</Text>
                    <Form method="post">
                      <input type="hidden" name="plan" value="free" />
                      <Button submit loading={submitting} variant="primary">Choose Free</Button>
                    </Form>
                  </BlockStack>
                </Card>

                <Card roundedAbove="sm">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg">Starter</Text>
                    <Text as="p" variant="bodyMd">Paid</Text>
                    <Text as="p" variant="bodyMd">Additional features. Subscription required.</Text>
                    <Button disabled>Coming soon</Button>
                  </BlockStack>
                </Card>

                <Card roundedAbove="sm">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg">Pro</Text>
                    <Text as="p" variant="bodyMd">Paid</Text>
                    <Text as="p" variant="bodyMd">Full features. Subscription required.</Text>
                    <Button disabled>Coming soon</Button>
                  </BlockStack>
                </Card>
              </InlineStack>

              <Text as="p" variant="bodySm" tone="subdued">
                Free to install with optional paid plans (Starter, Pro). Zero data retention. All requests are HMAC verified.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
