#!/usr/bin/env python3
"""
Generate a structured (not random) transactional dataset for a Saudi premium coffee shop.

Model in one line:
    orders[d, s] ~ Poisson( base_s * Trend(d) * Regime(d) * MonthShock(d) * MonthBehaviour(d)
                            * DOW_s(d) * Climate_s(d) * School_s(d) * Salary_s(d) * Ramadan_s(d)
                            * Holiday_s(d) * Promo_s(d) * Structural_s(d) * Anomaly_s(d) * Noise_s(d) )
for each demand segment s in {Commuter, Student, Leisure, Family, Delivery}.
Each order then receives a time from the segment's intraday profile, a channel, a customer
(from a persistent customer pool with heterogeneous visit frequencies), a basket built from
segment/hour/temperature dependent product choice probabilities, and discounts from the
promotion calendar. All money fields are derived from Quantity x Price in integer halalas so
they reconcile exactly.

See ../docs/METHODOLOGY.md for the full mathematical description.
"""
from __future__ import annotations

import math
import os
from collections import Counter

import numpy as np
import pandas as pd

import config as C

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data")
os.makedirs(OUT, exist_ok=True)

rng = np.random.default_rng(C.SEED)
SEG = C.SEGMENTS
NS = len(SEG)
days = pd.date_range(C.START, C.END, freq="D")
ND = len(days)
day_index = {d: i for i, d in enumerate(days)}
T_YEARS = np.arange(ND) / 365.25


def ts(x):
    return pd.Timestamp(x)


def idx(x):
    return day_index[ts(x)]


# =============================================================================
# 1. Calendar
# =============================================================================
cal = pd.DataFrame({"date": days})
cal["dow"] = cal.date.dt.day_name()
cal["doy"] = cal.date.dt.dayofyear
cal["year"] = cal.date.dt.year
cal["month"] = cal.date.dt.month
cal["is_weekend"] = cal.dow.isin(["Friday", "Saturday"])
cal["season"] = cal.month.map({12: "Winter", 1: "Winter", 2: "Winter", 3: "Spring", 4: "Spring", 5: "Spring",
                               6: "Summer", 7: "Summer", 8: "Summer", 9: "Autumn", 10: "Autumn", 11: "Autumn"})

ram_day = np.zeros(ND, int)
ram_len = np.zeros(ND, int)
for y, (s, L) in C.RAMADAN.items():
    i0 = idx(s)
    for k in range(L):
        ram_day[i0 + k] = k + 1
        ram_len[i0 + k] = L
fitr_day = np.zeros(ND, int)          # 1..7 days from 1 Shawwal
for y, s in C.EID_FITR.items():
    i0 = idx(s)
    for k in range(7):
        fitr_day[i0 + k] = k + 1
adha_rel = np.full(ND, -99)           # 0 = Arafah, 1 = Eid day 1, ... 7
for y, s in C.ARAFAH.items():
    i0 = idx(s)
    for k in range(8):
        adha_rel[i0 + k] = k
pre_ramadan = np.zeros(ND, bool)
for y, (s, L) in C.RAMADAN.items():
    pre_ramadan[idx(s) - 1] = True

holiday_name = [""] * ND
for d in C.FOUNDING_DAY:
    holiday_name[idx(d)] = "Saudi Founding Day"
for d in C.NATIONAL_DAY:
    holiday_name[idx(d)] = "Saudi National Day"
for d, n in C.BRIDGE_DAYS.items():
    holiday_name[idx(d)] = n
for i in range(ND):
    if 1 <= fitr_day[i] <= 4:
        holiday_name[i] = "Eid Al-Fitr"
    if 0 <= adha_rel[i] <= 4:
        holiday_name[i] = "Day of Arafah" if adha_rel[i] == 0 else "Eid Al-Adha"
cal["holiday"] = holiday_name
cal["is_holiday"] = cal.holiday != ""
national_eve = np.zeros(ND, bool)
for d in C.NATIONAL_DAY:
    national_eve[idx(d) - 1] = True

# Salary: government payday = 27th; if it falls on Fri/Sat it is paid on the preceding Thursday
paydays = []
for y in range(2022, 2026):
    for m in range(1, 13):
        p = pd.Timestamp(y, m, 27)
        if p.day_name() == "Friday":
            p -= pd.Timedelta(days=1)
        elif p.day_name() == "Saturday":
            p -= pd.Timedelta(days=2)
        paydays.append(p)
paydays = pd.DatetimeIndex(paydays)
days_since_pay = np.array([(d - paydays[paydays <= d].max()).days for d in days])
cal["days_since_payday"] = days_since_pay

school = np.array(["In Session"] * ND, dtype=object)
for a, b, st in C.SCHOOL_PERIODS:
    for d in pd.date_range(a, b):
        if d in day_index:
            school[day_index[d]] = st
cal["school"] = school

# Day type -> intraday profile & opening hours
daytype = []
for i, d in enumerate(days):
    if ram_day[i]:
        daytype.append("ramadan")
    elif fitr_day[i] == 1 or adha_rel[i] == 1:
        daytype.append("eid1")
    elif holiday_name[i]:
        daytype.append("holiday")
    else:
        daytype.append({"Thursday": "thu", "Friday": "fri", "Saturday": "sat"}.get(d.day_name(), "wkday"))
cal["daytype"] = daytype

# =============================================================================
# 2. Weather (Riyadh climatology + AR(1) daily anomaly)
# =============================================================================
T_MONTH = [14.5, 17.2, 21.6, 27.3, 32.8, 35.6, 36.8, 36.5, 33.2, 27.8, 20.9, 15.9]
MONTH_BEHAV = [1.03, 1.02, 1.00, 0.99, 0.98, 0.97, 0.96, 0.97, 1.00, 1.01, 1.02, 1.04]


def periodic_interp(values, doy):
    """Smooth periodic interpolation of 12 month-mid values to day-of-year (cosine weights)."""
    mids = np.array([15.5 + 30.44 * k for k in range(12)])
    out = np.zeros(len(doy))
    for j, x in enumerate(doy):
        pos = (x - mids[0]) / 30.44
        k0 = int(math.floor(pos)) % 12
        f = pos - math.floor(pos)
        w = (1 - math.cos(math.pi * f)) / 2
        out[j] = values[k0] * (1 - w) + values[(k0 + 1) % 12] * w
    return out


temp = periodic_interp(T_MONTH, cal.doy.values)
temp += cal.year.map({2023: 0.0, 2024: 0.4, 2025: 0.2}).values
anom = np.zeros(ND)
for i in range(1, ND):
    anom[i] = 0.8 * anom[i - 1] + rng.normal(0, 1.2)
temp = np.round(temp + anom, 1)
for d in C.RAIN_DAYS:
    temp[idx(d)] -= 3.0
cal["temp_c"] = temp
month_behav = periodic_interp(MONTH_BEHAV, cal.doy.values)

# =============================================================================
# 3. Deterministic demand components, shape (ND, NS)
# =============================================================================
comp = {}
ones = lambda: np.ones((ND, NS))  # noqa: E731
S = {s: j for j, s in enumerate(SEG)}

# --- Trend: decelerating organic growth (~6.6 % -> ~6.2 % YoY before structural events & price changes)
log_trend = 0.068 * T_YEARS - 0.012 * T_YEARS ** 2 / 6
comp["trend"] = np.repeat(np.exp(log_trend)[:, None], NS, 1)

