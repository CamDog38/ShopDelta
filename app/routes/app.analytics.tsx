import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useLocation, useRouteError, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { Page, DataTable, BlockStack, Text, Link, Button, InlineStack, Spinner } from "@shopify/polaris";
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
        pageInfo { hasNextPage }
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
                  title
                  discountedTotalSet { shopMoney { amount currencyCode } }
                  product { id title }
                  variant { sku }
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
      const response: Response = await admin.graphql(query, { variables: { first: 250, search, after } });
      const data = await response.json();
      dlog("GraphQL status:", response.status, "keys:", Object.keys(data || {}));
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
        after = newEdges.length ? (newEdges[newEdges.length - 1]?.cursor as string) : null;
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
    const productSet = new Map<string, { title: string; sku: string }>(); // id -> {title, sku}
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
        const sku: string = product?.sku ?? "";
        if (!counts.has(id)) counts.set(id, { title, quantity: 0 });
        counts.get(id)!.quantity += qty;
        buckets.get(key)!.quantity += qty;
        productSet.set(id, { title, sku });
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
      .map(([id, sales]) => ({ id, title: productSet.get(id)?.title || id, sales }))
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
        per[pid] = { qty: q, sales: alloc, title: productSet.get(pid)?.title || pid };
      }
      return { key: s.key, label: s.label, per };
    });

    // Build per-product line series across buckets for line charts
    const seriesProductLines = top5Ids.map((pid) => ({
      id: pid,
      title: productSet.get(pid)?.title || pid,
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
          // Year-on-Year: show monthly breakdown (Jan 2024 vs Jan 2025, etc.)
          // Build monthly totals for current period from buckets map
          const monthlyCurr = new Map<string, { label: string; qty: number; sales: number }>();
          for (const [key, info] of buckets.entries()) {
            // derive month key YYYY-MM from bucket key/label
            let mKey = key;
            if (!/^\d{4}-\d{2}$/.test(mKey)) {
              const m = (key.match(/^(\d{4})-(\d{2})/) || info.label.match(/(\d{4})-(\d{2})/));
              if (m) mKey = `${m[1]}-${m[2]}`; else continue;
            }
            const [y, mm] = mKey.split('-').map((x)=>parseInt(x,10));
            const d = new Date(Date.UTC(y, mm-1, 1));
            const label = `${d.toLocaleString("en-US", { month: "short" })} ${y}`;
            if (!monthlyCurr.has(mKey)) monthlyCurr.set(mKey, { label, qty: 0, sales: 0 });
            const acc = monthlyCurr.get(mKey)!;
            acc.qty += info.quantity;
            acc.sales += (bucketSales.get(key) || 0);
          }

          // Build monthly totals for previous period from prevEdges
          const monthlyPrev = new Map<string, { qty: number; sales: number }>();
          for (const e of prevEdges) {
            const d = new Date(e?.node?.processedAt);
            const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
            if (!monthlyPrev.has(mKey)) monthlyPrev.set(mKey, { qty: 0, sales: 0 });
            const liEdges = e?.node?.lineItems?.edges ?? [];
            for (const li of liEdges) {
              const q = li?.node?.quantity ?? 0;
              const amountStr: string | undefined = li?.node?.discountedTotalSet?.shopMoney?.amount as any;
              const amt = amountStr ? parseFloat(amountStr) : 0;
              const acc = monthlyPrev.get(mKey)!;
              acc.qty += q; acc.sales += amt;
            }
          }

          // Align months by label (current period months shown; previous uses same month of prior year)
          const ordered = Array.from(monthlyCurr.entries()).sort((a,b)=> (a[0] > b[0] ? 1 : -1));
          comparisonHeaders = ["Period","Qty (Curr)","Qty (Prev)","Qty Δ","Qty Δ%","Sales (Curr)","Sales (Prev)","Sales Δ","Sales Δ%"]; 
          const rows: Array<Record<string, any>> = [];
          for (const [mKey, curr] of ordered) {
            // Find corresponding month in previous-year map: subtract 1 year
            const [y, mm] = mKey.split('-').map((x)=>parseInt(x,10));
            const prevKey = `${y-1}-${String(mm).padStart(2,'0')}`;
            const prev = monthlyPrev.get(prevKey) || { qty: 0, sales: 0 };
            rows.push({
              period: curr.label,
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
          comparisonTable = rows;
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
              const title = productSet.get(pid)?.title || pid;
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
            const title = (bMap.get(pid)?.title) || (aMap.get(pid)?.title) || productSet.get(pid)?.title || pid;
            const a = aMap.get(pid) || { title, qty: 0, sales: 0 };
            const b = bMap.get(pid) || { title, qty: 0, sales: 0 };
            rows.push({
              product: title,
              productSku: productSet.get(pid)?.sku || "",
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
            const title = productSet.get(pid)?.title || prevCounts.get(pid)?.title || pid;
            const qCurr = counts.get(pid)?.quantity || 0;
            const qPrev = prevCounts.get(pid)?.quantity || 0;
            const sCurr = salesByProduct.get(pid) || 0;
            const sPrev = prevSalesByProduct.get(pid) || 0;
            rows.push({
              product: title,
              productSku: productSet.get(pid)?.sku || "",
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
      productLegend: top5Ids.map((id) => ({ id, title: productSet.get(id)?.title || id, sku: productSet.get(id)?.sku || "" })),
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
  const comparisonHeaders = Array.isArray((data as any).comparisonHeaders)
    ? ((data as any).comparisonHeaders as string[])
    : undefined;
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
        {/* Filters Card */}
        <div style={{ background: 'var(--p-color-bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--p-color-border)' }}>
          <Text as="h3" variant="headingSm" tone="subdued">Date Range & Filters</Text>
          <form id="filters-form" onSubmit={onFilterChange} style={{ marginTop: '16px' }}>
            <input type="hidden" name="view" defaultValue={filters?.view ?? "chart"} />
            <input type="hidden" name="compare" defaultValue={filters?.compare ?? "none"} />
            <input type="hidden" name="compareScope" defaultValue={filters?.compareScope ?? "aggregate"} />
            <input type="hidden" name="metric" defaultValue={filters?.metric ?? "qty"} />
            <input type="hidden" name="chartScope" defaultValue={filters?.chartScope ?? "aggregate"} />
            <input type="hidden" name="productFocus" defaultValue={filters?.productFocus ?? "all"} />
            <InlineStack gap="300" wrap align="end">
              <div style={{ minWidth: '140px' }}>
                <Text as="span" variant="bodySm" tone="subdued">Time Period</Text>
                <select 
                  name="preset" 
                  defaultValue={filters?.preset ?? "last30"} 
                  style={{ width: '100%', marginTop: '4px', padding: '8px', border: '1px solid var(--p-color-border)', borderRadius: '6px' }}
                  onChange={(e) => {
                    const preset = e.target.value;
                    const now = new Date();
                    const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                    const startInput = document.querySelector('input[name="start"]') as HTMLInputElement;
                    const endInput = document.querySelector('input[name="end"]') as HTMLInputElement;
                    
                    if (startInput && endInput) {
                      let start: Date, end: Date;
                      
                      switch (preset) {
                        case "last7":
                          end = utcNow;
                          start = new Date(utcNow);
                          start.setUTCDate(start.getUTCDate() - 6);
                          break;
                        case "last30":
                          end = utcNow;
                          start = new Date(utcNow);
                          start.setUTCDate(start.getUTCDate() - 29);
                          break;
                        case "thisMonth":
                          start = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), 1));
                          end = utcNow;
                          break;
                        case "lastMonth":
                          const firstThis = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), 1));
                          start = new Date(Date.UTC(firstThis.getUTCFullYear(), firstThis.getUTCMonth() - 1, 1));
                          end = new Date(Date.UTC(firstThis.getUTCFullYear(), firstThis.getUTCMonth(), 0));
                          break;
                        case "ytd":
                          start = new Date(Date.UTC(utcNow.getUTCFullYear(), 0, 1));
                          end = utcNow;
                          break;
                        default:
                          return; // Don't update for custom
                      }
                      
                      startInput.value = start.toISOString().slice(0, 10);
                      endInput.value = end.toISOString().slice(0, 10);
                    }
                  }}
                >
                  <option value="last7">Last 7 days</option>
                  <option value="last30">Last 30 days</option>
                  <option value="thisMonth">This month</option>
                  <option value="lastMonth">Last month</option>
                  <option value="ytd">Year to date</option>
                  <option value="custom">Custom range</option>
                </select>
              </div>
              <div style={{ minWidth: '120px' }}>
                <Text as="span" variant="bodySm" tone="subdued">Start Date</Text>
                <input name="start" type="date" defaultValue={filters?.start ?? ""} style={{ width: '100%', marginTop: '4px', padding: '8px', border: '1px solid var(--p-color-border)', borderRadius: '6px' }} />
              </div>
              <div style={{ minWidth: '120px' }}>
                <Text as="span" variant="bodySm" tone="subdued">End Date</Text>
                <input name="end" type="date" defaultValue={filters?.end ?? ""} style={{ width: '100%', marginTop: '4px', padding: '8px', border: '1px solid var(--p-color-border)', borderRadius: '6px' }} />
              </div>
              <div style={{ minWidth: '100px' }}>
                <Text as="span" variant="bodySm" tone="subdued">Group By</Text>
                <select name="granularity" defaultValue={(filters?.granularity as string) ?? "day"} style={{ width: '100%', marginTop: '4px', padding: '8px', border: '1px solid var(--p-color-border)', borderRadius: '6px' }}>
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
              </div>
              <Button submit variant="primary" disabled={isNavLoading} size="medium">Apply Filters</Button>
            </InlineStack>
            {isNavLoading && (
              <div style={{ marginTop: '12px' }}>
                <InlineStack gap="100" align="start">
                  <Spinner accessibilityLabel="Loading analytics" size="small" />
                  <Text as="span" variant="bodySm" tone="subdued">Updating data…</Text>
                </InlineStack>
              </div>
            )}
          </form>
        </div>

        {/* View Navigation */}
        <div style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          padding: '4px', 
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(102, 126, 234, 0.15)'
        }}>
          <InlineStack gap="100">
            <div 
              onClick={() => changeView("chart")} 
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                background: filters?.view === "chart" || !filters?.view 
                  ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                cursor: isNavLoading ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                border: 'none',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                opacity: isNavLoading ? 0.6 : 1,
                boxShadow: filters?.view === "chart" || !filters?.view 
                  ? '0 4px 15px rgba(79, 172, 254, 0.4)' 
                  : 'none'
              }}
            >
              📊 Charts
            </div>
            <div 
              onClick={() => changeView("table")} 
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                background: filters?.view === "table" 
                  ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                cursor: isNavLoading ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                border: 'none',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                opacity: isNavLoading ? 0.6 : 1,
                boxShadow: filters?.view === "table" 
                  ? '0 4px 15px rgba(79, 172, 254, 0.4)' 
                  : 'none'
              }}
            >
              📋 Data Table
            </div>
            <div 
              onClick={() => changeView("summary")} 
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                background: filters?.view === "summary" 
                  ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                cursor: isNavLoading ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                border: 'none',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                opacity: isNavLoading ? 0.6 : 1,
                boxShadow: filters?.view === "summary" 
                  ? '0 4px 15px rgba(79, 172, 254, 0.4)' 
                  : 'none'
              }}
            >
              📈 Summary
            </div>
            <div 
              onClick={() => changeView("compare")} 
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                background: filters?.view === "compare" 
                  ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                cursor: isNavLoading ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                border: 'none',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                opacity: isNavLoading ? 0.6 : 1,
                boxShadow: filters?.view === "compare" 
                  ? '0 4px 15px rgba(79, 172, 254, 0.4)' 
                  : 'none'
              }}
            >
              🔄 Compare
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <div 
                onClick={exportWorkbook} 
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                  color: 'white',
                  cursor: (isNavLoading || isExporting) ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  border: 'none',
                  transition: 'all 0.3s ease',
                  backdropFilter: 'blur(10px)',
                  opacity: (isNavLoading || isExporting) ? 0.6 : 1,
                  boxShadow: '0 4px 15px rgba(250, 112, 154, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isExporting ? '⏳' : '📥'} Export Excel
              </div>
            </div>
          </InlineStack>
        </div>

        {/* Chart view */}
        {(!filters?.view || filters?.view === "chart") && (
          <>
            <div style={{ background: 'var(--p-color-bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--p-color-border)' }}>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">{(filters?.metric || 'qty') === 'sales' ? '💰 Sales' : '📦 Quantity'} Analytics</Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {filters?.start && filters?.end ? `${filters.start} to ${filters.end}` : 'Select date range above'}
                  </Text>
                </InlineStack>
                
                <InlineStack gap="300" wrap>
                  <div>
                    <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                      <Text as="span" variant="bodySm" tone="subdued">Metric</Text>
                    </div>
                    <div style={{ 
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                      padding: '3px', 
                      borderRadius: '8px',
                      boxShadow: '0 2px 10px rgba(102, 126, 234, 0.15)'
                    }}>
                      <InlineStack gap="100">
                        <div 
                          onClick={() => applyPatch({ view: 'chart', metric: 'qty' })} 
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: (filters?.metric || 'qty') === 'qty' 
                              ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                              : 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            cursor: isNavLoading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            transition: 'all 0.3s ease',
                            opacity: isNavLoading ? 0.6 : 1,
                            boxShadow: (filters?.metric || 'qty') === 'qty' 
                              ? '0 2px 8px rgba(79, 172, 254, 0.4)' 
                              : 'none'
                          }}
                        >
                          📦 Quantity
                        </div>
                        <div 
                          onClick={() => applyPatch({ view: 'chart', metric: 'sales' })} 
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: (filters?.metric || 'qty') === 'sales' 
                              ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                              : 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            cursor: isNavLoading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            transition: 'all 0.3s ease',
                            opacity: isNavLoading ? 0.6 : 1,
                            boxShadow: (filters?.metric || 'qty') === 'sales' 
                              ? '0 2px 8px rgba(79, 172, 254, 0.4)' 
                              : 'none'
                          }}
                        >
                          💰 Sales
                        </div>
                      </InlineStack>
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                      <Text as="span" variant="bodySm" tone="subdued">View</Text>
                    </div>
                    <div style={{ 
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                      padding: '3px', 
                      borderRadius: '8px',
                      boxShadow: '0 2px 10px rgba(102, 126, 234, 0.15)'
                    }}>
                      <InlineStack gap="100">
                        <div 
                          onClick={() => applyPatch({ view: 'chart', chartScope: 'aggregate' })} 
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: (filters?.chartScope || 'aggregate') === 'aggregate' 
                              ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                              : 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            cursor: isNavLoading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            transition: 'all 0.3s ease',
                            opacity: isNavLoading ? 0.6 : 1,
                            boxShadow: (filters?.chartScope || 'aggregate') === 'aggregate' 
                              ? '0 2px 8px rgba(79, 172, 254, 0.4)' 
                              : 'none'
                          }}
                        >
                          📊 Total
                        </div>
                        <div 
                          onClick={() => applyPatch({ view: 'chart', chartScope: 'product' })} 
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: filters?.chartScope === 'product' 
                              ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                              : 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            cursor: isNavLoading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            transition: 'all 0.3s ease',
                            opacity: isNavLoading ? 0.6 : 1,
                            boxShadow: filters?.chartScope === 'product' 
                              ? '0 2px 8px rgba(79, 172, 254, 0.4)' 
                              : 'none'
                          }}
                        >
                          🏷️ By Product
                        </div>
                      </InlineStack>
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                      <Text as="span" variant="bodySm" tone="subdued">Chart Type</Text>
                    </div>
                    <div style={{ 
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                      padding: '3px', 
                      borderRadius: '8px',
                      boxShadow: '0 2px 10px rgba(102, 126, 234, 0.15)'
                    }}>
                      <InlineStack gap="100">
                        <div 
                          onClick={() => changeChart("bar")} 
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: chartType === "bar" 
                              ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                              : 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            cursor: isNavLoading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            transition: 'all 0.3s ease',
                            opacity: isNavLoading ? 0.6 : 1,
                            boxShadow: chartType === "bar" 
                              ? '0 2px 8px rgba(79, 172, 254, 0.4)' 
                              : 'none'
                          }}
                        >
                          📊 Bar
                        </div>
                        <div 
                          onClick={() => changeChart("line")} 
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: chartType === "line" 
                              ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                              : 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            cursor: isNavLoading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            transition: 'all 0.3s ease',
                            opacity: isNavLoading ? 0.6 : 1,
                            boxShadow: chartType === "line" 
                              ? '0 2px 8px rgba(79, 172, 254, 0.4)' 
                              : 'none'
                          }}
                        >
                          📈 Line
                        </div>
                      </InlineStack>
                    </div>
                  </div>
                </InlineStack>
              </BlockStack>
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
            <div style={{ background: 'var(--p-color-bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--p-color-border)' }}>
              <BlockStack gap="400">
                <div>
                  <Text as="h2" variant="headingMd">🔄 Comparison Analysis</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Compare performance across time periods and products</Text>
                </div>
                
                <InlineStack gap="300" wrap>
                  <div>
                    <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                      <Text as="span" variant="bodySm" tone="subdued">Comparison Type</Text>
                    </div>
                    <div style={{ 
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                      padding: '3px', 
                      borderRadius: '8px',
                      boxShadow: '0 2px 10px rgba(102, 126, 234, 0.15)'
                    }}>
                      <InlineStack gap="100">
                        <div 
                          onClick={() => changeCompare('mom')} 
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: (filters?.compare || 'mom') === 'mom' 
                              ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                              : 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            cursor: isNavLoading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            transition: 'all 0.3s ease',
                            opacity: isNavLoading ? 0.6 : 1,
                            boxShadow: (filters?.compare || 'mom') === 'mom' 
                              ? '0 2px 8px rgba(79, 172, 254, 0.4)' 
                              : 'none'
                          }}
                        >
                          📅 Month-over-Month
                        </div>
                        <div 
                          onClick={() => changeCompare('yoy')} 
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: filters?.compare === 'yoy' 
                              ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                              : 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            cursor: isNavLoading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            transition: 'all 0.3s ease',
                            opacity: isNavLoading ? 0.6 : 1,
                            boxShadow: filters?.compare === 'yoy' 
                              ? '0 2px 8px rgba(79, 172, 254, 0.4)' 
                              : 'none'
                          }}
                        >
                          📆 Year-over-Year
                        </div>
                      </InlineStack>
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                      <Text as="span" variant="bodySm" tone="subdued">Scope</Text>
                    </div>
                    <div style={{ 
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                      padding: '3px', 
                      borderRadius: '8px',
                      boxShadow: '0 2px 10px rgba(102, 126, 234, 0.15)'
                    }}>
                      <InlineStack gap="100">
                        <div
                          onClick={() => applyPatch({ view: 'compare', compare: (filters?.compare as string) || 'mom', compareScope: 'aggregate', momA: filters?.momA || '', momB: filters?.momB || '' })}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: (filters?.compareScope || 'aggregate') === 'aggregate' 
                              ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                              : 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            cursor: isNavLoading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            transition: 'all 0.3s ease',
                            opacity: isNavLoading ? 0.6 : 1,
                            boxShadow: (filters?.compareScope || 'aggregate') === 'aggregate' 
                              ? '0 2px 8px rgba(79, 172, 254, 0.4)' 
                              : 'none'
                          }}
                        >
                          📊 Overall Totals
                        </div>
                        <div
                          onClick={() => applyPatch({ view: 'compare', compare: (filters?.compare as string) || 'mom', compareScope: 'product', momA: filters?.momA || '', momB: filters?.momB || '' })}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: filters?.compareScope === 'product' 
                              ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' 
                              : 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            cursor: isNavLoading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            transition: 'all 0.3s ease',
                            opacity: isNavLoading ? 0.6 : 1,
                            boxShadow: filters?.compareScope === 'product' 
                              ? '0 2px 8px rgba(79, 172, 254, 0.4)' 
                              : 'none'
                          }}
                        >
                          🏷️ By Product
                        </div>
                      </InlineStack>
                    </div>
                  </div>
                </InlineStack>
                
                {(!filters?.compare || filters?.compare === 'mom') && (
                  <div style={{ background: 'var(--p-color-bg-surface-secondary)', padding: '16px', borderRadius: '8px' }}>
                    <Text as="span" variant="bodySm" tone="subdued">Month Selection (optional - leave blank for automatic consecutive months)</Text>
                    <div style={{ marginTop: '8px' }}>
                      <InlineStack gap="200" wrap>
                      <div style={{ minWidth: '140px' }}>
                        <Text as="span" variant="bodySm">From Month</Text>
                        <select id="momA" defaultValue={filters?.momA || ''} style={{ width: '100%', marginTop: '4px', padding: '8px', border: '1px solid var(--p-color-border)', borderRadius: '6px' }}>
                          <option value="">(auto-select)</option>
                          {momMonths.map((m) => (
                            <option key={m.key} value={m.key}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ minWidth: '140px' }}>
                        <Text as="span" variant="bodySm">To Month</Text>
                        <select id="momB" defaultValue={filters?.momB || ''} style={{ width: '100%', marginTop: '4px', padding: '8px', border: '1px solid var(--p-color-border)', borderRadius: '6px' }}>
                          <option value="">(auto-select next)</option>
                          {momMonths.map((m) => (
                            <option key={m.key} value={m.key}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ alignSelf: 'flex-end' }}>
                        <div onClick={() => {
                          const a = (document.getElementById('momA') as HTMLSelectElement | null)?.value || '';
                          const b = (document.getElementById('momB') as HTMLSelectElement | null)?.value || '';
                          const scope = (filters?.compareScope as string) || 'aggregate';
                          applyPatch({ view: 'compare', compare: 'mom', compareScope: scope, momA: a, momB: b });
                        }} style={{
                          padding: '10px 20px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                          color: 'white',
                          cursor: isNavLoading ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '14px',
                          border: 'none',
                          transition: 'all 0.3s ease',
                          opacity: isNavLoading ? 0.6 : 1,
                          boxShadow: '0 4px 15px rgba(79, 172, 254, 0.4)'
                        }}>
                          Update Comparison
                        </div>
                      </div>
                      </InlineStack>
                    </div>
                  </div>
                )}
                
                {isNavLoading && (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <InlineStack gap="100" align="center">
                      <Spinner accessibilityLabel="Loading comparison" size="small" />
                      <Text as="span" variant="bodySm" tone="subdued">Calculating comparison data…</Text>
                    </InlineStack>
                  </div>
                )}
              </BlockStack>
            </div>
            {!comparison && (
              <div style={{ background: 'var(--p-color-bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--p-color-border)', textAlign: 'center' }}>
                <Text as="p" variant="bodyMd" tone="subdued">
                  👆 Select a comparison type above (Month-over-Month or Year-over-Year) and scope (Overall Totals or By Product) to view comparison data.
                </Text>
                <div style={{ marginTop: '12px' }}>
                  <div 
                    onClick={() => changeCompare('mom')} 
                    style={{
                      display: 'inline-block',
                      padding: '12px 24px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '14px',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 4px 15px rgba(79, 172, 254, 0.4)'
                    }}
                  >
                    🚀 Start with Month-over-Month
                  </div>
                </div>
              </div>
            )}
            {!!comparison && (
              <div>
                {filters?.compareScope === "aggregate" && filters?.compare === 'mom' && (
                  <div style={{ background: 'var(--p-color-bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--p-color-border)' }}>
                    <div style={{ marginBottom: '16px' }}>
                      <Text as="h3" variant="headingMd">📊 Month-over-Month Comparison</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {filters?.momA && filters?.momB 
                          ? `Comparing ${momMonths.find(m => m.key === filters.momA)?.label || filters.momA} vs ${momMonths.find(m => m.key === filters.momB)?.label || filters.momB}`
                          : 'Showing consecutive month comparisons within your selected date range'
                        }
                      </Text>
                    </div>
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
                  <div style={{ background: 'var(--p-color-bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--p-color-border)' }}>
                    <div style={{ marginBottom: '20px' }}>
                      <Text as="h3" variant="headingMd">📆 Year-over-Year Comparison</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Comparing each month in your selected period vs the same month in the previous year (e.g., Jan 2025 vs Jan 2024, Feb 2025 vs Feb 2024)
                      </Text>
                    </div>
                    
                    {/* YoY Summary Cards */}
                    {comparison && (
                      <div style={{ 
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                        padding: '20px', 
                        borderRadius: '12px', 
                        marginBottom: '20px',
                        color: 'white'
                      }}>
                        <div style={{ color: 'white', marginBottom: '16px' }}>
                          <Text as="h4" variant="headingSm">
                            📊 Period Summary: {filters?.start} to {filters?.end}
                          </Text>
                        </div>
                        <InlineStack gap="400" wrap>
                          <div style={{ 
                            background: 'rgba(255, 255, 255, 0.15)', 
                            padding: '16px', 
                            borderRadius: '8px',
                            backdropFilter: 'blur(10px)',
                            minWidth: '200px'
                          }}>
                            <div style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: '4px' }}>
                              <Text as="p" variant="bodySm">📦 Total Quantity</Text>
                            </div>
                            <div style={{ color: 'white', marginBottom: '8px' }}>
                              <Text as="p" variant="headingLg">{fmtNum(comparison.current.qty)}</Text>
                            </div>
                            <div style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                              <Text as="p" variant="bodySm">vs {fmtNum(comparison.previous.qty)} last year</Text>
                            </div>
                            <div style={{ 
                              marginTop: '8px',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              background: comparison.deltas.qty >= 0 ? 'rgba(46, 213, 115, 0.3)' : 'rgba(231, 76, 60, 0.3)',
                              display: 'inline-block'
                            }}>
                              <span style={{ color: 'white', fontWeight: '600' }}>
                                <Text as="span" variant="bodySm">
                                  {comparison.deltas.qty >= 0 ? '↗️' : '↘️'} {fmtNum(Math.abs(comparison.deltas.qty))} ({comparison.deltas.qtyPct !== null ? fmtPct(Math.abs(comparison.deltas.qtyPct)) : '–'})
                                </Text>
                              </span>
                            </div>
                          </div>
                          
                          <div style={{ 
                            background: 'rgba(255, 255, 255, 0.15)', 
                            padding: '16px', 
                            borderRadius: '8px',
                            backdropFilter: 'blur(10px)',
                            minWidth: '200px'
                          }}>
                            <div style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: '4px' }}>
                              <Text as="p" variant="bodySm">💰 Total Sales</Text>
                            </div>
                            <div style={{ color: 'white', marginBottom: '8px' }}>
                              <Text as="p" variant="headingLg">{fmtMoney(comparison.current.sales)}</Text>
                            </div>
                            <div style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                              <Text as="p" variant="bodySm">vs {fmtMoney(comparison.previous.sales)} last year</Text>
                            </div>
                            <div style={{ 
                              marginTop: '8px',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              background: comparison.deltas.sales >= 0 ? 'rgba(46, 213, 115, 0.3)' : 'rgba(231, 76, 60, 0.3)',
                              display: 'inline-block'
                            }}>
                              <span style={{ color: 'white', fontWeight: '600' }}>
                                <Text as="span" variant="bodySm">
                                  {comparison.deltas.sales >= 0 ? '↗️' : '↘️'} {fmtMoney(Math.abs(comparison.deltas.sales))} ({comparison.deltas.salesPct !== null ? fmtPct(Math.abs(comparison.deltas.salesPct)) : '–'})
                                </Text>
                              </span>
                            </div>
                          </div>
                        </InlineStack>
                      </div>
                    )}
                    {Array.isArray((data as any).comparisonTable) && (data as any).comparisonTable.length > 0 && !("metric" in (data as any).comparisonTable[0]) ? (
                      <DataTable
                        columnContentTypes={["text","numeric","numeric","numeric","text","numeric","numeric","numeric","text"]}
                        headings={comparisonHeaders || ["Period","Qty (Curr)","Qty (Prev)","Qty Δ","Qty Δ%","Sales (Curr)","Sales (Prev)","Sales Δ","Sales Δ%"]}
                        rows={(data as any).comparisonTable.map((r: any) => [
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
                    ) : (
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
                    )}
                  </div>
                )}
                {filters?.compareScope === "product" && (
                  <div style={{ background: 'var(--p-color-bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--p-color-border)' }}>
                    <div style={{ marginBottom: '16px' }}>
                      <Text as="h3" variant="headingMd">🏷️ Product Comparison</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {filters?.compare === 'yoy' 
                          ? 'Comparing each product\'s performance in your selected period vs the same period last year'
                          : filters?.momA && filters?.momB
                            ? `Comparing each product's performance: ${momMonths.find(m => m.key === filters.momA)?.label || filters.momA} vs ${momMonths.find(m => m.key === filters.momB)?.label || filters.momB}`
                            : 'Comparing each product\'s performance between consecutive months in your selected period'
                        }
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
                            <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Qty Δ%</th>
                            <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Sales (Curr)</th>
                            <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Sales (Prev)</th>
                            <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Sales Δ</th>
                            <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border)', fontWeight: '600', fontSize: '14px' }}>Sales Δ%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {((data as any).comparisonTable as any[]).map((r: any, index: number) => (
                            <tr key={index} style={{ borderBottom: '1px solid var(--p-color-border-subdued)' }}>
                              <td style={{ 
                                padding: '12px', 
                                borderBottom: '1px solid var(--p-color-border-subdued)',
                                position: 'relative',
                                cursor: r.productSku ? 'help' : 'default'
                              }}
                              title={r.productSku ? `SKU: ${r.productSku}` : undefined}
                              >
                                <div style={{ 
                                  display: 'flex', 
                                  alignItems: 'center',
                                  gap: '8px'
                                }}>
                                  <span style={{ fontWeight: '500' }}>{r.product}</span>
                                  {r.productSku && (
                                    <span style={{ 
                                      background: 'var(--p-color-bg-surface-secondary)',
                                      color: 'var(--p-color-text-subdued)',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontFamily: 'monospace'
                                    }}>
                                      {r.productSku}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtNum(r.qtyCurr)}</td>
                              <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtNum(r.qtyPrev)}</td>
                              <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtNum(r.qtyDelta)}</td>
                              <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtPct(r.qtyDeltaPct)}</td>
                              <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtMoney(r.salesCurr)}</td>
                              <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtMoney(r.salesPrev)}</td>
                              <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtMoney(r.salesDelta)}</td>
                              <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid var(--p-color-border-subdued)' }}>{fmtPct(r.salesDeltaPct)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
            </>
            )}
            {errType && errType !== "ACCESS_DENIED" && (filters?.start && filters?.end) && (
              <div style={{ background: 'var(--p-color-bg-critical-subdued)', padding: '16px', borderRadius: '8px', border: '1px solid var(--p-color-border-critical)' }}>
                <Text as="p" variant="bodySm" tone="critical">
                  ⚠️ Error loading analytics: {(data as any).message || errType}
                </Text>
              </div>
            )}
            </BlockStack>
          </Page>
        );
      }
