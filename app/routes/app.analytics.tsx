import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useLocation, useRouteError, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { Page, DataTable, BlockStack, Text, Link, Button, InlineStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import analyticsStylesUrl from "../styles/analytics.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: analyticsStylesUrl },
];

// Fetch recent orders and compute top 5 products by quantity sold
type Granularity = "day" | "week" | "month";

function startOfWeek(d: Date) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = dt.getUTCDay(); // 0=Sun
  const diff = (dow + 6) % 7; // make Monday=0
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt;
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function fmtYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const DEBUG = process.env.DEBUG_ANALYTICS === "1";
  const dlog = (...args: any[]) => {
    if (DEBUG) console.log("[analytics]", ...args);
  };
  const { admin, session } = await authenticate.admin(request);

  // Parse filters
  const url = new URL(request.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const granParam = (url.searchParams.get("granularity") as Granularity) || "day";
  const preset = url.searchParams.get("preset") || "last30";
  const view = url.searchParams.get("view") || "chart"; // chart | table | summary | compare
  const compareMode = url.searchParams.get("compare") || "none"; // none | mom | yoy
  const compareScope = url.searchParams.get("compareScope") || "aggregate"; // aggregate | product
  const momA = url.searchParams.get("momA");
  const momB = url.searchParams.get("momB");
  const chartType = url.searchParams.get("chart") || "bar"; // bar | line
  const chartMetric = (url.searchParams.get("metric") || "qty").toLowerCase(); // qty | sales
  const chartScope = (url.searchParams.get("chartScope") || "aggregate").toLowerCase(); // aggregate | product
  const productFocus = url.searchParams.get("productFocus") || "all"; // all | productId

  // Determine default range based on preset
  const now = new Date();
  const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let start = startParam ? new Date(startParam + "T00:00:00.000Z") : undefined;
  let end = endParam ? new Date(endParam + "T23:59:59.999Z") : undefined;

  if (!start || !end) {
    switch (preset) {
      case "last7":
        end = utcNow;
        start = new Date(utcNow);
        start.setUTCDate(start.getUTCDate() - 6);
        break;
      case "thisMonth":
        start = startOfMonth(utcNow);
        end = utcNow;
        break;
      case "lastMonth": {
        const firstThis = startOfMonth(utcNow);
        const firstLast = new Date(Date.UTC(firstThis.getUTCFullYear(), firstThis.getUTCMonth() - 1, 1));
        const endLast = new Date(Date.UTC(firstThis.getUTCFullYear(), firstThis.getUTCMonth(), 0));
        start = firstLast;
        end = endLast;
        break;
      }
      case "ytd": {
        start = new Date(Date.UTC(utcNow.getUTCFullYear(), 0, 1));
        end = utcNow;
        break;
      }
      default: // last30
        end = utcNow;
        start = new Date(utcNow);
        start.setUTCDate(start.getUTCDate() - 29);
    }
  }

  // Query recent orders in a window and pull line items (quantity + discounted totals)
  const query = `#graphql
    query AnalyticsRecentOrders($first: Int!, $search: String, $after: String) {
      orders(first: $first, after: $after, sortKey: PROCESSED_AT, reverse: true, query: $search) {
        pageInfo { hasNextPage endCursor }
        edges {
          cursor
          node {
          id
          name
          processedAt
          lineItems(first: 100) {
            edges {
              node {
                quantity
                # Using title directly from the line item avoids requiring read_products scope
                title
                discountedTotalSet { shopMoney { amount currencyCode } }
                product {
                  id
                  title
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    // For MoM UI
    let momMonths: Array<{ key: string; label: string }> | undefined = undefined;
    // Build search term for processedAt range
    const search = `processed_at:>='${start!.toISOString()}' processed_at:<='${end!.toISOString()}'`;
    dlog("Fetching recent orders... shop=", session.shop, "range=", start, end, "gran=", granParam);
    // Paginate through all orders within the date range
    let after: string | null = null;
    const edges: any[] = [];
    while (true) {
      const response = await admin.graphql(query, { variables: { first: 250, search, after } });
      const data = await response.json();
      dlog("GraphQL status:", (response as any).status, "keys:", Object.keys(data || {}));
      const gqlErrors = (data && data.errors) || (data && data.data && data.data.errors);
      if (gqlErrors && Array.isArray(gqlErrors) && gqlErrors.length > 0) {
        dlog("GraphQL errors:", gqlErrors);
        return json(
          { error: "GRAPHQL_ERROR", message: gqlErrors[0]?.message || "GraphQL error", details: gqlErrors, shop: session.shop },
          { status: 200 },
        );
      }
      const page = data?.data?.orders;
      const newEdges = page?.edges ?? [];
      edges.push(...newEdges);
      if (page?.pageInfo?.hasNextPage) {
        after = page.pageInfo.endCursor as string;
      } else {
        break;
      }
    }
    dlog("Orders returned (all pages):", edges.length);

    // Existing: Top products overall in period
    const counts = new Map<string, { title: string; quantity: number }>();
    // New: Buckets by granularity
    const buckets = new Map<string, { label: string; quantity: number }>();
    // New: Sales amounts per bucket (discounted totals)
    const bucketSales = new Map<string, number>();
    let totalQty = 0;
    let totalSales = 0;
    let currencyCode: string | null = null;

    // For Table view: pivot qty by product within each bucket
    const productSet = new Map<string, string>(); // id -> title
    const pivot = new Map<string, Map<string, number>>(); // bucketKey -> (productId -> qty)

    function bucketKey(dateStr: string): { key: string; label: string } {
      const d = new Date(dateStr);
      if (granParam === "month") {
        const startM = startOfMonth(d);
        const key = `${startM.getUTCFullYear()}-${String(startM.getUTCMonth() + 1).padStart(2, "0")}`;
        const label = `${startM.toLocaleString("en-US", { month: "short" })} ${startM.getUTCFullYear()}`;
        return { key, label };
      }
      if (granParam === "week") {
        const ws = startOfWeek(d);
        const key = `W:${fmtYMD(ws)}`;
        const label = `Week of ${ws.toLocaleDateString("en-CA")}`;
        return { key, label };
      }
      // day
      const key = fmtYMD(d);
      const label = d.toLocaleDateString("en-CA");
      return { key, label };
    }

    // Pre-fill month buckets across the selected range so empty months appear
    if (granParam === "month") {
      const mStart = startOfMonth(start!);
      const mEnd = startOfMonth(end!);
      const cur = new Date(mStart);
      while (cur <= mEnd) {
        const key = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`;
        const label = `${cur.toLocaleString("en-US", { month: "short" })} ${cur.getUTCFullYear()}`;
        if (!buckets.has(key)) buckets.set(key, { label, quantity: 0 });
        if (!bucketSales.has(key)) bucketSales.set(key, 0);
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
    }

    for (const edge of edges) {
      const processedAt: string = edge?.node?.processedAt;
      const { key, label } = bucketKey(processedAt);
      if (!buckets.has(key)) buckets.set(key, { label, quantity: 0 });
      if (!bucketSales.has(key)) bucketSales.set(key, 0);
      if (!pivot.has(key)) pivot.set(key, new Map());

      const lineItemEdges = edge?.node?.lineItems?.edges ?? [];
      for (const liEdge of lineItemEdges) {
        const qty: number = liEdge?.node?.quantity ?? 0;
        const product = liEdge?.node?.product;
        const fallbackTitle: string = liEdge?.node?.title ?? "Unknown product";
        const id: string = product?.id ?? `li:${fallbackTitle}`;
        const title: string = product?.title ?? fallbackTitle;
        if (!counts.has(id)) counts.set(id, { title, quantity: 0 });
        counts.get(id)!.quantity += qty;
        buckets.get(key)!.quantity += qty;
        productSet.set(id, title);
        const row = pivot.get(key)!;
        row.set(id, (row.get(id) || 0) + qty);

        const amountStr: string | undefined = liEdge?.node?.discountedTotalSet?.shopMoney?.amount as any;
        const curr: string | undefined = liEdge?.node?.discountedTotalSet?.shopMoney?.currencyCode as any;
        const amount = amountStr ? parseFloat(amountStr) : 0;
        if (!currencyCode && curr) currencyCode = curr;
        totalSales += amount;
        bucketSales.set(key, (bucketSales.get(key) || 0) + amount);
        totalQty += qty;
      }
    }

    const topProducts = Array.from(counts.entries())
      .map(([id, { title, quantity }]) => ({ id, title, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Compute top by sales using pivot + average price proxy from totals per product within buckets
    const salesByProduct = new Map<string, number>();
    for (const [bKey] of pivot.entries()) {
      const row = pivot.get(bKey)!;
      for (const [pid, q] of row.entries()) {
        // Allocate bucket sales proportionally by quantity share within this bucket
        const bucketQty = buckets.get(bKey)!.quantity || 1;
        const bucketAmt = bucketSales.get(bKey) || 0;
        const alloc = (q / bucketQty) * bucketAmt;
        salesByProduct.set(pid, (salesByProduct.get(pid) || 0) + alloc);
      }
    }
    const topProductsBySales = Array.from(salesByProduct.entries())
      .map(([id, sales]) => ({ id, title: productSet.get(id) || id, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);

    const series = Array.from(buckets.entries())
      .map(([key, v]) => ({ key, label: v.label, quantity: v.quantity, sales: bucketSales.get(key) || 0 }))
      .sort((a, b) => (a.key > b.key ? 1 : -1));

    // Build per-bucket per-product series for product-scoped charts (limit to top 5 products)
    const top5Ids = topProducts.slice(0, 5).map((p) => p.id);
    const seriesProduct = series.map((s) => {
      const row = pivot.get(s.key) || new Map<string, number>();
      // allocate sales per product in bucket based on qty share
      const bucketQty = buckets.get(s.key)?.quantity || 1;
      const bucketAmt = bucketSales.get(s.key) || 0;
      const per: Record<string, { qty: number; sales: number; title: string }> = {};
      for (const pid of top5Ids) {
        const q = row.get(pid) || 0;
        const alloc = (q / bucketQty) * bucketAmt;
        per[pid] = { qty: q, sales: alloc, title: productSet.get(pid) || pid };
      }
      return { key: s.key, label: s.label, per };
    });

    // Build per-product line series across buckets for line charts
    const seriesProductLines = top5Ids.map((pid) => ({
      id: pid,
      title: productSet.get(pid) || pid,
      points: series.map((s) => {
        const row = pivot.get(s.key) || new Map<string, number>();
        const q = row.get(pid) || 0;
        const bucketQty = buckets.get(s.key)?.quantity || 1;
        const bucketAmt = bucketSales.get(s.key) || 0;
        const sales = (q / bucketQty) * bucketAmt;
        return { key: s.key, label: s.label, qty: q, sales };
      })
    }));

    dlog("Top products:", topProducts);
    dlog("Series buckets:", series.length);

    // Build table pivot headers (top 20 products by qty)
    const top20Ids = topProducts.slice(0, 20).map((p) => p.id);
    const table = series.map((s) => {
      const row: Record<string, any> = { key: s.key, label: s.label };
      for (const pid of top20Ids) {
        const qty = pivot.get(s.key)?.get(pid) || 0;
        row[pid] = qty;
      }
      return row;
    });

    // Comparison: previous period totals
    let comparison: any = null;
    let comparisonTable: Array<Record<string, any>> | null = null;
    let comparisonHeaders: string[] | null = null;
    if (compareMode === "mom" || compareMode === "yoy") {
      let prevStart: Date, prevEnd: Date;
      if (compareMode === "yoy") {
        prevStart = new Date(start!); prevStart.setUTCFullYear(prevStart.getUTCFullYear() - 1);
        prevEnd = new Date(end!); prevEnd.setUTCFullYear(prevEnd.getUTCFullYear() - 1);
      } else {
        const days = Math.ceil((+end! - +start!) / (1000 * 60 * 60 * 24)) + 1;
        prevEnd = new Date(start!); prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
        prevStart = new Date(prevEnd); prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
      }
      const prevSearch = `processed_at:>='${prevStart.toISOString()}' processed_at:<='${prevEnd.toISOString()}'`;
      const prevRes = await admin.graphql(query, { variables: { first: 250, search: prevSearch } });
      const prevData = await prevRes.json();
      const prevEdges = prevData?.data?.orders?.edges ?? [];
      let prevQty = 0; let prevSales = 0;
      const prevCounts = new Map<string, { title: string; quantity: number }>();
      const prevSalesByProduct = new Map<string, number>();
      for (const e of prevEdges) {
        const liEdges = e?.node?.lineItems?.edges ?? [];
        for (const li of liEdges) {
          const qty = li?.node?.quantity ?? 0; prevQty += qty;
          const amountStr: string | undefined = li?.node?.discountedTotalSet?.shopMoney?.amount as any;
          prevSales += amountStr ? parseFloat(amountStr) : 0;
          const p = li?.node?.product;
          const fallbackTitle: string = li?.node?.title ?? "Unknown product";
          const pid: string = p?.id ?? `li:${fallbackTitle}`;
          const ptitle: string = p?.title ?? fallbackTitle;
          if (!prevCounts.has(pid)) prevCounts.set(pid, { title: ptitle, quantity: 0 });
          prevCounts.get(pid)!.quantity += qty;
          // Sales allocation per product in prev period: approximate by per-line discounted total
          const amt = amountStr ? parseFloat(amountStr) : 0;
          prevSalesByProduct.set(pid, (prevSalesByProduct.get(pid) || 0) + amt);
        }
      }
      comparison = {
        mode: compareMode,
        current: { qty: totalQty, sales: totalSales },
        previous: { qty: prevQty, sales: prevSales },
        deltas: {
          qty: totalQty - prevQty,
          qtyPct: prevQty ? ((totalQty - prevQty) / prevQty) * 100 : null,
          sales: totalSales - prevSales,
          salesPct: prevSales ? ((totalSales - prevSales) / prevSales) * 100 : null,
        },
        prevRange: { start: fmtYMD(prevStart), end: fmtYMD(prevEnd) },
      };

      // Build comparison table depending on scope
      if (compareScope === "aggregate") {
        // If Month-on-Month is selected, create consecutive month pairs across the selected range
        if (compareMode === "mom") {
          // Build monthly totals (qty and sales) from all orders in-range using bucket labels
          // We already computed per-bucket totals in `series` (each bucket may be day/week/month). We rebuild months from edges via buckets map.
          const monthly = new Map<string, { label: string; qty: number; sales: number }>();
          for (const [key, info] of buckets.entries()) {
            // Determine the month start from the bucket label by using processedAt-derived keys we created earlier.
            // We don't have the raw date here, so derive month from label via a date from key when possible.
            // Keys for month buckets are "YYYY-MM"; for week/day, fallback by parsing first 10 of label (YYYY-MM-DD).
            let mKey = key;
            if (!/^\d{4}-\d{2}$/.test(mKey)) {
              // try to extract YYYY-MM from label or key
              const m = (key.match(/^(\d{4})-(\d{2})/) || info.label.match(/(\d{4})-(\d{2})/));
              if (m) mKey = `${m[1]}-${m[2]}`;
              else {
                // as a fallback, skip
                continue;
              }
            }
            const label = (() => {
              const [y, mm] = mKey.split('-').map((x) => parseInt(x, 10));
              const d = new Date(Date.UTC(y, mm - 1, 1));
              return `${d.toLocaleString("en-US", { month: "short" })} ${y}`;
            })();
            const q = info.quantity;
            const s = bucketSales.get(key) || 0;
            if (!monthly.has(mKey)) monthly.set(mKey, { label, qty: 0, sales: 0 });
            const acc = monthly.get(mKey)!;
            acc.qty += q;
            acc.sales += s;
          }

          // Sort month keys ascending
          const ordered = Array.from(monthly.entries()).sort((a, b) => (a[0] > b[0] ? 1 : -1));
          momMonths = ordered.map(([key, v]) => ({ key, label: v.label }));
          // Build rows
          comparisonHeaders = ["Period", "Qty (Curr)", "Qty (Prev)", "Qty Δ", "Qty Δ%", "Sales (Curr)", "Sales (Prev)", "Sales Δ", "Sales Δ%"]; 
          const rows: Array<Record<string, any>> = [];
          if (momA && momB) {
            // Explicit months selected: show A → B regardless of adjacency
            const a = monthly.get(momA);
            const b = monthly.get(momB);
            if (a && b) {
              rows.push({
                period: `${a.label} → ${b.label}`,
                qtyCurr: b.qty,
                qtyPrev: a.qty,
                qtyDelta: b.qty - a.qty,
                qtyDeltaPct: a.qty ? (((b.qty - a.qty) / a.qty) * 100) : null,
                salesCurr: b.sales,
                salesPrev: a.sales,
                salesDelta: b.sales - a.sales,
                salesDeltaPct: a.sales ? (((b.sales - a.sales) / a.sales) * 100) : null,
              });
            }
          } else {
            // No explicit months: show consecutive pairs within range
            for (let i = 1; i < ordered.length; i++) {
              const prev = ordered[i - 1][1];
              const curr = ordered[i][1];
              rows.push({
                period: `${prev.label} → ${curr.label}`,
                qtyCurr: curr.qty,
                qtyPrev: prev.qty,
                qtyDelta: curr.qty - prev.qty,
                qtyDeltaPct: prev.qty ? (((curr.qty - prev.qty) / prev.qty) * 100) : null,
                salesCurr: curr.sales,
                salesPrev: prev.sales,
                salesDelta: curr.sales - prev.sales,
                salesDeltaPct: prev.sales ? (((curr.sales - prev.sales) / prev.sales) * 100) : null,
              });
            }
          }
          comparisonTable = rows;
        } else {
          // Default aggregate single-period compare (YoY)
          comparisonHeaders = ["Metric", "Current", "Previous", "Change", "% Change"];
          comparisonTable = [
            {
              metric: "Quantity",
              current: totalQty,
              previous: prevQty,
              change: totalQty - prevQty,
              changePct: prevQty ? (((totalQty - prevQty) / prevQty) * 100).toFixed(1) + "%" : "–",
            },
            {
              metric: "Sales",
              current: totalSales,
              previous: prevSales,
              change: totalSales - prevSales,
              changePct: prevSales ? (((totalSales - prevSales) / prevSales) * 100).toFixed(1) + "%" : "–",
            },
          ];
        }
      } else {
        // by product
        if (compareMode === "mom") {
          // Build monthly per-product totals
          const monthlyProduct = new Map<string, Map<string, { title: string; qty: number; sales: number }>>();
          for (const [key, info] of buckets.entries()) {
            let mKey = key;
            if (!/^\d{4}-\d{2}$/.test(mKey)) {
              const m = (key.match(/^(\d{4})-(\d{2})/) || info.label.match(/(\d{4})-(\d{2})/));
              if (m) mKey = `${m[1]}-${m[2]}`; else continue;
            }
            if (!monthlyProduct.has(mKey)) monthlyProduct.set(mKey, new Map());
            const row = pivot.get(key) || new Map<string, number>();
            const bucketQty = buckets.get(key)?.quantity || 1;
            const bucketAmt = bucketSales.get(key) || 0;
            for (const [pid, q] of row.entries()) {
              const alloc = (q / bucketQty) * bucketAmt;
              const title = productSet.get(pid) || pid;
              const mp = monthlyProduct.get(mKey)!;
              if (!mp.has(pid)) mp.set(pid, { title, qty: 0, sales: 0 });
              const acc = mp.get(pid)!;
              acc.qty += q;
              acc.sales += alloc;
            }
          }
          const orderedMonths = Array.from(monthlyProduct.keys()).sort();
          // Select months: explicit A/B or default to last two available
          let aKey = momA && monthlyProduct.has(momA) ? momA : undefined;
          let bKey = momB && monthlyProduct.has(momB) ? momB : undefined;
          if (!aKey || !bKey) {
            if (orderedMonths.length >= 2) {
              aKey = orderedMonths[orderedMonths.length - 2];
              bKey = orderedMonths[orderedMonths.length - 1];
            }
          }
          const aMap = (aKey ? monthlyProduct.get(aKey) : undefined) || new Map<string, { title: string; qty: number; sales: number }>();
          const bMap = (bKey ? monthlyProduct.get(bKey) : undefined) || new Map<string, { title: string; qty: number; sales: number }>();
          const monthLabel = (k?: string) => {
            if (!k) return "";
            const [y, mm] = k.split('-').map((x) => parseInt(x, 10));
            const d = new Date(Date.UTC(y, mm - 1, 1));
            return `${d.toLocaleString("en-US", { month: "short" })} ${y}`;
          };
          // Expose months for UI selectors as well
          momMonths = orderedMonths.map((k) => ({ key: k, label: monthLabel(k) }));
          comparisonHeaders = [
            `Product (${monthLabel(aKey)} → ${monthLabel(bKey)})`,
            "Qty (Curr)", "Qty (Prev)", "Qty Δ", "Qty Δ%",
            "Sales (Curr)", "Sales (Prev)", "Sales Δ", "Sales Δ%",
          ];
          const keys = new Set<string>([...Array.from(aMap.keys()), ...Array.from(bMap.keys())]);
          const rows: Array<Record<string, any>> = [];
          for (const pid of keys) {
            const title = (bMap.get(pid)?.title) || (aMap.get(pid)?.title) || productSet.get(pid) || pid;
            const a = aMap.get(pid) || { title, qty: 0, sales: 0 };
            const b = bMap.get(pid) || { title, qty: 0, sales: 0 };
            rows.push({
              product: title,
              qtyCurr: b.qty,
              qtyPrev: a.qty,
              qtyDelta: b.qty - a.qty,
              qtyDeltaPct: a.qty ? (((b.qty - a.qty) / a.qty) * 100) : null,
              salesCurr: b.sales,
              salesPrev: a.sales,
              salesDelta: b.sales - a.sales,
              salesDeltaPct: a.sales ? (((b.sales - a.sales) / a.sales) * 100) : null,
            });
          }
          rows.sort((x, y) => (y.salesDelta as number) - (x.salesDelta as number));
          comparisonTable = rows.slice(0, 100);
        } else {
          // Default previous period vs current period (existing behavior)
          comparisonHeaders = ["Product", "Qty (Curr)", "Qty (Prev)", "Qty Δ", "Qty Δ%", "Sales (Curr)", "Sales (Prev)", "Sales Δ", "Sales Δ%"];
          // Merge keys
          const keys = new Set<string>([...productSet.keys(), ...prevCounts.keys()]);
          const rows: Array<Record<string, any>> = [];
          for (const pid of keys) {
            const title = productSet.get(pid) || prevCounts.get(pid)?.title || pid;
            const qCurr = counts.get(pid)?.quantity || 0;
            const qPrev = prevCounts.get(pid)?.quantity || 0;
            const sCurr = salesByProduct.get(pid) || 0;
            const sPrev = prevSalesByProduct.get(pid) || 0;
            rows.push({
              product: title,
              qtyCurr: qCurr,
              qtyPrev: qPrev,
              qtyDelta: qCurr - qPrev,
              qtyDeltaPct: qPrev ? (((qCurr - qPrev) / qPrev) * 100) : null,
              salesCurr: sCurr,
              salesPrev: sPrev,
              salesDelta: sCurr - sPrev,
              salesDeltaPct: sPrev ? (((sCurr - sPrev) / sPrev) * 100) : null,
            });
          }
          rows.sort((a, b) => (b.salesDelta as number) - (a.salesDelta as number));
          comparisonTable = rows.slice(0, 50);
        }
      }
    }

    return json({
      topProducts,
      topProductsBySales,
      series,
      table,
      headers: topProducts.slice(0, 20).map((p) => ({ id: p.id, title: p.title })),
      totals: { qty: totalQty, sales: totalSales, currency: currencyCode },
      comparison,
      comparisonTable,
      comparisonHeaders,
      seriesProduct,
      seriesProductLines,
      productLegend: top5Ids.map((id) => ({ id, title: productSet.get(id) || id })),
      momMonths,
      filters: { start: fmtYMD(start!), end: fmtYMD(end!), granularity: granParam, preset, view, compare: compareMode, chart: chartType, metric: chartMetric, chartScope, compareScope, productFocus, momA: momA || undefined, momB: momB || undefined },
      shop: session.shop,
    });
  } catch (err: any) {
    // Return a structured error with diagnostics
    dlog("Loader error:", err?.message, err?.response?.errors || err);
    return json(
      {
        error: "REQUEST_FAILED",
        message: err?.message || "Failed to load orders",
        shop: session.shop,
      },
      { status: 200 },
    );
  }
};

export function ErrorBoundary() {
  const error = useRouteError() as any;

  return (
    <Page>
      <TitleBar title="Analytics" />
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Something went wrong</Text>
        <Text as="p" variant="bodyMd">{error?.message || "Unknown error"}</Text>
      </BlockStack>
    </Page>
  );
}

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isNavLoading = navigation.state !== "idle";
  const [isExporting, setIsExporting] = useState(false);
  // Handle known error cases with helpful actions
  const errType = (data as any).error as string | undefined;
  if (errType === "ACCESS_DENIED") {
    const shop = (data as any).shop as string | undefined;
    const search = new URLSearchParams(location.search);
    const host = search.get("host") ?? undefined;
    // Point to our server route which will do a safe top-level redirect to /auth
    const base = shop ? `/app/reauth?shop=${encodeURIComponent(shop)}&reinstall=1` : "/app/reauth";
    const reauthUrl = host ? `${base}&host=${encodeURIComponent(host)}` : base;

    const redirectTop = () => {
      // Force a top-level redirect; works inside the embedded iframe
      if (typeof window !== "undefined" && window.top) {
        try {
          (window.top as Window).location.assign(reauthUrl);
          return;
        } catch (e) {
          // fall through to link below
        }
      }
      // Fallback: navigate current frame
      window.location.assign(reauthUrl);
    };
    return (
      <Page>
        <TitleBar title="Analytics" />
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            {(data as any).message}
          </Text>
          <Button onClick={redirectTop} variant="primary">
            Reauthorize app
          </Button>
          <Text as="p" variant="bodySm">
            If the button above doesn’t work, try this link: <Link url={reauthUrl}>Open auth</Link>
          </Text>
          <Text as="p" variant="bodySm">
            Or open auth in the top window: {" "}
            <a href={reauthUrl} target="_top" rel="noreferrer">Open auth (top)</a>
          </Text>
        </BlockStack>
      </Page>
    );
  }

  const topProducts = Array.isArray((data as any).topProducts)
    ? ((data as any).topProducts as Array<{ id: string; title: string; quantity: number }>)
    : [];
  const series = Array.isArray((data as any).series)
    ? ((data as any).series as Array<{ key: string; label: string; quantity: number; sales: number }>)
    : [];
  type Filters = { start: string; end: string; granularity: string; preset: string; view?: string; compare?: string; chart?: string; compareScope?: string; metric?: string; chartScope?: string; productFocus?: string; momA?: string; momB?: string };
  const filters = (data as any).filters as Filters | undefined;
  const topBySales = Array.isArray((data as any).topProductsBySales)
    ? ((data as any).topProductsBySales as Array<{ id: string; title: string; sales: number }>)
    : [];
  const productLegend = Array.isArray((data as any).productLegend)
    ? ((data as any).productLegend as Array<{ id: string; title: string }>)
    : [];
  const seriesProduct = Array.isArray((data as any).seriesProduct)
    ? ((data as any).seriesProduct as Array<{ key: string; label: string; per: Record<string, { qty: number; sales: number; title: string }> }>)
    : [];
  const seriesProductLines = Array.isArray((data as any).seriesProductLines)
    ? ((data as any).seriesProductLines as Array<{ id: string; title: string; points: Array<{ key: string; label: string; qty: number; sales: number }> }>)
    : [];
  const totals = (data as any).totals as { qty: number; sales: number; currency?: string } | undefined;
  const comparison = (data as any).comparison as
    | { mode: string; current: { qty: number; sales: number }; previous: { qty: number; sales: number }; deltas: { qty: number; qtyPct: number | null; sales: number; salesPct: number | null }; prevRange: { start: string; end: string } }
    | null;
  const headers = Array.isArray((data as any).headers)
    ? ((data as any).headers as Array<{ id: string; title: string }>)
    : [];
  const tableData = Array.isArray((data as any).table)
    ? ((data as any).table as Array<Record<string, any>>)
    : [];
  const momMonths = Array.isArray((data as any).momMonths)
    ? ((data as any).momMonths as Array<{ key: string; label: string }>)
    : [];

  const rows = topProducts.map((p, idx) => [String(idx + 1), p.title, String(p.quantity)]);

  // Compute simple bar visualization values
  const maxQ = series.reduce((m, s) => Math.max(m, s.quantity), 0) || 1;
  const visBars = series.map((s) => ({ label: s.label, pct: Math.round((s.quantity / maxQ) * 100), qty: s.quantity }));

  // Formatting helpers
  const fmtNum = (n: number | null | undefined) => {
    const v = Number(n ?? 0);
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(v);
  };
  const fmtPct = (n: number | null | undefined) => (n == null ? "–" : `${n.toFixed(1)}%`);
  const fmtMoney = (n: number | null | undefined) => {
    const v = Number(n ?? 0);
    const formatted = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
    return totals?.currency ? `${totals.currency} ${formatted}` : formatted;
  };

  const onFilterChange = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    const form = e?.currentTarget ?? (document.getElementById("filters-form") as HTMLFormElement | null);
    if (!form) return;
    const formData = new FormData(form);
    submit(formData, { method: "get" });
  };

  // Build export URL with current filters and open in a new tab
  const exportWorkbook = () => {
    setIsExporting(true);
    const form = document.getElementById("filters-form") as HTMLFormElement | null;
    const fd = form ? new FormData(form) : new FormData();
    // Ensure compare/momA/momB/compareScope persist
    if (!fd.get("view")) fd.set("view", filters?.view || "chart");
    if (!fd.get("compare")) fd.set("compare", filters?.compare || "none");
    if (!fd.get("compareScope")) fd.set("compareScope", filters?.compareScope || "aggregate");
    if (filters?.momA) fd.set("momA", filters.momA);
    if (filters?.momB) fd.set("momB", filters.momB);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string" && v !== "") params.set(k, v);
    }
    params.set("format", "xlsx");
    const href = `/app/analytics/export?${params.toString()}`;
    // Create a temporary form targeting a new tab to ensure first-party cookie context
    const formEl = document.createElement('form');
    formEl.method = 'GET';
    formEl.action = href;
    formEl.target = '_blank';
    document.body.appendChild(formEl);
    formEl.submit();
    document.body.removeChild(formEl);
    // Brief loading indicator
    window.setTimeout(() => setIsExporting(false), 1500);
  };

  // Precompute strongly-typed table config for Table view
  const tableColumnTypes: ("text" | "numeric")[] = ["text", ...headers.map(() => "numeric" as const)];
  const tableHeadings: string[] = ["Time Period", ...headers.map((h) => h.title)];
  const tableRows: string[][] = tableData.map((r) => [r.label, ...headers.map((h) => String(r[h.id] || 0))]);

  // Chart helpers and dimensions
  const chartType = (filters?.chart as string) || "bar";
  const svgPadding = { top: 20, right: 24, bottom: 40, left: 40 };
  const svgW = Math.max(560, 48 + series.length * 80);
  const svgH = 260;
  const innerW = svgW - svgPadding.left - svgPadding.right;
  const innerH = svgH - svgPadding.top - svgPadding.bottom;
  const yMaxQty = Math.max(1, ...series.map((s) => s.quantity));
  const yMaxSales = Math.max(1, ...series.map((s) => s.sales));
  const yMaxMetric = (filters?.metric === 'sales') ? yMaxSales : yMaxQty;
  const yScaleM = (v: number) => innerH - (v / yMaxMetric) * innerH;
  const xBand = (i: number) => (innerW / Math.max(1, series.length)) * i + (innerW / Math.max(1, series.length)) / 2;
  const colorPalette = ["#5c6ac4", "#47c1bf", "#f49342", "#bb86fc", "#9c6ade"];

  const changeChart = (type: string) => {
    const form = document.getElementById("filters-form") as HTMLFormElement | null;
    const fd = form ? new FormData(form) : new FormData();
    fd.set("view", "chart");
    fd.set("chart", type);
    if (!(fd.get("metric"))) fd.set("metric", (filters?.metric as string) || "qty");
    if (!(fd.get("chartScope"))) fd.set("chartScope", (filters?.chartScope as string) || "aggregate");
    submit(fd, { method: "get" });
  };

  const applyPatch = (patch: Record<string, string>) => {
    const form = document.getElementById("filters-form") as HTMLFormElement | null;
    const fd = form ? new FormData(form) : new FormData();
    for (const [k, v] of Object.entries(patch)) fd.set(k, v);
    submit(fd, { method: "get" });
  };

  const changeView = (view: string) => {
    const form = document.getElementById("filters-form") as HTMLFormElement | null;
    const fd = form ? new FormData(form) : new FormData();
    fd.set("view", view);
    submit(fd, { method: "get" });
  };

  const changeCompare = (mode: string) => {
    const form = document.getElementById("filters-form") as HTMLFormElement | null;
    const fd = form ? new FormData(form) : new FormData();
    fd.set("compare", mode);
    fd.set("view", "compare");
    submit(fd, { method: "get" });
  };

  return (
    <Page>
      <TitleBar title="Analytics" />
      <BlockStack gap="400">
        {/* Filters */}
        <form id="filters-form" onSubmit={onFilterChange}>
          <input type="hidden" name="view" defaultValue={filters?.view ?? "chart"} />
          <input type="hidden" name="compare" defaultValue={filters?.compare ?? "none"} />
          <input type="hidden" name="compareScope" defaultValue={filters?.compareScope ?? "aggregate"} />
          <input type="hidden" name="metric" defaultValue={filters?.metric ?? "qty"} />
          <input type="hidden" name="chartScope" defaultValue={filters?.chartScope ?? "aggregate"} />
          <input type="hidden" name="productFocus" defaultValue={filters?.productFocus ?? "all"} />
          <div className="analytics-form-row">
          <InlineStack gap="300" wrap>
            <label className="analytics-select">
              <span>Preset</span>
              <select name="preset" defaultValue={filters?.preset ?? "last30"}>
                <option value="last7">Last 7 days</option>
                <option value="last30">Last 30 days</option>
                <option value="thisMonth">This month</option>
                <option value="lastMonth">Last month</option>
                <option value="ytd">Year to date</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="analytics-select">
              <span>Start</span>
              <input name="start" type="date" defaultValue={filters?.start ?? ""} />
            </label>
            <label className="analytics-select">
              <span>End</span>
              <input name="end" type="date" defaultValue={filters?.end ?? ""} />
            </label>
            <label className="analytics-select">
              <span>Granularity</span>
              <select name="granularity" defaultValue={(filters?.granularity as string) ?? "day"}>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
            <div className="analytics-apply"><Button submit variant="primary">Apply</Button></div>
          </InlineStack>
          </div>
        </form>

        {/* Tabs */}
        <InlineStack gap="200" wrap>
          <Button onClick={() => changeView("chart")} variant={filters?.view === "chart" || !filters?.view ? "primary" : undefined}>Chart</Button>
          <Button onClick={() => changeView("table")} variant={filters?.view === "table" ? "primary" : undefined}>Table</Button>
          <Button onClick={() => changeView("summary")} variant={filters?.view === "summary" ? "primary" : undefined}>Summary</Button>
          <Button onClick={() => changeView("compare")} variant={filters?.view === "compare" ? "primary" : undefined}>Comparison</Button>
          <span className="spacer-16" />
          <Button onClick={exportWorkbook}>Export (Excel)</Button>
        </InlineStack>

        {/* Chart view */}
        {(!filters?.view || filters?.view === "chart") && (
          <>
            <div className="analytics-card">
              <div className="analytics-header">
                <Text as="h2" variant="headingMd">{(filters?.metric || 'qty') === 'sales' ? 'Sales' : 'Quantity'} over time</Text>
                <div className="analytics-segmented">
                <InlineStack gap="100">
                  <Button onClick={() => applyPatch({ view: 'chart', metric: 'qty' })} variant={(filters?.metric || 'qty') === 'qty' ? 'primary' : undefined}>Qty</Button>
                  <Button onClick={() => applyPatch({ view: 'chart', metric: 'sales' })} variant={(filters?.metric || 'qty') === 'sales' ? 'primary' : undefined}>Sales</Button>
                  <span className="spacer-12" />
                  <Button onClick={() => applyPatch({ view: 'chart', chartScope: 'aggregate' })} variant={(filters?.chartScope || 'aggregate') === 'aggregate' ? 'primary' : undefined}>Aggregate</Button>
                  <Button onClick={() => applyPatch({ view: 'chart', chartScope: 'product' })} variant={filters?.chartScope === 'product' ? 'primary' : undefined}>By product</Button>
                  <span className="spacer-12" />
                  <Button onClick={() => changeChart("bar")} variant={chartType === "bar" ? "primary" : undefined}>Bar</Button>
                  <Button onClick={() => changeChart("line")} variant={chartType === "line" ? "primary" : undefined}>Line</Button>
                </InlineStack>
                </div>
              </div>
              {series.length === 0 ? (
                <Text as="p" variant="bodyMd">No data in range.</Text>
              ) : (
                <>
                <div className="analytics-chart-scroll">
                  <svg width={svgW} height={svgH} role="img" aria-label="Chart">
                    {/* Axes */}
                    <g transform={`translate(${svgPadding.left},${svgPadding.top})`}>
                      {/* Y axis */}
                      <line x1={0} y1={0} x2={0} y2={innerH} stroke="#d0d4d9" />
                      {/* Y ticks */}
                      {Array.from({ length: 5 }).map((_, i) => {
                        const valueGetter = (d: any) => (filters?.metric === 'sales' ? d.sales : d.quantity);
                        const maxVal = Math.max(1, ...series.map(valueGetter));
                        const v = (maxVal / 4) * i;
                        const y = yScaleM(v);
                        return (
                          <g key={i}>
                            <line x1={-4} y1={y} x2={0} y2={y} stroke="#aeb4bb" />
                            <text x={-8} y={y + 4} textAnchor="end" fontSize={10} fill="#6b7177">{Math.round(v)}</text>
                            <line x1={0} y1={y} x2={innerW} y2={y} stroke="#f1f3f5" />
                          </g>
                        );
                      })}
                      {/* X axis */}
                      <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#d0d4d9" />
                      {series.map((s, i) => (
                        <text key={s.key} x={xBand(i)} y={innerH + 16} textAnchor="middle" fontSize={10} fill="#6b7177">{s.label}</text>
                      ))}

                      {/* Bars or Line */}
                      {chartType === "bar" && (
                        (filters?.chartScope === 'product'
                          ? (
                              // Stacked bars for top 5 products
                              series.map((s, i) => {
                                const cx = xBand(i);
                                const barW = Math.max(22, innerW / Math.max(1, series.length) * 0.5);
                                let yCursor = innerH;
                                const per = ((data as any).seriesProduct as any[]).find((x) => x.key === s.key)?.per || {};
                                const allLegend = ((data as any).productLegend as any[]) || [];
                                const legend = (filters?.productFocus && filters.productFocus !== 'all')
                                  ? allLegend.filter((lg: any) => lg.id === filters.productFocus)
                                  : allLegend;
                                const colors = ["#5c6ac4", "#47c1bf", "#f49342", "#bb86fc", "#9c6ade"]; // 5 colors
                                return (
                                  <g key={s.key}>
                                    {legend.map((lg: any, idx: number) => {
                                      const val = per[lg.id] ? (filters?.metric === 'sales' ? per[lg.id].sales : per[lg.id].qty) : 0;
                                      const h = innerH - yScaleM(val);
                                      yCursor -= h;
                                      return (
                                        <rect key={lg.id}
                                          x={cx - barW / 2}
                                          y={yCursor}
                                          width={barW}
                                          height={h}
                                          fill={colors[idx % colors.length]}
                                        >
                                          <title>{`${s.label} • ${lg.title}: ${filters?.metric === 'sales' ? fmtMoney(val) : fmtNum(val)}`}</title>
                                        </rect>
                                      );
                                    })}
                                  </g>
                                );
                              })
                            )
                          : (
                              // Aggregate single bar
                              series.map((s, i) => {
                                const cx = xBand(i);
                                const barW = Math.max(22, innerW / Math.max(1, series.length) * 0.5);
                                const val = (filters?.metric === 'sales' ? s.sales : s.quantity);
                                const h = innerH - yScaleM(val);
                                return (
                                  <rect key={s.key}
                                    x={cx - barW / 2}
                                    y={yScaleM(val)}
                                    width={barW}
                                    height={h}
                                    rx={4}
                                    fill="#5c6ac4"
                                  >
                                    <title>{`${s.label}: ${filters?.metric === 'sales' ? fmtMoney(val) : fmtNum(val)}`}</title>
                                  </rect>
                                );
                              })
                            ))
                      )}

                      {chartType === "line" && (
                        <>
                          {filters?.chartScope === 'product'
                            ? (
                                // Multiple product lines (optionally focused)
                                seriesProductLines
                                  .filter((pl) => !filters?.productFocus || filters.productFocus === 'all' || pl.id === filters.productFocus)
                                  .map((pl, idx) => (
                                  <g key={pl.id}>
                                    <polyline
                                      fill="none"
                                      stroke={colorPalette[idx % colorPalette.length]}
                                      strokeWidth={2}
                                      points={pl.points.map((pt, i) => {
                                        const val = (filters?.metric === 'sales' ? pt.sales : pt.qty);
                                        return `${xBand(i)},${yScaleM(val)}`;
                                      }).join(' ')}
                                    />
                                    {pl.points.map((pt, i) => {
                                      const val = (filters?.metric === 'sales' ? pt.sales : pt.qty);
                                      return <circle key={`${pl.id}-${pt.key}`} cx={xBand(i)} cy={yScaleM(val)} r={3} fill={colorPalette[idx % colorPalette.length]}>
                                        <title>{`${pt.label} • ${pl.title}: ${filters?.metric === 'sales' ? fmtMoney(val) : fmtNum(val)}`}</title>
                                      </circle>;
                                    })}
                                  </g>
                                ))
                              )
                            : (
                                // Single aggregate line
                                <>
                                  <polyline
                                    fill="none"
                                    stroke="#5c6ac4"
                                    strokeWidth={2}
                                    points={series.map((s, i) => {
                                      const val = (filters?.metric === 'sales' ? s.sales : s.quantity);
                                      return `${xBand(i)},${yScaleM(val)}`;
                                    }).join(" ")}
                                  />
                                  {series.map((s, i) => {
                                    const val = (filters?.metric === 'sales' ? s.sales : s.quantity);
                                    return <circle key={s.key} cx={xBand(i)} cy={yScaleM(val)} r={3} fill="#5c6ac4">
                                      <title>{`${s.label}: ${filters?.metric === 'sales' ? fmtMoney(val) : fmtNum(val)}`}</title>
                                    </circle>;
                                  })}
                                </>
                              )}
                        </>
                      )}
                    </g>
                  </svg>
                </div>
                {/* Legend and product focus (beneath chart) */}
                {filters?.chartScope === 'product' && productLegend.length > 0 && (
                  <div className="analytics-legend">
                    <div className="analytics-legend-chips">
                      {productLegend.map((p, idx) => (
                        <span
                          key={p.id}
                          className={`analytics-legend-chip ${(filters?.productFocus && filters.productFocus !== 'all' && filters.productFocus !== p.id) ? 'analytics-muted' : ''}`}
                          onClick={() => applyPatch({ view: 'chart', chartScope: 'product', productFocus: (filters?.productFocus === p.id ? 'all' : p.id) })}
                          title={`Show only ${p.title}`}
                        >
                          <span className="analytics-legend-swatch" style={{ background: colorPalette[idx % colorPalette.length] }} />
                          <span className="text-12">{p.title}</span>
                        </span>
                      ))}
                    </div>
                    <label className="inline-label">
                      <span className="legend-label">Show only</span>
                      <select defaultValue={filters?.productFocus ?? 'all'} onChange={(e) => applyPatch({ view: 'chart', productFocus: e.currentTarget.value })}>
                        <option value="all">All products</option>
                        {productLegend.map((p) => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                </>
              )}
            </div>
          </>
        )}

        {/* Table view */}
        {filters?.view === "table" && (
          <>
            <Text as="h2" variant="headingMd">Table View</Text>
            <DataTable
              columnContentTypes={tableColumnTypes}
              headings={tableHeadings}
              rows={tableRows}
            />
          </>
        )}

        {/* Summary view */}
        {filters?.view === "summary" && (
          <>
            <Text as="h2" variant="headingMd">Summary</Text>
            <Text as="p" variant="bodyMd">Total quantity: {fmtNum(totals?.qty)}</Text>
            <Text as="p" variant="bodyMd">Total sales: {fmtMoney(totals?.sales)}</Text>

            <Text as="h3" variant="headingSm" tone="subdued">Top 10 products by quantity</Text>
            <DataTable
              columnContentTypes={["numeric", "text", "numeric"]}
              headings={["#", "Product", "Qty"]}
              rows={topProducts.map((p, i) => [String(i + 1), p.title, String(p.quantity)])}
            />

            <Text as="h3" variant="headingSm" tone="subdued">Top 10 products by sales</Text>
            <DataTable
              columnContentTypes={["numeric", "text", "numeric"]}
              headings={["#", "Product", "Sales"]}
              rows={topBySales.map((p, i) => [String(i + 1), p.title, fmtMoney(p.sales)])}
            />
          </>
        )}

        {/* Comparison view */}
        {filters?.view === "compare" && (
          <>
            <InlineStack gap="200" wrap>
              <Button onClick={() => changeCompare("none")} variant={filters?.compare === "none" ? "primary" : undefined}>None</Button>
              <Button onClick={() => changeCompare("mom")} variant={filters?.compare === "mom" ? "primary" : undefined}>Month-on-Month</Button>
              <Button onClick={() => changeCompare("yoy")} variant={filters?.compare === "yoy" ? "primary" : undefined}>Year-on-Year</Button>
              <span className="spacer-16" />
              <Button onClick={() => { const fd = new FormData(document.getElementById("filters-form") as HTMLFormElement); fd.set("view","compare"); fd.set("compareScope","aggregate"); submit(fd,{method:"get"}); }} variant={filters?.compareScope === "aggregate" ? "primary" : undefined}>Aggregated</Button>
              <Button onClick={() => { const fd = new FormData(document.getElementById("filters-form") as HTMLFormElement); fd.set("view","compare"); fd.set("compareScope","product"); submit(fd,{method:"get"}); }} variant={filters?.compareScope === "product" ? "primary" : undefined}>By product</Button>
            </InlineStack>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Comparison</Text>
              {/* MoM month selectors */}
              {filters?.compare === 'mom' && (filters?.compareScope === 'aggregate' || filters?.compareScope === 'product') && (
                <div className="analytics-compare-selectors">
                <InlineStack gap="200" wrap>
                  <label className="inline-label">
                    <span className="legend-label">Month A</span>
                    <select id="momA" defaultValue={filters?.momA || ''}>
                      <option value="">(auto)</option>
                      {momMonths.map((m) => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-label">
                    <span className="legend-label">Month B</span>
                    <select id="momB" defaultValue={filters?.momB || ''}>
                      <option value="">(auto next)</option>
                      {momMonths.map((m) => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="analytics-compare-apply"><Button onClick={() => {
                    const a = (document.getElementById('momA') as HTMLSelectElement | null)?.value || '';
                    const b = (document.getElementById('momB') as HTMLSelectElement | null)?.value || '';
                    const scope = (filters?.compareScope as string) || 'aggregate';
                    applyPatch({ view: 'compare', compare: 'mom', compareScope: scope, momA: a, momB: b });
                  }} variant="primary">Apply</Button></div>
                </InlineStack>
                </div>
              )}
              {!comparison && <Text as="p" variant="bodyMd">Select a comparison mode to calculate deltas.</Text>}
              {!!comparison && (
                <>
                  {filters?.compareScope === "aggregate" && filters?.compare === 'mom' && (
                    <div className="analytics-table-sticky">
                    <DataTable
                      columnContentTypes={["text","numeric","numeric","numeric","text","numeric","numeric","numeric","text"]}
                      headings={["Period","Qty (Curr)","Qty (Prev)","Qty Δ","Qty Δ%","Sales (Curr)","Sales (Prev)","Sales Δ","Sales Δ%"]}
                      rows={((data as any).comparisonTable as any[]).map((r: any) => [
                        r.period,
                        fmtNum(r.qtyCurr),
                        fmtNum(r.qtyPrev),
                        fmtNum(r.qtyDelta),
                        fmtPct(r.qtyDeltaPct),
                        fmtMoney(r.salesCurr),
                        fmtMoney(r.salesPrev),
                        fmtMoney(r.salesDelta),
                        fmtPct(r.salesDeltaPct),
                      ])}
                    />
                    </div>
                  )}
                  {filters?.compareScope === "aggregate" && filters?.compare === 'yoy' && (
                    <div className="analytics-table-sticky">
                    <DataTable
                      columnContentTypes={["text","numeric","numeric","numeric","text"]}
                      headings={["Metric","Current","Previous","Change","% Change"]}
                      rows={(data as any).comparisonTable.map((r: any) => [
                        r.metric,
                        r.metric === "Sales" ? fmtMoney(r.current) : fmtNum(r.current),
                        r.metric === "Sales" ? fmtMoney(r.previous) : fmtNum(r.previous),
                        r.metric === "Sales" ? fmtMoney(r.change) : fmtNum(r.change),
                        typeof r.changePct === "string" ? r.changePct : fmtPct(r.changePct as number | null | undefined),
                      ])}
                    />
                    </div>
                  )}

                  {filters?.compareScope === "product" && (
                    <div className="analytics-table-sticky">
                    <DataTable
                      columnContentTypes={["text","numeric","numeric","numeric","text","numeric","numeric","numeric","text"]}
                      headings={["Product","Qty (Curr)","Qty (Prev)","Qty Δ","Qty Δ%","Sales (Curr)","Sales (Prev)","Sales Δ","Sales Δ%"]}
                      rows={(data as any).comparisonTable.map((r: any) => [
                        r.product,
                        fmtNum(r.qtyCurr),
                        fmtNum(r.qtyPrev),
                        fmtNum(r.qtyDelta),
                        fmtPct(r.qtyDeltaPct),
                        fmtMoney(r.salesCurr),
                        fmtMoney(r.salesPrev),
                        fmtMoney(r.salesDelta),
                        fmtPct(r.salesDeltaPct),
                      ])}
                    />
                    </div>
                  )}
                </>
              )}
            </BlockStack>
          </>
        )}
        {errType && errType !== "ACCESS_DENIED" && (
          <Text as="p" variant="bodySm">
            Error loading analytics: {(data as any).message || errType}
          </Text>
        )}
        {/* Retain original table under Chart view as a quick glance */}
        {/* Removed top products table from Chart view as requested */}
      </BlockStack>
    </Page>
  );
}