# --- Regime: slow AR(1) on log scale -> strong/weak spells of several weeks
reg = np.zeros(ND)
for i in range(1, ND):
    reg[i] = 0.97 * reg[i - 1] + rng.normal(0, 0.008)
comp["regime"] = np.repeat(np.exp(reg)[:, None], NS, 1)

# --- Month shocks: random per calendar month + designed surprises
mshock = np.ones(ND)
for (y, m), g in cal.groupby(["year", "month"]).groups.items():
    v = math.exp(rng.normal(0, 0.022)) * C.MONTH_SURPRISES.get((y, m), 1.0)
    mshock[list(g)] = v
comp["month_shock"] = np.repeat(mshock[:, None], NS, 1)
comp["month_behaviour"] = np.repeat(month_behav[:, None], NS, 1)

# --- Day of week (Saudi week: Sun-Thu work, Fri-Sat weekend)
DOW = {
    "Commuter": dict(Sunday=1.05, Monday=1.00, Tuesday=1.00, Wednesday=0.98, Thursday=0.92, Friday=0.22, Saturday=0.30),
    "Student": dict(Sunday=1.00, Monday=1.00, Tuesday=1.00, Wednesday=0.95, Thursday=0.80, Friday=0.35, Saturday=0.55),
    "Leisure": dict(Sunday=0.82, Monday=0.80, Tuesday=0.85, Wednesday=0.95, Thursday=1.45, Friday=1.35, Saturday=1.15),
    "Family": dict(Sunday=0.60, Monday=0.55, Tuesday=0.60, Wednesday=0.70, Thursday=1.20, Friday=1.90, Saturday=1.60),
    "Delivery": dict(Sunday=0.90, Monday=0.90, Tuesday=0.92, Wednesday=0.97, Thursday=1.15, Friday=1.25, Saturday=1.10),
}
dowc = ones()
for i in range(ND):
    dname = cal.dow[i]
    weekend_like = cal.is_holiday[i] or fitr_day[i] in (1, 2, 3, 4) or adha_rel[i] in (0, 1, 2, 3, 4)
    for s in SEG:
        v = DOW[s][dname]
        if weekend_like and dname not in ("Friday", "Saturday"):
            v = DOW[s]["Saturday"]
        if ram_day[i]:
            v = v ** 0.4          # Ramadan flattens the weekly rhythm
        dowc[i, S[s]] = v
comp["day_of_week"] = dowc

# --- Climate: temperature comfort + summer travel
comfort = np.exp(-((temp - 22) / 9) ** 2)
travel = np.exp(-((cal.doy.values - 205) / 24) ** 2)
cl = ones()
cl[:, S["Commuter"]] = 1 - 0.12 * travel
cl[:, S["Leisure"]] = (0.84 + 0.28 * comfort) * (1 - 0.14 * travel)
cl[:, S["Family"]] = (0.90 + 0.20 * comfort) * (1 - 0.20 * travel)
cl[:, S["Delivery"]] = 1 + 0.014 * (temp - 26)
comp["climate"] = cl

# --- School / university calendar
SCHOOL_MULT = {
    "In Session": {},
    "Exams": {"Student": 1.10, "Family": 0.95},
    "Term Break": {"Student": 0.45, "Family": 1.12, "Leisure": 1.04, "Commuter": 0.93},
    "Summer Vacation": {"Student": 0.20, "Commuter": 0.88, "Family": 0.90},
}
sc = ones()
for i in range(ND):
    for s, v in SCHOOL_MULT[school[i]].items():
        sc[i, S[s]] = v
comp["school"] = sc

# --- Salary cycle: post-payday lift decaying, end-of-month squeeze
k = days_since_pay.astype(float)
sal = 1 + 0.09 * np.exp(-k / 2.5) - 0.045 * np.clip((k - 14) / 12, 0, 1)
salc = ones()
for s, sens in {"Commuter": 0.3, "Student": 0.5, "Leisure": 1.0, "Family": 1.0, "Delivery": 1.0}.items():
    salc[:, S[s]] = 1 + sens * (sal - 1)
comp["salary"] = salc

# --- Ramadan
RAM = {"Commuter": 0.30, "Student": 0.45, "Leisure": 1.40, "Family": 1.25, "Delivery": 1.55}
ramc = ones()
for i in range(ND):
    if ram_day[i]:
        kk, L = ram_day[i], ram_len[i]
        intra = 0.85 + 0.15 * min(1.0, (kk - 1) / 5)
        if kk > L - 10:
            intra *= 0.93            # last ten nights: worship, Eid shopping
        if kk == L:
            intra *= 1.27            # Eid eve rush
        for s in SEG:
            ramc[i, S[s]] = RAM[s] * intra
comp["ramadan"] = ramc

# --- Holidays & Eid (relative to the weekend-like day-of-week baseline)
FITR = {1: dict(Commuter=.2, Student=.2, Leisure=1.05, Family=1.2, Delivery=.85),
        2: dict(Commuter=.5, Student=.5, Leisure=1.3, Family=1.45, Delivery=1.1),
        3: dict(Commuter=.6, Student=.5, Leisure=1.25, Family=1.3, Delivery=1.1),
        4: dict(Commuter=.7, Student=.55, Leisure=1.1, Family=1.1, Delivery=1.0)}
POST_EID = dict(Commuter=.75, Student=.6, Leisure=.9, Family=.95, Delivery=.95)
ADHA = {0: dict(Commuter=.9, Student=.8, Leisure=.75, Family=.6, Delivery=.9),
        1: dict(Commuter=.2, Student=.2, Leisure=.8, Family=.9, Delivery=.8),
        2: dict(Commuter=.5, Student=.5, Leisure=1.2, Family=1.35, Delivery=1.05),
        3: dict(Commuter=.6, Student=.5, Leisure=1.15, Family=1.25, Delivery=1.05),
        4: dict(Commuter=.7, Student=.55, Leisure=1.0, Family=1.05, Delivery=1.0)}
POST_ADHA = dict(Commuter=.8, Student=.9, Leisure=.9, Family=.9, Delivery=.9)
NATIONAL = dict(Student=.6, Leisure=1.3, Family=1.25, Delivery=1.1)
FOUNDING = dict(Student=.6, Leisure=1.2, Family=1.15, Delivery=1.05)
BRIDGE = dict(Student=.7, Leisure=1.05, Family=1.05)
hol = ones()
for i in range(ND):
    m = {}
    if fitr_day[i] in FITR:
        m = FITR[fitr_day[i]]
    elif fitr_day[i] >= 5:
        m = POST_EID
    elif adha_rel[i] in ADHA:
        m = ADHA[adha_rel[i]]
    elif adha_rel[i] >= 5:
        m = POST_ADHA
    elif holiday_name[i] == "Saudi National Day":
        m = NATIONAL
    elif holiday_name[i] == "Saudi Founding Day":
        m = FOUNDING
    elif holiday_name[i]:
        m = BRIDGE
    elif national_eve[i]:
        m = dict(Leisure=1.12, Family=1.08)
    elif pre_ramadan[i]:
        m = dict(Leisure=1.15, Family=1.10, Delivery=1.05)
    for s, v in m.items():
        hol[i, S[s]] = v
comp["holiday"] = hol

