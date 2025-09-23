import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Text, BlockStack, Card } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function PrivacyPolicy() {
  return (
    <Page>
      <TitleBar title="Privacy Policy" />
      <BlockStack gap="600">
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          padding: '32px', 
          borderRadius: '12px', 
          color: 'white',
          textAlign: 'center'
        }}>
          <div style={{ color: 'white', marginBottom: '8px' }}>
            <Text as="h1" variant="heading2xl">Privacy Policy</Text>
          </div>
          <div style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
            <Text as="p" variant="bodyLg">How ShopDelta Analytics protects and uses your data</Text>
          </div>
          <div style={{ color: 'rgba(255, 255, 255, 0.8)', marginTop: '8px' }}>
            <Text as="p" variant="bodySm">Last updated: {new Date().toLocaleDateString()}</Text>
          </div>
        </div>

        {/* Introduction */}
        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text as="h2" variant="headingLg">Introduction</Text>
            </div>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                ShopDelta Analytics ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Shopify application.
              </Text>
              <Text as="p" variant="bodyMd">
                By installing and using ShopDelta Analytics, you agree to the collection and use of information in accordance with this policy.
              </Text>
            </BlockStack>
          </div>
        </Card>

        {/* Information We Collect */}
        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text as="h2" variant="headingLg">Information We Collect</Text>
            </div>
            <BlockStack gap="400">
              <div>
                <div style={{ marginBottom: '8px' }}>
                  <Text as="h3" variant="headingMd">Store Data</Text>
                </div>
                <Text as="p" variant="bodyMd">
                  We access and process the following data from your Shopify store through the Shopify Admin API:
                </Text>
                <div style={{ marginTop: '12px', paddingLeft: '16px' }}>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    <li><Text as="span" variant="bodyMd">Order information (order dates, quantities, amounts)</Text></li>
                    <li><Text as="span" variant="bodyMd">Product information (names, SKUs, prices)</Text></li>
                    <li><Text as="span" variant="bodyMd">Line item details for analytics calculations</Text></li>
                    <li><Text as="span" variant="bodyMd">Store metadata (shop domain, currency)</Text></li>
                  </ul>
                </div>
              </div>

              <div>
                <div style={{ marginBottom: '8px' }}>
                  <Text as="h3" variant="headingMd">Usage Data</Text>
                </div>
                <Text as="p" variant="bodyMd">
                  We may collect information about how you interact with our app, including:
                </Text>
                <div style={{ marginTop: '12px', paddingLeft: '16px' }}>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    <li><Text as="span" variant="bodyMd">App usage patterns and feature utilization</Text></li>
                    <li><Text as="span" variant="bodyMd">Error logs and performance metrics</Text></li>
                    <li><Text as="span" variant="bodyMd">Session information for authentication</Text></li>
                  </ul>
                </div>
              </div>
            </BlockStack>
          </div>
        </Card>

        {/* How We Use Information */}
        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text as="h2" variant="headingLg">How We Use Your Information</Text>
            </div>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                We use the collected information for the following purposes:
              </Text>
              <div style={{ paddingLeft: '16px' }}>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  <li><Text as="span" variant="bodyMd">To provide analytics and reporting services</Text></li>
                  <li><Text as="span" variant="bodyMd">To generate sales insights and performance metrics</Text></li>
                  <li><Text as="span" variant="bodyMd">To create comparison reports (Month-over-Month, Year-over-Year)</Text></li>
                  <li><Text as="span" variant="bodyMd">To export data in Excel format when requested</Text></li>
                  <li><Text as="span" variant="bodyMd">To improve our app's functionality and user experience</Text></li>
                  <li><Text as="span" variant="bodyMd">To provide customer support and technical assistance</Text></li>
                </ul>
              </div>
            </BlockStack>
          </div>
        </Card>

        {/* Data Storage and Security */}
        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text as="h2" variant="headingLg">Data Storage and Security</Text>
            </div>
            <BlockStack gap="300">
              <div>
                <div style={{ marginBottom: '8px' }}>
                  <Text as="h3" variant="headingMd">Data Processing</Text>
                </div>
                <Text as="p" variant="bodyMd">
                  Your store data is processed in real-time to generate analytics. We do not permanently store your sensitive business data on our servers.
                </Text>
              </div>

              <div>
                <div style={{ marginBottom: '8px' }}>
                  <Text as="h3" variant="headingMd">Session Storage</Text>
                </div>
                <Text as="p" variant="bodyMd">
                  We use Redis for secure session storage to maintain your authentication state while using the app.
                </Text>
              </div>

              <div>
                <div style={{ marginBottom: '8px' }}>
                  <Text as="h3" variant="headingMd">Security Measures</Text>
                </div>
                <Text as="p" variant="bodyMd">
                  We implement industry-standard security measures including:
                </Text>
                <div style={{ marginTop: '12px', paddingLeft: '16px' }}>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    <li><Text as="span" variant="bodyMd">HTTPS encryption for all data transmission</Text></li>
                    <li><Text as="span" variant="bodyMd">Shopify OAuth 2.0 authentication</Text></li>
                    <li><Text as="span" variant="bodyMd">Secure API access tokens with limited scope</Text></li>
                    <li><Text as="span" variant="bodyMd">Regular security updates and monitoring</Text></li>
                  </ul>
                </div>
              </div>
            </BlockStack>
          </div>
        </Card>

        {/* Data Sharing */}
        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text as="h2" variant="headingLg">Data Sharing and Disclosure</Text>
            </div>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                We do not sell, trade, or otherwise transfer your personal or business data to third parties. Your data may only be disclosed in the following limited circumstances:
              </Text>
              <div style={{ paddingLeft: '16px' }}>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  <li><Text as="span" variant="bodyMd">When required by law or legal process</Text></li>
                  <li><Text as="span" variant="bodyMd">To protect our rights, property, or safety</Text></li>
                  <li><Text as="span" variant="bodyMd">With your explicit consent</Text></li>
                  <li><Text as="span" variant="bodyMd">To trusted service providers who assist in app operation (under strict confidentiality agreements)</Text></li>
                </ul>
              </div>
            </BlockStack>
          </div>
        </Card>

        {/* Your Rights */}
        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text as="h2" variant="headingLg">Your Rights and Choices</Text>
            </div>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                You have the following rights regarding your data:
              </Text>
              <div style={{ paddingLeft: '16px' }}>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  <li><Text as="span" variant="bodyMd"><strong>Access:</strong> You can access your data through the app interface</Text></li>
                  <li><Text as="span" variant="bodyMd"><strong>Export:</strong> You can export your analytics data in Excel format</Text></li>
                  <li><Text as="span" variant="bodyMd"><strong>Deletion:</strong> You can uninstall the app to revoke data access</Text></li>
                  <li><Text as="span" variant="bodyMd"><strong>Correction:</strong> Data corrections should be made in your Shopify admin</Text></li>
                  <li><Text as="span" variant="bodyMd"><strong>Portability:</strong> You can export your data for use elsewhere</Text></li>
                </ul>
              </div>
            </BlockStack>
          </div>
        </Card>

        {/* GDPR and CCPA Compliance */}
        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text as="h2" variant="headingLg">GDPR and CCPA Compliance</Text>
            </div>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                We are committed to compliance with applicable data protection regulations, including GDPR and CCPA.
              </Text>
              <div>
                <div style={{ marginBottom: '8px' }}>
                  <Text as="h3" variant="headingMd">Legal Basis for Processing (GDPR)</Text>
                </div>
                <Text as="p" variant="bodyMd">
                  We process your data based on legitimate interest in providing analytics services and your consent through app installation.
                </Text>
              </div>
              <div>
                <div style={{ marginBottom: '8px' }}>
                  <Text as="h3" variant="headingMd">California Consumer Rights (CCPA)</Text>
                </div>
                <Text as="p" variant="bodyMd">
                  California residents have additional rights including the right to know what personal information is collected and the right to delete personal information.
                </Text>
              </div>
            </BlockStack>
          </div>
        </Card>

        {/* Data Retention */}
        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text as="h2" variant="headingLg">Data Retention</Text>
            </div>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                We retain your data only as long as necessary to provide our services:
              </Text>
              <div style={{ paddingLeft: '16px' }}>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  <li><Text as="span" variant="bodyMd">Session data is retained for the duration of your active session</Text></li>
                  <li><Text as="span" variant="bodyMd">Analytics data is processed in real-time and not permanently stored</Text></li>
                  <li><Text as="span" variant="bodyMd">Upon app uninstallation, all associated data is removed</Text></li>
                  <li><Text as="span" variant="bodyMd">Log data may be retained for up to 30 days for security and debugging purposes</Text></li>
                </ul>
              </div>
            </BlockStack>
          </div>
        </Card>

        {/* Contact Information */}
        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text as="h2" variant="headingLg">Contact Us</Text>
            </div>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                If you have any questions about this Privacy Policy or our data practices, please contact us:
              </Text>
              <div style={{ 
                background: 'var(--p-color-bg-surface-secondary)', 
                padding: '16px', 
                borderRadius: '8px' 
              }}>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd"><strong>ShopDelta Analytics</strong></Text>
                  <Text as="p" variant="bodyMd">Email: privacy@shopdelta.com</Text>
                  <Text as="p" variant="bodyMd">Support: support@shopdelta.com</Text>
                  <Text as="p" variant="bodyMd">Website: https://shopdelta.com</Text>
                </BlockStack>
              </div>
            </BlockStack>
          </div>
        </Card>

        {/* Updates to Policy */}
        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text as="h2" variant="headingLg">Updates to This Policy</Text>
            </div>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
              </Text>
              <Text as="p" variant="bodyMd">
                You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.
              </Text>
            </BlockStack>
          </div>
        </Card>

        {/* Footer */}
        <div style={{ 
          background: 'var(--p-color-bg-surface-secondary)', 
          padding: '24px', 
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <Text as="p" variant="bodySm" tone="subdued">
            This Privacy Policy is effective as of {new Date().toLocaleDateString()} and applies to all users of ShopDelta Analytics.
          </Text>
        </div>
      </BlockStack>
    </Page>
  );
}
