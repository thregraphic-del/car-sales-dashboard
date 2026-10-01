"""
Static business configuration for the Saudi premium coffee shop simulation.

Everything that a forecaster might want to validate against lives here:
product catalogue, price/cost changes, calendar of religious & national events,
academic calendar, promotions and the known one-off anomalies.
All monetary values are in SAR.
"""
import pandas as pd

SEED = 20230101
START = pd.Timestamp("2023-01-01")
END = pd.Timestamp("2025-12-31")
VAT = 0.15  # menu prices are VAT inclusive; the dataset stores VAT-exclusive prices

SEGMENTS = ["Commuter", "Student", "Leisure", "Family", "Delivery"]

# ---------------------------------------------------------------------------
# Products: id, name, category, menu price incl. VAT (SAR), unit cost ex VAT (SAR),
#           base popularity weight, kind (hot / iced / food / addon), tags
# ---------------------------------------------------------------------------
PRODUCTS = [
    ("P001", "Espresso", "Espresso Drinks", 13, 1.95, 3.0, "hot", {"esp"}),
    ("P002", "Cortado", "Espresso Drinks", 16, 2.60, 3.0, "hot", {"esp", "milk"}),
    ("P003", "Americano", "Espresso Drinks", 15, 2.10, 9.0, "hot", {"esp"}),
    ("P004", "Cappuccino", "Espresso Drinks", 18, 3.30, 7.0, "hot", {"esp", "milk"}),
    ("P005", "Latte", "Espresso Drinks", 19, 3.60, 9.0, "hot", {"esp", "milk"}),
    ("P006", "Flat White", "Espresso Drinks", 19, 3.40, 6.0, "hot", {"esp", "milk"}),
    ("P007", "Spanish Latte", "Espresso Drinks", 21, 4.90, 14.0, "hot", {"esp", "milk"}),
    ("P008", "Mocha", "Espresso Drinks", 22, 5.10, 4.0, "hot", {"esp", "milk"}),
    ("P009", "Caramel Macchiato", "Espresso Drinks", 22, 5.00, 4.0, "hot", {"esp", "milk"}),
    ("P010", "Iced Americano", "Iced Coffee", 16, 2.30, 7.0, "iced", {"esp"}),
    ("P011", "Iced Latte", "Iced Coffee", 20, 3.90, 8.0, "iced", {"esp", "milk"}),
    ("P012", "Iced Spanish Latte", "Iced Coffee", 22, 5.30, 13.0, "iced", {"esp", "milk"}),
    ("P013", "Iced Mocha", "Iced Coffee", 23, 5.40, 3.0, "iced", {"esp", "milk"}),
    ("P014", "Cold Brew", "Iced Coffee", 21, 3.10, 5.0, "iced", {"brew"}),
    ("P015", "V60 Pour Over", "Specialty Coffee", 26, 7.90, 3.0, "hot", {"brew"}),
    ("P016", "Saudi Qahwa (Dallah)", "Specialty Coffee", 28, 5.00, 2.0, "hot", set()),
    ("P017", "Matcha Latte", "Tea & Matcha", 23, 6.20, 4.0, "hot", {"milk"}),
    ("P018", "Iced Matcha Latte", "Tea & Matcha", 24, 6.40, 5.0, "iced", {"milk"}),
    ("P019", "Karak Tea", "Tea & Matcha", 11, 1.60, 4.0, "hot", {"milk"}),
    ("P020", "Black Tea", "Tea & Matcha", 9, 0.80, 2.0, "hot", set()),
    ("P021", "Hot Chocolate", "Other Beverages", 18, 4.20, 2.0, "hot", {"milk"}),
    ("P022", "Mint Lemonade", "Other Beverages", 17, 2.60, 3.0, "iced", set()),
    ("P023", "Mineral Water", "Other Beverages", 3, 0.90, 0.0, "addon", set()),
    ("P024", "Butter Croissant", "Bakery", 12, 4.60, 6.0, "food", {"bakery"}),
    ("P025", "Almond Croissant", "Bakery", 16, 6.30, 3.0, "food", {"bakery"}),
    ("P026", "Zaatar & Cheese Croissant", "Bakery", 14, 5.60, 3.0, "food", {"bakery"}),
    ("P027", "Chocolate Chip Cookie", "Bakery", 10, 3.10, 5.0, "food", {"bakery", "snack"}),
    ("P028", "Date Ma'amoul Cookie", "Bakery", 8, 2.70, 2.0, "food", {"bakery", "snack"}),
    ("P029", "San Sebastian Cheesecake", "Desserts", 29, 10.50, 4.0, "food", {"dessert"}),
    ("P030", "Chocolate Fudge Cake", "Desserts", 27, 9.80, 3.0, "food", {"dessert"}),
    ("P031", "Honey Cake", "Desserts", 25, 8.60, 2.0, "food", {"dessert"}),
    ("P032", "Turkey & Cheese Sandwich", "Sandwiches", 27, 12.50, 3.0, "food", {"meal"}),
    ("P033", "Halloumi Pesto Sandwich", "Sandwiches", 26, 11.80, 3.0, "food", {"meal"}),
    ("P034", "Chicken Caesar Wrap", "Sandwiches", 29, 13.40, 2.0, "food", {"meal"}),
    ("P035", "Pumpkin Spice Latte", "Seasonal", 24, 5.60, 7.0, "hot", {"esp", "milk", "seasonal"}),
    ("P036", "Pistachio Latte", "Seasonal", 25, 6.60, 7.0, "hot", {"esp", "milk", "seasonal"}),
    ("P037", "Iced Saffron Rose Latte", "Seasonal", 25, 6.90, 7.0, "iced", {"esp", "milk", "seasonal"}),
    ("P038", "National Day Green Latte", "Seasonal", 23, 5.50, 8.0, "iced", {"milk", "seasonal"}),
    ("P039", "Ramadan Qahwa & Dates Box", "Seasonal", 65, 21.00, 5.0, "food", {"seasonal", "box"}),
    ("P040", "Eid Ma'amoul Box", "Seasonal", 55, 22.00, 4.0, "food", {"seasonal", "box"}),
]

