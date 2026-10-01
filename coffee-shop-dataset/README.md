# Saudi Premium Coffee Shop: Forecasting Dataset (2023–2025)

This is a transactional dataset for one premium specialty coffee shop with a drive-thru in north
Riyadh. Amounts are in SAR (VAT-exclusive). It covers **3 full years of daily data
(1 Jan 2023 – 31 Dec 2025)** and was built for time-series forecasting and predictive analytics.

The values are not independent random draws. Every row comes from an explicit demand model:

- a trend with growth that slows over time
- a slow-moving business regime
- day-of-week, monthly and annual seasonality, plus temperature
- Ramadan (on the Hijri calendar, so it moves each year), Eid, National Day and Founding Day
- the school calendar
- the salary cycle (payday on the 27th)
- promotions
- structural breaks and unlabelled anomalies

The noise is controlled: Poisson + lognormal, about 9% per day on the log scale. The full model is
documented in **[docs/METHODOLOGY.md](docs/METHODOLOGY.md)**. A day-by-day ground-truth file lets you
check whether a model finds the real patterns.

## Headline numbers

| | 2023 | 2024 | 2025 |
|---|---|---|---|
| Orders | 78,346 | 86,776 | 91,283 |
| Avg orders / day | 215 | 237 | 250 |
| Net sales (SAR) | 2.54 M | 2.82 M | 3.02 M |
| Net sales growth | – | +10.9% | +7.2% |
| Gross margin | 70.9% | 69.9% | 68.3% |
| Net margin | 9.4% | 11.8% | 11.1% |

Totals:

- **477,893 line items**, **256,405 orders**.
- **40 products** in 9 categories.
- **12,623 customers** (incl. 6 corporate accounts): new, returning and guest, with persistent IDs and realistic repeat-purchase behaviour.
- Average order value is about 33 SAR, with about 2.0 items per order.

## Deliverables

| # | Deliverable | File(s) |
|---|---|---|
| 1 | CSV dataset | `data/coffee_shop_transactions_2023.csv`, `_2024.csv`, `_2025.csv` (one per year to stay under GitHub's file-size limits), plus all years in one file: `data/coffee_shop_transactions_full.csv.gz` |
| 2 | Excel version | `data/coffee_shop_transactions_2023.xlsx`, `_2024.xlsx`, `_2025.xlsx` (transactions + data dictionary sheet) and `reports/coffee_shop_analysis.xlsx` (every summary below in one workbook) |
| 3 | Data dictionary | [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) · `reports/data_dictionary.csv` |
| 4 | Statistical assumptions | [docs/STATISTICAL_ASSUMPTIONS.md](docs/STATISTICAL_ASSUMPTIONS.md) · `reports/statistical_assumptions.csv` |
| 5 | Monthly summary table | `reports/monthly_summary.csv` (incl. YoY and out/under-performance vs the structural expectation) |
| 6 | Daily sales summary | `reports/daily_sales_summary.csv` (orders, items, gross → net → GP → opex → **Net Profit**, AOV, customers, calendar features); weekly version in `reports/weekly_sales_summary.csv` (Sunday-start weeks) |
| 7 | Product performance | `reports/product_performance.csv` (volume, margin, share, season index, peak month, volume/margin quadrant) |
| 8 | Seasonal analysis | [docs/SEASONAL_ANALYSIS.md](docs/SEASONAL_ANALYSIS.md) · `reports/seasonal_analysis.csv`: expected vs observed effect of day of week, month, Ramadan, holidays/Eid, salary cycle, promotions and anomalies; hourly profile; iced/hot mix by temperature |
| ★ | Mathematical logic | [docs/METHODOLOGY.md](docs/METHODOLOGY.md) |
| ★ | Ground truth for validation | `data/ground_truth_daily_components.csv` (noise-free expected orders and every component, per day) |
| ★ | Forecast benchmark and noise floor | `reports/forecast_benchmark.csv`, `reports/signal_to_noise.csv` |
| ★ | Validation checks | `reports/validation_checks.csv` (18 checks, all pass) |

All key tables are also in [docs/SUMMARY_TABLES.md](docs/SUMMARY_TABLES.md).

Supporting data:

| File | Content |
|---|---|
| `calendar_features.csv` | Exogenous regressors: holidays, events, school period, temperature, days since payday |
| `daily_operating_expenses.csv` | Operating costs used for Net Profit |
| `product_master.csv` | Product catalogue |
| `price_cost_change_log.csv` | Price and cost changes |
| `promotion_calendar.csv` | Promotion dates and terms |
| `customer_master.csv` | One row per customer |

## Things to know before modelling

- **Grain.** One row per order line. Count orders as `nunique(Transaction_ID)`. AOV is `Σ Net_Sales / orders`.
- **Business date.** Sales after midnight (Thursday–Saturday nights until 01:00, Ramadan until 03:00) belong to the previous `Date`, as in a POS end-of-day.
- **Accounting identities hold exactly on every row:**
  - `Gross_Sales = Quantity × Unit_Price`
  - `Net_Sales = Gross_Sales − Discount − Return_Amount`
  - `COGS = Quantity × Unit_Cost`
  - `Gross_Profit = Net_Sales − COGS`
- **Gross profit is computed on net revenue (after discounts).** This is standard accounting and is how promotions show their margin cost. For the pre-discount figure, use `Gross_Sales − COGS`.
- **Net Profit is daily.** It is `Σ Gross_Profit − Σ Payment_Fee − Σ Delivery_Commission − Total_Opex`, and is already computed in `reports/daily_sales_summary.csv`.
- **Missing values** appear only where real POS data has them:
  - `Customer_ID` for guest orders (~31%, by design)
  - `Payment_Method` 0.36%
  - `Order_Channel` 0.24%
  - `Time` 0.07%, including a POS outage on 2024-10-15
- **Anomalies are deliberately unlabelled** in the transaction file: sandstorms, rain, a machine breakdown, a power outage, event nights, a viral video, a competitor opening and road works. Their dates and effects are listed in the ground truth.
- **Outliers.** About 2 corporate bulk orders per month (`CORP-xx`, payment by `Corporate Invoice`), with AOV around 1,000 SAR.
- **Noise floor.** Even a perfect model scores about **7% MAPE on daily orders** (2025 hold-out). A good model with holiday and Ramadan regressors should reach about 9–11%. Naive and Holt-Winters models without event knowledge score about 19–23%.

## Regenerating

```bash
pip install numpy pandas xlsxwriter openpyxl statsmodels
cd generator
python generate_dataset.py   # ~45 s: transactions, ground truth, master data
python build_reports.py      # ~3 min: summaries, validation, benchmark, Excel workbooks
python write_docs.py         # markdown tables in docs/
```

All parameters (products, prices, calendar, promotions, anomalies) are in `generator/config.py`. The
random seed (`20230101`) makes the output fully reproducible.
