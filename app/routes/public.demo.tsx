import type { LinksFunction, MetaFunction } from "@remix-run/node";
import AnalyticsView, { type AnalyticsData } from "../components/AnalyticsView";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import analyticsStylesUrl from "../styles/analytics.css?url";

export const meta: MetaFunction = () => [
  { title: "Demo - ShopDelta Analytics" },
  { name: "description", content: "See ShopDelta's powerful analytics features in action. Privacy-first Shopify analytics." },
  { name: "robots", content: "index, follow" },
];

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: analyticsStylesUrl },
];

function buildMockData(): AnalyticsData {
  // Build 6 months of monthly buckets with mock quantities and sales
  const now = new Date();
  const months: Array<{ key: string; label: string }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = `${d.toLocaleString("en-US", { month: "short" })} ${d.getUTCFullYear()}`;
    months.push({ key, label });
  }

  const products = [
    { id: "p1", title: "Aurora Tee" },
    { id: "p2", title: "Nebula Hoodie" },
    { id: "p3", title: "Lunar Cap" },
    { id: "p4", title: "Solar Socks" },
    { id: "p5", title: "Cosmic Mug" },
  ];

  // Random-ish but deterministic numbers
  const rand = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  // Per-month totals and per-product breakdown
  const series = months.map((m, i) => {
    const qtyBase = 200 + Math.round(rand(i + 1) * 150);
    const sales = qtyBase * (20 + (i % 3) * 3);
    return { key: m.key, label: m.label, quantity: qtyBase, sales };
  });

  const seriesProduct = months.map((m, i) => {
    const qtyBase = 200 + Math.round(rand(i + 1) * 150);
    const salesBase = qtyBase * (20 + (i % 3) * 3);
    const per: Record<string, { qty: number; sales: number; title: string }> = {};
    let qtyLeft = qtyBase;
    products.forEach((p, idx) => {
      const q = idx < products.length - 1 ? Math.round(qtyBase * (0.15 + rand(i + idx) * 0.15)) : qtyLeft;
      qtyLeft -= q;
      const s = (q / Math.max(1, qtyBase)) * salesBase;
      per[p.id] = { qty: q, sales: s, title: p.title };
    });
    return { key: m.key, label: m.label, per };
  });

  const seriesProductLines = products.map((p, pi) => ({
    id: p.id,
    title: p.title,
    points: months.map((m, mi) => {
      const q = Math.round(30 + rand((pi + 1) * (mi + 1)) * 120);
      const sales = q * (18 + (mi % 4));
      return { key: m.key, label: m.label, qty: q, sales };
    }),
  }));

  const topProducts = products.map((p, idx) => ({ id: p.id, title: p.title, quantity: 300 - idx * 20 }));
  const topProductsBySales = products.map((p, idx) => ({ id: p.id, title: p.title, sales: 8000 - idx * 500 }));

  const headers = products.slice(0, 5).map((p) => ({ id: p.id, title: p.title }));
  const table = months.map((m, mi) => {
    const row: Record<string, any> = { key: m.key, label: m.label };
    headers.forEach((h, hi) => {
      row[h.id] = Math.round(20 + rand(mi + hi) * 80);
    });
    return row;
  });

  const totalsQty = series.reduce((a, s) => a + s.quantity, 0);
  const totalsSales = series.reduce((a, s) => a + s.sales, 0);

  const data: AnalyticsData = {
    topProducts,
    topProductsBySales,
    series,
    table,
    headers,
    totals: { qty: totalsQty, sales: totalsSales, currency: "USD" },
    comparison: null,
    comparisonTable: null,
    comparisonHeaders: null,
    seriesProduct,
    seriesProductLines,
    productLegend: products.map((p) => ({ id: p.id, title: p.title })),
    momMonths: months,
    filters: {
      start: months[0].key + "-01",
      end: months[months.length - 1].key + "-28",
      granularity: "month",
      preset: "last30",
      view: "chart",
      compare: "none",
      chart: "bar",
      compareScope: "aggregate",
      metric: "qty",
      chartScope: "aggregate",
      productFocus: "all",
    },
  };

  return data;
}

export default function PublicDemo() {
  const data = buildMockData();
  return (
    <AppProvider i18n={en}>
      <div style={{ padding: 16 }}>
        <AnalyticsView data={data} title="Demo Analytics" />
      </div>
    </AppProvider>
  );
}