# Hot <-> iced counterpart used when a regular's favourite drink "switches" with temperature
COUNTERPART = {
    "Americano": "Iced Americano", "Latte": "Iced Latte", "Spanish Latte": "Iced Spanish Latte",
    "Mocha": "Iced Mocha", "Matcha Latte": "Iced Matcha Latte", "Flat White": "Iced Latte",
    "Cappuccino": "Iced Latte", "Caramel Macchiato": "Iced Latte", "V60 Pour Over": "Cold Brew",
}

# Segment-specific preference multipliers on product popularity
SEGMENT_PREF = {
    "Commuter": {"Americano": 1.6, "Espresso": 1.8, "Cortado": 1.5, "Flat White": 1.5, "Latte": 1.2,
                 "Iced Americano": 1.4, "Cold Brew": 1.3, "Spanish Latte": 0.8, "Mocha": 0.6,
                 "Hot Chocolate": 0.3, "Matcha Latte": 0.7, "Saudi Qahwa (Dallah)": 0.3, "Mint Lemonade": 0.5},
    "Student": {"Iced Spanish Latte": 1.5, "Iced Latte": 1.3, "Iced Matcha Latte": 1.7, "Matcha Latte": 1.3,
                "Mocha": 1.3, "Iced Mocha": 1.6, "Caramel Macchiato": 1.4, "Mint Lemonade": 1.4,
                "Espresso": 0.5, "Americano": 0.7, "V60 Pour Over": 0.6, "Saudi Qahwa (Dallah)": 0.3,
                "Karak Tea": 1.2},
    "Leisure": {"Spanish Latte": 1.3, "Iced Spanish Latte": 1.2, "V60 Pour Over": 1.6,
                "Saudi Qahwa (Dallah)": 1.4, "Cold Brew": 1.2, "Karak Tea": 1.1},
    "Family": {"Hot Chocolate": 2.5, "Mocha": 1.4, "Spanish Latte": 1.2, "Saudi Qahwa (Dallah)": 2.0,
               "Mint Lemonade": 1.6, "Karak Tea": 1.3, "Espresso": 0.5, "Cortado": 0.5, "V60 Pour Over": 0.5},
    "Delivery": {"Spanish Latte": 1.3, "Iced Spanish Latte": 1.4, "Saudi Qahwa (Dallah)": 1.2,
                 "Cold Brew": 1.2, "Espresso": 0.3, "Cortado": 0.4, "V60 Pour Over": 0.5},
}

# Menu price changes (VAT inclusive, absolute SAR increase) -- stable prices with occasional changes
PRICE_CHANGES = [
    ("2024-03-01", ["Cortado", "Cappuccino", "Latte", "Flat White", "Spanish Latte", "Mocha", "Caramel Macchiato",
                    "Iced Latte", "Iced Spanish Latte", "Iced Mocha"], 1.0, "Milk-based drinks +1 SAR"),
    ("2024-07-01", ["Cold Brew", "V60 Pour Over"], 2.0, "Brew bar +2 SAR"),
    ("2025-01-15", ["Turkey & Cheese Sandwich", "Halloumi Pesto Sandwich", "Chicken Caesar Wrap",
                    "San Sebastian Cheesecake"], 2.0, "Food & cheesecake +2 SAR"),
    ("2025-01-15", ["Butter Croissant", "Almond Croissant", "Zaatar & Cheese Croissant"], 1.0, "Croissants +1 SAR"),
    ("2025-09-01", ["Espresso", "Americano", "Iced Americano"], 1.0, "Black coffee +1 SAR"),
]

