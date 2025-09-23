import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Text, BlockStack, InlineStack, Card, DataTable, Button } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

// Mock data generator
function generateMockData() {
  const products = [
    { id: "1", title: "Wireless Bluetooth Headphones", sku: "WBH-001" },
    { id: "2", title: "Smartphone Case - Clear", sku: "SC-CLEAR-001" },
    { id: "3", title: "USB-C Charging Cable", sku: "USB-C-001" },
    { id: "4", title: "Portable Power Bank", sku: "PPB-10000" },
    { id: "5", title: "Screen Protector - Tempered Glass", sku: "SP-TG-001" },
    { id: "6", title: "Car Phone Mount", sku: "CPM-001" },
    { id: "7", title: "Wireless Charging Pad", sku: "WCP-001" },
    { id: "8", title: "Bluetooth Speaker", sku: "BS-MINI-001" },
    { id: "9", title: "Phone Ring Holder", sku: "PRH-001" },
    { id: "10", title: "Lightning Cable", sku: "LC-001" }
  ];

  const now = new Date();
  const buckets = new Map();
  const productSales = new Map();
  const productQty = new Map();

  // Generate last 30 days of data
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString('en-CA');
    
    // Random daily sales between 500-2000
    const dailySales = Math.floor(Math.random() * 1500) + 500;
    const dailyQty = Math.floor(Math.random() * 50) + 10;
    
    buckets.set(key, { label, quantity: dailyQty, sales: dailySales });

    // Distribute sales across products
    products.forEach(product => {
      const productDailySales = Math.floor(Math.random() * 300) + 50;
      const productDailyQty = Math.floor(Math.random() * 8) + 1;
      
      productSales.set(product.id, (productSales.get(product.id) || 0) + productDailySales);
      productQty.set(product.id, (productQty.get(product.id) || 0) + productDailyQty);
    });
  }

  // Calculate totals
  const totalSales = Array.from(buckets.values()).reduce((sum, bucket) => sum + bucket.sales, 0);
  const totalQty = Array.from(buckets.values()).reduce((sum, bucket) => sum + bucket.quantity, 0);

  // Top products by sales
  const topProductsBySales = Array.from(productSales.entries())
    .map(([id, sales]) => {
      const product = products.find(p => p.id === id);
      return { id, title: product?.title || id, sales, sku: product?.sku || "" };
    })
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 10);

  // Top products by quantity
  const topProductsByQty = Array.from(productQty.entries())
    .map(([id, qty]) => {
      const product = products.find(p => p.id === id);
      return { id, title: product?.title || id, quantity: qty, sku: product?.sku || "" };
    })
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  // Time series data
  const series = Array.from(buckets.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.key.localeCompare(b.key));

  // Mock comparison data (current vs previous month)
  const currentMonth = series.slice(-15); // Last 15 days as "current"
  const previousMonth = series.slice(-30, -15); // Previous 15 days as "previous"
  
  const currentTotals = {
    qty: currentMonth.reduce((sum, day) => sum + day.quantity, 0),
    sales: currentMonth.reduce((sum, day) => sum + day.sales, 0)
  };
  
  const previousTotals = {
    qty: previousMonth.reduce((sum, day) => sum + day.quantity, 0),
    sales: previousMonth.reduce((sum, day) => sum + day.sales, 0)
  };

  const comparison = {
    current: currentTotals,
    previous: previousTotals,
    deltas: {
      qty: currentTotals.qty - previousTotals.qty,
      sales: currentTotals.sales - previousTotals.sales,
      qtyPct: previousTotals.qty ? ((currentTotals.qty - previousTotals.qty) / previousTotals.qty) * 100 : null,
      salesPct: previousTotals.sales ? ((currentTotals.sales - previousTotals.sales) / previousTotals.sales) * 100 : null
    }
  };

  // Product comparison table
  const comparisonTable = topProductsByQty.slice(0, 8).map(product => {
    const currentSales = Math.floor(Math.random() * 1000) + 200;
    const previousSales = Math.floor(Math.random() * 800) + 150;
    const currentQty = Math.floor(Math.random() * 20) + 5;
    const previousQty = Math.floor(Math.random() * 18) + 3;
    
    return {
      product: product.title,
      productSku: product.sku,
      qtyCurr: currentQty,
      qtyPrev: previousQty,
      qtyDelta: currentQty - previousQty,
      qtyDeltaPct: previousQty ? ((currentQty - previousQty) / previousQty) * 100 : null,
      salesCurr: currentSales,
      salesPrev: previousSales,
      salesDelta: currentSales - previousSales,
      salesDeltaPct: previousSales ? ((currentSales - previousSales) / previousSales) * 100 : null
    };
  });

  return {
    totals: { qty: totalQty, sales: totalSales, currency: "USD" },
    topProducts: topProductsByQty,
    topProductsBySales,
    series,
    comparison,
    comparisonTable,
    filters: {
      start: series[0]?.key || new Date().toISOString().slice(0, 10),
      end: series[series.length - 1]?.key || new Date().toISOString().slice(0, 10),
      granularity: "day",
      preset: "last30",
      view: "chart",
      compare: "mom"
    }
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  
  // Generate fresh mock data on each request
  const mockData = generateMockData();
  
  return json({
    ...mockData,
    shop: "demo-store.myshopify.com"
  });
};