# --- Promotions (day-level uplift; hour-level effects are added after profiles are built)
promos = list(C.PROMOTIONS)
ram_days_list = [days[i] for i in range(ND) if ram_day[i]]
promos.append(dict(C.RAMADAN_PROMO, days=ram_days_list))
promo_on = [[] for _ in range(ND)]
for p in promos:
    for d in p["days"]:
        if d in day_index:
            i = day_index[d]
            if "weekdays" in p and d.day_name() not in p["weekdays"]:
                continue
            if "weekdays" in p and (ram_day[i] or cal.is_holiday[i]):
                continue
            promo_on[i].append(p)
pr = ones()
acq = np.ones(ND)
post_label = [""] * ND
for i in range(ND):
    for p in promo_on[i]:
        for s, v in p.get("uplift", {}).items():
            pr[i, S[s]] *= v
        acq[i] *= p.get("acquisition", 1.0)
for p in promos:
    if "post_days" in p:
        last = day_index[max(p["days"])]
        for j in range(1, p["post_days"] + 1):
            if last + j < ND:
                for s, v in p["post_dip"].items():
                    pr[last + j, S[s]] *= v
                post_label[last + j] = "Post-" + p["name"]
comp["promotion"] = pr

# --- Structural changes (unlabelled in transactions)
st = ones()
dd = np.arange(ND)
x = dd - idx(C.OFFICE_TOWER_OPEN)
st[:, S["Commuter"]] *= np.where(x >= 0, 1 + 0.15 * (1 - np.exp(-np.maximum(x, 0) / 30)), 1)
x = dd - idx(C.APP_LAUNCH)
for s in ("Commuter", "Student", "Leisure"):
    st[:, S[s]] *= np.where(x >= 0, 1 + 0.03 * (1 - np.exp(-np.maximum(x, 0) / 90)), 1)
x = dd - idx(C.VIRAL_POST)
viral = np.where(x >= 0, 0.6 * np.exp(-np.maximum(x, 0) / 3.5), 0)
for s in ("Student", "Leisure", "Family"):
    st[:, S[s]] *= 1 + viral + np.where(x >= 0, 0.02, 0)
st[:, S["Delivery"]] *= 1 + 0.5 * viral
acq *= 1 + 3 * viral
x = dd - idx(C.COMPETITOR_OPEN)
comp_eff = np.where(x >= 0, np.exp(-np.maximum(x, 0) / 55), 0)
for s in ("Leisure", "Student"):
    st[:, S[s]] *= 1 - 0.10 * comp_eff - np.where(x >= 0, 0.025, 0)
for s in ("Commuter", "Family", "Delivery"):
    st[:, S[s]] *= 1 - 0.04 * comp_eff
road = np.zeros(ND, bool)
road[idx(C.ROAD_WORKS[0]): idx(C.ROAD_WORKS[1]) + 1] = True
st[road, S["Commuter"]] *= 0.80
for s in ("Student", "Leisure", "Family"):
    st[road, S[s]] *= 0.93
comp["structural"] = st

# --- Anomalies (weather, events)
an = ones()
anomaly_label = [""] * ND
for d in C.SANDSTORMS:
    i = idx(d)
    an[i] = [0.8, 0.65, 0.6, 0.55, 1.3]
    anomaly_label[i] = "Sandstorm"
for d in C.RAIN_DAYS:
    i = idx(d)
    an[i] = [0.9, 0.8, 0.75, 0.7, 1.6]
    anomaly_label[i] = "Rain"
for d in C.CONCERT_NIGHTS:
    i = idx(d)
    an[i, S["Leisure"]] *= 1.5
    an[i, S["Student"]] *= 1.2
    anomaly_label[i] = "Nearby Riyadh Season event"
comp["anomaly"] = an

# =============================================================================
# 4. Intraday profiles (10-minute bins, 0..28h; >24h = after midnight, same business day)
# =============================================================================
NB = 168
BIN_H = (np.arange(NB) + 0.5) / 6.0
PROFILES = {
    "Commuter": {"wkday": [(7.4, .8, 1), (9.3, 1, .45), (13.3, 1, .35), (16.6, 1.2, .3), (19.5, 1.5, .12)],
                 "thu": [(7.4, .8, 1), (9.3, 1, .45), (13.3, 1, .4), (16.3, 1.2, .38), (20.5, 1.8, .25)],
                 "fri": [(9.0, 1.2, .6), (16.5, 1.5, .6), (20.5, 1.8, .5)],
                 "sat": [(9.5, 1.3, .7), (16.5, 1.5, .6), (20.5, 1.8, .45)]},
    "Student": {"wkday": [(7.0, .6, .35), (10.5, 1.2, .35), (14.6, 1.4, 1), (18.0, 1.5, .6), (21.5, 1.5, .45)],
                "thu": [(7.0, .6, .3), (10.5, 1.2, .3), (14.0, 1.4, .9), (19.0, 1.8, .8), (22.5, 1.5, .7)],
                "fri": [(15.5, 1.5, .6), (20.0, 2, 1), (23.0, 1.5, .5)],
                "sat": [(12.0, 1.5, .5), (16.5, 1.5, .8), (21.0, 2, .9)]},
    "Leisure": {"wkday": [(10.0, 1.5, .2), (16.8, 1.3, .45), (20.6, 1.5, 1), (23.0, 1, .35)],
                "thu": [(10.0, 1.5, .15), (17.0, 1.3, .45), (21.3, 1.7, 1), (24.0, .9, .5)],
                "fri": [(9.5, 1.2, .25), (16.5, 1.3, .55), (21.0, 1.8, 1), (23.8, 1, .45)],
                "sat": [(10.8, 1.3, .45), (17.0, 1.5, .6), (20.8, 1.7, .9), (23.5, 1, .3)]},
    "Family": {"wkday": [(17.5, 1.3, .6), (20.3, 1.4, 1)],
               "thu": [(18.0, 1.5, .7), (21.0, 1.5, 1)],
               "fri": [(10.0, 1.2, .35), (17.0, 1.4, .8), (20.8, 1.6, 1)],
               "sat": [(11.0, 1.3, .55), (17.0, 1.4, .8), (20.5, 1.6, .9)]},
    "Delivery": {"wkday": [(9.0, 1, .25), (12.8, 1.2, .5), (15.5, 1.3, .55), (21.0, 1.8, 1)],
                 "thu": [(9.0, 1, .2), (12.8, 1.2, .45), (15.5, 1.3, .5), (21.8, 1.9, 1)],
                 "fri": [(10.0, 1.2, .3), (14.0, 1.3, .45), (17.0, 1.4, .6), (21.5, 1.9, 1)],
                 "sat": [(10.5, 1.2, .35), (13.5, 1.3, .5), (16.5, 1.4, .6), (21.0, 1.9, 1)]},
}
RAMADAN_PROFILE = [(16.6, .7, .25), (20.4, .55, .55), (22.6, 1.1, 1.0), (25.2, .9, .6)]
EID1_PROFILE = [(8.0, .8, .25), (12.8, 1.5, .12), (17.5, 1.8, .75), (21.6, 1.9, 1.0)]
OPEN = {"wkday": [(6, 24)], "thu": [(6, 25)], "fri": [(6, 11.5), (12.83, 25)], "sat": [(7, 25)],
        "holiday": [(7, 25)], "ramadan": [(15, 18), (19.5, 27)], "eid1": [(7, 25.5)]}
