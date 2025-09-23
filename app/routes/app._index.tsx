import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Text, BlockStack, InlineStack, Button, Card } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { Link } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppIndex() {
  return (
    <Page>
      <TitleBar title="ShopDelta Analytics" />
      <BlockStack gap="600">
        {/* Hero Section */}
        <div style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          padding: '60px 40px', 
          borderRadius: '16px', 
          color: 'white',
          textAlign: 'center'
        }}>
          <div style={{ color: 'white', marginBottom: '20px' }}>
            <Text as="h1" variant="heading3xl">📊 ShopDelta Analytics</Text>
          </div>
          <div style={{ color: 'rgba(255, 255, 255, 0.9)', marginBottom: '30px' }}>
            <Text as="p" variant="headingLg">Powerful sales analytics and comparison tools for your Shopify store</Text>
          </div>
          <div style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: '40px', maxWidth: '600px', margin: '0 auto 40px' }}>
            <Text as="p" variant="bodyLg">Make data-driven decisions with comprehensive sales insights, product performance tracking, and advanced comparison analytics</Text>
          </div>
          <Link to="/app/analytics">
            <div style={{
              display: 'inline-block',
              padding: '16px 32px',
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              color: 'white',
              fontWeight: '600',
              fontSize: '16px',
              textDecoration: 'none',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}>
              🚀 Start Analyzing Your Data
            </div>
          </Link>
        </div>

        {/* Data Use Notice */}
        <Card>
          <div style={{ 
            padding: '24px', 
            background: 'linear-gradient(135deg, #e8f5e8 0%, #f0f9ff 100%)',
            borderRadius: '12px',
            border: '2px solid #10b981',
            textAlign: 'center'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <Text as="h3" variant="headingMd">🔒 Data Use</Text>
            </div>
            <Text as="p" variant="bodyLg" tone="subdued">
              ShopDelta displays analytics based on live order data from your Shopify store. <strong>No order or customer data is stored in our systems.</strong>
            </Text>
            <div style={{ marginTop: '12px' }}>
              <Link to="/privacy" style={{ color: '#10b981', textDecoration: 'underline' }}>
                <Text as="span" variant="bodySm">View our Privacy Policy</Text>
              </Link>
            </div>
          </div>
        </Card>

        {/* Features Grid */}
        <BlockStack gap="400">
          <Text as="h2" variant="headingXl" alignment="center">
            Why ShopDelta Analytics?
          </Text>
          
          <InlineStack gap="400" wrap>
            <div style={{ flex: '1', minWidth: '300px' }}>
              <Card>
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📈</div>
                  <div style={{ marginBottom: '12px' }}>
                    <Text as="h3" variant="headingMd">Advanced Analytics</Text>
                  </div>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Visualize your sales data with interactive charts, tables, and summaries. Track quantity and revenue trends over time with daily, weekly, or monthly granularity.
                  </Text>
                </div>
              </Card>
            </div>

            <div style={{ flex: '1', minWidth: '300px' }}>
              <Card>
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔄</div>
                  <div style={{ marginBottom: '12px' }}>
                    <Text as="h3" variant="headingMd">Smart Comparisons</Text>
                  </div>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Compare performance with Month-over-Month and Year-over-Year analysis. See exactly how your business is growing with detailed delta calculations and percentage changes.
                  </Text>
                </div>
              </Card>
            </div>

            <div style={{ flex: '1', minWidth: '300px' }}>
              <Card>
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏷️</div>
                  <div style={{ marginBottom: '12px' }}>
                    <Text as="h3" variant="headingMd">Product Insights</Text>
                  </div>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Analyze individual product performance with SKU tracking. Identify your top performers and understand which products drive the most revenue.
                  </Text>
                </div>
              </Card>
            </div>
          </InlineStack>
        </BlockStack>

        {/* Key Benefits */}
        <Card>
          <div style={{ padding: '32px' }}>
            <div style={{ marginBottom: '24px', textAlign: 'center' }}>
              <Text as="h2" variant="headingLg">🎯 What You'll Get</Text>
            </div>
            
            <InlineStack gap="600" wrap>
              <div style={{ flex: '1', minWidth: '250px' }}>
                <BlockStack gap="300">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold'
                    }}>
                      📊
                    </div>
                    <Text as="h4" variant="headingSm">Real-time Sales Tracking</Text>
                  </div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Monitor your sales performance in real-time with up-to-date data from your Shopify store.
                  </Text>
                </BlockStack>
              </div>

              <div style={{ flex: '1', minWidth: '250px' }}>
                <BlockStack gap="300">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold'
                    }}>
                      📥
                    </div>
                    <Text as="h4" variant="headingSm">Excel Export</Text>
                  </div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Export your analytics data to Excel for further analysis, reporting, or sharing with your team.
                  </Text>
                </BlockStack>
              </div>

              <div style={{ flex: '1', minWidth: '250px' }}>
                <BlockStack gap="300">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold'
                    }}>
                      🎨
                    </div>
                    <Text as="h4" variant="headingSm">Beautiful Interface</Text>
                  </div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Enjoy a modern, intuitive interface designed with Shopify's design system for a seamless experience.
                  </Text>
                </BlockStack>
              </div>
            </InlineStack>
          </div>
        </Card>

        {/* Getting Started */}
        <div style={{ 
          background: 'var(--p-color-bg-surface-secondary)', 
          padding: '40px', 
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <Text as="h2" variant="headingLg">Ready to unlock your store's potential?</Text>
          </div>
          <div style={{ marginBottom: '24px' }}>
            <Text as="p" variant="bodyLg" tone="subdued">Start exploring your sales data and discover insights that will help grow your business.</Text>
          </div>
          <Link to="/app/analytics">
            <div style={{
              display: 'inline-block',
              padding: '14px 28px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '8px',
              color: 'white',
              fontWeight: '600',
              fontSize: '16px',
              textDecoration: 'none',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)'
            }}>
              📊 Go to Analytics
            </div>
          </Link>
        </div>
      </BlockStack>
    </Page>
  );
}
