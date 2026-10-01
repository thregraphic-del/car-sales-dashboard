#!/usr/bin/env python3
"""
Build the summary tables, seasonal analysis, validation report, forecast benchmark and Excel
workbooks from the generated transaction file.

Every "Expected" number comes from the noise-free model (ground_truth_daily_components.csv);
every "Observed" number is estimated from the transactions only, using the SAME estimator.
If a forecasting model recovers the "Expected" values it is learning the structure, not the noise.
"""
import os
import warnings

import numpy as np
import pandas as pd

import config as C
from data_dictionary import DICTIONARY, ASSUMPTIONS

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
REP = os.path.join(HERE, "..", "reports")
os.makedirs(REP, exist_ok=True)

tx = pd.read_csv(os.path.join(DATA, "coffee_shop_transactions_full.csv.gz"), low_memory=False,
                 dtype={"Customer_ID": str})
gt = pd.read_csv(os.path.join(DATA, "ground_truth_daily_components.csv"))
opex = pd.read_csv(os.path.join(DATA, "daily_operating_expenses.csv"))
calf = pd.read_csv(os.path.join(DATA, "calendar_features.csv"))
promo_cal = pd.read_csv(os.path.join(DATA, "promotion_calendar.csv"))
prod_master = pd.read_csv(os.path.join(DATA, "product_master.csv"))
changes = pd.read_csv(os.path.join(DATA, "price_cost_change_log.csv"))

MONEY = ["Gross_Sales", "Discount", "Return_Amount", "Net_Sales", "COGS", "Gross_Profit", "Payment_Fee",
         "Delivery_Commission"]

# =============================================================================
# Validation (exact reconciliation in halalas)
# =============================================================================
c = lambda s: np.round(tx[s] * 100).astype(np.int64)  # noqa: E731
checks = []


def check(name, ok, detail=""):
    checks.append((name, "PASS" if ok else "FAIL", detail))


check("Gross_Sales = Quantity x Unit_Price (exact, every line)", (c("Gross_Sales") == tx.Quantity * c("Unit_Price")).all())
check("Net_Sales = Gross_Sales - Discount - Return_Amount (exact)",
      (c("Net_Sales") == c("Gross_Sales") - c("Discount") - c("Return_Amount")).all())
check("COGS = Quantity x Unit_Cost (exact)", (c("COGS") == tx.Quantity * c("Unit_Cost")).all())
check("Gross_Profit = Net_Sales - COGS (exact)", (c("Gross_Profit") == c("Net_Sales") - c("COGS")).all())
check("No negative Net_Sales", (tx.Net_Sales >= 0).all())
check("No negative Gross_Sales / Discount / Quantity", (tx.Gross_Sales >= 0).all() and (tx.Discount >= 0).all()
      and (tx.Quantity >= 1).all())
check("Discount never exceeds Gross_Sales", (tx.Discount <= tx.Gross_Sales).all())
check("Quantity is an integer", pd.api.types.is_integer_dtype(tx.Quantity))
cogs_gt = tx.COGS > tx.Net_Sales
why = tx.loc[cogs_gt, "Promotion"].eq("Loyalty Free Drink") | tx.loc[cogs_gt, "Return_Amount"].gt(0)
check("COGS > Net_Sales only on refunded or loyalty-free lines", why.all(),
      f"{cogs_gt.sum():,} lines ({cogs_gt.mean():.2%}); all are returns or free loyalty drinks")
dates = pd.to_datetime(tx.Date)
full = pd.date_range(C.START, C.END)
check("Every calendar day 2023-01-01..2025-12-31 has transactions", set(full) == set(dates.unique()),
      f"{dates.nunique()} of {len(full)} days")
check("Transaction_ID + Line_No is unique", not tx.duplicated(["Transaction_ID", "Line_No"]).any())
od = tx.groupby("Transaction_ID").agg(n_dates=("Date", "nunique"), n_cust=("Customer_ID", "nunique"))
check("Each Transaction_ID has a single Date and Customer", (od.n_dates == 1).all() and (od.n_cust <= 1).all())
pp = tx.groupby("Product_ID").Unit_Price.nunique()
exp_changes = {p: 1 for p in prod_master.Product_ID}
for _, r in changes[changes.Type == "Price"].iterrows():
    pid = prod_master.loc[prod_master.Product_Name == r.Product_or_Group, "Product_ID"].iloc[0]
    exp_changes[pid] += 1
check("Each product has a stable price (distinct prices = scheduled price changes + 1)",
      all(pp[p] <= exp_changes[p] for p in pp.index), f"max distinct prices per product: {pp.max()}")
first_type = (tx.drop_duplicates("Transaction_ID").dropna(subset=["Customer_ID"])
              .sort_values(["Date", "Time", "Transaction_ID"]).groupby("Customer_ID").Customer_Type.agg(list))
check("A customer is 'New' at most once and only on the first visit",
      first_type.map(lambda l: l.count("New") <= 1 and ("New" not in l or l[0] == "New")).all())
check("Guest orders have no Customer_ID, identified orders always do",
      tx.loc[tx.Customer_Type == "Guest", "Customer_ID"].isna().all()
      and tx.loc[tx.Customer_Type != "Guest", "Customer_ID"].notna().all())
