# How the data was generated (mathematical logic)

This document describes **exactly** how every number in the dataset was produced, so you can check
whether a forecasting model is recovering real structure or fitting noise. The code that implements
it is `generator/generate_dataset.py` (model) and `generator/config.py` (calendar, products,
promotions, anomalies). Seed `20230101` reproduces the data bit-for-bit.

---

## 1. Design principle: top-down demand, bottom-up transactions

Real coffee-shop sales are not "random rows". They come from groups of people with different
routines (commuters, students, friends meeting at night, families on the weekend, people ordering
delivery). Each group reacts differently to the weekday, the season, Ramadan, school holidays and
payday. The generator therefore works in two stages:

1. **Daily demand (top-down).** For every day `d` and every demand segment `s`, an expected order
   count `λ[d,s]` is the product of interpretable components. The realised count is a noisy
   draw around it.
2. **Transactions (bottom-up).** Each order gets a time, channel, customer, basket, prices,
   discounts and payment from rules that depend on the segment, the hour, the temperature, the
   customer's history and the promotion calendar. Every money field is then *derived*, never drawn.

Because the weekend, Ramadan or summer effect on the **total** comes from changing segment *mix*,
these effects are not fixed percentages. For example, Friday has roughly the same number of orders
as an average day, but 17% more revenue, because commuters disappear and families with large
baskets arrive.

---

## 2. Daily demand model

### 2.1 The equation

For segment `s ∈ {Commuter, Student, Leisure, Family, Delivery}`:

```
λ[d,s] = base_s · Trend(d) · Regime(d) · MonthShock(d) · MonthBehaviour(d)
         · DOW_s(d) · Climate_s(d) · School_s(d) · Salary_s(d) · Ramadan_s(d)
         · Holiday_s(d) · Promo_s(d) · Structural_s(d) · Anomaly_s(d)

N[d,s] ~ Poisson( λ[d,s] · exp(ε_d − σ_d²/2) · exp(ε_ds − σ_s²/2) )
ε_d ~ N(0, 0.055²)  (shared by all segments: "busy/quiet day")
ε_ds ~ N(0, 0.045²) (segment-specific)

Orders(d) = Σ_s N[d,s]  +  corporate bulk orders (outliers, §7)
```

`base_s` uses the mix (60, 32, 72, 22, 30), scaled so that 2023 averages **215 orders/day**.
The lognormal terms are mean-corrected (`−σ²/2`), so `E[N] = λ`. Poisson on top of a lognormal mean
gives over-dispersed counts, as real retail data has. Total daily noise is ~9% on the log scale
(see `reports/signal_to_noise.csv`).

### 2.2 Components

