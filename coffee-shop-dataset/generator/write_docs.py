#!/usr/bin/env python3
"""Render the markdown deliverables (dictionary, assumptions, seasonal analysis, summaries) from the report CSVs."""
import os

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
REP = os.path.join(HERE, "..", "reports")
DOCS = os.path.join(HERE, "..", "docs")
os.makedirs(DOCS, exist_ok=True)


def md(df, floatfmt=3):
    df = df.copy()
    for c in df.columns:
        if pd.api.types.is_float_dtype(df[c]):
            whole = df[c].dropna().apply(float.is_integer).all() and c not in ("Net_Sales", "Gross_Profit", "Net_Profit")
            fmt = "{:,.0f}" if whole else "{:,.%df}" % floatfmt
            df[c] = df[c].map(lambda v: "" if pd.isna(v) else fmt.format(v))
    df = df.fillna("").astype(str).apply(lambda s: s.str.replace("|", "\\|", regex=False))
    lines = ["| " + " | ".join(df.columns) + " |", "|" + "---|" * len(df.columns)]
    lines += ["| " + " | ".join(r) + " |" for r in df.values]
    return "\n".join(lines)


dd = pd.read_csv(os.path.join(REP, "data_dictionary.csv"))
with open(os.path.join(DOCS, "DATA_DICTIONARY.md"), "w") as f:
    f.write("# Data dictionary - `coffee_shop_transactions_*.csv`\n\n"
            "Grain: **one row per order line** (product within a receipt). An order = all rows sharing a `Transaction_ID`.\n"
            "All money is SAR, VAT-exclusive, 2 decimals, and reconciles exactly (see `reports/validation_checks.csv`).\n\n")
    f.write(md(dd))
    f.write("\n\n## Companion files\n\n"
            "| File | Grain | Content |\n|---|---|---|\n"
            "| `data/calendar_features.csv` | day | Holiday name, event, school period, Riyadh avg temperature, days since payday (exogenous regressors) |\n"
            "| `data/daily_operating_expenses.csv` | day | Staff, rent, utilities, marketing, other opex -> Net Profit |\n"
            "| `data/product_master.csv` | product | Category, kind (hot/iced/food), base & final price and cost, base margin |\n"
            "| `data/price_cost_change_log.csv` | change | Every scheduled price / cost change with reason |\n"
            "| `data/promotion_calendar.csv` | promotion | Dates, discount rate, scope, hours, channels, daily marketing budget |\n"
            "| `data/customer_master.csv` | customer | Acquisition segment, first-seen date, pre-2023 member flag |\n"
            "| `data/ground_truth_daily_components.csv` | day | Noise-free expected orders, every multiplicative component, segment orders, unlabelled anomalies |\n")

asm = pd.read_csv(os.path.join(REP, "statistical_assumptions.csv"))
with open(os.path.join(DOCS, "STATISTICAL_ASSUMPTIONS.md"), "w") as f:
    f.write("# Statistical assumptions\n\nSummary register. Full mathematical derivation: [METHODOLOGY.md](METHODOLOGY.md).\n\n")
    f.write(md(asm))
    f.write("\n")

sa = pd.read_csv(os.path.join(REP, "seasonal_analysis.csv"))
hp = pd.read_csv(os.path.join(REP, "hourly_profile_avg_orders.csv"))
mix = pd.read_csv(os.path.join(REP, "iced_vs_hot_mix_by_month.csv")).rename(columns={"Unnamed: 0": "Month"})
with open(os.path.join(DOCS, "SEASONAL_ANALYSIS.md"), "w") as f:
    f.write("# Seasonal analysis - expected vs observed effects\n\n"
            "How to read the columns:\n\n"
            "* **Model_Component_Multiplier** - the designed multiplier of that component on total expected orders "
            "(average of `E_<component>` in the ground truth).\n"
            "* **Expected_Orders_Lift** - the estimator below applied to the *noise-free* expected orders.\n"
            "* **Observed_*_Lift** - the *same* estimator applied to the actual transactions (retail orders, net sales, AOV, gross profit).\n\n"
            "Estimators: day of week = ratio to centred 7-day moving average (clean weeks); month = monthly avg daily value / "
            "that year's average, averaged over 3 years; salary = ratio to centred 29-day moving average; events, holidays "
            "and promotions = ratio to the median of the same weekday within +-5 weeks on normal days.\n\n"
            "Lift > 1 = above baseline. Expected and Observed agree closely, i.e. the patterns are detectable above the noise; "
            "differences on 3-day rows (e.g. a holiday seen once per year) are sampling noise.\n\n")
    for fac, g in sa.groupby("Factor", sort=False):
        f.write(f"## {fac}\n\n")
        f.write(md(g.drop(columns=["Factor"])))
        f.write("\n\n")
    f.write("## Hour of day - average orders per hour by day type\n\n")
    f.write(md(hp, 2))
    f.write("\n\n## Product seasonality - iced share of beverage units vs temperature\n\n")
    f.write(md(mix, 1))
    f.write("\n")

