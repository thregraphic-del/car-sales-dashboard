# ذكاء المعرض — Saudi Car Dealership Intelligence (Demo)

An interactive, Arabic-first (RTL) training dashboard that explains how a Saudi car
dealership works: what we sell, who buys, where leads come from, how customers pay,
what is collected, what sits in stock, and what every number means.

> **بيانات تجريبية / Demo Data** — كل أرقام المبيعات والطلبات والأرباح والتحصيل وهمية
> ولأغراض التدريب فقط، ولا تمثل السوق السعودي الحقيقي. أسماء العملاء والمندوبين وهمية،
> وأرقام الهيكل (VIN) تبدأ بـ `DEMO`.

## Run

No build step. Open `index.html` in a browser, or serve the folder:

```bash
cd dealership && python3 -m http.server 8080   # then open http://localhost:8080
```

## Pages

1. الرئيسية — 10 KPI cards (current vs previous period + sparkline), trend, payment mix, management Q&A
2. السيارات — vehicle explorer (33 models, 15 brands) + full vehicle profile with image stage (front/side/rear/interior), funnel and customer sources
3. المبيعات — by brand, model, body type/category, month, branch, salesperson + model × branch heatmap
4. العملاء ومصادرهم — channel comparison (leads, conversion, revenue, CPL, cost per sale), funnel, lost reasons
5. التمويل والكاش — cash vs financing, payment methods, financiers
6. التحصيل — receivables, aging buckets (0–7 … +90), invoice table with detail panel
7. المخزون — stock KPIs, age/status/demand center (bar ↔ donut), inventory table
8. الربحية — product-mix quadrant (units × margin, bubble = revenue), best-seller vs most-profitable
9. قطع الغيار وما بعد البيع — 15 common parts/consumables (educational)
10. قاموس السيارات — Brand → Model → Grade → Engine → Fuel → Drive explorer + 40-term glossary

Every KPI, chart, bar, bubble, row and vehicle is clickable. KPIs and charts open an
Arabic "اشرح لي" card: what it is, what it means, why management cares, the formula with
the live numbers, how to read it, the decision it supports, and an objective
good / needs-follow-up / needs-attention verdict against stated thresholds (training
thresholds, editable in `js/explain.js`). Clicking a bar/slice cross-filters the whole
dashboard; 12 global filters re-compute every page.

## Structure

| File | Purpose |
|---|---|
| `js/data.js` | Vehicle catalog (reference specs) + seeded generator for inquiries, funnel, sales, payments, collections, inventory |
| `js/app.js` | State, filters, aggregations (with as-of collection logic), drawer, events |
| `js/pages.js` | The 10 page renderers + management questions |
| `js/views.js` | Drawer views: vehicle profile, invoice, stock unit, channel, bubble, question, part, term |
| `js/explain.js` | Explanation registry and thresholds |
| `js/charts.js` | Dependency-free HTML/SVG charts |
| `js/images.js` | Wikimedia image resolver with cache and line-art fallback |
| `js/content.js` | Glossary, dictionary levels, spare-parts content |

## Images

Vehicle and part photos are real photos loaded at runtime from Wikimedia Commons
(Wikipedia lead image for the front view; Commons search for side/rear/interior). Each
is labelled as a *representative image of the model* with a link to its Commons file
page for attribution/licensing. Without internet access a labelled line drawing is shown.

## Specifications

Specs are reference values for a common GCC trim and can differ by market, trim and
model year — always verify against the official distributor.