open_mask = {k: np.zeros(NB) for k in OPEN}
for k_, spans in OPEN.items():
    for a, b in spans:
        open_mask[k_][(BIN_H >= a) & (BIN_H < b)] = 1


def bumps(spec, jit):
    out = np.zeros(NB)
    for (mu, sd, a) in spec:
        mu2 = mu + jit.normal(0, 0.15)
        a2 = a * math.exp(jit.normal(0, 0.08))
        out += a2 * np.exp(-0.5 * ((BIN_H - mu2) / sd) ** 2)
    return out


profiles = np.zeros((ND, NS, NB))
hour_ratio_promo = np.ones((ND, NS))
hour_ratio_anom = np.ones((ND, NS))
hour_promo_window = [None] * ND
breakdown_i, bk_a, bk_b = idx(C.MACHINE_BREAKDOWN[0]), C.MACHINE_BREAKDOWN[1], C.MACHINE_BREAKDOWN[2]
power_i, pw_a, pw_b = idx(C.POWER_OUTAGE[0]), C.POWER_OUTAGE[1], C.POWER_OUTAGE[2]
for i in range(ND):
    dt = daytype[i]
    base_key = {"holiday": "sat", "eid1": None, "ramadan": None}.get(dt, dt)
    for s in SEG:
        if dt == "ramadan":
            spec = list(RAMADAN_PROFILE)
            if s == "Commuter":
                spec[0] = (16.6, .7, .5)
            if ram_day[i] == ram_len[i]:
                spec.append((24.5, 2.0, 1.0))
        elif dt == "eid1":
            spec = EID1_PROFILE
        else:
            spec = list(PROFILES[s][base_key])
            if s == "Student" and school[i] == "Exams" and dt in ("wkday", "thu"):
                spec.append((22.8, 1.2, .6))
        prof = bumps(spec, rng) * open_mask[dt]
        base_sum = prof.sum()
        mod = prof.copy()
        for p in promo_on[i]:
            if "hours" in p:
                a, b = p["hours"]
                w = (BIN_H >= a) & (BIN_H < b)
                mod[w] *= p["hour_boost"][s]
                hour_promo_window[i] = (a, b, p)
        hour_ratio_promo[i, S[s]] = mod.sum() / base_sum
        mod2 = mod.copy()
        if i == breakdown_i:
            mod2[(BIN_H >= bk_a) & (BIN_H < bk_b)] *= 0.35
        if i == power_i:
            mod2[(BIN_H >= pw_a) & (BIN_H < pw_b)] = 0
        hour_ratio_anom[i, S[s]] = mod2.sum() / mod.sum()
        profiles[i, S[s]] = mod2 / mod2.sum()
comp["promotion"] = comp["promotion"] * hour_ratio_promo
comp["anomaly"] = comp["anomaly"] * hour_ratio_anom
anomaly_label[breakdown_i] = "Espresso machine breakdown 09:30-15:00"
anomaly_label[power_i] = "Power outage 18:40-21:30"
anomaly_label[idx(C.POS_OUTAGE[0])] = "POS offline 13:00-16:30 (manual entry)"

# =============================================================================
# 5. Expected demand, calibration, noise, realised order counts
# =============================================================================
BASE_MIX = np.array([60, 32, 72, 22, 30], float)
ORDER = ["trend", "regime", "month_shock", "month_behaviour", "day_of_week", "climate", "school",
         "salary", "ramadan", "holiday", "promotion", "structural", "anomaly"]
mult = np.ones((ND, NS))
for c in ORDER:
    mult *= comp[c]
y23 = (cal.year == 2023).values
scale = 215.0 / (mult[y23] * BASE_MIX).sum(1).mean()
base = BASE_MIX * scale
lam = mult * base

sig_d, sig_s = 0.055, 0.045
eps_day = np.exp(rng.normal(0, sig_d, ND) - sig_d ** 2 / 2)
eps_seg = np.exp(rng.normal(0, sig_s, (ND, NS)) - sig_s ** 2 / 2)
noise = eps_day[:, None] * eps_seg
N = rng.poisson(lam * noise)

# =============================================================================
# 6. Products, prices, costs
# =============================================================================
prod = pd.DataFrame(C.PRODUCTS, columns=["Product_ID", "Product_Name", "Category", "Menu_Price_Incl_VAT",
                                         "Base_Unit_Cost", "Popularity", "Kind", "Tags"])
NP = len(prod)
pname = {n: j for j, n in enumerate(prod.Product_Name)}
menu = np.repeat(prod.Menu_Price_Incl_VAT.values[None, :].astype(float), ND, 0)
for d, names, inc, _ in C.PRICE_CHANGES:
    i0 = idx(d)
    for n in names:
        menu[i0:, pname[n]] += inc
price_c = np.round(menu / (1 + C.VAT) * 100).astype(np.int64)        # VAT-exclusive, halalas
cost = np.repeat(prod.Base_Unit_Cost.values[None, :].astype(float), ND, 0)
for d, tag, f, _ in C.COST_CHANGES:
    i0 = idx(d)
    for j in range(NP):
        tags = prod.Tags[j]
        if (tag == "food" and prod.Kind[j] == "food") or tag in tags:
            cost[i0:, j] *= f
cost_c = np.round(cost * 100).astype(np.int64)
elastic = (price_c / price_c[0][None, :]) ** -0.8

avail = np.ones((ND, NP), bool)
season_start = np.full((ND, NP), -1)
for n, wins in C.SEASONAL_WINDOWS.items():
    j = pname[n]
    avail[:, j] = False
    for a, b in wins:
        i0, i1 = idx(a), idx(b)
        avail[i0:i1 + 1, j] = True
        season_start[i0:i1 + 1, j] = i0
for n in ("Ramadan Qahwa & Dates Box", "Eid Ma'amoul Box"):
    avail[:, pname[n]] = False
for y, (s, L) in C.RAMADAN.items():
    i0 = idx(s)
    avail[i0:i0 + L + 4, pname["Ramadan Qahwa & Dates Box"]] = True
    season_start[i0:i0 + L + 4, pname["Ramadan Qahwa & Dates Box"]] = i0
    avail[i0 + L - 5:i0 + L + 4, pname["Eid Ma'amoul Box"]] = True
    season_start[i0 + L - 5:i0 + L + 4, pname["Eid Ma'amoul Box"]] = i0 + L - 5
for y, s in C.ARAFAH.items():
    i0 = idx(s)
    avail[i0 - 2:i0 + 5, pname["Eid Ma'amoul Box"]] = True
    season_start[i0 - 2:i0 + 5, pname["Eid Ma'amoul Box"]] = i0 - 2

KIND = prod.Kind.values
DRINKS = np.where(np.isin(KIND, ["hot", "iced"]))[0]
FOODS = np.where(KIND == "food")[0]
WATER = pname["Mineral Water"]
ESP = np.array(["esp" in t for t in prod.Tags])
NB_H = 6
HOUR_FAC = {n: [1] * 6 for n in prod.Product_Name}
for n in ("Espresso", "Americano", "Cortado", "Flat White"):
    HOUR_FAC[n] = [1.4, 1.2, 1, .9, .8, .7]
HOUR_FAC["Cappuccino"] = [1.3, 1.2, 1, .9, .8, .7]
for n in ("Spanish Latte", "Iced Spanish Latte"):
    HOUR_FAC[n] = [.8, .9, 1, 1.1, 1.2, 1.2]