missing = tx.isna().mean()
check("Missing values confined to Time / Payment_Method / Order_Channel / Customer_ID (guests)",
      set(missing[missing > 0].index) <= {"Time", "Payment_Method", "Order_Channel", "Customer_ID"},
      "; ".join(f"{k}: {v:.2%}" for k, v in missing[missing > 0].items()))

# =============================================================================
# Daily / weekly / monthly summaries
# =============================================================================
orders = tx.groupby("Transaction_ID").agg(Date=("Date", "first"), Customer_ID=("Customer_ID", "first"),
                                          Customer_Type=("Customer_Type", "first"), Channel=("Order_Channel", "first"),
                                          Net=("Net_Sales", "sum"))
daily = tx.groupby("Date")[MONEY + ["Quantity"]].sum()
daily.insert(0, "Orders", orders.groupby("Date").size())
daily["Unique_Customers"] = orders.dropna(subset=["Customer_ID"]).groupby("Date").Customer_ID.nunique()
daily["New_Customers"] = orders[orders.Customer_Type == "New"].groupby("Date").size()
daily["Guest_Orders"] = orders[orders.Customer_Type == "Guest"].groupby("Date").size()
daily["Delivery_Orders"] = orders[orders.Channel == "Delivery App"].groupby("Date").size()
daily = daily.fillna(0).rename(columns={"Quantity": "Items_Sold"})
daily["AOV"] = daily.Net_Sales / daily.Orders
daily["Items_per_Order"] = daily.Items_Sold / daily.Orders
daily["Gross_Margin_%"] = daily.Gross_Profit / daily.Net_Sales * 100
daily = daily.join(opex.set_index("Date")[["Staff_Cost", "Rent", "Utilities", "Marketing", "Other_Opex", "Total_Opex"]])
daily["Net_Profit"] = daily.Gross_Profit - daily.Payment_Fee - daily.Delivery_Commission - daily.Total_Opex
daily["Net_Margin_%"] = daily.Net_Profit / daily.Net_Sales * 100
daily = calf.set_index("Date")[["Day_Name", "Is_Weekend", "Is_Holiday", "Season", "School_Period", "Event",
                                "Avg_Temp_C", "Days_Since_Payday"]].join(daily)
daily = daily.round(2).reset_index()
daily.to_csv(os.path.join(REP, "daily_sales_summary.csv"), index=False)
check("Daily Net_Profit = Gross_Profit - Payment_Fee - Delivery_Commission - Total_Opex",
      np.allclose(daily.Net_Profit, daily.Gross_Profit - daily.Payment_Fee - daily.Delivery_Commission - daily.Total_Opex,
                  atol=0.02))
check("Daily AOV = Net_Sales / Orders", np.allclose(daily.AOV, daily.Net_Sales / daily.Orders, atol=0.01))

d = daily.copy()
d["Date"] = pd.to_datetime(d.Date)
SUMCOLS = ["Orders", "Items_Sold"] + MONEY + ["Total_Opex", "Net_Profit", "New_Customers"]


def finish(g):
    g["AOV"] = g.Net_Sales / g.Orders
    g["Items_per_Order"] = g.Items_Sold / g.Orders
    g["Gross_Margin_%"] = g.Gross_Profit / g.Net_Sales * 100
    g["Net_Margin_%"] = g.Net_Profit / g.Net_Sales * 100
    g["Discount_Rate_%"] = g.Discount / g.Gross_Sales * 100
    return g


d["Week_Start"] = d.Date - pd.to_timedelta((d.Date.dt.dayofweek + 1) % 7, unit="D")   # Sunday-start Saudi week
weekly = finish(d.groupby("Week_Start")[SUMCOLS].sum())
weekly.insert(0, "Days_In_Week", d.groupby("Week_Start").size())
weekly = weekly.round(2).reset_index()
weekly["Week_Start"] = weekly.Week_Start.dt.strftime("%Y-%m-%d")
weekly.to_csv(os.path.join(REP, "weekly_sales_summary.csv"), index=False)

d["Year"], d["Month"] = d.Date.dt.year, d.Date.dt.month
monthly = finish(d.groupby(["Year", "Month"])[SUMCOLS].sum())
monthly.insert(0, "Days", d.groupby(["Year", "Month"]).size())
monthly.insert(1, "Month_Name", [pd.Timestamp(2000, m, 1).month_name() for _, m in monthly.index])
monthly["Avg_Daily_Orders"] = monthly.Orders / monthly.Days
monthly["Avg_Daily_Net_Sales"] = monthly.Net_Sales / monthly.Days
o2 = orders.dropna(subset=["Customer_ID"]).copy()
o2["YM"] = o2.Date.str[:7]
monthly["Active_Customers"] = o2.groupby("YM").Customer_ID.nunique().values
monthly["MoM_Net_Sales_%"] = monthly.Net_Sales.pct_change() * 100
monthly["YoY_Net_Sales_%"] = monthly.Net_Sales.pct_change(12) * 100
gtm = gt.copy()
gtm["Date"] = pd.to_datetime(gtm.Date)
gtm["Expected_No_Shock"] = gtm.Expected_Orders / gtm.E_month_shock / gtm.E_regime
exp_m = gtm.groupby([gtm.Date.dt.year, gtm.Date.dt.month]).Expected_No_Shock.sum().values
monthly["Expected_Orders_(structural)"] = exp_m
monthly["Orders_vs_Structural_Expectation_%"] = (monthly.Orders / exp_m - 1) * 100
monthly["Performance_Flag"] = np.select([monthly["Orders_vs_Structural_Expectation_%"] > 3,
                                         monthly["Orders_vs_Structural_Expectation_%"] < -3],
                                        ["Outperformed", "Underperformed"], "In line")