# Unit cost changes (multiplicative), applied to tagged groups
COST_CHANGES = [
    ("2024-01-01", "milk", 1.06, "Dairy supplier price increase"),
    ("2024-07-01", "esp", 1.05, "Green coffee bean contract renewal"),
    ("2025-01-15", "food", 1.07, "Bakery/kitchen supplier increase"),
    ("2025-05-01", "esp", 1.08, "Global arabica price surge pass-through"),
    ("2025-05-01", "brew", 1.08, "Global arabica price surge pass-through"),
]

# Seasonal product availability windows: (product name) -> list of (start, end)
# Ramadan/Eid windows are filled in by the calendar builder.
SEASONAL_WINDOWS = {
    "Pumpkin Spice Latte": [("2023-10-01", "2023-11-30"), ("2024-10-01", "2024-11-30"), ("2025-10-01", "2025-11-30")],
    "Pistachio Latte": [("2023-01-01", "2023-02-28"), ("2023-12-01", "2024-02-29"), ("2024-12-01", "2025-02-28"),
                        ("2025-12-01", "2025-12-31")],
    "Iced Saffron Rose Latte": [("2023-06-01", "2023-08-31"), ("2024-06-01", "2024-08-31"), ("2025-06-01", "2025-08-31")],
    "National Day Green Latte": [("2023-09-10", "2023-09-30"), ("2024-09-10", "2024-09-30"), ("2025-09-10", "2025-09-30")],
}

# ---------------------------------------------------------------------------
# Islamic calendar (Umm al-Qura, verified with hijri-converter)
# ---------------------------------------------------------------------------
RAMADAN = {2023: ("2023-03-23", 29), 2024: ("2024-03-11", 30), 2025: ("2025-03-01", 29)}
EID_FITR = {2023: "2023-04-21", 2024: "2024-04-10", 2025: "2025-03-30"}
ARAFAH = {2023: "2023-06-27", 2024: "2024-06-15", 2025: "2025-06-05"}

FOUNDING_DAY = ["2023-02-22", "2024-02-22", "2025-02-22"]
NATIONAL_DAY = ["2023-09-23", "2024-09-23", "2025-09-23"]
# Government "bridge" days off when the national holiday touches the weekend
BRIDGE_DAYS = {"2023-02-23": "Founding Day Holiday", "2023-09-24": "National Day Holiday",
               "2025-02-23": "Founding Day Holiday"}
BLACK_FRIDAY = ["2023-11-24", "2024-11-29", "2025-11-28"]

# ---------------------------------------------------------------------------
# Academic calendar (approximate Saudi MoE 3-term calendar 2022/23-2024/25, 2-term 2025/26)
# Default status is "In Session".
# ---------------------------------------------------------------------------
SCHOOL_PERIODS = [
    ("2023-02-19", "2023-03-02", "Exams"), ("2023-03-03", "2023-03-11", "Term Break"),
    ("2023-04-13", "2023-04-29", "Term Break"), ("2023-06-11", "2023-06-22", "Exams"),
    ("2023-06-23", "2023-08-19", "Summer Vacation"),
    ("2023-11-05", "2023-11-16", "Exams"), ("2023-11-17", "2023-11-25", "Term Break"),
    ("2024-02-11", "2024-02-22", "Exams"), ("2024-02-23", "2024-03-02", "Term Break"),
    ("2024-04-04", "2024-04-20", "Term Break"), ("2024-06-02", "2024-06-13", "Exams"),
    ("2024-06-14", "2024-08-17", "Summer Vacation"),
    ("2024-11-03", "2024-11-14", "Exams"), ("2024-11-15", "2024-11-23", "Term Break"),
    ("2025-01-10", "2025-01-18", "Term Break"),
    ("2025-02-09", "2025-02-20", "Exams"), ("2025-02-21", "2025-03-01", "Term Break"),
    ("2025-03-20", "2025-04-05", "Term Break"), ("2025-05-30", "2025-06-14", "Term Break"),
    ("2025-06-15", "2025-06-26", "Exams"), ("2025-06-27", "2025-08-23", "Summer Vacation"),
    ("2025-11-21", "2025-11-29", "Term Break"),
]

# ---------------------------------------------------------------------------
# Promotions. rate = line discount rate; scope = which lines are discounted.
# uplift = multiplicative demand effect per segment on active days.
# ---------------------------------------------------------------------------
def _rng(a, b):
    return list(pd.date_range(a, b, freq="D"))


