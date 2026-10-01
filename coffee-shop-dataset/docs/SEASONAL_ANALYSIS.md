# Seasonal analysis - expected vs observed effects

How to read the columns:

* **Model_Component_Multiplier** - the designed multiplier of that component on total expected orders (average of `E_<component>` in the ground truth).
* **Expected_Orders_Lift** - the estimator below applied to the *noise-free* expected orders.
* **Observed_*_Lift** - the *same* estimator applied to the actual transactions (retail orders, net sales, AOV, gross profit).

Estimators: day of week = ratio to centred 7-day moving average (clean weeks); month = monthly avg daily value / that year's average, averaged over 3 years; salary = ratio to centred 29-day moving average; events, holidays and promotions = ratio to the median of the same weekday within +-5 weeks on normal days.

Lift > 1 = above baseline. Expected and Observed agree closely, i.e. the patterns are detectable above the noise; differences on 3-day rows (e.g. a holiday seen once per year) are sampling noise.

## Day of week

| Level | Days | Model_Component_Multiplier | Expected_Orders_Lift | Observed_Orders_Lift | Observed_Net_Sales_Lift | Observed_AOV_Lift | Observed_Gross_Profit_Lift | Note |
|---|---|---|---|---|---|---|---|---|
| Sunday | 66 | 0.966 | 0.967 | 0.957 | 0.881 | 0.922 |  | Ratio to centred 7-day moving average; Ramadan/holiday/promo weeks excluded |
| Monday | 69 | 0.938 | 0.943 | 0.947 | 0.859 | 0.905 |  | Ratio to centred 7-day moving average; Ramadan/holiday/promo weeks excluded |
| Tuesday | 70 | 0.963 | 0.968 | 0.966 | 0.889 | 0.919 |  | Ratio to centred 7-day moving average; Ramadan/holiday/promo weeks excluded |
| Wednesday | 73 | 1.003 | 1.004 | 0.990 | 0.928 | 0.936 |  | Ratio to centred 7-day moving average; Ramadan/holiday/promo weeks excluded |
| Thursday | 69 | 1.218 | 1.227 | 1.226 | 1.216 | 0.991 |  | Ratio to centred 7-day moving average; Ramadan/holiday/promo weeks excluded |
| Friday | 67 | 0.991 | 0.987 | 1.006 | 1.177 | 1.171 |  | Ratio to centred 7-day moving average; Ramadan/holiday/promo weeks excluded |
| Saturday | 67 | 0.917 | 0.910 | 0.920 | 1.060 | 1.152 |  | Ratio to centred 7-day moving average; Ramadan/holiday/promo weeks excluded |

## Month

| Level | Days | Model_Component_Multiplier | Expected_Orders_Lift | Observed_Orders_Lift | Observed_Net_Sales_Lift | Observed_AOV_Lift | Observed_Gross_Profit_Lift | Note |
|---|---|---|---|---|---|---|---|---|
| January | 93 | 1.009 | 1.031 | 1.021 | 0.967 | 0.945 |  | Winter peak, Riyadh Season, comfortable outdoor seating. Component = month behaviour x climate |
| February | 85 | 1.032 | 1.083 | 1.081 | 1.040 | 0.958 |  | Winter; Founding Day; exams/term break. Component = month behaviour x climate |
| March | 93 | 1.045 | 1.066 | 1.069 | 1.207 | 1.125 |  | Spring; Ramadan in 2024-2025 (fewer, larger orders). Component = month behaviour x climate |
| April | 90 | 1.009 | 0.996 | 0.998 | 1.089 | 1.088 |  | Ramadan/Eid Al-Fitr 2023-2024; warming. Component = month behaviour x climate |
| May | 93 | 0.958 | 0.971 | 0.970 | 0.958 | 0.987 |  | Heat rising; exam season approaches. Component = month behaviour x climate |
| June | 90 | 0.922 | 0.834 | 0.834 | 0.864 | 1.040 |  | Exams end, summer travel begins; Eid Al-Adha. Component = month behaviour x climate |
| July | 93 | 0.842 | 0.765 | 0.778 | 0.778 | 0.994 |  | Peak heat & travel abroad; students away. Component = month behaviour x climate |
| August | 93 | 0.892 | 0.813 | 0.813 | 0.805 | 0.994 |  | Summer trough; back-to-school end of month. Component = month behaviour x climate |
| September | 90 | 0.969 | 1.033 | 1.032 | 1.024 | 0.989 |  | Schools back; National Day. Component = month behaviour x climate |
| October | 93 | 1.029 | 1.110 | 1.103 | 1.079 | 0.977 |  | Autumn recovery; Riyadh Season starts; Pumpkin Spice. Component = month behaviour x climate |
| November | 90 | 1.061 | 1.170 | 1.163 | 1.108 | 0.952 |  | Cooler; White Friday promotion. Component = month behaviour x climate |
| December | 93 | 1.038 | 1.137 | 1.146 | 1.088 | 0.950 |  | Winter peak; Riyadh Season events; Pistachio Latte. Component = month behaviour x climate |

