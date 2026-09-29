# Vehicle Performance Center — Executive Dealership Intelligence

Arabic RTL executive BI for a multi-branch dealership group. Open `showroom/index.html` directly in a browser (no build, no server). Libraries (Three.js, Chart.js, Lucide, Google Fonts) load from CDNs. Without them, the dashboard still works: charts show a notice and the 3D stage falls back to a labelled 2D view.

## Structure

| File | Responsibility |
|---|---|
| `data/schema.js` | **Data contract**: every table, field and enum the dashboard consumes. Demo and production data must both match it. |
| `data/catalog.js` | Vehicle catalog: Brand → Model → Generation/Year → Trim, including specs, MSRP and 3D-asset metadata. Add a vehicle by adding a row; no UI changes needed. |
| `data/demo-generator.js` | Deterministic **demo** dataset: leads → test drives → offers → reservations → sales → deliveries → payment schedules, plus VIN-level vehicles, customers, salespeople, campaigns and marketing spend. |
| `data/data-source.js` | The only data entry point. Validates against the schema, normalises dates, builds indexes and joins, and derives receivable/collection positions. |
| `js/core.js` | Arabic labels, formatting, periods (each with its comparison period), the **filter store** (cross-filtering and vehicle hierarchy), the query engine, and the **metric registry** (definitions behind every ⓘ). |
| `js/ui.js` | Drawer with back-stack, data table (sort/search/paginate/CSV), popovers, tooltip, toast. |
| `js/drill.js` | Drill-down engine: any chart mark opens a slice (KPIs → breakdown → records → record detail). |
| `js/viz.js` | Question-driven modules: overview, sales, customer acquisition, inventory, payments & cash flow, profitability. |
| `js/insights.js` | Rule-based executive insights. Each rule fires only when the data supports it and provides a why, a metric and a path to the records. |
| `js/explorer.js` | Vehicle selection hierarchy, breadcrumb, catalog, search, compare, and the data panels around the 3D viewer. |
| `js/showroom3d.js` | Three.js studio viewer. Loads `trim.asset.model3d` (GLB/GLTF) when present; otherwise shows a procedural studio representation, labelled as such. |
| `js/app.js` | Boot, filter bar, active-filter chips, tabs and the render pipeline. |

## Connecting production data

Replace the demo generator without touching UI code:

```html
<script>
  // before App.boot() runs (e.g. rendered by the backend, or after fetch)
  DataSource.useProductionData({ branches, salespeople, trims, vehicles, customers,
    leads, sales, payments, campaigns, marketingSpend, meta:{ today:'2026-09-29' } });
</script>
```

Tables and fields are documented in `data/schema.js`. Validation problems are reported in the console (`[DataSource] validation`). The header badge switches from **بيانات تجريبية** (demo) to **بيانات الإنتاج** (production).

## Metric conventions

- **Comparisons:** every period has an equal-length comparison period. When a **model year** filter is active, the comparison uses the previous model year (like-for-like).
- **Snapshot metrics:** inventory is measured at the period end; receivables and overdue amounts are measured as of today.
- **Funnel:** stages are counted by the date each event happened within the period. The Sales stage therefore equals the Sales KPI.
- **Marketing spend:** allocated to a branch or vehicle slice in proportion to that slice's share of the source's leads.
- **Acquisition cost per sale:** spend of the lead's source in the lead's month ÷ sales from that source and month.