for n in ("Karak Tea", "Black Tea"):
    HOUR_FAC[n] = [1.2, 1, .9, 1, 1.2, 1.4]
HOUR_FAC["Hot Chocolate"] = [.5, .7, .8, 1, 1.3, 1.5]
HOUR_FAC["Saudi Qahwa (Dallah)"] = [.6, .8, .8, 1, 1.5, 1.5]
for n in ("Iced Americano", "Cold Brew"):
    HOUR_FAC[n] = [.9, 1.1, 1.2, 1.2, 1, .8]
HOUR_FAC["Mint Lemonade"] = [.4, .9, 1.4, 1.4, 1.1, .9]
HOUR_FAC["V60 Pour Over"] = [1.1, 1.3, 1, 1, 1, .8]
for j in FOODS:
    tags = prod.Tags[j]
    if "bakery" in tags:
        HOUR_FAC[prod.Product_Name[j]] = [2.2, 1.5, .7, .8, .5, .4]
    if "snack" in tags:
        HOUR_FAC[prod.Product_Name[j]] = [1.2, 1.1, 1, 1.3, 1, 1]
    if "meal" in tags:
        HOUR_FAC[prod.Product_Name[j]] = [.6, 1.3, 2.5, 1, .8, .4]
    if "dessert" in tags:
        HOUR_FAC[prod.Product_Name[j]] = [.25, .6, .8, 1.3, 1.6, 1.4]
    if "box" in tags:
        HOUR_FAC[prod.Product_Name[j]] = [.2, .4, .6, 1.3, 1.4, 1.3]
HF = np.array([HOUR_FAC[n] for n in prod.Product_Name], float)  # (NP, 6)
SEGP = np.ones((NS, NP))
for s, d_ in C.SEGMENT_PREF.items():
    for n, v in d_.items():
        SEGP[S[s], pname[n]] = v
RAM_MIX = np.ones(NP)
for j in FOODS:
    if "dessert" in prod.Tags[j]:
        RAM_MIX[j] = 1.6
    if "bakery" in prod.Tags[j]:
        RAM_MIX[j] = 0.6
RAM_MIX[pname["Saudi Qahwa (Dallah)"]] = 2.2
RAM_MIX[pname["Karak Tea"]] = 1.4
POP = prod.Popularity.values.astype(float)
TEMP_SHIFT = [-3, -1, 3, 4, 0, -2]
CP = {pname[a]: pname[b] for a, b in C.COUNTERPART.items()}
CP.update({b: a for a, b in list(CP.items()) if b not in CP})


def bucket(h):
    return 0 if h < 10 else 1 if h < 12 else 2 if h < 15 else 3 if h < 18 else 4 if h < 22 else 5


def iced_share(T, b):
    te = T + TEMP_SHIFT[b]
    return 0.20 + 0.66 / (1 + math.exp(-(te - 25) / 4.5))


def promo_applies(p, h, seg, channel, j):
    if "hours" in p and not (p["hours"][0] <= h < p["hours"][1]):
        return False
    if "channels" in p and channel not in p["channels"]:
        return False
    if "segments" in p and seg not in p["segments"]:
        return False
    sc_ = p["scope"]
    if sc_ == "all":
        return True
    if sc_ == "beverages":
        return KIND[j] in ("hot", "iced")
    if sc_ == "iced":
        return KIND[j] == "iced"
    if sc_ == "desserts":
        return "dessert" in prod.Tags[j]
    return False


# =============================================================================
# 7. Customers
# =============================================================================
P_NEW = np.array([0.025, 0.05, 0.07, 0.08, 0.06])
LIFE = np.array([420, 280, 360, 400, 220])
ONE_TIME = 0.35
GAMMA_SHAPE = np.array([0.7, 0.9, 0.9, 1.0, 0.9])
ID_SHARE_EST = np.array([0.62, 0.55, 0.55, 0.50, 1.0])
PAY_METHODS = ["mada", "Apple Pay", "Credit Card", "Cash", "STC Pay"]


def pay_probs(t):
    f = t / 3.0
    p = np.array([0.50 - 0.03 * f, 0.22 + 0.12 * f, 0.11 - 0.01 * f, 0.12 - 0.07 * f, 0.05 - 0.01 * f])
    return p / p.sum()


class Pool:
    def __init__(self, s):
        self.s = s
        self.ids, self.w, self.start, self.end = [], [], [], []
        self.fav, self.food, self.bask, self.pay, self.stamps, self.norders = [], [], [], [], [], []

    def add(self, d, pre_existing=False):
        s = self.s
        cid = f"C{len(all_customers) + 1:06d}"
        all_customers.append((cid, SEG[s], days[d] if d >= 0 else pd.NaT))
        self.ids.append(cid)
        self.w.append(rng.gamma(GAMMA_SHAPE[s], 1.0))
        self.start.append(d)
        if pre_existing:
            self.end.append(int(rng.exponential(LIFE[s])))
        elif rng.random() < ONE_TIME:
            self.end.append(d)
        else:
            self.end.append(d + int(rng.exponential(LIFE[s])))
        wv = POP[DRINKS] * SEGP[s, DRINKS] * (prod.Category.values[DRINKS] != "Seasonal")
        self.fav.append(int(DRINKS[np.searchsorted(np.cumsum(wv / wv.sum()), rng.random())]))
        self.food.append(rng.gamma(2.0, 0.5))
        self.bask.append(rng.gamma(10, 0.1))
        self.pay.append(int(np.searchsorted(np.cumsum(pay_probs(max(d, 0) / 365.25)), rng.random())))
        self.stamps.append(int(rng.integers(0, 10)) if pre_existing else 0)
        self.norders.append(0)
        return len(self.ids) - 1


all_customers = []
pools = [Pool(s) for s in range(NS)]
for s in range(NS):
    id_orders = lam[:30, s].mean() * ID_SHARE_EST[s]
    n0 = int(P_NEW[s] * id_orders * (1 - ONE_TIME) * LIFE[s] * 0.9)
    for _ in range(n0):
        pools[s].add(-1, pre_existing=True)

# =============================================================================
# 8. Order simulation
# =============================================================================
MU_DRINK = np.array([0.06, 0.30, 0.55, 1.50, 0.85])
MU_FOOD = np.array([0.18, 0.25, 0.27, 0.75, 0.48])
FOOD_BUCKET = [1.3, 1.1, 1.2, .9, .8, .6]
DRIVE = np.array([0.45, 0.15, 0.20, 0.25, 0.0])
LAUNCH_I = idx(C.APP_LAUNCH)
POS_I, pos_a, pos_b = idx(C.POS_OUTAGE[0]), C.POS_OUTAGE[1], C.POS_OUTAGE[2]
RET_P = {"Delivery App": 0.006}
rows = []
order_seq = 0
cust_type_first = {}