## Ramadan

| Level | Days | Model_Component_Multiplier | Expected_Orders_Lift | Observed_Orders_Lift | Observed_Net_Sales_Lift | Observed_AOV_Lift | Observed_Gross_Profit_Lift | Note |
|---|---|---|---|---|---|---|---|---|
| All Ramadan days | 85 | 0.972 | 1.019 | 1.020 | 1.264 | 1.242 | 1.261 | Demand shifts to night; fewer but larger orders |
| Nights 1-3 | 8 | 0.875 | 0.933 | 0.964 | 1.178 | 1.230 | 1.185 |  |
| Nights 4-19 | 46 | 0.980 | 1.045 | 1.041 | 1.269 | 1.218 | 1.269 |  |
| Last 10 nights (excl. Eid eve) | 27 | 0.958 | 0.969 | 0.968 | 1.248 | 1.291 | 1.236 |  |
| Eid Al-Fitr eve (last night) | 3 | 1.248 | 1.212 | 1.195 | 1.513 | 1.269 | 1.508 |  |
| Ramadan 2023 | 29 | 0.990 | 1.028 | 1.024 | 1.245 | 1.222 | 1.244 |  |
| Ramadan 2024 | 30 | 0.955 | 1.054 | 1.030 | 1.318 | 1.273 | 1.314 |  |
| Ramadan 2025 | 26 | 0.974 | 0.969 | 1.004 | 1.221 | 1.230 | 1.218 |  |
| Ramadan eve (night before) | 3 | 1.079 | 1.142 | 1.183 | 1.242 | 1.066 | 1.249 |  |

## Holidays & Eid

| Level | Days | Model_Component_Multiplier | Expected_Orders_Lift | Observed_Orders_Lift | Observed_Net_Sales_Lift | Observed_AOV_Lift | Observed_Gross_Profit_Lift | Note |
|---|---|---|---|---|---|---|---|---|
| Eid Al-Fitr day 1 | 3 | 0.939 | 0.903 | 0.833 | 1.126 | 1.334 | 1.118 |  |
| Eid Al-Fitr day 2 | 3 | 1.180 | 1.034 | 0.980 | 1.253 | 1.312 | 1.224 |  |
| Eid Al-Fitr day 3 | 3 | 1.149 | 1.104 | 1.127 | 1.434 | 1.313 | 1.413 |  |
| Eid Al-Fitr day 4 | 3 | 1.018 | 0.959 | 1.003 | 1.355 | 1.360 | 1.337 |  |
| Post-Eid Al-Fitr (days 5-7) | 9 | 0.858 | 0.815 | 0.806 | 0.846 | 1.052 | 0.854 |  |
| Day of Arafah | 3 | 0.772 | 0.640 | 0.731 | 0.890 | 1.214 | 0.881 |  |
| Eid Al-Adha day 1 | 3 | 0.749 | 0.687 | 0.752 | 1.001 | 1.380 | 0.981 |  |
| Eid Al-Adha day 2 | 3 | 1.098 | 0.928 | 0.898 | 1.115 | 1.302 | 1.096 |  |
| Eid Al-Adha day 3 | 3 | 1.075 | 0.926 | 0.998 | 1.250 | 1.293 | 1.238 |  |
| Eid Al-Adha day 4 | 3 | 0.963 | 0.841 | 0.867 | 1.176 | 1.353 | 1.147 |  |
| Post-Eid Al-Adha (days 5-7) | 9 | 0.873 | 0.791 | 0.792 | 0.781 | 0.983 | 0.779 |  |
| Saudi National Day (Sep 23) | 3 | 1.152 | 1.131 | 1.029 | 0.966 | 0.940 | 0.885 | Includes National Day Offer promotion |
| National Day Eve | 3 | 1.049 | 1.051 | 1.002 | 0.949 | 0.932 | 0.882 |  |
| Saudi Founding Day (Feb 22) | 3 | 1.097 | 0.962 | 1.025 | 0.995 | 0.985 | 0.935 | Includes Founding Day Offer promotion |
| Bridge holiday | 3 | 1.008 | 0.875 | 0.946 | 0.990 | 1.029 | 0.927 |  |

