#!/usr/bin/env python3
"""Aggregate the transactions into compact cubes and embed them into the dashboard HTML template."""
import json
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
OUT = os.path.join(HERE, "..", "dashboard")

tx = pd.read_csv(os.path.join(DATA, "coffee_shop_transactions_full.csv.gz"), low_memory=False)
cal = pd.read_csv(os.path.join(DATA, "calendar_features.csv"))
gt = pd.read_csv(os.path.join(DATA, "ground_truth_daily_components.csv"))
opex = pd.read_csv(os.path.join(DATA, "daily_operating_expenses.csv"))
pm = pd.read_csv(os.path.join(DATA, "product_master.csv"))

CH = ["In-Store", "Drive-Thru", "Mobile App", "Delivery App", "Unknown"]
PAY = ["mada", "Apple Pay", "Credit Card", "Cash", "STC Pay", "Delivery App", "Corporate Invoice", "Unknown"]
CT = ["New", "Returning", "Guest"]
CAT = ["Espresso Drinks", "Iced Coffee", "Specialty Coffee", "Tea & Matcha", "Other Beverages", "Bakery", "Desserts",
       "Sandwiches", "Seasonal"]
PROD = list(pm.Product_ID)
DAYS = list(cal.Date)
MONTHS = sorted({d[:7] for d in DAYS})

tx["Order_Channel"] = tx.Order_Channel.fillna("Unknown")
tx["Payment_Method"] = tx.Payment_Method.fillna("Unknown")
tx["m"] = tx.Date.str[:7].map({m: i for i, m in enumerate(MONTHS)})
tx["d"] = tx.Date.map({d: i for i, d in enumerate(DAYS)})
tx["ch"] = tx.Order_Channel.map({c: i for i, c in enumerate(CH)})
tx["pay"] = tx.Payment_Method.map({c: i for i, c in enumerate(PAY)})
tx["ct"] = tx.Customer_Type.map({c: i for i, c in enumerate(CT)})
tx["cat"] = tx.Category.map({c: i for i, c in enumerate(CAT)})
tx["p"] = tx.Product_ID.map({c: i for i, c in enumerate(PROD)})
tx["hour"] = pd.to_numeric(tx.Time.str[:2], errors="coerce")
assert tx[["m", "d", "ch", "pay", "ct", "cat", "p"]].notna().all().all()

r2 = lambda s: s.round(2)  # noqa: E731

# L: line cube (month, channel, payment, customer type, category)
g = tx.groupby(["m", "ch", "pay", "ct", "cat"])
L = pd.DataFrame({"net": r2(g.Net_Sales.sum()), "gp": r2(g.Gross_Profit.sum()), "gross": r2(g.Gross_Sales.sum()),
                  "disc": r2(g.Discount.sum()), "qty": g.Quantity.sum(), "fee": r2(g.Payment_Fee.sum()),
                  "com": r2(g.Delivery_Commission.sum()), "oc": g.Transaction_ID.nunique()}).reset_index()
# O: distinct orders (month, channel, payment, customer type)
O = tx.groupby(["m", "ch", "pay", "ct"]).Transaction_ID.nunique().reset_index()
# P: product cube
g = tx.groupby(["m", "ch", "p"])
P = pd.DataFrame({"qty": g.Quantity.sum(), "net": r2(g.Net_Sales.sum()), "gp": r2(g.Gross_Profit.sum())}).reset_index()
# D: daily cube (day, channel, category)
g = tx.groupby(["d", "ch", "cat"])
D = pd.DataFrame({"net": r2(g.Net_Sales.sum()), "gp": r2(g.Gross_Profit.sum()),
                  "fc": r2(g.Payment_Fee.sum() + g.Delivery_Commission.sum()), "oc": g.Transaction_ID.nunique()}).reset_index()
D0 = tx.groupby(["d", "ch"]).Transaction_ID.nunique().reset_index()
# H: hour cube (month, channel, category, hour) -> orders containing
h = tx.dropna(subset=["hour"]).copy()
h["hour"] = h.hour.astype(int)
H = h.groupby(["m", "ch", "cat", "hour"]).agg(net=("Net_Sales", "sum"), oc=("Transaction_ID", "nunique")).reset_index()
H["net"] = r2(H.net)
H0 = h.groupby(["m", "ch", "hour"]).Transaction_ID.nunique().reset_index()

# day metadata: [month idx, dow (0=Sun), event class]
ev = cal.Event.fillna("")
gtx = gt.set_index("Date")


def cls(i):
    e = ev[i]
    d = DAYS[i]
    if gtx.loc[d, "Eid_Fitr_Day"] > 0:
        return 1
    if not np.isnan(gtx.loc[d, "Adha_Rel_Day"]):
        return 2
    if gtx.loc[d, "Ramadan_Day"] > 0:
        return 3
    if "National Day" in e or "Founding Day" in e:
        return 4
    if "White Friday" in e and "Post-" not in e:
        return 5
    if "Salary Week" in e:
        return 6
    return 0


dow = pd.to_datetime(cal.Date).dt.dayofweek.map(lambda x: (x + 1) % 7)
daymeta = [[int(MONTHS.index(DAYS[i][:7])), int(dow[i]), cls(i)] for i in range(len(DAYS))]

op = opex.copy()
op["m"] = op.Date.str[:7].map({m: i for i, m in enumerate(MONTHS)})
opex_m = op.groupby("m").Total_Opex.sum().round(2).tolist()

payload = {
    "months": MONTHS, "days": DAYS, "daymeta": daymeta, "ch": CH, "pay": PAY, "ct": CT, "cat": CAT,
    "prod": [[r.Product_ID, r.Product_Name, CAT.index(r.Category)] for r in pm.itertuples()],
    "L": L.values.tolist(), "O": O.values.tolist(), "P": P.values.tolist(), "D": D.values.tolist(),
    "H": H.values.tolist(), "H0": H0.values.tolist(), "D0": D0.values.tolist(), "opex": opex_m,
    "opexD": op.Total_Opex.round(2).tolist(),
}


def compact(o):
    if isinstance(o, float) and o.is_integer():
        return int(o)
    if isinstance(o, list):
        return [compact(x) for x in o]
    if isinstance(o, dict):
        return {k: compact(v) for k, v in o.items()}
    return o


js = json.dumps(compact(payload), ensure_ascii=False, separators=(",", ":"))
tpl = open(os.path.join(HERE, "dashboard_template.html"), encoding="utf-8").read()
os.makedirs(OUT, exist_ok=True)
path = os.path.join(OUT, "coffee_shop_dashboard.html")
open(path, "w", encoding="utf-8").write(tpl.replace("/*__DATA__*/null", js))
# reference totals for verification
print(json.dumps({"net": round(tx.Net_Sales.sum(), 2), "orders": tx.Transaction_ID.nunique(),
                  "gp": round(tx.Gross_Profit.sum(), 2), "bytes": os.path.getsize(path)}))