for i in range(ND):
    d = days[i]
    t = T_YEARS[i]
    T = temp[i]
    dt = daytype[i]
    weekend_like = dt in ("fri", "sat", "holiday", "eid1")
    ram = ram_day[i] > 0
    sal_i = sal[i]
    wf_basket = max([p.get("basket", 1.0) for p in promo_on[i]] + [1.0])
    novelty = np.where(season_start[i] >= 0, 1 + 0.5 * np.exp(-(i - season_start[i]) / 14.0), 1.0)
    base_w = POP * elastic[i] * avail[i] * novelty * (RAM_MIX if ram else 1.0)
    # drink & food choice tables: [seg][bucket] -> cdf
    tables = {}
    for s in range(NS):
        for b in range(6):
            sh = iced_share(T, b)
            tf = np.where(KIND == "hot", (1 - sh) / 0.5, np.where(KIND == "iced", sh / 0.5, 1.0))
            w = base_w * SEGP[s] * HF[:, b] * tf
            wd = w[DRINKS].copy()
            hpw = hour_promo_window[i]
            tables[(s, b)] = [wd, w[FOODS].copy()]
    pay_p = pay_probs(t)
    app_share = 0.0 if i < LAUNCH_I else 0.03 + 0.15 * (1 - math.exp(-(i - LAUNCH_I) / 240))
    p_id_store = 0.50 + 0.16 * t / 3
    p_id_drive = 0.40 + 0.15 * t / 3

    for s in range(NS):
        n = int(N[i, s])
        if n == 0:
            continue
        cdf_bins = np.cumsum(profiles[i, s])
        bins_ = np.minimum(np.searchsorted(cdf_bins, rng.random(n) * cdf_bins[-1]), NB - 1)
        secs = bins_ * 600 + rng.integers(0, 600, n)
        hours = secs / 3600.0
        # channel
        if SEG[s] == "Delivery":
            chans = np.array(["Delivery App"] * n, dtype=object)
        else:
            a_sh = app_share * (1.3 if s == 0 else 1.2 if s == 1 else 1.0)
            dr = DRIVE[s] * (1.35 if ram else 1.0) * (1.15 if T > 33 else 1.0) * (0.45 if road[i] else 1.0)
            u = rng.random(n)
            chans = np.where(u < a_sh, "Mobile App", np.where(u < a_sh + dr, "Drive-Thru", "In-Store")).astype(object)
        # identification
        u = rng.random(n)
        bonus = 0.10 if s == 0 else 0.0
        pid = np.where(chans == "In-Store", p_id_store + bonus, np.where(chans == "Drive-Thru", p_id_drive + bonus, 1.0))
        outage = (i == POS_I) & (hours >= pos_a) & (hours < pos_b)
        identified = (u < pid) & ~outage
        # customers
        pool = pools[s]
        id_idx = np.where(identified)[0]
        M = len(id_idx)
        cust_of = np.full(n, -1)
        is_new = np.zeros(n, bool)
        if M:
            n_new = min(M, rng.binomial(M, min(0.9, P_NEW[s] * acq[i])))
            n_ret = M - n_new
            st_ = np.array(pool.start)
            en_ = np.array(pool.end)
            active = np.where((st_ < i) & (en_ >= i))[0]
            chosen = []
            if n_ret and len(active):
                wv = np.array(pool.w)[active]
                replace = n_ret > len(active) // 2
                chosen = list(rng.choice(active, size=n_ret, replace=replace, p=wv / wv.sum()))
            else:
                n_new = M
            for _ in range(M - len(chosen)):
                chosen.append(pool.add(i))
            chosen = np.array(chosen)
            perm = rng.permutation(M)
            cust_of[id_idx] = chosen[perm]
        mu_d = MU_DRINK[s] * (1.15 if weekend_like else 1) * (1.2 if ram else 1) * (1 + 1.5 * (sal_i - 1)) * wf_basket
        mu_f = MU_FOOD[s] * (1.25 if ram else 1) * (1 + (sal_i - 1)) * (1.1 if weekend_like else 1)
        for o in range(n):
            h = hours[o]
            b = bucket(h if h < 24 else 23.9)
            ci = cust_of[o]
            ch = chans[o]
            if ci >= 0:
                cid = pool.ids[ci]
                ctype = "New" if (pool.norders[ci] == 0 and pool.start[ci] == i) else "Returning"
                pool.norders[ci] += 1
                bm, fa = pool.bask[ci], pool.food[ci]
            else:
                cid, ctype, bm, fa = None, "Guest", 1.0, 1.0
            thu_night = 1.2 if (dt == "thu" and h >= 20) else 1.0
            food_only_p = 0.07 if b == 0 else 0.04
            nd_ = 0 if rng.random() < food_only_p else 1 + rng.poisson(mu_d * bm * thu_night)
            nf_ = rng.poisson(mu_f * FOOD_BUCKET[b] * fa)
            if nd_ == 0 and nf_ == 0:
                nf_ = 1
            wd, wf = tables[(s, b)]
            in_breakdown = (i == breakdown_i) and (bk_a <= h < bk_b)
            hpw = hour_promo_window[i]
            in_hh = hpw is not None and hpw[0] <= h < hpw[1]
            if in_breakdown or in_hh:
                wd = wd.copy()
                if in_breakdown:
                    wd[ESP[DRINKS]] = 0
                if in_hh:
                    wd[KIND[DRINKS] == "iced"] *= 1.4
            items = Counter()
            if nd_:
                cdf = np.cumsum(wd)
                picks = DRINKS[np.minimum(np.searchsorted(cdf, rng.random(nd_) * cdf[-1]), len(DRINKS) - 1)]
                for k_, j in enumerate(picks):
                    if ci >= 0 and k_ == 0 and rng.random() < 0.55:
                        fj = pool.fav[ci]
                        sh = iced_share(T, b)
                        if fj in CP and ((KIND[fj] == "hot") == (rng.random() < sh)):
                            fj = CP[fj]
                        if avail[i, fj] and not (in_breakdown and ESP[fj]):
                            j = fj
                    items[int(j)] += 1
            if nf_:
                cdf = np.cumsum(wf)
                picks = FOODS[np.minimum(np.searchsorted(cdf, rng.random(nf_) * cdf[-1]), len(FOODS) - 1)]
                for j in picks:
                    items[int(j)] += 1
            if rng.random() < 0.02 + (0.04 if T > 32 else 0) + (0.12 if s == 3 else 0.03 if s == 4 else 0):
                items[WATER] += 1 + (rng.random() < 0.3)
            # payment
            if ch == "Delivery App":
                pay = "Delivery App"
            else:
                if ci >= 0 and rng.random() < 0.8:
                    pay = PAY_METHODS[pool.pay[ci]]
                else:
                    pay = PAY_METHODS[int(np.searchsorted(np.cumsum(pay_p), rng.random()))]
                if ch == "Mobile App" and pay == "Cash":
                    pay = "Apple Pay"
            # loyalty
            free_line = None
            loyal = ci >= 0 and ch != "Delivery App"
            if loyal:
                drink_lines = [j for j in items if KIND[j] in ("hot", "iced")]
                if pool.stamps[ci] >= 10 and drink_lines:
                    free_line = min(drink_lines, key=lambda j: price_c[i, j])
                    pool.stamps[ci] -= 10
                pool.stamps[ci] += sum(q for j, q in items.items() if KIND[j] in ("hot", "iced")) - (1 if free_line is not None else 0)
            order_seq += 1
            for j, q in items.items():
                pc = int(price_c[i, j])
                gross = pc * q
                rate, pname_ = 0.0, "No Promotion"
                for p in promo_on[i]:
                    if promo_applies(p, h, SEG[s], ch, j) and p["rate"] > rate:
                        rate, pname_ = p["rate"], p["name"]
                if j == free_line:
                    disc = pc + int(round(pc * (q - 1) * rate))
                    pname_ = "Loyalty Free Drink"
                else:
                    disc = int(round(gross * rate))
                rp = RET_P.get(ch, 0.002) * (4 if i == breakdown_i else 1)
                ret = gross - disc if rng.random() < rp else 0
                rows.append((i, int(secs[o]), order_seq, s, cid, ctype, j, q, pc, disc, pname_, ret,
                             int(cost_c[i, j]), pay, ch, bool(outage[o])))