monthly = monthly.round(2).reset_index()
monthly.to_csv(os.path.join(REP, "monthly_summary.csv"), index=False)

# =============================================================================
# Product performance
# =============================================================================
tx["Season"] = tx.Season.astype(str)
pg = tx.groupby(["Product_ID", "Product_Name", "Category"]).agg(
    Units_Sold=("Quantity", "sum"), Order_Lines=("Quantity", "size"), Gross_Sales=("Gross_Sales", "sum"),
    Discount=("Discount", "sum"), Net_Sales=("Net_Sales", "sum"), COGS=("COGS", "sum"),
    Gross_Profit=("Gross_Profit", "sum"), Days_On_Sale=("Date", "nunique"))
pg["Avg_Net_Price"] = pg.Net_Sales / pg.Units_Sold
pg["Gross_Margin_%"] = pg.Gross_Profit / pg.Net_Sales * 100
pg["Units_Share_%"] = pg.Units_Sold / pg.Units_Sold.sum() * 100
pg["Net_Sales_Share_%"] = pg.Net_Sales / pg.Net_Sales.sum() * 100
pg["Gross_Profit_Share_%"] = pg.Gross_Profit / pg.Gross_Profit.sum() * 100
pg["Units_per_Day_On_Sale"] = pg.Units_Sold / pg.Days_On_Sale
pg["Rank_Net_Sales"] = pg.Net_Sales.rank(ascending=False).astype(int)
season_units = tx.groupby(["Product_ID", "Season"]).Quantity.sum().unstack(fill_value=0)
season_days = tx.groupby("Season").Date.nunique()
season_rate = season_units / season_days
season_idx = season_rate.div(season_rate.mean(1), axis=0)
for s_ in ["Winter", "Spring", "Summer", "Autumn"]:
    pg[f"Season_Index_{s_}"] = season_idx[s_].reindex(pg.index.get_level_values(0)).values
mu = tx.groupby(["Product_ID", "Month"]).Quantity.sum().unstack(fill_value=0)
pg["Peak_Month"] = [pd.Timestamp(2000, int(m), 1).month_name() for m in mu.idxmax(1).reindex(pg.index.get_level_values(0))]
yu = tx.groupby(["Product_ID", "Year"]).Quantity.sum().unstack(fill_value=0)
for y in (2023, 2024, 2025):
    pg[f"Units_{y}"] = yu[y].reindex(pg.index.get_level_values(0)).values
vol_med, mar_med = pg.Units_per_Day_On_Sale.median(), pg["Gross_Margin_%"].median()
pg["Volume_Margin_Quadrant"] = np.select(
    [(pg.Units_per_Day_On_Sale >= vol_med) & (pg["Gross_Margin_%"] >= mar_med),
     (pg.Units_per_Day_On_Sale >= vol_med) & (pg["Gross_Margin_%"] < mar_med),
     (pg.Units_per_Day_On_Sale < vol_med) & (pg["Gross_Margin_%"] >= mar_med)],
    ["Star: high volume, high margin", "Traffic driver: high volume, lower margin",
     "Niche: low volume, high margin"], "Review: low volume, lower margin")
pg = pg.round(2).reset_index().sort_values("Rank_Net_Sales")
pg.to_csv(os.path.join(REP, "product_performance.csv"), index=False)

# =============================================================================
# Hourly profile
# =============================================================================
oh = tx.drop_duplicates("Transaction_ID")[["Date", "Time"]].dropna().copy()
oh["Hour"] = oh.Time.str[:2].astype(int)
dt_map = gt.set_index("Date").Day_Type
oh["Day_Type"] = oh.Date.map(dt_map).map({"wkday": "Sun-Wed", "thu": "Thursday", "fri": "Friday", "sat": "Saturday",
                                          "holiday": "Public holiday", "ramadan": "Ramadan", "eid1": "Eid day 1"})
ndays = gt.Day_Type.map({"wkday": "Sun-Wed", "thu": "Thursday", "fri": "Friday", "sat": "Saturday",
                         "holiday": "Public holiday", "ramadan": "Ramadan", "eid1": "Eid day 1"}).value_counts()
hourly = oh.groupby(["Hour", "Day_Type"]).size().unstack(fill_value=0) / ndays
hourly = hourly[["Sun-Wed", "Thursday", "Friday", "Saturday", "Public holiday", "Ramadan", "Eid day 1"]].round(2)
hourly.index.name = "Hour (clock time; 00-03 belong to previous business day)"
hourly.to_csv(os.path.join(REP, "hourly_profile_avg_orders.csv"))