ms = pd.read_csv(os.path.join(REP, "monthly_summary.csv"))
pp = pd.read_csv(os.path.join(REP, "product_performance.csv"))
bench = pd.read_csv(os.path.join(REP, "forecast_benchmark.csv"))
val = pd.read_csv(os.path.join(REP, "validation_checks.csv"))
snr = pd.read_csv(os.path.join(REP, "signal_to_noise.csv"))
cust = pd.read_csv(os.path.join(REP, "customer_segment_summary.csv"))
with open(os.path.join(DOCS, "SUMMARY_TABLES.md"), "w") as f:
    f.write("# Summary tables\n\nFull versions (CSV) are in `reports/` and all in one workbook: `reports/coffee_shop_analysis.xlsx`.\n\n")
    f.write("## Monthly summary\n\n")
    f.write(md(ms[["Year", "Month_Name", "Orders", "Avg_Daily_Orders", "Net_Sales", "Gross_Profit", "Gross_Margin_%",
                   "Net_Profit", "Net_Margin_%", "AOV", "Items_per_Order", "Discount_Rate_%", "Active_Customers",
                   "New_Customers", "YoY_Net_Sales_%", "Orders_vs_Structural_Expectation_%", "Performance_Flag"]], 1))
    yr = ms.groupby("Year")[["Orders", "Net_Sales", "Gross_Profit", "Net_Profit"]].sum()
    yr["Net_Sales_Growth_%"] = yr.Net_Sales.pct_change() * 100
    yr["Orders_Growth_%"] = yr.Orders.pct_change() * 100
    yr["Gross_Margin_%"] = yr.Gross_Profit / yr.Net_Sales * 100
    yr["Net_Margin_%"] = yr.Net_Profit / yr.Net_Sales * 100
    f.write("\n\n## Annual totals\n\n")
    f.write(md(yr.reset_index(), 1))
    f.write("\n\n## Product performance\n\n")
    f.write(md(pp[["Rank_Net_Sales", "Product_Name", "Category", "Units_Sold", "Net_Sales", "Gross_Profit", "Gross_Margin_%",
                   "Units_Share_%", "Avg_Net_Price", "Season_Index_Winter", "Season_Index_Summer", "Peak_Month",
                   "Volume_Margin_Quadrant"]], 2))
    f.write("\n\n## Customer segments\n\n")
    f.write(md(cust, 2))
    f.write("\n\n## Daily sales summary (first 14 days - full file `reports/daily_sales_summary.csv`)\n\n")
    ds = pd.read_csv(os.path.join(REP, "daily_sales_summary.csv"))
    f.write(md(ds[["Date", "Day_Name", "Event", "Avg_Temp_C", "Orders", "Items_Sold", "Net_Sales", "Gross_Profit",
                   "AOV", "Total_Opex", "Net_Profit"]].head(14), 2))
    f.write("\n\n## Forecast benchmark (train 2023-2024, test 2025, daily orders)\n\n")
    f.write(md(bench, 2))
    f.write("\n\n## Signal vs noise\n\n")
    f.write(md(snr, 4))
    f.write("\n\n## Validation checks\n\n")
    f.write(md(val))
    f.write("\n")
print("docs written")