| Component | Formula / values | What it represents |
|---|---|---|
| **Trend** | `exp(0.068·t − 0.002·t²)`, t in years since 2023-01-01 | Decelerating organic growth (~6.6% → ~6.2% per year). Price increases, the app, the office tower and the competitor add or remove growth on top, giving realised net-sales growth of **+10.9% (2024)** and **+7.2% (2025)**. |
| **Regime** | `x_t = 0.97·x_{t−1} + N(0, 0.008²)`, factor `exp(x_t)` | Slow random drift lasting several weeks (stationary SD ≈ 3.3%). It produces strong and weak periods that no calendar explains. |
| **MonthShock** | `exp(N(0, 0.022²))` per calendar month × designed surprises: Oct-23 ×1.04, Jun-24 ×0.95, Dec-24 ×1.05, Feb-25 ×1.03, Aug-25 ×0.96 | Some months beat or miss expectations. `reports/monthly_summary.csv` flags them (`Orders_vs_Structural_Expectation_%`). |
| **MonthBehaviour** | Month mid-points Jan 1.03, Feb 1.02, Mar 1.00, Apr 0.99, May 0.98, Jun 0.97, Jul 0.96, Aug 0.97, Sep 1.00, Oct 1.01, Nov 1.02, Dec 1.04, cosine-interpolated by day of year | Pure calendar habits beyond weather (Riyadh Season, winter outings). The curve is smooth, so there is no step change on the 1st of each month. |
| **DOW_s** | Table below. On a public holiday or Eid day that falls on a weekday, the Saturday value is used. In Ramadan, `DOW^0.4` (flattened). | Saudi week: Sun–Thu work and school, Fri–Sat weekend. |
| **Climate_s** | `T` = Riyadh climatology + AR(1) anomaly `a_t = 0.8a_{t−1} + N(0,1.2²)`; `comfort = exp(−((T−22)/9)²)`; `travel = exp(−((doy−205)/24)²)`. Commuter `1−0.12·travel`; Leisure `(0.84+0.28·comfort)(1−0.14·travel)`; Family `(0.90+0.20·comfort)(1−0.20·travel)`; Delivery `1+0.014(T−26)` | Nice weather brings people out. Summer heat and travel abroad (peaking around 24 July) empty the city. Heat pushes people to delivery. |
| **School_s** | Summer: Student 0.20, Commuter 0.88, Family 0.90. Term break: Student 0.45, Family 1.12, Leisure 1.04, Commuter 0.93. Exams: Student 1.10 (+ a 22:50 study bump), Family 0.95 | Approximate Saudi Ministry of Education calendar (`config.SCHOOL_PERIODS`). |
| **Salary_s** | `sal(k) = 1 + 0.09·e^{−k/2.5} − 0.045·clip((k−14)/12, 0, 1)`, k = days since payday; segment effect `1 + w_s(sal−1)` with w = Commuter 0.3, Student 0.5, others 1.0 | Payday on the 27th (moved to Thursday when the 27th is a Friday or Saturday). Spending jumps after payday, then tightens before the next one. Baskets also grow: drinks `×(1+1.5(sal−1))`. |
| **Ramadan_s** | Commuter 0.30, Student 0.45, Leisure 1.40, Family 1.25, Delivery 1.55, × intra-month curve `0.85 + 0.15·min(1,(k−1)/5)`, ×0.93 in the last 10 nights, ×1.27 on Eid eve | Closed while people fast. Night demand after Taraweeh, then Suhoor. It starts slowly, dips in the last ten nights (worship, Eid shopping) and has a rush on Eid eve. |
| **Holiday_s** | See §3 | Eid, Arafah, National Day, Founding Day, bridge days, Ramadan eve, National Day eve. |
| **Promo_s** | Day uplift per segment (`config.PROMOTIONS`) × hour-window boost ratio (§2.3); post-White-Friday dip | Promotions move traffic. White Friday also pulls demand forward from the next week. |
| **Structural_s** | §6 | Real business events that permanently or temporarily shift the level. |
| **Anomaly_s** | §6 | Weather and operational shocks. These are **not labelled** in the transaction file. |

**Day-of-week multipliers** (the base absorbs the normalisation):

| Segment | Sun | Mon | Tue | Wed | Thu | Fri | Sat |
|---|---|---|---|---|---|---|---|
| Commuter | 1.05 | 1.00 | 1.00 | 0.98 | 0.92 | 0.22 | 0.30 |
| Student | 1.00 | 1.00 | 1.00 | 0.95 | 0.80 | 0.35 | 0.55 |
| Leisure | 0.82 | 0.80 | 0.85 | 0.95 | **1.45** | 1.35 | 1.15 |
| Family | 0.60 | 0.55 | 0.60 | 0.70 | 1.20 | **1.90** | 1.60 |
| Delivery | 0.90 | 0.90 | 0.92 | 0.97 | 1.15 | 1.25 | 1.10 |

The resulting **total** day-of-week index, measured as the ratio to a centred 7-day moving average,
is about Sun 0.97, Mon 0.94, Tue 0.97, Wed 1.00, **Thu 1.23**, Fri 0.99, Sat 0.91 for orders. The
revenue index is different: Fri 1.18 and Sat 1.06, because weekend baskets are larger. It also moves
with the season, because the segment mix changes. That is why no two Mondays are alike.

### 2.3 Intraday (hourly) seasonality