# =============================================================================
# Seasonal analysis: Expected (noise-free model) vs Observed (transactions), same estimator
# =============================================================================
A = daily[["Date", "Orders", "Net_Sales", "AOV", "Gross_Profit", "Day_Name", "Event"]].copy()
A["Date"] = pd.to_datetime(A.Date)
A = A.merge(gt.assign(Date=pd.to_datetime(gt.Date)), on="Date")
A["Corp"] = A.Corporate_Orders
A["Retail"] = A.Orders - A.Corp
A["Exp"] = A.Expected_Orders
special = (A.Day_Type.isin(["ramadan", "eid1", "holiday"]) | (A.Eid_Fitr_Day > 0) | A.Adha_Rel_Day.notna()
           | (A.Event.str.contains("Ramadan Eve|Fitr Eve|National Day Eve|Offer|White Friday|Monday Boost|Back to School|App Launch|Post-|Happy Hour",
                                   regex=True)) | (A.Unlabelled_Anomaly.fillna("") != "")
           | (A.Date.between("2024-02-08", "2024-02-22")))
A["Normal"] = ~special
dow_i = A.Date.dt.dayofweek.values
dates_np = A.Date.values


def same_weekday_baseline(col):
    """Median of the same weekday within +-5 weeks, using only 'normal' days."""
    v = A[col].values
    out = np.full(len(A), np.nan)
    for i in range(len(A)):
        js = [i + 7 * k for k in (-5, -4, -3, -2, -1, 1, 2, 3, 4, 5) if 0 <= i + 7 * k < len(A)]
        js = [j for j in js if A.Normal.iat[j]]
        if len(js) >= 3:
            out[i] = np.median(v[js])
    return out


for col in ("Retail", "Exp", "Net_Sales", "AOV", "Gross_Profit"):
    A[f"BL_{col}"] = same_weekday_baseline(col)
A["Lift_Obs"] = A.Retail / A.BL_Retail
A["Lift_Exp"] = A.Exp / A.BL_Exp
A["Lift_Net"] = A.Net_Sales / A.BL_Net_Sales
A["Lift_AOV"] = A.AOV / A.BL_AOV
A["Lift_GP"] = A.Gross_Profit / A.BL_Gross_Profit
rows = []


def add(factor, level, mask, comp=None, note=""):
    m = mask & A.Lift_Obs.notna()
    if m.sum() == 0:
        return
    rows.append(dict(Factor=factor, Level=level, Days=int(m.sum()),
                     Model_Component_Multiplier=round(A.loc[mask, f"E_{comp}"].mean(), 3) if comp else np.nan,
                     Expected_Orders_Lift=round(A.loc[m, "Lift_Exp"].mean(), 3),
                     Observed_Orders_Lift=round(A.loc[m, "Lift_Obs"].mean(), 3),
                     Observed_Net_Sales_Lift=round(A.loc[m, "Lift_Net"].mean(), 3),
                     Observed_AOV_Lift=round(A.loc[m, "Lift_AOV"].mean(), 3),
                     Observed_Gross_Profit_Lift=round(A.loc[m, "Lift_GP"].mean(), 3), Note=note))


# Day of week: ratio to centred 7-day moving average (classical decomposition), normal weeks only
for col in ("Retail", "Exp", "Net_Sales", "AOV"):
    A[f"MA7_{col}"] = A[col].rolling(7, center=True).mean()
    A[f"MA28_{col}"] = A[col].rolling(29, center=True).mean()
clean7 = A.Normal.rolling(7, center=True).min().astype(bool) & (A.Day_Type != "ramadan")
for dname in ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]:
    m = clean7 & (A.Day_Name == dname)
    rows.append(dict(Factor="Day of week", Level=dname, Days=int(m.sum()),
                     Model_Component_Multiplier=round(A.loc[m, "E_day_of_week"].mean() / A.loc[clean7, "E_day_of_week"].mean(), 3),
                     Expected_Orders_Lift=round((A.Exp / A.MA7_Exp)[m].mean(), 3),
                     Observed_Orders_Lift=round((A.Retail / A.MA7_Retail)[m].mean(), 3),
                     Observed_Net_Sales_Lift=round((A.Net_Sales / A.MA7_Net_Sales)[m].mean(), 3),
                     Observed_AOV_Lift=round((A.AOV / A.MA7_AOV)[m].mean(), 3), Observed_Gross_Profit_Lift=np.nan,
                     Note="Ratio to centred 7-day moving average; Ramadan/holiday/promo weeks excluded"))

# Month: monthly avg daily orders / that year's avg daily orders, averaged over 3 years
A["Year"], A["Month"] = A.Date.dt.year, A.Date.dt.month
for col in ("Retail", "Exp", "Net_Sales", "AOV"):
    A[f"YR_{col}"] = A[col] / A.groupby("Year")[col].transform("mean")
