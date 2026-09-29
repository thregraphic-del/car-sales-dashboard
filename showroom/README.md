# Vehicle Performance Center — Saudi Dealership Executive Intelligence

Arabic RTL executive BI for a multi-branch dealership group. Open `showroom/index.html` directly in a browser (no build, no server). Libraries (Three.js, Chart.js, Lucide, Google Fonts) load from CDNs. Without them, the dashboard still works: charts show a notice and the 3D stage falls back to a labelled 2D view.

## Structure

| File | Responsibility |
|---|---|
| `data/schema.js` | **Data contract**: every table, field and enum the dashboard consumes. Demo and production data must both match it. |
| `data/brands.js` | Brand registry (15 Saudi-market brands), embedded official logo marks where a verified vector source exists, and the manufacturer → distributor relationships with a confidence flag. |
| `data/catalog.js` | Vehicle master catalog: Brand → Model → Model Year (generation) → Trim. Models list only the years they exist in; trims are model/generation-specific; body type, powertrain and price segment follow the taxonomies below. Add a vehicle by adding a row. |
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

## Saudi catalog & taxonomies

- **Brands:** Toyota, Lexus, Nissan, Hyundai, Kia, Chevrolet, GMC, Ford, MG, Geely, Changan, Jetour, GAC, Haval, BYD. Model years 2024–2026, only where the model and generation exist (for example Camry XV70 → XV80 hybrid from MY2025, Prado J150 → J250, Patrol Y62 → Y63, LX 700h from MY2026).
- **Body types:** Sedan, SUV, Crossover, Pickup, MPV, Hatchback, Sports Car.
- **Powertrains:** Petrol, Hybrid, Plug-in Hybrid, Full Electric.
- **Price segments** (derived from MSRP): Economy < SAR 90K, Mainstream < 180K, Premium < 350K, Luxury.
- **Customer segments:** Individual, Family, Executive, Fleet, Corporate, Government.
- **Vehicle status:** Available, Reserved, In Transit, Sold, Delivered. A sold unit is never counted as stock.
- **Payment status:** Paid, Not Yet Due, Overdue, 90+ Days Overdue.
- Prices and specs are realistic demo values. Verify them against official distributor price lists before production use.

## Brand logos

Official marks are embedded only where a verified vector source exists: Toyota, Nissan, Hyundai, Kia, Chevrolet, Ford and MG, from Simple Icons v16.33. Trademarks belong to their owners. The other brands (Lexus, GMC, Geely, Changan, Jetour, GAC, Haval, BYD) use a clean text wordmark. No other brand's mark or generic car icon is ever substituted.

To add an official logo, place the licensed SVG at `assets/brands/<id>.svg` and set `logoFile` for that brand in `data/brands.js`.

## Distributors

Manufacturer → Saudi distributor relationships are modelled explicitly (`DISTRIBUTORS` in `data/brands.js`):

- `confidence:'reported'` marks publicly reported relationships. They must be verified before production use.
- MG, Geely, GAC, Haval and BYD are mapped to a neutral "Distributor / Dealer Entity" rather than an unverified name.

## Vehicle imagery

No licensed vehicle photos or 3D models are bundled. The 3D viewer shows a body-type studio representation (sedan, hatchback, crossover, SUV, large SUV, pickup, MPV, van or sports car) and says so in the UI. Set `asset.model3d` (GLB/GLTF) or `asset.image` per trim when licensed assets are available.