## Salary cycle (payday = 27th)

| Level | Days | Model_Component_Multiplier | Expected_Orders_Lift | Observed_Orders_Lift | Observed_Net_Sales_Lift | Observed_AOV_Lift | Observed_Gross_Profit_Lift | Note |
|---|---|---|---|---|---|---|---|---|
| Payday to +2 days | 69 | 1.049 | 1.077 | 1.073 | 1.152 | 1.075 |  | Ratio to centred 29-day moving average; normal days only |
| +3 to +6 days | 93 | 1.012 | 1.001 | 0.995 | 0.980 | 0.983 |  | Ratio to centred 29-day moving average; normal days only |
| +7 to +13 days | 179 | 1.002 | 1.000 | 1.002 | 1.008 | 1.006 |  | Ratio to centred 29-day moving average; normal days only |
| +14 to +20 days | 175 | 0.991 | 0.994 | 0.995 | 1.002 | 1.008 |  | Ratio to centred 29-day moving average; normal days only |
| +21 days to next payday (squeeze) | 219 | 0.970 | 0.975 | 0.976 | 0.963 | 0.989 |  | Ratio to centred 29-day moving average; normal days only |

## Promotions

| Level | Days | Model_Component_Multiplier | Expected_Orders_Lift | Observed_Orders_Lift | Observed_Net_Sales_Lift | Observed_AOV_Lift | Observed_Gross_Profit_Lift | Note |
|---|---|---|---|---|---|---|---|---|
| White Friday | 18 | 1.208 | 1.216 | 1.229 | 1.058 | 0.865 | 0.952 | Avg discount on promoted lines 20% |
| Post-White Friday | 21 | 0.962 | 0.989 | 0.989 | 0.988 | 1.006 | 0.985 | Post-promotion pull-forward dip |
| Back to School 15% | 28 | 1.061 | 0.984 | 0.961 | 0.909 | 0.953 | 0.889 | Avg discount on promoted lines 15% |
| App Launch 25% Off | 21 | 1.042 | 1.016 | 1.036 | 1.037 | 1.013 | 1.016 | Avg discount on promoted lines 25% |
| National Day Offer | 12 | 1.065 | 1.046 | 1.032 | 0.953 | 0.921 | 0.876 | Avg discount on promoted lines 20% |
| Founding Day Offer | 9 | 1.026 | 0.949 | 0.993 | 0.934 | 0.940 | 0.879 | Avg discount on promoted lines 15% |
| Ramadan Nights Desserts 10% | 85 | 1.000 | 1.019 | 1.020 | 1.264 | 1.242 | 1.261 | Avg discount on promoted lines 10% |
| Monday Boost 15% (Monday weekly index vs normal Mondays) | 8 | 1.104 | 1.071 | 1.088 | 0.987 |  |  | Jan-Feb 2025 only; avg discount on promoted lines 15%. The promo also lifts the 7-day MA slightly, so this estimator understates the lift a little |
| Summer Iced Happy Hour (14:00-17:00 share of orders) |  |  |  | 1.272 |  |  |  | Hour-level promo: window share 15.7% in 2023 (no promo) vs 19.9% / 20.2% in 2024 / 2025; designed hourly boost x1.45 (students, leisure, delivery) |

## Unlabelled anomalies (ground truth only)