mi = A.groupby("Month")[["YR_Retail", "YR_Exp", "YR_Net_Sales", "YR_AOV"]].mean()
MONTH_NOTE = {1: "Winter peak, Riyadh Season, comfortable outdoor seating", 2: "Winter; Founding Day; exams/term break",
              3: "Spring; Ramadan in 2024-2025 (fewer, larger orders)", 4: "Ramadan/Eid Al-Fitr 2023-2024; warming",
              5: "Heat rising; exam season approaches", 6: "Exams end, summer travel begins; Eid Al-Adha",
              7: "Peak heat & travel abroad; students away", 8: "Summer trough; back-to-school end of month",
              9: "Schools back; National Day", 10: "Autumn recovery; Riyadh Season starts; Pumpkin Spice",
              11: "Cooler; White Friday promotion", 12: "Winter peak; Riyadh Season events; Pistachio Latte"}
for m in range(1, 13):
    rows.append(dict(Factor="Month", Level=pd.Timestamp(2000, m, 1).month_name(), Days=int((A.Month == m).sum()),
                     Model_Component_Multiplier=round(A.loc[A.Month == m, "E_month_behaviour"].mean()
                                                      * A.loc[A.Month == m, "E_climate"].mean(), 3),
                     Expected_Orders_Lift=round(mi.loc[m, "YR_Exp"], 3), Observed_Orders_Lift=round(mi.loc[m, "YR_Retail"], 3),
                     Observed_Net_Sales_Lift=round(mi.loc[m, "YR_Net_Sales"], 3), Observed_AOV_Lift=round(mi.loc[m, "YR_AOV"], 3),
                     Observed_Gross_Profit_Lift=np.nan, Note=MONTH_NOTE[m] + ". Component = month behaviour x climate"))

# Ramadan
r = A.Ramadan_Day
L = r.groupby(A.Year).transform("max")
add("Ramadan", "All Ramadan days", r > 0, "ramadan", "Demand shifts to night; fewer but larger orders")
add("Ramadan", "Nights 1-3", r.between(1, 3), "ramadan")
add("Ramadan", "Nights 4-19", r.between(4, 19), "ramadan")
add("Ramadan", "Last 10 nights (excl. Eid eve)", (r > L - 10) & (r < L), "ramadan")
add("Ramadan", "Eid Al-Fitr eve (last night)", (r == L) & (r > 0), "ramadan")
for y in (2023, 2024, 2025):
    add("Ramadan", f"Ramadan {y}", (r > 0) & (A.Year == y), "ramadan")
add("Ramadan", "Ramadan eve (night before)", A.Event.str.contains("Ramadan Eve"), "holiday")

# Holidays
for k in (1, 2, 3, 4):
    add("Holidays & Eid", f"Eid Al-Fitr day {k}", A.Eid_Fitr_Day == k, "holiday")
add("Holidays & Eid", "Post-Eid Al-Fitr (days 5-7)", A.Eid_Fitr_Day >= 5, "holiday")
add("Holidays & Eid", "Day of Arafah", A.Adha_Rel_Day == 0, "holiday")
for k in (1, 2, 3, 4):
    add("Holidays & Eid", f"Eid Al-Adha day {k}", A.Adha_Rel_Day == k, "holiday")
add("Holidays & Eid", "Post-Eid Al-Adha (days 5-7)", A.Adha_Rel_Day >= 5, "holiday")
add("Holidays & Eid", "Saudi National Day (Sep 23)", A.Event.str.contains("Saudi National Day"), "holiday",
    "Includes National Day Offer promotion")
add("Holidays & Eid", "National Day Eve", A.Event.str.contains("National Day Eve"), "holiday")
add("Holidays & Eid", "Saudi Founding Day (Feb 22)", A.Event.str.contains("Saudi Founding Day"), "holiday",
    "Includes Founding Day Offer promotion")
add("Holidays & Eid", "Bridge holiday", A.Event.str.contains("Day Holiday"), "holiday")

# Salary cycle: ratio to 29-day centred MA (spans one pay cycle), normal days
clean29 = A.Normal & (A.Day_Type != "ramadan")
for lo, hi, lab in [(0, 2, "Payday to +2 days"), (3, 6, "+3 to +6 days"), (7, 13, "+7 to +13 days"),
                    (14, 20, "+14 to +20 days"), (21, 31, "+21 days to next payday (squeeze)")]:
    m = clean29 & A.Days_Since_Payday.between(lo, hi)
    rows.append(dict(Factor="Salary cycle (payday = 27th)", Level=lab, Days=int(m.sum()),
                     Model_Component_Multiplier=round(A.loc[m, "E_salary"].mean(), 3),
                     Expected_Orders_Lift=round((A.Exp / A.MA28_Exp)[m].mean(), 3),
                     Observed_Orders_Lift=round((A.Retail / A.MA28_Retail)[m].mean(), 3),
                     Observed_Net_Sales_Lift=round((A.Net_Sales / A.MA28_Net_Sales)[m].mean(), 3),
                     Observed_AOV_Lift=round((A.AOV / A.MA28_AOV)[m].mean(), 3), Observed_Gross_Profit_Lift=np.nan,
                     Note="Ratio to centred 29-day moving average; normal days only"))

# Promotions (day-level)
for name in ["White Friday", "Post-White Friday", "Back to School 15%", "App Launch 25% Off",
             "National Day Offer", "Founding Day Offer", "Ramadan Nights Desserts 10%"]:
    m = A.Event.str.contains(name, regex=False)
    if name == "White Friday":
        m &= ~A.Event.str.contains("Post-White Friday", regex=False)
    disc = tx[tx.Promotion == name]
    note = f"Avg discount on promoted lines {disc.Discount.sum() / max(disc.Gross_Sales.sum(), 1):.0%}" if len(disc) else \
        "Post-promotion pull-forward dip"
    add("Promotions", name, m, "promotion", note)