# --- Corporate bulk orders (outliers)
corp_ids = [f"CORP-{k:02d}" for k in range(1, 7)]
corp_seen = set()
corp_days = []
for y in (2023, 2024, 2025):
    cand = [i for i in range(ND) if days[i].year == y and cal.dow[i] in ("Sunday", "Monday", "Tuesday", "Wednesday")
            and not ram_day[i] and not cal.is_holiday[i] and school[i] != "Summer Vacation" and fitr_day[i] == 0]
    n_c = 18 + 4 * (y - 2023)
    corp_days += list(rng.choice(cand, n_c, replace=False))
    corp_days += [idx(f"{y}-09-22") if days[idx(f"{y}-09-22")].day_name() not in ("Friday", "Saturday") else idx(f"{y}-09-21"),
                  idx(f"{y}-02-20")]
corp_w = np.array([5, 4, 3, 2, 1.5, 1])
for i in sorted(corp_days):
    order_seq += 1
    cid = corp_ids[int(rng.choice(6, p=corp_w / corp_w.sum()))]
    ctype = "Returning" if cid in corp_seen else "New"
    corp_seen.add(cid)
    sec = int(8.5 * 3600 + rng.integers(0, 2 * 3600))
    cands = [j for j in DRINKS if avail[i, j] and prod.Category[j] != "Seasonal"]
    for j in rng.choice(cands, int(rng.integers(3, 6)), replace=False):
        q = int(rng.integers(5, 21))
        pc = int(price_c[i, j])
        rows.append((i, sec, order_seq, -1, cid, ctype, int(j), q, pc, int(round(pc * q * 0.10)), "Corporate Agreement 10%",
                     0, int(cost_c[i, j]), "Corporate Invoice", "In-Store", False))
    for j in rng.choice([j for j in FOODS if avail[i, j] and "box" not in prod.Tags[j]], int(rng.integers(1, 3)), replace=False):
        q = int(rng.integers(5, 16))
        pc = int(price_c[i, j])
        rows.append((i, sec, order_seq, -1, cid, ctype, int(j), q, pc, int(round(pc * q * 0.10)), "Corporate Agreement 10%",
                     0, int(cost_c[i, j]), "Corporate Invoice", "In-Store", False))

# =============================================================================
# 9. Assemble transaction table
# =============================================================================
df = pd.DataFrame(rows, columns=["di", "sec", "order", "seg", "Customer_ID", "Customer_Type", "pj", "Quantity",
                                 "price_c", "disc_c", "Promotion", "ret_c", "cost_c", "Payment_Method",
                                 "Order_Channel", "outage"])
df = df.sort_values(["di", "sec", "order", "pj"], kind="stable").reset_index(drop=True)
order_map = {o: k + 1 for k, o in enumerate(pd.unique(df.order))}
df["Transaction_ID"] = df.order.map(lambda o: f"TXN-{order_map[o]:07d}")
df["Line_No"] = df.groupby("order").cumcount() + 1

FEE = {"mada": 0.008, "Apple Pay": 0.009, "Credit Card": 0.022, "Cash": 0.0, "STC Pay": 0.015,
       "Delivery App": 0.0, "Corporate Invoice": 0.0}
gross_c = df.Quantity * df.price_c
net_c = gross_c - df.disc_c - df.ret_c
cogs_c = df.Quantity * df.cost_c
fee_c = np.round(net_c * df.Payment_Method.map(FEE)).astype(np.int64)
comm_rate = np.where(df.di >= idx("2025-01-01"), 0.20, 0.22)
comm_c = np.where(df.Order_Channel == "Delivery App", np.round(net_c * comm_rate), 0).astype(np.int64)

cd = cal.iloc[df.di.values].reset_index(drop=True)
event_of_day = []
for i in range(ND):
    ev = []
    if ram_day[i]:
        ev.append("Ramadan - Last 10 Nights" if ram_day[i] > ram_len[i] - 10 else "Ramadan")
        if ram_day[i] == ram_len[i]:
            ev.append("Eid Al-Fitr Eve")
    if pre_ramadan[i]:
        ev.append("Ramadan Eve")
    if holiday_name[i]:
        ev.append(holiday_name[i])
    elif fitr_day[i] >= 5:
        ev.append("Post-Eid Al-Fitr Holiday")
    elif adha_rel[i] >= 5:
        ev.append("Post-Eid Al-Adha Holiday")
    if national_eve[i]:
        ev.append("National Day Eve")
    for p in promo_on[i]:
        if p["name"] not in ev:
            ev.append(p["name"])
    if post_label[i]:
        ev.append(post_label[i])
    if days_since_pay[i] <= 4:
        ev.append("Salary Week")
    event_of_day.append(" | ".join(dict.fromkeys(ev)) if ev else "No Event")
cal["event"] = event_of_day

tx = pd.DataFrame({
    "Transaction_ID": df.Transaction_ID,
    "Line_No": df.Line_No,
    "Date": cd.date.dt.strftime("%Y-%m-%d"),
    "Time": pd.to_datetime(df.sec % 86400, unit="s").dt.strftime("%H:%M:%S"),
    "Day_Name": cd.dow,
    "Week_Number": cd.date.dt.isocalendar().week.astype(int).values,
    "Month": cd.month,
    "Month_Name": cd.date.dt.month_name(),
    "Quarter": cd.date.dt.quarter,
    "Year": cd.year,
    "Is_Weekend": cd.is_weekend.astype(int),
    "Is_Holiday": cd.is_holiday.astype(int),
    "Season": cd.season,
    "Event": [event_of_day[i] for i in df.di],
    "School_Period": cd.school,
    "Customer_ID": df.Customer_ID,
    "Customer_Type": df.Customer_Type,
    "Product_ID": prod.Product_ID.values[df.pj],
    "Product_Name": prod.Product_Name.values[df.pj],
    "Category": prod.Category.values[df.pj],
    "Quantity": df.Quantity,
    "Unit_Price": df.price_c / 100,
    "Gross_Sales": gross_c / 100,
    "Discount": df.disc_c / 100,
    "Promotion": df.Promotion,
    "Return_Amount": df.ret_c / 100,
    "Net_Sales": net_c / 100,
    "Unit_Cost": df.cost_c / 100,
    "COGS": cogs_c / 100,
    "Gross_Profit": (net_c - cogs_c) / 100,
    "Payment_Method": df.Payment_Method,
    "Order_Channel": df.Order_Channel,
    "Payment_Fee": fee_c / 100,
    "Delivery_Commission": comm_c / 100,
})

# --- Missing values (order-level so all lines of an order agree)
orders_u = df.order.unique()
miss_pay = set(rng.choice(orders_u, int(0.0035 * len(orders_u)), replace=False))
miss_chan = set(rng.choice(orders_u, int(0.0025 * len(orders_u)), replace=False))
miss_time = set(rng.choice(orders_u, int(0.0005 * len(orders_u)), replace=False))
outage_orders = set(df.order[df.outage])
tx.loc[df.order.isin(miss_pay | outage_orders).values, "Payment_Method"] = np.nan
tx.loc[df.order.isin(miss_chan).values, "Order_Channel"] = np.nan
tx.loc[df.order.isin(miss_time | outage_orders).values, "Time"] = np.nan

