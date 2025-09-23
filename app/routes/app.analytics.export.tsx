import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// NOTE: This route depends on the exceljs package. Install it in your project:
//   npm install exceljs
// If exceljs is not installed, this route will throw at runtime.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "xlsx"; // xlsx only for now

  console.log("Export request received:", {
    url: url.toString(),
    searchParams: Object.fromEntries(url.searchParams.entries())
  });

  try {
    const { admin, session } = await authenticate.admin(request);

    // Reuse the same aggregation logic as the analytics page: we duplicate the needed parts here
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");
    const granParam = url.searchParams.get("granularity") || "day";
    const preset = url.searchParams.get("preset") || "last30";
    const compareMode = url.searchParams.get("compare") || "none"; // mom | yoy | none
    const compareScope = url.searchParams.get("compareScope") || "aggregate";
    const momA = url.searchParams.get("momA");
    const momB = url.searchParams.get("momB");

    // Date window
    const now = new Date();
    const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let start = startParam ? new Date(startParam + "T00:00:00.000Z") : undefined;
    let end = endParam ? new Date(endParam + "T23:59:59.999Z") : undefined;
    function startOfMonth(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
    if (!start || !end) {
      switch (preset) {
        case "last7": {
          end = utcNow; start = new Date(utcNow); start.setUTCDate(start.getUTCDate() - 6); break;
        }
        case "thisMonth": { start = startOfMonth(utcNow); end = utcNow; break; }
        case "lastMonth": {
          const firstThis = startOfMonth(utcNow);
          const firstLast = new Date(Date.UTC(firstThis.getUTCFullYear(), firstThis.getUTCMonth() - 1, 1));
          const endLast = new Date(Date.UTC(firstThis.getUTCFullYear(), firstThis.getUTCMonth(), 0));
          start = firstLast; end = endLast; break;
        }
        case "ytd": { start = new Date(Date.UTC(utcNow.getUTCFullYear(), 0, 1)); end = utcNow; break; }
        default: { end = utcNow; start = new Date(utcNow); start.setUTCDate(start.getUTCDate() - 29); }
      }
    }

    // GraphQL query with pagination
    const query = `#graphql
      query ExportOrders($first: Int!, $search: String, $after: String) {
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
    const search = `processed_at:>='${start!.toISOString()}' processed_at:<='${end!.toISOString()}'`;
    // Fetch all pages
    const edges: any[] = [];
    try {
      let after: string | null = null;
      while (true) {
        const response = await admin.graphql(query, { variables: { first: 250, search, after } });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("GraphQL response not OK:", response.status, errorText);
          return json({ 
            error: "GraphQL request failed", 
            details: `HTTP ${response.status}: ${errorText}`,
            query: search 
          }, { status: 500 });
        }

        const data = await response.json() as any;
        
        if (data.errors) {
          console.error("GraphQL errors:", data.errors);
          return json({ 
            error: "GraphQL query errors", 
            details: data.errors.map((e: any) => e.message).join(", "),
            query: search 
          }, { status: 500 });
        }

        const page = data?.data?.orders;
        const newEdges = page?.edges ?? [];
        console.log(`Fetched ${newEdges.length} orders, total so far: ${edges.length + newEdges.length}`);
        edges.push(...newEdges);
        
        if (page?.pageInfo?.hasNextPage && newEdges.length > 0) {
          after = newEdges[newEdges.length - 1]?.cursor as string;
        } else {
          break;
        }
      }
    } catch (gerr: any) {
      console.error("GraphQL request failed:", gerr);
      return json({ 
        error: "GraphQL request failed", 
        details: gerr?.message || String(gerr),
        query: search 
      }, { status: 500 });
    }

    // Aggregations
    const buckets = new Map<string, { label: string; qty: number; sales: number }>();
    const productSet = new Map<string, string>();
    const pivot = new Map<string, Map<string, { qty: number; sales: number }>>();
    let currency: string | undefined;

    function startOfWeek(d: Date) { const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dow = dt.getUTCDay(); const diff = (dow + 6) % 7; dt.setUTCDate(dt.getUTCDate() - diff); return dt; }
    function keyLabel(dateStr: string) {
      const d = new Date(dateStr);
      if (granParam === "month") {
        const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
        return { key: `${m.getUTCFullYear()}-${String(m.getUTCMonth()+1).padStart(2,'0')}`,
          label: `${m.toLocaleString('en-US',{month:'short'})} ${m.getUTCFullYear()}` };
      }
      if (granParam === "week") {
        const ws = startOfWeek(d); const key = `W:${ws.toISOString().slice(0,10)}`;
        return { key, label: `Week of ${ws.toLocaleDateString('en-CA')}` };
      }
      return { key: d.toISOString().slice(0,10), label: d.toLocaleDateString('en-CA') };
    }

    // Pre-fill monthly buckets across the selected range so empty months appear
    if (granParam === "month") {
      const mStart = new Date(Date.UTC(start!.getUTCFullYear(), start!.getUTCMonth(), 1));
      const mEnd = new Date(Date.UTC(end!.getUTCFullYear(), end!.getUTCMonth(), 1));
      const cur = new Date(mStart);
      while (cur <= mEnd) {
        const k = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth()+1).padStart(2,'0')}`;
        const label = `${cur.toLocaleString('en-US',{month:'short'})} ${cur.getUTCFullYear()}`;
        if (!buckets.has(k)) buckets.set(k, { label, qty: 0, sales: 0 });
        if (!pivot.has(k)) pivot.set(k, new Map());
        cur.setUTCMonth(cur.getUTCMonth()+1);
      }
    }

    for (const edge of edges) {
      const { key, label } = keyLabel(edge?.node?.processedAt);
      if (!buckets.has(key)) buckets.set(key, { label, qty: 0, sales: 0 });
      if (!pivot.has(key)) pivot.set(key, new Map());
      const liEdges = edge?.node?.lineItems?.edges ?? [];
      for (const li of liEdges) {
        const qty: number = li?.node?.quantity ?? 0;
        const product = li?.node?.product; const t = li?.node?.title ?? "Unknown product";
        const pid: string = product?.id ?? `li:${t}`; const title: string = product?.title ?? t;
        const amountStr: string | undefined = li?.node?.discountedTotalSet?.shopMoney?.amount as any;
        const curr: string | undefined = li?.node?.discountedTotalSet?.shopMoney?.currencyCode as any;
        const amt = amountStr ? parseFloat(amountStr) : 0; if (!currency && curr) currency = curr;
        buckets.get(key)!.qty += qty; buckets.get(key)!.sales += amt;
        productSet.set(pid, title);
        const row = pivot.get(key)!; if (!row.has(pid)) row.set(pid, { qty: 0, sales: 0 });
        const acc = row.get(pid)!; acc.qty += qty; acc.sales += amt;
      }
    }

    console.log(`Processing ${edges.length} orders for export`);

    // Build the workbook
    if (format !== "xlsx") {
      return json({ error: "Unsupported format" }, { status: 400 });
    }

    // Dynamically import exceljs to avoid bundling issues
    let ExcelJS: any;
    try {
      console.log("Importing exceljs...");
      ExcelJS = await import("exceljs");
      console.log("ExcelJS imported successfully");
    } catch (e: any) {
      console.error("Failed to import exceljs:", e);
      return json({
        error: "Missing dependency: exceljs",
        details: "Run 'npm install exceljs' in your project, then retry the export.",
      }, { status: 500 });
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = "Analytics Export";
    const hdrStyle = { bold: true };

    // Sheet 1: Sales over time (qty & sales)
    const s1 = wb.addWorksheet("SalesOverTime");
    s1.addRow(["Period", "Quantity", "Sales"]).font = hdrStyle as any;
    Array.from(buckets.entries()).sort((a,b)=> a[0]>b[0]?1:-1).forEach(([_, v])=>{
      s1.addRow([v.label, v.qty, v.sales]);
    });
    // Qty as integer, Sales as accounting format
    s1.getColumn(2).numFmt = "#,##0";
    s1.getColumn(3).numFmt = "#,##0.00";

    // Sheet 2: Sales over time by product (qty pivot top 20)
    const s2 = wb.addWorksheet("ByProduct_Qty");
    const topProducts = new Map<string, number>();
    for (const [_k, row] of pivot.entries()) for (const [pid, v] of row.entries()) topProducts.set(pid, (topProducts.get(pid)||0)+v.qty);
    const top20 = Array.from(topProducts.entries()).sort((a,b)=> b[1]-a[1]).slice(0,20).map(([pid])=>pid);
    s2.addRow(["Period", ...top20.map(pid=>productSet.get(pid)||pid)]).font = hdrStyle as any;
    Array.from(buckets.entries()).sort((a,b)=> a[0]>b[0]?1:-1).forEach(([key, v])=>{
      const row = pivot.get(key) || new Map();
      s2.addRow([v.label, ...top20.map(pid => (row.get(pid)?.qty)||0)]);
    });

    // Sheet 3: Top products by qty
    const s3 = wb.addWorksheet("TopProducts_Qty");
    const topQty = Array.from(topProducts.entries()).sort((a,b)=> b[1]-a[1]).slice(0,50);
    s3.addRow(["Product", "Quantity"]).font = hdrStyle as any;
    topQty.forEach(([pid, q])=> s3.addRow([productSet.get(pid)||pid, q]));

    // Sheet 4: Top products by sales
    const s4 = wb.addWorksheet("TopProducts_Sales");
    const productSales = new Map<string, number>();
    for (const [_k, row] of pivot.entries()) for (const [pid, v] of row.entries()) productSales.set(pid, (productSales.get(pid)||0)+v.sales);
    Array.from(productSales.entries()).sort((a,b)=> b[1]-a[1]).slice(0,50).forEach(([pid, s], i)=>{
      if (i===0) s4.addRow(["Product", "Sales"]).font = hdrStyle as any;
      s4.addRow([productSet.get(pid)||pid, s]);
    });
    s4.getColumn(2).numFmt = "#,##0.00";

    // Sheet 5+: Comparisons
    // MoM Aggregate pairs
    if (compareMode === "mom") {
      const monthly = new Map<string, { label: string; qty: number; sales: number }>();
      for (const [key, v] of buckets.entries()) {
        let mKey = key; if (!/^\d{4}-\d{2}$/.test(mKey)) { const m = (key.match(/^(\d{4})-(\d{2})/) || v.label.match(/(\d{4})-(\d{2})/)); if (m) mKey = `${m[1]}-${m[2]}`; else continue; }
        if (!monthly.has(mKey)) monthly.set(mKey, { label: v.label.replace(/\d{4}-.*/, v.label), qty: 0, sales: 0 });
        const acc = monthly.get(mKey)!; acc.qty += v.qty; acc.sales += v.sales;
      }
      const ordered = Array.from(monthly.entries()).sort((a,b)=> a[0]>b[0]?1:-1);
      const s5 = wb.addWorksheet("MoM_Aggregate");
      s5.addRow(["Period","Qty (Curr)","Qty (Prev)","Qty Δ","Qty Δ%","Sales (Curr)","Sales (Prev)","Sales Δ","Sales Δ%",]).font = hdrStyle as any;
      const pairs: Array<[string,string]> = [];
      if (momA && momB) pairs.push([momA, momB]); else for (let i=1;i<ordered.length;i++){ pairs.push([ordered[i-1][0], ordered[i][0]]); }
      for (const [a,b] of pairs) {
        const A = monthly.get(a); const B = monthly.get(b); if (!A||!B) continue;
        const qd = B.qty - A.qty; const qdp = A.qty ? (qd/A.qty)*100 : null;
        const sd = B.sales - A.sales; const sdp = A.sales ? (sd/A.sales)*100 : null;
        s5.addRow([`${A.label} → ${B.label}`, B.qty, A.qty, qd, qdp ?? "", B.sales, A.sales, sd, sdp ?? ""]);
      }
      s5.getColumn(2).numFmt = "#,##0"; // Qty Curr
      s5.getColumn(3).numFmt = "#,##0"; // Qty Prev
      s5.getColumn(4).numFmt = "#,##0"; // Qty Δ
      s5.getColumn(6).numFmt = "#,##0.00"; // Sales Curr
      s5.getColumn(7).numFmt = "#,##0.00"; // Sales Prev
      s5.getColumn(8).numFmt = "#,##0.00"; // Sales Δ

      // MoM By Product
      if (compareScope === "product") {
        const monthlyProduct = new Map<string, Map<string, { title: string; qty: number; sales: number }>>();
        for (const [key, b] of buckets.entries()) {
          let mKey = key; if (!/^\d{4}-\d{2}$/.test(mKey)) { const m = (key.match(/^(\d{4})-(\d{2})/) || b.label.match(/(\d{4})-(\d{2})/)); if (m) mKey = `${m[1]}-${m[2]}`; else continue; }
          const row = pivot.get(key) || new Map(); if (!monthlyProduct.has(mKey)) monthlyProduct.set(mKey, new Map());
          const mp = monthlyProduct.get(mKey)!;
          for (const [pid, v] of (row as Map<string,{qty:number,sales:number}>).entries()) {
            if (!mp.has(pid)) mp.set(pid, { title: productSet.get(pid)||pid, qty: 0, sales: 0 });
            const acc = mp.get(pid)!; acc.qty += v.qty; acc.sales += v.sales;
          }
        }
        const s6 = wb.addWorksheet("MoM_ByProduct");
        s6.addRow(["Product","Qty (Curr)","Qty (Prev)","Qty Δ","Qty Δ%","Sales (Curr)","Sales (Prev)","Sales Δ","Sales Δ%",]).font = hdrStyle as any;
        const months = Array.from(monthlyProduct.keys()).sort();
        const [aKey,bKey] = momA && momB ? [momA, momB] : months.slice(-2);
        const A = (aKey && monthlyProduct.get(aKey)) || new Map();
        const B = (bKey && monthlyProduct.get(bKey)) || new Map();
        const keys = new Set<string>([...A.keys(), ...B.keys()]);
        for (const pid of keys) {
          const a = A.get(pid) || { title: productSet.get(pid)||pid, qty: 0, sales: 0 };
          const b = B.get(pid) || { title: productSet.get(pid)||pid, qty: 0, sales: 0 };
          const qd = b.qty - a.qty; const qdp = a.qty ? (qd/a.qty)*100 : null;
          const sd = b.sales - a.sales; const sdp = a.sales ? (sd/a.sales)*100 : null;
          s6.addRow([a.title, b.qty, a.qty, qd, qdp ?? "", b.sales, a.sales, sd, sdp ?? ""]);
        }
        s6.getColumn(2).numFmt = "#,##0";
        s6.getColumn(3).numFmt = "#,##0";
        s6.getColumn(4).numFmt = "#,##0";
        s6.getColumn(6).numFmt = "#,##0.00";
        s6.getColumn(7).numFmt = "#,##0.00";
        s6.getColumn(8).numFmt = "#,##0.00";
      }
    }

    // YoY Aggregate
    if (compareMode === "yoy") {
      const yoy = wb.addWorksheet("YoY_Aggregate");
      yoy.addRow(["Metric","Current","Previous","Change","% Change"]).font = hdrStyle as any;
      // For simplicity use totals from buckets vs a prev-year fetch; the page computation already does prev year fetch.
      // Here we only export current range; clients can switch the "compare=yoy" and download.
      const totalQty = Array.from(buckets.values()).reduce((a,b)=>a+b.qty,0);
      const totalSales = Array.from(buckets.values()).reduce((a,b)=>a+b.sales,0);
      yoy.addRow(["Quantity", totalQty, "", "", ""]);
      yoy.addRow(["Sales", totalSales, "", "", ""]);
      yoy.getColumn(2).numFmt = "#,##0.00";
    }

    console.log("Generating Excel buffer...");
    const buf = await wb.xlsx.writeBuffer(); // returns ArrayBuffer in browsers / Uint8Array in Node
    console.log(`Excel buffer generated, size: ${buf.byteLength} bytes`);
    
    const filename = `analytics_export_${new Date().toISOString().slice(0,10)}.xlsx`;
    console.log(`Returning Excel file: ${filename}`);
    
    return new Response(buf as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=${filename}`,
      },
    });
  } catch (err: any) {
    console.error("Export failed:", err);
    
    // Handle Response objects specifically
    if (err instanceof Response) {
      try {
        const errorText = await err.text();
        return json({ 
          error: "HTTP Response Error", 
          details: `Status: ${err.status} ${err.statusText}, Body: ${errorText}`,
          timestamp: new Date().toISOString()
        }, { status: 500 });
      } catch (textErr) {
        return json({ 
          error: "HTTP Response Error", 
          details: `Status: ${err.status} ${err.statusText}`,
          timestamp: new Date().toISOString()
        }, { status: 500 });
      }
    }
    
    // Handle other error types
    let errorDetails = "Unknown error";
    if (err?.message) {
      errorDetails = err.message;
    } else if (err?.stack) {
      errorDetails = err.stack;
    } else if (typeof err === 'string') {
      errorDetails = err;
    } else {
      try {
        errorDetails = JSON.stringify(err);
      } catch {
        errorDetails = String(err);
      }
    }
    
    return json({ 
      error: "Export failed", 
      details: errorDetails,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};