# Monday Boost: Monday weekly index (ratio to centred 7-day MA) on boost Mondays vs normal Mondays
mb = A.Event.str.contains("Monday Boost", regex=False)
mon = clean7 & (A.Day_Name == "Monday")
r_obs, r_exp, r_net = A.Retail / A.MA7_Retail, A.Exp / A.MA7_Exp, A.Net_Sales / A.MA7_Net_Sales
disc = tx[tx.Promotion == "Monday Boost 15%"]
rows.append(dict(Factor="Promotions", Level="Monday Boost 15% (Monday weekly index vs normal Mondays)", Days=int(mb.sum()),
                 Model_Component_Multiplier=round(A.loc[mb, "E_promotion"].mean(), 3),
                 Expected_Orders_Lift=round(r_exp[mb].mean() / r_exp[mon].mean(), 3),
                 Observed_Orders_Lift=round(r_obs[mb].mean() / r_obs[mon].mean(), 3),
                 Observed_Net_Sales_Lift=round(r_net[mb].mean() / r_net[mon].mean(), 3), Observed_AOV_Lift=np.nan,
                 Observed_Gross_Profit_Lift=np.nan,
                 Note=f"Jan-Feb 2025 only; avg discount on promoted lines {disc.Discount.sum() / disc.Gross_Sales.sum():.0%}. "
                      "The promo also lifts the 7-day MA slightly, so this estimator understates the lift a little"))

# Summer Iced Happy Hour: share of orders 14:00-17:00 on Sun-Thu summer days, promo vs no-promo (2023)
oh2 = oh.copy()
oh2["D"] = pd.to_datetime(oh2.Date)
summer_wd = oh2.D.dt.month.isin([7, 8]) & oh2.D.dt.dayofweek.isin([6, 0, 1, 2, 3])
win = oh2.Hour.between(14, 16)
share = lambda m: win[m].mean()  # noqa: E731
s23, s24, s25 = (share(summer_wd & (oh2.D.dt.year == y)) for y in (2023, 2024, 2025))
rows.append(dict(Factor="Promotions", Level="Summer Iced Happy Hour (14:00-17:00 share of orders)", Days=np.nan,
                 Model_Component_Multiplier=np.nan, Expected_Orders_Lift=np.nan,
                 Observed_Orders_Lift=round(((s24 + s25) / 2) / s23, 3), Observed_Net_Sales_Lift=np.nan,
                 Observed_AOV_Lift=np.nan, Observed_Gross_Profit_Lift=np.nan,
                 Note=f"Hour-level promo: window share {s23:.1%} in 2023 (no promo) vs {s24:.1%} / {s25:.1%} in 2024 / 2025; "
                      f"designed hourly boost x1.45 (students, leisure, delivery)"))

# Unlabelled anomalies
for lab in ["Sandstorm", "Rain", "Nearby Riyadh Season event", "Espresso machine breakdown", "Power outage"]:
    add("Unlabelled anomalies (ground truth only)", lab, A.Unlabelled_Anomaly.fillna("").str.startswith(lab), "anomaly",
        "Not flagged in the transaction file - a robust model should treat these as outliers")
seasonal = pd.DataFrame(rows)
seasonal.to_csv(os.path.join(REP, "seasonal_analysis.csv"), index=False)

# Iced vs hot mix by month (product seasonality)
bev = tx[tx.Category.isin(["Espresso Drinks", "Iced Coffee", "Specialty Coffee", "Tea & Matcha", "Other Beverages", "Seasonal"])]
iced_names = set(prod_master.loc[prod_master.Kind == "iced", "Product_Name"])
bev = bev.assign(Iced=bev.Product_Name.isin(iced_names) * bev.Quantity)
mix = bev.groupby("Month").agg(Beverage_Units=("Quantity", "sum"), Iced_Units=("Iced", "sum"))
mix["Iced_Share_%"] = (mix.Iced_Units / mix.Beverage_Units * 100).round(1)
mix["Avg_Temp_C"] = calf.assign(M=pd.to_datetime(calf.Date).dt.month).groupby("M").Avg_Temp_C.mean().round(1)
mix.index = [pd.Timestamp(2000, m, 1).month_name() for m in mix.index]
mix.to_csv(os.path.join(REP, "iced_vs_hot_mix_by_month.csv"))