PROMOTIONS = [
    dict(name="App Launch 25% Off", days=_rng("2023-09-10", "2023-09-30"), rate=0.25, scope="all",
         channels={"Mobile App"}, uplift={"Commuter": 1.03, "Student": 1.05, "Leisure": 1.04, "Family": 1.02},
         acquisition=1.8, budget=900),
    *[dict(name="Founding Day Offer", days=_rng(pd.Timestamp(d) - pd.Timedelta(days=1), pd.Timestamp(d) + pd.Timedelta(days=1)),
           rate=0.15, scope="beverages", uplift={"Leisure": 1.05, "Student": 1.04}, acquisition=1.3, budget=500)
      for d in FOUNDING_DAY],
    *[dict(name="National Day Offer", days=_rng(pd.Timestamp(d) - pd.Timedelta(days=2), pd.Timestamp(d) + pd.Timedelta(days=1)),
           rate=0.20, scope="beverages", uplift={"Leisure": 1.08, "Family": 1.06, "Student": 1.08, "Delivery": 1.05},
           acquisition=1.6, budget=800)
      for d in NATIONAL_DAY],
    *[dict(name="White Friday", days=_rng(pd.Timestamp(d) - pd.Timedelta(days=2), pd.Timestamp(d) + pd.Timedelta(days=3)),
           rate=0.20, scope="all", uplift={"Commuter": 1.08, "Student": 1.18, "Leisure": 1.25, "Family": 1.18, "Delivery": 1.35},
           acquisition=2.5, budget=1200, basket=1.15,
           post_days=7, post_dip={"Student": 0.96, "Leisure": 0.95, "Family": 0.96, "Delivery": 0.93})
      for d in BLACK_FRIDAY],
    dict(name="Summer Iced Happy Hour", days=_rng("2024-07-01", "2024-08-31") + _rng("2025-06-22", "2025-08-31"),
         rate=0.25, scope="iced", hours=(14.0, 17.0), weekdays={"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"},
         hour_boost={"Commuter": 1.2, "Student": 1.45, "Leisure": 1.45, "Family": 1.2, "Delivery": 1.45},
         acquisition=1.2, budget=250),
    dict(name="Monday Boost 15%", days=[d for d in _rng("2025-01-05", "2025-02-24") if d.day_name() == "Monday"],
         rate=0.15, scope="beverages", uplift={"Commuter": 1.05, "Student": 1.15, "Leisure": 1.14, "Family": 1.10, "Delivery": 1.12},
         acquisition=1.2, budget=300),
    dict(name="Back to School 15%", days=_rng("2024-08-18", "2024-08-31") + _rng("2025-08-24", "2025-09-06"),
         rate=0.15, scope="all", segments={"Student"}, uplift={"Student": 1.18}, acquisition=1.5, budget=300),
    # Ramadan Nights is added by the calendar builder (dates depend on Hijri calendar)
]
RAMADAN_PROMO = dict(name="Ramadan Nights Desserts 10%", rate=0.10, scope="desserts", uplift={}, acquisition=1.0, budget=250)

# ---------------------------------------------------------------------------
# Structural changes and anomalies (NOT labelled in the transaction file; they
# are recorded only in the ground-truth file so you can test model robustness)
# ---------------------------------------------------------------------------
OFFICE_TOWER_OPEN = "2023-10-01"      # commuters +15 % ramp (tau 30 days), permanent
APP_LAUNCH = "2023-09-10"             # mobile app channel launch
VIRAL_POST = "2024-02-08"             # influencer video: +60 % decaying (tau 3.5 d), +2 % permanent
COMPETITOR_OPEN = "2024-04-28"        # competitor opens: -10 % decaying (tau 55 d), -2.5 % permanent
ROAD_WORKS = ("2025-08-03", "2025-09-04")   # access road works: drive-thru & commuters hit
MACHINE_BREAKDOWN = ("2023-07-11", 9.5, 15.0)   # espresso machine down 09:30-15:00
POS_OUTAGE = ("2024-10-15", 13.0, 16.5)         # POS offline: manual entry, Time/Payment missing
POWER_OUTAGE = ("2025-05-20", 18.67, 21.5)      # closed 18:40-21:30
SANDSTORMS = ["2023-05-16", "2023-06-05", "2024-04-16", "2024-05-02", "2025-04-21", "2025-05-12"]
RAIN_DAYS = ["2023-01-24", "2023-11-20", "2023-11-27", "2024-01-08", "2024-04-30", "2024-12-15",
             "2025-01-06", "2025-11-17", "2025-12-22"]
CONCERT_NIGHTS = ["2023-12-14", "2024-12-12", "2025-12-11"]   # nearby Riyadh Season event
# Designed month-level surprises (on top of random month shocks)
MONTH_SURPRISES = {(2023, 10): 1.04, (2024, 6): 0.95, (2024, 12): 1.05, (2025, 2): 1.03, (2025, 8): 0.96}
