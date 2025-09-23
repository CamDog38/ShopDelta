import { useLocation, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { Page, DataTable, BlockStack, Text, Button, InlineStack, Spinner } from "@shopify/polaris";

// Props match the loader output shape used by app/routes/app.analytics.tsx
export type AnalyticsData = {
  topProducts?: Array<{ id: string; title: string; quantity: number }>;
  topProductsBySales?: Array<{ id: string; title: string; sales: number }>;
  series?: Array<{ key: string; label: string; quantity: number; sales: number }>;
  table?: Array<Record<string, any>>;
  headers?: Array<{ id: string; title: string }>;
  totals?: { qty: number; sales: number; currency?: string };
  comparison?: any;
  comparisonTable?: Array<Record<string, any>> | null;
  comparisonHeaders?: string[] | null;
  seriesProduct?: Array<{ key: string; label: string; per: Record<string, { qty: number; sales: number; title: string }> }>;
  seriesProductLines?: Array<{ id: string; title: string; points: Array<{ key: string; label: string; qty: number; sales: number }> }>;
  productLegend?: Array<{ id: string; title: string; sku?: string }>;
  momMonths?: Array<{ key: string; label: string }>;
  filters?: { start: string; end: string; granularity: string; preset: string; view?: string; compare?: string; chart?: string; compareScope?: string; metric?: string; chartScope?: string; productFocus?: string; momA?: string; momB?: string };
  shop?: string;
  error?: string;
  message?: string;
};

export default function AnalyticsView({ data, title = "Analytics" }: { data: AnalyticsData; title?: string }) {
  const location = useLocation();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [isExporting, setIsExporting] = useState(false);
  const isNavLoading = navigation.state !== "idle";

  // Error UI (if any) — minimal for demo/public contexts
  const errType = (data as any).error as string | undefined;
  if (errType) {
    return (
      <Page>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Something went wrong</Text>
          <Text as="p" variant="bodyMd">{(data as any).message || "Unknown error"}</Text>
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

  const maxQ = series.reduce((m, s) => Math.max(m, s.quantity), 0) || 1;
  const visBars = series.map((s) => ({ label: s.label, pct: Math.round((s.quantity / maxQ) * 100), qty: s.quantity }));

  const fmtNum = (n: number | null | undefined) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(n ?? 0));
  const fmtPct = (n: number | null | undefined) => (n == null ? "–" : `${n.toFixed(1)}%`);
  const fmtMoney = (n: number | null | undefined) => {
    const v = Number(n ?? 0);
    const formatted = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    return totals?.currency ? `${totals.currency} ${formatted}` : formatted;
  };

  const onFilterChange = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    const form = e?.currentTarget ?? (document.getElementById("filters-form") as HTMLFormElement | null);
    if (!form) return;
    const formData = new FormData(form);
    submit(formData, { method: "get" });
  };

  const exportWorkbook = () => {
    setIsExporting(true);
    const form = document.getElementById("filters-form") as HTMLFormElement | null;
    const fd = form ? new FormData(form) : new FormData();
    if (!fd.get("view")) fd.set("view", filters?.view || "chart");
    if (!fd.get("compare")) fd.set("compare", filters?.compare || "none");
    if (!fd.get("compareScope")) fd.set("compareScope", filters?.compareScope || "aggregate");
    if (filters?.momA) fd.set("momA", filters.momA);
    if (filters?.momB) fd.set("momB", filters.momB);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (typeof v === "string" && v !== "") params.set(k, v);
    params.set("format", "xlsx");
    const href = `/app/analytics/export?${params.toString()}`;
    const formEl = document.createElement('form');
    formEl.method = 'GET';
    formEl.action = href;
    formEl.target = '_blank';
    document.body.appendChild(formEl);
    formEl.submit();
    document.body.removeChild(formEl);
    window.setTimeout(() => setIsExporting(false), 1500);
  };

  const tableColumnTypes: ("text" | "numeric")[] = ["text", ...headers.map(() => "numeric" as const)];
  const tableHeadings: string[] = ["Time Period", ...headers.map((h) => h.title)];
  const tableRows: string[][] = tableData.map((r) => [r.label, ...headers.map((h) => String(r[h.id] || 0))]);

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
              </BlockStack>
              {series.length === 0 ? (
                <Text as="p" variant="bodyMd">No data in range.</Text>
              ) : (
                <>
                <div className="analytics-chart-scroll">
                  <svg width={Math.max(560, 48 + series.length * 80)} height={260} role="img" aria-label="Chart">
                    {/* Axes */}
                    <g transform={`translate(${40},${20})`}>
                      {/* Y axis */}
                      <line x1={0} y1={0} x2={0} y2={260-20-40} stroke="#d0d4d9" />
                      {/* Y ticks */}
                      {Array.from({ length: 5 }).map((_, i) => {
                        const valueGetter = (d: any) => (filters?.metric === 'sales' ? d.sales : d.quantity);
                        const maxVal = Math.max(1, ...series.map(valueGetter));
                        const v = (maxVal / 4) * i;
                        const innerH = 260-20-40;
                        const y = innerH - (v / Math.max(1, maxVal)) * innerH;
                        const innerW = Math.max(560, 48 + series.length * 80) - 40 - 24;
                        return (
                          <g key={i}>
                            <line x1={-4} y1={y} x2={0} y2={y} stroke="#aeb4bb" />
                            <text x={-8} y={y + 4} textAnchor="end" fontSize={10} fill="#6b7177">{Math.round(v)}</text>
                            <line x1={0} y1={y} x2={innerW} y2={y} stroke="#f1f3f5" />
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Table view */}
        {filters?.view === "table" && (
          <div style={{ background: 'var(--p-color-bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--p-color-border)' }}>
            <Text as="h2" variant="headingMd">📋 Quantity by Product over Time</Text>
            <div style={{ marginTop: '16px' }}>
              <DataTable
                columnContentTypes={tableColumnTypes}
                headings={tableHeadings}
                rows={tableRows}
                stickyHeader
              />
            </div>
          </div>
        )}

      </BlockStack>
    </Page>
  );
}