// Helper functions
const fmtNum = (n: number | null | undefined): string => {
  if (n == null) return "–";
  return new Intl.NumberFormat("en-US").format(n);
};

const fmtMoney = (amount: number | null | undefined, currency = "USD"): string => {
  if (amount == null) return "–";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
};

const fmtPct = (pct: number | null | undefined): string => {
  if (pct == null) return "–";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
};

export default function DemoPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="Demo Store Analytics" />
      <BlockStack gap="600">
        {/* Demo Notice */}
        <div style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          padding: '24px', 
          borderRadius: '12px', 
          color: 'white',
          textAlign: 'center'
        }}>
          <div style={{ color: 'white', marginBottom: '8px' }}>
            <Text as="h2" variant="headingLg">🎭 Demo Store Analytics</Text>
          </div>
          <div style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
            <Text as="p" variant="bodyMd">This page showcases ShopDelta Analytics with realistic mock data. All data is randomly generated for demonstration purposes.</Text>
          </div>
        </div>

        {/* Key Metrics */}
        <InlineStack gap="400" wrap>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <Card>
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <Text as="p" variant="bodySm" tone="subdued">Total Sales (30 days)</Text>
                <div style={{ color: '#2563eb', margin: '8px 0' }}>
                  <Text as="p" variant="heading2xl">{fmtMoney(data.totals.sales)}</Text>
                </div>
                <div style={{ 
                  background: data.comparison.deltas.sales >= 0 ? '#dcfce7' : '#fef2f2',
                  color: data.comparison.deltas.sales >= 0 ? '#166534' : '#dc2626',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  {data.comparison.deltas.sales >= 0 ? '↗️' : '↘️'} {fmtPct(data.comparison.deltas.salesPct)}
                </div>
              </div>
            </Card>
          </div>

          <div style={{ flex: '1', minWidth: '200px' }}>
            <Card>
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <Text as="p" variant="bodySm" tone="subdued">Total Quantity (30 days)</Text>
                <div style={{ color: '#7c3aed', margin: '8px 0' }}>
                  <Text as="p" variant="heading2xl">{fmtNum(data.totals.qty)}</Text>
                </div>
                <div style={{ 
                  background: data.comparison.deltas.qty >= 0 ? '#dcfce7' : '#fef2f2',
                  color: data.comparison.deltas.qty >= 0 ? '#166534' : '#dc2626',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  {data.comparison.deltas.qty >= 0 ? '↗️' : '↘️'} {fmtPct(data.comparison.deltas.qtyPct)}
                </div>
              </div>
            </Card>
          </div>

          <div style={{ flex: '1', minWidth: '200px' }}>
            <Card>
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <Text as="p" variant="bodySm" tone="subdued">Average Order Value</Text>
                <div style={{ color: '#059669', margin: '8px 0' }}>
                  <Text as="p" variant="heading2xl">{fmtMoney(data.totals.sales / data.totals.qty)}</Text>
                </div>
                <div style={{ 
                  background: '#f0fdf4',
                  color: '#166534',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  📊 Calculated
                </div>
              </div>
            </Card>
          </div>
        </InlineStack>

        {/* Top Products */}
        <InlineStack gap="600" wrap>
          <div style={{ flex: '1', minWidth: '400px' }}>
            <Card>
              <div style={{ padding: '20px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <Text as="h3" variant="headingMd">🏆 Top Products by Sales</Text>
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {data.topProductsBySales.slice(0, 5).map((product, index) => (
                    <div key={product.id} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '12px 0',
                      borderBottom: index < 4 ? '1px solid #f3f4f6' : 'none'
                    }}>
                      <div>
                        <div style={{ fontWeight: '500' }}>
                          <Text as="p" variant="bodyMd">{product.title}</Text>
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          SKU: {product.sku}
                        </Text>
                      </div>
                      <div style={{ fontWeight: '600', color: '#2563eb' }}>
                        <Text as="p" variant="bodyMd">{fmtMoney(product.sales)}</Text>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div style={{ flex: '1', minWidth: '400px' }}>
            <Card>
              <div style={{ padding: '20px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <Text as="h3" variant="headingMd">📦 Top Products by Quantity</Text>
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {data.topProducts.slice(0, 5).map((product, index) => (
                    <div key={product.id} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '12px 0',
                      borderBottom: index < 4 ? '1px solid #f3f4f6' : 'none'
                    }}>
                      <div>
                        <div style={{ fontWeight: '500' }}>
                          <Text as="p" variant="bodyMd">{product.title}</Text>
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          SKU: {product.sku}
                        </Text>
                      </div>
                      <div style={{ fontWeight: '600', color: '#7c3aed' }}>
                        <Text as="p" variant="bodyMd">{fmtNum(product.quantity)}</Text>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </InlineStack>

        {/* Product Comparison Table */}
        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text as="h3" variant="headingMd">🏷️ Product Performance Comparison</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Comparing recent performance vs previous period (mock data)
              </Text>
            </div>
            <div style={{ 
              background: 'white', 
              borderRadius: '8px', 
              overflow: 'hidden',
              border: '1px solid var(--p-color-border)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--p-color-bg-surface-secondary)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Product</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Qty (Curr)</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Qty (Prev)</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Qty Δ</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Sales (Curr)</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Sales (Prev)</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Sales Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.comparisonTable.map((row, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid var(--p-color-border-subdued)' }}>
                      <td style={{ 
                        padding: '12px', 
                        borderBottom: '1px solid var(--p-color-border-subdued)'
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <span style={{ fontWeight: '500' }}>{row.product}</span>
                          {row.productSku && (
                            <span style={{ 
                              background: 'var(--p-color-bg-surface-secondary)',
                              color: 'var(--p-color-text-subdued)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontFamily: 'monospace'
                            }}>
                              {row.productSku}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtNum(row.qtyCurr)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtNum(row.qtyPrev)}</td>
                      <td style={{ 
                        padding: '12px', 
                        textAlign: 'right', 
                        borderBottom: '1px solid var(--p-color-border-subdued)',
                        color: row.qtyDelta >= 0 ? '#059669' : '#dc2626'
                      }}>
                        {row.qtyDelta >= 0 ? '+' : ''}{fmtNum(row.qtyDelta)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtMoney(row.salesCurr)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtMoney(row.salesPrev)}</td>
                      <td style={{ 
                        padding: '12px', 
                        textAlign: 'right', 
                        borderBottom: '1px solid var(--p-color-border-subdued)',
                        color: row.salesDelta >= 0 ? '#059669' : '#dc2626'
                      }}>
                        {row.salesDelta >= 0 ? '+' : ''}{fmtMoney(row.salesDelta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* Call to Action */}
        <div style={{ 
          background: 'var(--p-color-bg-surface-secondary)', 
          padding: '32px', 
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <Text as="h3" variant="headingLg">Ready to see your real store data?</Text>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <Text as="p" variant="bodyMd" tone="subdued">Connect your Shopify store to get actual sales analytics and insights.</Text>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/app/analytics" style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '8px',
              color: 'white',
              fontWeight: '600',
              textDecoration: 'none',
              fontSize: '14px'
            }}>
              📊 View Real Analytics
            </a>
            <a href="/app" style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              color: '#374151',
              fontWeight: '600',
              textDecoration: 'none',
              fontSize: '14px'
            }}>
              🏠 Back to Home
            </a>
          </div>
        </div>
      </BlockStack>
    </Page>
  );
}