# Customer behaviour
oc = orders.dropna(subset=["Customer_ID"])
cs = oc.groupby("Customer_ID").agg(Orders=("Net", "size"), Spend=("Net", "sum"), First=("Date", "min"), Last=("Date", "max"))
cs["Seg"] = pd.read_csv(os.path.join(DATA, "customer_master.csv")).set_index("Customer_ID").Acquisition_Segment.reindex(cs.index)
cs.loc[cs.index.str.startswith("CORP"), "Seg"] = "Corporate"
cs["Tenure_Days"] = (pd.to_datetime(cs.Last) - pd.to_datetime(cs.First)).dt.days + 1
cust_sum = cs.groupby("Seg").agg(Customers=("Orders", "size"), Avg_Orders=("Orders", "mean"), Median_Orders=("Orders", "median"),
                                 One_Visit_Share=("Orders", lambda x: (x == 1).mean()),
                                 Avg_Basket_SAR=("Spend", "sum"), Top10pct_Orders_Share=("Orders", lambda x: x.nlargest(max(1, len(x) // 10)).sum() / x.sum()))
cust_sum["Avg_Basket_SAR"] = cust_sum.Avg_Basket_SAR / cs.groupby("Seg").Orders.sum()
cust_sum["Visits_per_Month_(active_customers)"] = cs.groupby("Seg").apply(
    lambda g: (g.Orders / (g.Tenure_Days / 30.4).clip(lower=1)).mean())
cust_sum = cust_sum.round(3).reset_index().rename(columns={"Seg": "Acquisition_Segment"})
cust_sum.to_csv(os.path.join(REP, "customer_segment_summary.csv"), index=False)
freq = pd.cut(cs.Orders, [0, 1, 2, 5, 10, 25, 50, 100, 10000],
              labels=["1", "2", "3-5", "6-10", "11-25", "26-50", "51-100", "100+"]).value_counts().sort_index()
freq_df = pd.DataFrame({"Orders_per_Customer": freq.index.astype(str), "Customers": freq.values,
                        "Share_%": (freq.values / freq.sum() * 100).round(2)})
freq_df.to_csv(os.path.join(REP, "customer_frequency_distribution.csv"), index=False)

# =============================================================================
# Forecast benchmark: train 2023-2024, test 2025 (daily orders)
# =============================================================================
from statsmodels.tsa.holtwinters import ExponentialSmoothing  # noqa: E402

ser = A.set_index("Date").Retail.astype(float)
train, test = ser[:"2024-12-31"], ser["2025-01-01":]
h = len(test)


def mape(f):
    return float(np.mean(np.abs(test.values - np.asarray(f)) / test.values) * 100)


bench = []
bench.append(("Naive (last value)", mape(np.repeat(train.iloc[-1], h))))
bench.append(("Seasonal naive (same weekday last week, recursive)", mape(np.tile(train.iloc[-7:].values, h // 7 + 1)[:h])))
bench.append(("Moving average (28 days)", mape(np.repeat(train.iloc[-28:].mean(), h))))
w = np.arange(1, 29)
bench.append(("Weighted moving average (28 days, linear weights)", mape(np.repeat((train.iloc[-28:].values * w).sum() / w.sum(), h))))
bench.append(("Seasonal naive (same weekday, 52 weeks ago)", mape(ser.shift(364)["2025-01-01":].values)))
hw = ExponentialSmoothing(train, trend="add", damped_trend=True, seasonal="mul", seasonal_periods=7).fit()
bench.append(("Holt-Winters (damped additive trend, weekly multiplicative)", mape(hw.forecast(h))))
# log-linear regression with calendar features (stand-in for Prophet/XGBoost-style models)
F = pd.DataFrame(index=A.Date)
F["t"] = np.arange(len(A)) / 365.25
for k in range(1, 4):
    F[f"s{k}"] = np.sin(2 * np.pi * k * A.Date.dt.dayofyear.values / 365.25)
    F[f"c{k}"] = np.cos(2 * np.pi * k * A.Date.dt.dayofyear.values / 365.25)
for dn in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]:
    F[dn] = (A.Day_Name == dn).astype(float).values
F["ram"] = (A.Ramadan_Day > 0).astype(float).values
F["ram_last10"] = ((A.Ramadan_Day > 0) & (A.Ramadan_Day > L - 10)).astype(float).values
for k in range(1, 8):
    F[f"fitr{k}"] = (A.Eid_Fitr_Day == k).astype(float).values
for k in range(0, 8):
    F[f"adha{k}"] = (A.Adha_Rel_Day == k).astype(float).values
F["hol"] = A.Event.str.contains("National Day|Founding Day|Day Holiday").astype(float).values
F["eve"] = A.Event.str.contains("Ramadan Eve|Fitr Eve|National Day Eve").astype(float).values
F["sal"] = np.exp(-A.Days_Since_Payday.values / 2.5)
F["wf"] = A.Event.str.contains("White Friday").astype(float).values
F["promo"] = A.Event.str.contains("Monday Boost|Back to School|App Launch").astype(float).values
F["summer_school"] = (A.School_Period == "Summer Vacation").astype(float).values
F["break"] = (A.School_Period == "Term Break").astype(float).values
F["temp"] = A.Temp_C.values
F["temp2"] = (A.Temp_C.values - 26) ** 2
F["const"] = 1.0
Xtr, Xte = F.loc[train.index].values, F.loc[test.index].values
beta, *_ = np.linalg.lstsq(Xtr, np.log(train.values), rcond=None)
resid_sd = np.std(np.log(train.values) - Xtr @ beta)
bench.append(("Log-linear regression on calendar/event/weather features (Prophet/GBM-style)",
              mape(np.exp(Xte @ beta + resid_sd ** 2 / 2))))
bench.append(("ORACLE: noise-free ground truth Expected_Orders (irreducible-noise floor)", mape(A.set_index("Date").Exp["2025-01-01":])))
bench = pd.DataFrame(bench, columns=["Model", "MAPE_2025_daily_orders_%"]).round({"MAPE_2025_daily_orders_%": 2})
bench.to_csv(os.path.join(REP, "forecast_benchmark.csv"), index=False)

# Signal-to-noise
lr = np.log(A.Retail) - np.log(A.Exp)
snr = pd.DataFrame([
    ("Var(log actual daily orders)", np.var(np.log(A.Retail))),
    ("Var(log actual - log expected) = noise variance", np.var(lr)),
    ("Share of daily log-variance explained by structure (R^2)", 1 - np.var(lr) / np.var(np.log(A.Retail))),
    ("Correlation actual vs expected daily orders", np.corrcoef(A.Retail, A.Exp)[0, 1]),
    ("Noise SD on log scale (approx. % daily noise)", np.std(lr)),
    ("Monthly: share of log-variance explained by structure",
     1 - np.var(np.log(A.groupby(["Year", "Month"]).Retail.sum()) - np.log(A.groupby(["Year", "Month"]).Exp.sum()))
     / np.var(np.log(A.groupby(["Year", "Month"]).Retail.sum()))),
], columns=["Metric", "Value"]).round(4)
snr.to_csv(os.path.join(REP, "signal_to_noise.csv"), index=False)

val = pd.DataFrame(checks, columns=["Check", "Result", "Detail"])
val.to_csv(os.path.join(REP, "validation_checks.csv"), index=False)

# =============================================================================
# Dictionary, assumptions, Excel
# =============================================================================
dd = pd.DataFrame(DICTIONARY, columns=["Column", "Type", "Example", "Description", "Derivation / Formula"])
ex = tx.dropna().iloc[0]
dd["Example"] = [str(ex[c_]) if c_ in ex.index else e for c_, e in zip(dd.Column, dd.Example)]
dd.to_csv(os.path.join(REP, "data_dictionary.csv"), index=False)
asm = pd.DataFrame(ASSUMPTIONS, columns=["Area", "Assumption", "Value / Formula"])
asm.to_csv(os.path.join(REP, "statistical_assumptions.csv"), index=False)

print("Writing analysis workbook...")
with pd.ExcelWriter(os.path.join(REP, "coffee_shop_analysis.xlsx"), engine="xlsxwriter") as xw:
    book = xw.book
    hdr = book.add_format({"bold": True, "bg_color": "#3E2723", "font_color": "white", "border": 1, "text_wrap": True,
                           "valign": "top"})
    sheets = [("Validation", val), ("Data_Dictionary", dd), ("Assumptions", asm), ("Seasonal_Analysis", seasonal),
              ("Monthly_Summary", monthly), ("Weekly_Summary", weekly), ("Daily_Summary", daily),
              ("Product_Performance", pg), ("Hourly_Profile", hourly.reset_index()), ("Iced_vs_Hot_Mix", mix.reset_index()),
              ("Customer_Segments", cust_sum), ("Customer_Frequency", freq_df), ("Forecast_Benchmark", bench),
              ("Signal_to_Noise", snr), ("Promotion_Calendar", promo_cal), ("Price_Cost_Changes", changes),
              ("Product_Master", prod_master), ("Ground_Truth", gt)]
    for name, frame in sheets:
        frame.to_excel(xw, sheet_name=name, index=False)
        ws = xw.sheets[name]
        for j, col in enumerate(frame.columns):
            ws.write(0, j, str(col), hdr)
            width = min(60, max(10, int(frame[col].astype(str).str.len().quantile(0.9)) + 2, len(str(col)) // 2 + 4))
            ws.set_column(j, j, width)
        ws.freeze_panes(1, 0)
        ws.autofilter(0, 0, len(frame), len(frame.columns) - 1)

if not os.environ.get("SKIP_TX_XLSX"):
    import xlsxwriter  # noqa: E402

    print("Writing transactions workbooks, one per year (this takes a few minutes)...")
    for year in (2023, 2024, 2025):
        wb = xlsxwriter.Workbook(os.path.join(DATA, f"coffee_shop_transactions_{year}.xlsx"), {"strings_to_urls": False})
        bold = wb.add_format({"bold": True, "bg_color": "#3E2723", "font_color": "white"})
        money = wb.add_format({"num_format": "#,##0.00"})
        for name, frame in (("Transactions", tx[tx.Year == year]), ("Data_Dictionary", dd)):
            ws = wb.add_worksheet(name)
            ws.freeze_panes(1, 0)
            cols = list(frame.columns)
            ws.write_row(0, 0, cols, bold)
            for j, col in enumerate(cols):
                ws.set_column(j, j, 14 if name == "Transactions" else 40,
                              money if col in MONEY + ["Unit_Price", "Unit_Cost"] else None)
            if name == "Transactions":
                ws.autofilter(0, 0, len(frame), len(cols) - 1)
            for r, row in enumerate(frame.itertuples(index=False, name=None), start=1):
                ws.write_row(r, 0, ["" if (isinstance(v, float) and v != v) else v for v in row])
        wb.close()

print(val.to_string())
print(bench.to_string())
print(snr.to_string())