# =============================================================================
# 10. Operating expenses (for Net Profit) & ground truth
# =============================================================================
STAFF_MONTHLY = {2023: 62000, 2024: 67500, 2025: 72000}
RENT_YEAR = {2023: 420000, 2024: 420000, 2025: 455000}
ONE_OFF = {idx(C.MACHINE_BREAKDOWN[0]): (6800, "Espresso machine repair"),
           idx(C.POS_OUTAGE[0]): (1200, "POS repair"),
           idx(C.POWER_OUTAGE[0]): (2400, "Spoilage after power outage")}
opex = []
for i in range(ND):
    d = days[i]
    dim = d.days_in_month
    staff = STAFF_MONTHLY[d.year] / dim * (1.12 if ram_day[i] else 1.0)
    if any(p["name"] in ("White Friday", "National Day Offer") for p in promo_on[i]):
        staff += 350
    rent = RENT_YEAR[d.year] / (366 if d.is_leap_year else 365)
    util = 210 + 11 * max(0.0, temp[i] - 22) + rng.normal(0, 15)
    mkt = 110 + sum(p.get("budget", 0) for p in promo_on[i])
    other = 190 + rng.normal(0, 20) + ONE_OFF.get(i, (0, ""))[0]
    opex.append((d.strftime("%Y-%m-%d"), round(staff, 2), round(rent, 2), round(util, 2), round(mkt, 2), round(other, 2),
                 ONE_OFF.get(i, (0, ""))[1]))
opex = pd.DataFrame(opex, columns=["Date", "Staff_Cost", "Rent", "Utilities", "Marketing", "Other_Opex", "One_Off_Note"])
opex["Total_Opex"] = opex[["Staff_Cost", "Rent", "Utilities", "Marketing", "Other_Opex"]].sum(axis=1).round(2)

lam_tot = lam.sum(1)
gt = pd.DataFrame({"Date": days.strftime("%Y-%m-%d"), "Day_Type": daytype, "Temp_C": temp,
                   "School_Period": school, "Days_Since_Payday": days_since_pay,
                   "Ramadan_Day": ram_day, "Eid_Fitr_Day": fitr_day,
                   "Adha_Rel_Day": np.where(adha_rel >= 0, adha_rel, np.nan)})
for c in ORDER:
    # total-level multiplicative effect of component c on expected orders
    gt[f"E_{c}"] = np.round(lam_tot / (lam / comp[c]).sum(1), 5)
for s in SEG:
    gt[f"Lambda_{s}"] = np.round(lam[:, S[s]], 3)
gt["Expected_Orders"] = np.round(lam_tot, 3)
gt["Noise_Factor_Total"] = np.round((lam * noise).sum(1) / lam_tot, 5)
gt["Simulated_Retail_Orders"] = N.sum(1)
gt["Corporate_Orders"] = [sum(1 for c_ in corp_days if c_ == i) for i in range(ND)]
gt["Unlabelled_Anomaly"] = anomaly_label
gt["Structural_Note"] = ""
for d, note in [(C.OFFICE_TOWER_OPEN, "Office tower opens nearby (commuters +15% ramp)"),
                (C.APP_LAUNCH, "Mobile app launch"),
                (C.VIRAL_POST, "Viral influencer video (+60% decaying)"),
                (C.COMPETITOR_OPEN, "Competitor opens nearby (-10% decaying, -2.5% permanent)"),
                (C.ROAD_WORKS[0], "Road works start (drive-thru access reduced)"),
                (C.ROAD_WORKS[1], "Road works end")]:
    gt.loc[idx(d), "Structural_Note"] = note
for s in SEG:
    gt[f"Orders_{s}"] = N[:, S[s]]

# =============================================================================
# 11. Write outputs
# =============================================================================
tx.to_csv(os.path.join(OUT, "coffee_shop_transactions_full.csv.gz"), index=False, compression="gzip")
for y in (2023, 2024, 2025):
    tx[tx.Year == y].to_csv(os.path.join(OUT, f"coffee_shop_transactions_{y}.csv"), index=False)
gt.to_csv(os.path.join(OUT, "ground_truth_daily_components.csv"), index=False)
opex.to_csv(os.path.join(OUT, "daily_operating_expenses.csv"), index=False)
cal_out = cal[["date", "dow", "is_weekend", "is_holiday", "holiday", "season", "school", "event", "temp_c",
               "days_since_payday"]].copy()
cal_out.columns = ["Date", "Day_Name", "Is_Weekend", "Is_Holiday", "Holiday_Name", "Season", "School_Period", "Event",
                   "Avg_Temp_C", "Days_Since_Payday"]
cal_out["Date"] = cal_out.Date.dt.strftime("%Y-%m-%d")
cal_out.to_csv(os.path.join(OUT, "calendar_features.csv"), index=False)

pm = prod.drop(columns=["Tags", "Popularity"]).copy()
pm["Base_Unit_Price_ex_VAT"] = price_c[0] / 100
pm["Final_Unit_Price_ex_VAT"] = price_c[-1] / 100
pm["Base_Unit_Cost"] = cost_c[0] / 100
pm["Final_Unit_Cost"] = cost_c[-1] / 100
pm["Base_Margin_%"] = np.round((1 - cost_c[0] / price_c[0]) * 100, 1)
pm["Base_Popularity_Weight"] = POP
pm.to_csv(os.path.join(OUT, "product_master.csv"), index=False)
hist = []
for d, names, inc, why in C.PRICE_CHANGES:
    for n in names:
        hist.append((d, "Price", n, f"+{inc:.0f} SAR menu price (incl. VAT)", why))
for d, tag, f, why in C.COST_CHANGES:
    hist.append((d, "Cost", f"group:{tag}", f"x{f}", why))
pd.DataFrame(hist, columns=["Effective_Date", "Type", "Product_or_Group", "Change", "Reason"]).to_csv(
    os.path.join(OUT, "price_cost_change_log.csv"), index=False)
cust = pd.DataFrame(all_customers, columns=["Customer_ID", "Acquisition_Segment", "First_Seen_Date"])
cust["Pre_Existing_Member"] = cust.First_Seen_Date.isna()
cust["First_Seen_Date"] = cust.First_Seen_Date.dt.strftime("%Y-%m-%d")
cust.to_csv(os.path.join(OUT, "customer_master.csv"), index=False)
promo_rows = []
for p in promos:
    dd_ = sorted(p["days"])
    promo_rows.append((p["name"], dd_[0].strftime("%Y-%m-%d"), dd_[-1].strftime("%Y-%m-%d"), len(dd_), p["rate"], p["scope"],
                       p.get("hours", ""), ",".join(sorted(p.get("channels", []))), ",".join(sorted(p.get("segments", []))),
                       p.get("budget", 0)))
pd.DataFrame(promo_rows, columns=["Promotion", "First_Day", "Last_Day", "Days", "Discount_Rate", "Scope", "Hours",
                                  "Channels", "Segments", "Daily_Marketing_Budget"]).to_csv(
    os.path.join(OUT, "promotion_calendar.csv"), index=False)

print(f"rows={len(tx):,} orders={tx.Transaction_ID.nunique():,} customers={len(all_customers):,}")
print(tx.groupby("Year").Net_Sales.sum().round(0))