Each segment has an intraday profile per day type (Sun–Wed, Thu, Fri, Sat/holiday, Ramadan, Eid
day 1). The profile is a sum of Gaussian bumps on a 10-minute grid running 0–28 h (hours above 24
belong to the same business day):

```
profile_s(h) = Σ_k a_k · exp(−½((h − μ_k)/σ_k)²) · Open(h)
μ_k ← μ_k + N(0, 0.15²) h,  a_k ← a_k · exp(N(0, 0.08²))   (re-drawn every day)
```

Examples of the bumps:

- Commuters peak at 07:25 (σ 0.8 h).
- Students peak at 14:35.
- Leisure peaks at 20:35, or 21:20 with a midnight shoulder on Thursdays.
- Families peak at 20:20, plus late morning on weekends.
- Ramadan bumps sit at 16:35 (pre-iftar takeaway), 20:25, 22:35 and 01:10 (suhoor).

Opening hours:

| Day | Hours |
|---|---|
| Sun–Wed | 06:00–24:00 |
| Thu | 06:00–01:00 |
| Fri | 06:00–11:30 and 12:50–01:00 (closed for Jumu'ah) |
| Sat and holidays | 07:00–01:00 |
| Ramadan | 15:00–18:00 and 19:30–03:00 |

Order times are sampled from these profiles. **Hour-specific events** change the profile, and the
day's volume changes by the same ratio:

```
λ[d,s] ← λ[d,s] · Σ_h profile_mod(h) / Σ_h profile(h)
```

This is how the Summer Iced Happy Hour (×1.45 between 14:00 and 17:00), the machine breakdown
(×0.35 between 09:30 and 15:00) and the power outage (×0 between 18:40 and 21:30) work.

---

## 3. Saudi events

Islamic dates use the Umm al-Qura calendar (checked with `hijri-converter`):

| | 2023 | 2024 | 2025 |
|---|---|---|---|
| Ramadan | 23 Mar – 20 Apr (29 d) | 11 Mar – 9 Apr (30 d) | 1 – 29 Mar (29 d) |
| Eid Al-Fitr (1 Shawwal) | 21 Apr | 10 Apr | 30 Mar |
| Day of Arafah / Eid Al-Adha | 27 / 28 Jun | 15 / 16 Jun | 5 / 6 Jun |
| Founding Day | Wed 22 Feb (+ Thu 23 bridge) | Thu 22 Feb | Sat 22 Feb (+ Sun 23 bridge) |
| National Day | Sat 23 Sep (+ Sun 24 bridge) | Mon 23 Sep | Tue 23 Sep |
| White Friday (Black Friday) | 22–27 Nov | 27 Nov – 2 Dec | 26 Nov – 1 Dec |

Ramadan moves about 11 days earlier each year. A model that treats it as a fixed month effect
(March or April) will misfit. A model given a Ramadan regressor will not.

**Holiday multipliers.** These apply on top of the weekend-like day-of-week baseline:

| Day | Commuter | Student | Leisure | Family | Delivery |
|---|---|---|---|---|---|
| Eid Al-Fitr d1 | 0.20 | 0.20 | 1.05 | 1.20 | 0.85 |
| Eid Al-Fitr d2 | 0.50 | 0.50 | 1.30 | 1.45 | 1.10 |
| Eid Al-Fitr d3 | 0.60 | 0.50 | 1.25 | 1.30 | 1.10 |
| Eid Al-Fitr d4 | 0.70 | 0.55 | 1.10 | 1.10 | 1.00 |
| Post-Eid Al-Fitr d5–7 | 0.75 | 0.60 | 0.90 | 0.95 | 0.95 |
| Day of Arafah | 0.90 | 0.80 | 0.75 | 0.60 | 0.90 |
| Eid Al-Adha d1 | 0.20 | 0.20 | 0.80 | 0.90 | 0.80 |
| Eid Al-Adha d2 / d3 / d4 | 0.5 / 0.6 / 0.7 | 0.5 / 0.5 / 0.55 | 1.20 / 1.15 / 1.00 | 1.35 / 1.25 / 1.05 | 1.05 / 1.05 / 1.00 |
| Post-Eid Al-Adha d5–7 | 0.80 | 0.90 | 0.90 | 0.90 | 0.90 |
| National Day | 1.00 | 0.60 | 1.30 | 1.25 | 1.10 |
| Founding Day | 1.00 | 0.60 | 1.20 | 1.15 | 1.05 |
| Bridge day | 1.00 | 0.70 | 1.05 | 1.05 | 1.00 |
| National Day eve | – | – | 1.12 | 1.08 | – |
| Ramadan eve | – | – | 1.15 | 1.10 | 1.05 |

Eid day 1 also has its own intraday profile: a small post-prayer bump around 08:00, a very quiet
midday, and a strong evening.

**Measured holiday effects against the same weekday.** A weekday holiday *removes* commuters and
students, so its net effect against the same weekday can be below 1 even though leisure and family
demand go up. Founding Day and the bridge days show this. Measured against a typical same-weekday
baseline, Eid Al-Adha days are below 1: the city empties as people travel for the holiday.
Revenue still rises, because baskets are larger (AOV about +33%).

---

## 4. From orders to line items

For each order of segment `s` at hour `h` (bucketed: <10, 10–12, 12–15, 15–18, 18–22, 22+):

1. **Channel**
   - Delivery segment: always `Delivery App`.
   - Mobile app share (after the 2023-09-10 launch): `0.03 + 0.15(1 − e^{−days/240})`, ×1.3 for commuters and ×1.2 for students.
   - Drive-thru share: Commuter 0.45, Student 0.15, Leisure 0.20, Family 0.25. It is ×1.35 in Ramadan, ×1.15 when T > 33 °C and ×0.45 during the road works.
   - Everything else is `In-Store`.
2. **Customer**
   - Probability the customer is identified (loyalty member): In-Store `0.50 → 0.66` and Drive-Thru `0.40 → 0.55`, both rising linearly over the 3 years (+0.10 for commuters). App and delivery customers are always identified. During the POS outage nobody can be identified.
   - New members per day: `Binomial(M, p_new,s · acquisition(d))` with p_new = 0.025, 0.05, 0.07, 0.08, 0.06. Acquisition rises with promotions (White Friday ×2.5) and the viral video (×4 decaying).
   - All other identified orders come from the segment's **active pool**. Customers are sampled without replacement, weighted by a personal visit rate `w ~ Gamma(shape 0.7–1.0, 1)`. This heavy tail creates regulars: about 2% of members place 100+ orders, and the top 10% of members place about 55% of member orders.
   - Lifetime: 35% of new members never return. The rest stay active for `Exp(mean 220–420 days)`, by segment. Members who joined before 2023 appear as `Returning` the first time they show up in 2023.
3. **Basket**
   - Drinks: `0` with probability 4% (7% before 10:00); otherwise `1 + Poisson(μ_d)`.
     - μ_d = Commuter 0.06, Student 0.30, Leisure 0.55, Family 1.50, Delivery 0.85.
     - Multiplied by: weekend ×1.15, Ramadan ×1.2, payday `×(1+1.5(sal−1))`, Thursday after 20:00 ×1.2, White Friday ×1.15, and the customer's own basket factor `~Gamma(10, 0.1)`.
   - Food: `Poisson(μ_f)`.
     - μ_f = 0.18, 0.25, 0.27, 0.75, 0.48 by segment.
     - Multiplied by an hour factor (1.3 early … 0.6 at night), Ramadan ×1.25, weekend ×1.1, payday, and the customer's food affinity `~Gamma(2, 0.5)`.
   - Water add-on: probability 2%, +4% when T > 32 °C, +12% for families, +3% for delivery.
4. **Product choice.** Each draw has probability ∝
   ```
   popularity_j · segment_pref[s,j] · hour_factor[j,bucket] · temp_factor_j · availability[d,j]
   · novelty[d,j] · ramadan_mix_j · (price[d,j]/price[0,j])^−0.8
   ```
   - `temp_factor = (1−p_iced)/0.5` for hot drinks and `p_iced/0.5` for iced, where `p_iced = 0.20 + 0.66/(1+e^{−(T+shift_h−25)/4.5})`. The iced share therefore goes from about 20% in January to 70% in July.
   - Seasonal products only appear inside their availability windows, with a launch novelty of `1 + 0.5e^{−days/14}`.
   - An identified customer orders their **favourite** drink 55% of the time. When the weather calls for it, they switch to its hot/iced counterpart (Latte ↔ Iced Latte).
   - Repeated draws of the same product are merged, which is where `Quantity` > 1 comes from.
5. **Discounts** (per line). The best active promotion that applies to the line (by date, hour, channel, segment and scope) gives `Discount = round(Gross × rate, 2)`. Loyalty: after every 10 stamped drinks, the cheapest drink on the next order is free for one unit.
6. **Returns.** Each line is refunded with probability 0.2% (0.6% for delivery, ×4 on the breakdown day). A refund sets `Return_Amount = Gross − Discount`. The product was still made, so COGS remains.
7. **Payment**
   - Delivery orders are paid through the delivery app.
   - Identified customers use their own preferred method 80% of the time.
   - Otherwise the method follows a mix that shifts over time: Cash 12% → 5%, Apple Pay 22% → 34%, mada ≈ 47–50%, Credit 10–11%, STC Pay 4–5%. App orders cannot be paid in cash.

---

## 5. Accounting identities (exact)

All amounts are computed in **integer halalas** and then divided by 100, so the identities hold
exactly on every row:

```
Unit_Price          = round(menu_price_incl_VAT / 1.15, 2)
Gross_Sales         = Quantity × Unit_Price                    (= "Revenue")
Net_Sales           = Gross_Sales − Discount − Return_Amount
COGS                = Quantity × Unit_Cost
Gross_Profit        = Net_Sales − COGS
Payment_Fee         = round(Net_Sales × fee_rate(method), 2)
Delivery_Commission = round(Net_Sales × 22% (20% from 2025), 2)   [delivery only]

Orders(d)           = count distinct Transaction_ID
AOV(d)              = Σ Net_Sales / Orders
Items_per_Order(d)  = Σ Quantity / Orders
Net_Profit(d)       = Σ Gross_Profit − Σ Payment_Fee − Σ Delivery_Commission − Total_Opex(d)
```

> **Note on Gross Profit.** The brief wrote `Gross Profit = Revenue − COGS`. Here Gross Profit is
> computed on **net** revenue (after discounts and refunds). That is the accounting convention, and
> it is the only way promotions can show their true margin cost: White Friday raises orders by 22%
> but *lowers* gross profit by about 5%. The pre-discount figure is
> `Gross_Sales − COGS` if you need it.

Operating expenses (`data/daily_operating_expenses.csv`):

| Item | Amount |
|---|---|
| Staff | 62,000 / 67,500 / 72,000 SAR per month (2023/24/25) ÷ days in month; ×1.12 in Ramadan (night shifts); +350 SAR/day on White Friday and National Day |
| Rent | 420k / 420k / 455k SAR per year |
| Utilities | `210 + 11·max(0, T−22) + N(0, 15)` (air conditioning) |
| Marketing | `110 + Σ promotion budgets` |
| Other | `190 + N(0, 20)` + one-offs: machine repair 6,800 SAR, POS repair 1,200 SAR, spoilage 2,400 SAR |

Net margin is about 9–12% a year. July and August are loss-making: the summer trough meets
peak air-conditioning costs.

---

## 6. Structural breaks, anomalies, outliers (for robustness testing)

| Date | Event | Effect | Labelled in `Event`? |
|---|---|---|---|
| 2023-07-11 | Espresso machine breakdown 09:30–15:00 | Window ×0.35; espresso drinks unavailable; returns ×4; repair cost | No |
| 2023-09-10 | Mobile app launch | App channel appears; +3% for commuters/students/leisure (τ = 90 d); 25% app promo for 3 weeks | Promo only |
| 2023-10-01 | Office tower opens nearby | Commuters `×(1 + 0.15(1 − e^{−x/30}))`, permanent | No |
| 2024-02-08 | Viral influencer video | Student/leisure/family `×(1 + 0.6e^{−x/3.5}) + 2%` permanent; acquisition ×4 | No |
| 2024-04-28 | Competitor opens | Leisure/students `−10%·e^{−x/55} − 2.5%` permanent; others `−4%·e^{−x/55}` | No |
| 2024-10-15 | POS offline 13:00–16:30 | Orders keyed in later: `Time` and `Payment_Method` missing, customers recorded as Guest | No |
| 2025-05-20 | Power outage 18:40–21:30 | Window ×0 | No |
| 2025-08-03 → 09-04 | Road works on the access road | Commuters ×0.80, others ×0.93, drive-thru share ×0.45 | No |
| 6 days | Sandstorms (spring) | In-store segments ×0.55–0.8, delivery ×1.3 | No |
| 9 days | Rain (Nov–Apr) | In-store segments ×0.7–0.9, delivery ×1.6, temperature −3 °C | No |
| 3 nights | Nearby Riyadh Season event (December) | Leisure ×1.5, students ×1.2 | No |
| ~2/month | **Corporate bulk orders** (CORP-01..06) | 3–5 drinks × 5–20 units plus food, 10% discount, `Corporate Invoice`; AOV around 1,000 SAR | Promotion column |

Full list with daily dates: `data/ground_truth_daily_components.csv`
(`Unlabelled_Anomaly`, `Structural_Note`).

---

## 7. Missing values

| Field | Rate | Cause |
|---|---|---|
| `Customer_ID` | ~30% | Guest (non-member) orders. Structural, not an error. |
| `Payment_Method` | 0.36% | Random POS sync errors (0.35%) plus the POS-outage orders |
| `Order_Channel` | 0.24% | Random sync errors |
| `Time` | 0.07% | POS outage plus random sync errors |

Missing values are assigned per order, so all lines of an order agree. Financial fields are never
missing, so the identities always hold.

---

## 8. How to validate a forecasting model with this dataset

1. **Use the ground truth.** `ground_truth_daily_components.csv` has, for every day:
   - `Expected_Orders`: the noise-free mean.
   - `E_<component>`: the multiplicative effect of each component on total expected orders, computed as `Σ_s λ[d,s] / Σ_s (λ[d,s]/component[d,s])`.
   - The realised orders per segment.
2. **Know the noise floor.** Predicting `Expected_Orders` perfectly still gives a 2025 daily-orders
   MAPE of **~7%**. That is pure Poisson and lognormal noise. A model that reports much lower
   in-sample error is fitting noise.
3. **Benchmark** (`reports/forecast_benchmark.csv`, train 2023–24, test 2025, daily orders):

   | Model | MAPE |
   |---|---|
   | Naive / moving averages | ~19–23% |
   | Holt-Winters, weekly seasonality | ~19% (no Ramadan or annual knowledge) |
   | Seasonal naive, 52 weeks ago | ~13% |
   | Log-linear regression with calendar, event and weather features | ~10.5% |
   | Oracle | ~7% |

   A good SARIMA, Prophet or LightGBM model with holiday and Ramadan regressors should land around
   9–11%. Aggregating to weekly or monthly removes most of the noise: structure explains **99%** of
   the monthly log-variance.
4. **Compare recovered effects.** Check the effects your model recovers against
   `reports/seasonal_analysis.csv`. Its `Expected_*_Lift` columns apply the *same estimator* to the
   noise-free series that `Observed_*_Lift` applies to the data, so the two are directly comparable.
   `Model_Component_Multiplier` is the pure designed multiplier.
5. **Test robustness.**
   - The unlabelled anomalies should show up as outliers, not as seasonality.
   - The competitor (Apr-2024) and office-tower (Oct-2023) level shifts should be absorbed by trend
     or changepoints. Prophet's changepoint detection should find them.
   - Summer 2023 has no Iced Happy Hour, so it is a natural control for that hourly promotion.