| Level | Days | Model_Component_Multiplier | Expected_Orders_Lift | Observed_Orders_Lift | Observed_Net_Sales_Lift | Observed_AOV_Lift | Observed_Gross_Profit_Lift | Note |
|---|---|---|---|---|---|---|---|---|
| Sandstorm | 6 | 0.773 | 0.745 | 0.739 | 0.738 | 1.003 | 0.744 | Not flagged in the transaction file - a robust model should treat these as outliers |
| Rain | 9 | 0.911 | 0.920 | 0.964 | 0.964 | 1.009 | 0.950 | Not flagged in the transaction file - a robust model should treat these as outliers |
| Nearby Riyadh Season event | 3 | 1.235 | 1.241 | 1.195 | 1.160 | 0.974 | 1.170 | Not flagged in the transaction file - a robust model should treat these as outliers |
| Espresso machine breakdown | 1 | 0.875 | 0.887 | 0.925 | 0.970 | 1.066 | 0.972 | Not flagged in the transaction file - a robust model should treat these as outliers |
| Power outage | 1 | 0.767 | 0.763 | 0.903 | 0.790 | 0.899 | 0.794 | Not flagged in the transaction file - a robust model should treat these as outliers |

## Hour of day - average orders per hour by day type

| Hour (clock time; 00-03 belong to previous business day) | Sun-Wed | Thursday | Friday | Saturday | Public holiday | Ramadan | Eid day 1 |
|---|---|---|---|---|---|---|---|
| 0 | 0.00 | 13.00 | 9.74 | 4.62 | 4.20 | 31.97 | 6.17 |
| 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 27.52 | 1.50 |
| 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 11.11 | 0.00 |
| 6 | 9.12 | 6.75 | 0.46 | 0.00 | 0.00 | 0.00 | 0.00 |
| 7 | 16.23 | 12.99 | 2.14 | 1.26 | 1.07 | 0.00 | 3.50 |
| 8 | 12.92 | 11.02 | 5.59 | 4.04 | 3.07 | 0.00 | 3.83 |
| 9 | 10.22 | 8.76 | 7.83 | 8.33 | 7.60 | 0.00 | 1.33 |
| 10 | 7.24 | 6.52 | 6.60 | 11.16 | 10.60 | 0.00 | 0.67 |
| 11 | 5.46 | 5.39 | 1.96 | 10.06 | 9.77 | 0.00 | 2.33 |
| 12 | 7.74 | 7.62 | 0.41 | 6.97 | 7.13 | 0.00 | 3.17 |
| 13 | 10.24 | 9.33 | 3.46 | 5.25 | 4.57 | 0.00 | 1.67 |
| 14 | 10.84 | 10.00 | 7.21 | 6.89 | 7.77 | 0.00 | 5.67 |
| 15 | 12.86 | 13.70 | 14.01 | 11.80 | 11.00 | 4.52 | 7.67 |
| 16 | 15.75 | 17.15 | 19.38 | 17.16 | 18.37 | 10.28 | 12.50 |
| 17 | 15.06 | 17.73 | 18.44 | 19.01 | 19.73 | 6.06 | 15.17 |
| 18 | 15.09 | 18.47 | 19.02 | 18.62 | 19.47 | 0.00 | 16.67 |
| 19 | 17.72 | 23.64 | 21.51 | 20.26 | 20.03 | 7.38 | 19.50 |
| 20 | 19.97 | 30.07 | 26.66 | 21.76 | 22.37 | 30.31 | 18.67 |
| 21 | 17.99 | 30.59 | 27.29 | 19.71 | 21.30 | 33.26 | 22.83 |
| 22 | 13.04 | 26.61 | 23.16 | 15.01 | 16.40 | 45.38 | 18.33 |
| 23 | 7.62 | 21.66 | 16.70 | 10.40 | 10.87 | 38.47 | 11.33 |

## Product seasonality - iced share of beverage units vs temperature

| Month | Beverage_Units | Iced_Units | Iced_Share_% | Avg_Temp_C |
|---|---|---|---|---|
| January | 34768 | 6920 | 19.9 | 15.3 |
| February | 34546 | 8139 | 23.6 | 17.7 |
| March | 41702 | 11811 | 28.3 | 21.3 |
| April | 36137 | 17307 | 47.9 | 27.7 |
| May | 34057 | 21142 | 62.1 | 32.8 |
| June | 29303 | 20005 | 68.3 | 35.4 |
| July | 27795 | 19415 | 69.9 | 36.9 |
| August | 28820 | 19846 | 68.9 | 36.4 |
| September | 35613 | 22950 | 64.4 | 33.3 |
| October | 37718 | 17648 | 46.8 | 27.0 |
| November | 39618 | 11880 | 30.0 | 21.1 |
| December | 38791 | 8633 | 22.3 | 16.9 |
