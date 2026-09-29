/* =====================================================================
   بيانات تجريبية / Demo Data
   كل أرقام الطلبات والمبيعات والأرباح والتحصيل هنا وهمية ومولّدة آلياً
   بمولّد أرقام ثابت (seeded) حتى تبقى النتائج نفسها في كل مرة.
   المواصفات الفنية مرجعية لفئة شائعة في سوق الخليج وقد تختلف حسب الفئة والسنة.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- Seeded PRNG (mulberry32) ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = rng(20260929);
  const rand = (a, b) => a + R() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const chance = (p) => R() < p;
  function pickW(items, wf) {
    let total = 0; for (const it of items) total += wf(it);
    let r = R() * total;
    for (const it of items) { r -= wf(it); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  const pick = (arr) => arr[Math.floor(R() * arr.length)];

  /* ---------- Reference date & period ---------- */
  const TODAY = new Date(Date.UTC(2026, 8, 29)); // 29 Sep 2026
  const DAY = 86400000;
  const MONTHS = []; // 24 months: Oct 2024 .. Sep 2026
  for (let i = 0; i < 24; i++) {
    const d = new Date(Date.UTC(2024, 9 + i, 1));
    MONTHS.push({ key: d.toISOString().slice(0, 7), y: d.getUTCFullYear(), m: d.getUTCMonth() });
  }
  const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  /* ---------- Brands ---------- */
  const BRANDS = {
    Toyota: { ar: 'تويوتا', origin: 'اليابان' },
    Lexus: { ar: 'لكزس', origin: 'اليابان' },
    Nissan: { ar: 'نيسان', origin: 'اليابان' },
    Hyundai: { ar: 'هيونداي', origin: 'كوريا الجنوبية' },
    Kia: { ar: 'كيا', origin: 'كوريا الجنوبية' },
    Chevrolet: { ar: 'شيفروليه', origin: 'الولايات المتحدة' },
    GMC: { ar: 'جي إم سي', origin: 'الولايات المتحدة' },
    Ford: { ar: 'فورد', origin: 'الولايات المتحدة' },
    MG: { ar: 'إم جي', origin: 'الصين' },
    Geely: { ar: 'جيلي', origin: 'الصين' },
    Changan: { ar: 'شانجان', origin: 'الصين' },
    Jetour: { ar: 'جيتور', origin: 'الصين' },
    GAC: { ar: 'جي إيه سي', origin: 'الصين' },
    Haval: { ar: 'هافال', origin: 'الصين' },
    BYD: { ar: 'بي واي دي', origin: 'الصين' }
  };

  /* ---------- Vehicle catalog ----------
     body: Sedan | SUV | Pickup     cat: standard | luxury | hybrid | electric
     price: سعر البيع المرجعي (ر.س، تجريبي)   margin: هامش الربح الإجمالي المستهدف (%)
     demand: وزن الطلب النسبي (وهمي)            close: قابلية الإغلاق (وهمي)
     wiki: عناوين مقالات ويكيبيديا للصورة الرئيسية  q/token: بحث Wikimedia Commons للزوايا */
  const V = [
    { id: 'camry', brand: 'Toyota', model: 'Camry', ar: 'كامري', trim: 'SE Hybrid', grades: ['LE', 'SE', 'GLE'], year: 2026, body: 'Sedan', cat: 'hybrid', origin: 'اليابان', engine: '2.5 لتر 4 سلندر هجين', cc: 2487, hp: 225, tq: 221, trans: 'e-CVT أوتوماتيك', drive: 'FWD', fuel: 'هجين', seats: 5, price: 128500, margin: 8, demand: 10, close: 1.1, wiki: ['Toyota Camry (XV80)', 'Toyota Camry'], q: 'Toyota Camry XV80', token: 'camry' },
    { id: 'corolla', brand: 'Toyota', model: 'Corolla', ar: 'كورولا', trim: 'XLi', grades: ['XLi', 'GLi', 'Hybrid'], year: 2026, body: 'Sedan', cat: 'standard', origin: 'اليابان', engine: '1.6 لتر 4 سلندر', cc: 1598, hp: 121, tq: 154, trans: 'CVT أوتوماتيك', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 89900, margin: 6.5, demand: 9, close: 1.15, wiki: ['Toyota Corolla (E210)', 'Toyota Corolla'], q: 'Toyota Corolla E210 sedan', token: 'corolla' },
    { id: 'yaris', brand: 'Toyota', model: 'Yaris', ar: 'يارس', trim: 'Y', grades: ['Y', 'YX', 'Y Plus'], year: 2026, body: 'Sedan', cat: 'standard', origin: 'تايلاند', engine: '1.5 لتر 4 سلندر', cc: 1496, hp: 106, tq: 140, trans: 'CVT أوتوماتيك', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 67900, margin: 6, demand: 4, close: 1.15, wiki: ['Toyota Yaris Ativ', 'Toyota Vios'], q: 'Toyota Yaris Ativ', token: 'yaris' },
    { id: 'landcruiser', brand: 'Toyota', model: 'Land Cruiser', ar: 'لاندكروزر', trim: 'GXR Twin Turbo', grades: ['GX', 'GXR', 'VXR'], year: 2026, body: 'SUV', cat: 'standard', origin: 'اليابان', engine: '3.5 لتر V6 تيربو مزدوج', cc: 3445, hp: 409, tq: 650, trans: 'أوتوماتيك 10 سرعات', drive: '4WD', fuel: 'بنزين', seats: 7, price: 329000, margin: 11, demand: 7, close: 0.95, wiki: ['Toyota Land Cruiser (J300)', 'Toyota Land Cruiser'], q: 'Toyota Land Cruiser 300', token: 'cruiser' },
    { id: 'prado', brand: 'Toyota', model: 'Land Cruiser Prado', ar: 'برادو', trim: 'TXL', grades: ['TX', 'TXL', 'VX'], year: 2026, body: 'SUV', cat: 'standard', origin: 'اليابان', engine: '2.4 لتر 4 سلندر تيربو', cc: 2393, hp: 278, tq: 430, trans: 'أوتوماتيك 8 سرعات', drive: '4WD', fuel: 'بنزين', seats: 7, price: 235000, margin: 10, demand: 6, close: 0.95, wiki: ['Toyota Land Cruiser Prado', 'Toyota Land Cruiser (J250)'], q: 'Toyota Land Cruiser 250', token: 'cruiser' },
    { id: 'hilux', brand: 'Toyota', model: 'Hilux', ar: 'هايلكس', trim: 'GLX Double Cab 4x4', grades: ['Single Cab', 'GL', 'GLX'], year: 2026, body: 'Pickup', cat: 'standard', origin: 'تايلاند', engine: '2.7 لتر 4 سلندر', cc: 2694, hp: 164, tq: 245, trans: 'أوتوماتيك 6 سرعات', drive: '4WD', fuel: 'بنزين', seats: 5, price: 112000, margin: 7, demand: 8, close: 1.25, wiki: ['Toyota Hilux'], q: 'Toyota Hilux AN120 double cab', token: 'hilux' },
    { id: 'rav4', brand: 'Toyota', model: 'RAV4', ar: 'راف فور', trim: 'Hybrid AWD', grades: ['LE', 'XLE', 'Adventure'], year: 2026, body: 'SUV', cat: 'hybrid', origin: 'اليابان', engine: '2.5 لتر 4 سلندر هجين', cc: 2487, hp: 219, tq: 221, trans: 'e-CVT أوتوماتيك', drive: 'AWD', fuel: 'هجين', seats: 5, price: 146500, margin: 8.5, demand: 5, close: 1.0, wiki: ['Toyota RAV4 (XA50)', 'Toyota RAV4'], q: 'Toyota RAV4 XA50 hybrid', token: 'rav4' },
    { id: 'lexus-es', brand: 'Lexus', model: 'ES', ar: 'إي إس', trim: 'ES 350 Platinum', grades: ['ES 250', 'ES 350', 'ES 300h'], year: 2026, body: 'Sedan', cat: 'luxury', origin: 'اليابان', engine: '3.5 لتر V6', cc: 3456, hp: 302, tq: 362, trans: 'أوتوماتيك 8 سرعات', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 249000, margin: 12, demand: 3, close: 0.9, wiki: ['Lexus ES (XZ10)', 'Lexus ES'], q: 'Lexus ES XZ10', token: 'lexus es' },
    { id: 'lexus-rx', brand: 'Lexus', model: 'RX', ar: 'آر إكس', trim: 'RX 350 Premier', grades: ['RX 350', 'RX 350h', 'RX 500h'], year: 2026, body: 'SUV', cat: 'luxury', origin: 'اليابان', engine: '2.4 لتر 4 سلندر تيربو', cc: 2393, hp: 275, tq: 430, trans: 'أوتوماتيك 8 سرعات', drive: 'AWD', fuel: 'بنزين', seats: 5, price: 332000, margin: 13, demand: 3, close: 0.85, wiki: ['Lexus RX (AL30)', 'Lexus RX'], q: 'Lexus RX AL30', token: 'lexus rx' },
    { id: 'lexus-lx', brand: 'Lexus', model: 'LX', ar: 'إل إكس', trim: 'LX 600 VIP', grades: ['LX 600', 'LX 600 F Sport', 'LX 600 VIP'], year: 2026, body: 'SUV', cat: 'luxury', origin: 'اليابان', engine: '3.5 لتر V6 تيربو مزدوج', cc: 3445, hp: 409, tq: 650, trans: 'أوتوماتيك 10 سرعات', drive: '4WD', fuel: 'بنزين', seats: 7, price: 565000, margin: 14, demand: 1.6, close: 0.8, wiki: ['Lexus LX (J310)', 'Lexus LX'], q: 'Lexus LX 600', token: 'lexus lx' },
    { id: 'patrol', brand: 'Nissan', model: 'Patrol', ar: 'باترول', trim: 'LE Titanium', grades: ['XE', 'SE', 'LE'], year: 2026, body: 'SUV', cat: 'standard', origin: 'اليابان', engine: '3.5 لتر V6 تيربو مزدوج', cc: 3498, hp: 425, tq: 700, trans: 'أوتوماتيك 9 سرعات', drive: '4WD', fuel: 'بنزين', seats: 7, price: 358000, margin: 11, demand: 6, close: 0.9, wiki: ['Nissan Patrol (Y63)', 'Nissan Patrol'], q: 'Nissan Patrol Y63', token: 'patrol' },
    { id: 'xterra', brand: 'Nissan', model: 'X-Terra', ar: 'إكس تيرا', trim: 'SE 4x4', grades: ['S', 'SE', 'Platinum'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الصين', engine: '2.5 لتر 4 سلندر', cc: 2488, hp: 164, tq: 241, trans: 'أوتوماتيك 7 سرعات', drive: '4WD', fuel: 'بنزين', seats: 7, price: 124900, margin: 7.5, demand: 3, close: 0.95, wiki: ['Nissan Terra', 'Nissan Xterra'], q: 'Nissan Terra 2021', token: 'terra' },
    { id: 'elantra', brand: 'Hyundai', model: 'Elantra', ar: 'إلنترا', trim: 'Smart', grades: ['Comfort', 'Smart', 'Premium'], year: 2026, body: 'Sedan', cat: 'standard', origin: 'كوريا الجنوبية', engine: '2.0 لتر 4 سلندر', cc: 1999, hp: 156, tq: 179, trans: 'IVT أوتوماتيك', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 86500, margin: 6, demand: 6, close: 1.05, wiki: ['Hyundai Elantra (CN7)', 'Hyundai Elantra'], q: 'Hyundai Elantra CN7', token: 'elantra' },
    { id: 'accent', brand: 'Hyundai', model: 'Accent', ar: 'أكسنت', trim: 'Smart', grades: ['Comfort', 'Smart', 'Premium'], year: 2026, body: 'Sedan', cat: 'standard', origin: 'كوريا الجنوبية', engine: '1.5 لتر 4 سلندر', cc: 1497, hp: 115, tq: 144, trans: 'IVT أوتوماتيك', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 69900, margin: 6, demand: 4, close: 1.1, wiki: ['Hyundai Accent (BN7)', 'Hyundai Accent'], q: 'Hyundai Accent 2023 BN7', token: 'accent' },
    { id: 'sonata', brand: 'Hyundai', model: 'Sonata', ar: 'سوناتا', trim: 'Smart', grades: ['Comfort', 'Smart', 'Premium'], year: 2026, body: 'Sedan', cat: 'standard', origin: 'كوريا الجنوبية', engine: '2.5 لتر 4 سلندر', cc: 2497, hp: 191, tq: 246, trans: 'أوتوماتيك 8 سرعات', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 109500, margin: 7, demand: 3, close: 0.95, wiki: ['Hyundai Sonata (DN8)', 'Hyundai Sonata'], q: 'Hyundai Sonata DN8', token: 'sonata' },
    { id: 'tucson', brand: 'Hyundai', model: 'Tucson', ar: 'توسان', trim: 'Smart', grades: ['Comfort', 'Smart', 'Premium'], year: 2026, body: 'SUV', cat: 'standard', origin: 'كوريا الجنوبية', engine: '2.0 لتر 4 سلندر', cc: 1999, hp: 156, tq: 192, trans: 'أوتوماتيك 6 سرعات', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 104900, margin: 7.5, demand: 5, close: 1.0, wiki: ['Hyundai Tucson (NX4)', 'Hyundai Tucson'], q: 'Hyundai Tucson NX4', token: 'tucson' },
    { id: 'santafe', brand: 'Hyundai', model: 'Santa Fe', ar: 'سنتافي', trim: 'Calligraphy AWD', grades: ['Smart', 'Premium', 'Calligraphy'], year: 2026, body: 'SUV', cat: 'standard', origin: 'كوريا الجنوبية', engine: '2.5 لتر 4 سلندر تيربو', cc: 2497, hp: 277, tq: 422, trans: 'DCT أوتوماتيك 8 سرعات', drive: 'AWD', fuel: 'بنزين', seats: 7, price: 158000, margin: 8.5, demand: 3, close: 0.95, wiki: ['Hyundai Santa Fe (MX5)', 'Hyundai Santa Fe'], q: 'Hyundai Santa Fe MX5', token: 'santa' },
    { id: 'k5', brand: 'Kia', model: 'K5', ar: 'كي 5', trim: 'GT-Line', grades: ['LX', 'EX', 'GT-Line'], year: 2026, body: 'Sedan', cat: 'standard', origin: 'كوريا الجنوبية', engine: '2.5 لتر 4 سلندر', cc: 2497, hp: 191, tq: 246, trans: 'أوتوماتيك 8 سرعات', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 102000, margin: 7, demand: 4, close: 1.0, wiki: ['Kia K5', 'Kia Optima'], q: 'Kia K5 DL3', token: 'k5' },
    { id: 'sportage', brand: 'Kia', model: 'Sportage', ar: 'سبورتاج', trim: 'EX', grades: ['LX', 'EX', 'GT-Line'], year: 2026, body: 'SUV', cat: 'standard', origin: 'كوريا الجنوبية', engine: '2.0 لتر 4 سلندر', cc: 1999, hp: 156, tq: 192, trans: 'أوتوماتيك 6 سرعات', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 99500, margin: 7.5, demand: 4, close: 1.0, wiki: ['Kia Sportage (NQ5)', 'Kia Sportage'], q: 'Kia Sportage NQ5', token: 'sportage' },
    { id: 'sorento', brand: 'Kia', model: 'Sorento', ar: 'سورينتو', trim: 'EX AWD', grades: ['LX', 'EX', 'GT-Line'], year: 2026, body: 'SUV', cat: 'standard', origin: 'كوريا الجنوبية', engine: '3.5 لتر V6', cc: 3470, hp: 272, tq: 331, trans: 'أوتوماتيك 8 سرعات', drive: 'AWD', fuel: 'بنزين', seats: 7, price: 149000, margin: 8, demand: 3, close: 0.95, wiki: ['Kia Sorento (MQ4)', 'Kia Sorento'], q: 'Kia Sorento MQ4', token: 'sorento' },
    { id: 'telluride', brand: 'Kia', model: 'Telluride', ar: 'تيلورايد', trim: 'SX AWD', grades: ['LX', 'EX', 'SX'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الولايات المتحدة', engine: '3.8 لتر V6', cc: 3778, hp: 291, tq: 355, trans: 'أوتوماتيك 8 سرعات', drive: 'AWD', fuel: 'بنزين', seats: 8, price: 192000, margin: 9, demand: 2.5, close: 0.9, wiki: ['Kia Telluride'], q: 'Kia Telluride', token: 'telluride' },
    { id: 'tahoe', brand: 'Chevrolet', model: 'Tahoe', ar: 'تاهو', trim: 'LT 4WD', grades: ['LS', 'LT', 'Z71', 'High Country'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الولايات المتحدة', engine: '5.3 لتر V8', cc: 5328, hp: 355, tq: 519, trans: 'أوتوماتيك 10 سرعات', drive: '4WD', fuel: 'بنزين', seats: 8, price: 298000, margin: 10, demand: 4, close: 0.95, wiki: ['Chevrolet Tahoe'], q: 'Chevrolet Tahoe 2021', token: 'tahoe' },
    { id: 'yukon', brand: 'GMC', model: 'Yukon', ar: 'يوكن', trim: 'SLT 4WD', grades: ['SLE', 'SLT', 'AT4', 'Denali'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الولايات المتحدة', engine: '5.3 لتر V8', cc: 5328, hp: 355, tq: 519, trans: 'أوتوماتيك 10 سرعات', drive: '4WD', fuel: 'بنزين', seats: 8, price: 318000, margin: 10.5, demand: 3, close: 0.9, wiki: ['GMC Yukon'], q: 'GMC Yukon 2021', token: 'yukon' },
    { id: 'explorer', brand: 'Ford', model: 'Explorer', ar: 'إكسبلورر', trim: 'XLT 4WD', grades: ['Base', 'XLT', 'Limited', 'ST'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الولايات المتحدة', engine: '2.3 لتر EcoBoost تيربو', cc: 2261, hp: 300, tq: 420, trans: 'أوتوماتيك 10 سرعات', drive: '4WD', fuel: 'بنزين', seats: 7, price: 168000, margin: 8, demand: 2.5, close: 0.85, wiki: ['Ford Explorer (sixth generation)', 'Ford Explorer'], q: 'Ford Explorer 2020', token: 'explorer' },
    { id: 'expedition', brand: 'Ford', model: 'Expedition', ar: 'إكسبديشن', trim: 'Limited 4WD', grades: ['XLT', 'Limited', 'Platinum'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الولايات المتحدة', engine: '3.5 لتر V6 EcoBoost', cc: 3496, hp: 400, tq: 651, trans: 'أوتوماتيك 10 سرعات', drive: '4WD', fuel: 'بنزين', seats: 8, price: 282000, margin: 9.5, demand: 2, close: 0.85, wiki: ['Ford Expedition'], q: 'Ford Expedition 2022', token: 'expedition' },
    { id: 'mg5', brand: 'MG', model: 'MG 5', ar: 'إم جي 5', trim: 'STD', grades: ['STD', 'COM', 'LUX'], year: 2026, body: 'Sedan', cat: 'standard', origin: 'الصين', engine: '1.5 لتر 4 سلندر', cc: 1498, hp: 112, tq: 150, trans: 'CVT أوتوماتيك', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 59900, margin: 9, demand: 4, close: 0.95, wiki: ['MG 5 (2020)', 'MG5 (sedan)', 'MG 5'], q: 'MG5 sedan 2021', token: 'mg5' },
    { id: 'mgzs', brand: 'MG', model: 'ZS', ar: 'زد إس', trim: 'COM', grades: ['STD', 'COM', 'LUX'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الصين', engine: '1.5 لتر 4 سلندر', cc: 1498, hp: 112, tq: 150, trans: 'CVT أوتوماتيك', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 69900, margin: 9.5, demand: 3.5, close: 0.95, wiki: ['MG ZS (crossover)', 'MG ZS'], q: 'MG ZS crossover', token: 'zs' },
    { id: 'monjaro', brand: 'Geely', model: 'Monjaro', ar: 'مونجارو', trim: 'Flagship AWD', grades: ['GF', 'Premium', 'Flagship'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الصين', engine: '2.0 لتر 4 سلندر تيربو', cc: 1969, hp: 238, tq: 350, trans: 'أوتوماتيك 8 سرعات', drive: 'AWD', fuel: 'بنزين', seats: 5, price: 152000, margin: 11, demand: 3, close: 0.85, wiki: ['Geely Monjaro', 'Geely Xingyue L'], q: 'Geely Monjaro', token: 'monjaro' },
    { id: 'cs75', brand: 'Changan', model: 'CS75 Plus', ar: 'سي إس 75 بلس', trim: 'Premium', grades: ['Comfort', 'Luxury', 'Premium'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الصين', engine: '1.5 لتر 4 سلندر تيربو', cc: 1494, hp: 178, tq: 300, trans: 'أوتوماتيك 6 سرعات', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 94900, margin: 10, demand: 3.5, close: 0.9, wiki: ['Changan CS75', 'Changan CS75 Plus'], q: 'Changan CS75 Plus', token: 'cs75' },
    { id: 'jetour-t2', brand: 'Jetour', model: 'T2', ar: 'تي 2', trim: 'Traveller 4WD', grades: ['Standard', 'Luxury', 'Travel 4WD'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الصين', engine: '2.0 لتر 4 سلندر تيربو', cc: 1998, hp: 254, tq: 390, trans: 'DCT أوتوماتيك 7 سرعات', drive: '4WD', fuel: 'بنزين', seats: 5, price: 134900, margin: 12, demand: 3, close: 0.85, wiki: ['Jetour Traveller', 'Jetour T2'], q: 'Jetour Traveller', token: 'jetour' },
    { id: 'gs8', brand: 'GAC', model: 'GS8', ar: 'جي إس 8', trim: 'GT AWD', grades: ['GL', 'GE', 'GT'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الصين', engine: '2.0 لتر 4 سلندر تيربو', cc: 1991, hp: 248, tq: 400, trans: 'أوتوماتيك 8 سرعات', drive: 'AWD', fuel: 'بنزين', seats: 7, price: 149900, margin: 10.5, demand: 2, close: 0.85, wiki: ['GAC Trumpchi GS8', 'Trumpchi GS8'], q: 'Trumpchi GS8 2022', token: 'gs8' },
    { id: 'h6', brand: 'Haval', model: 'H6', ar: 'إتش 6', trim: 'Supreme', grades: ['Active', 'Premium', 'Supreme'], year: 2026, body: 'SUV', cat: 'standard', origin: 'الصين', engine: '1.5 لتر 4 سلندر تيربو', cc: 1497, hp: 181, tq: 285, trans: 'DCT أوتوماتيك 7 سرعات', drive: 'FWD', fuel: 'بنزين', seats: 5, price: 92900, margin: 9, demand: 3, close: 0.9, wiki: ['Haval H6'], q: 'Haval H6 third generation', token: 'h6' },
    { id: 'seal', brand: 'BYD', model: 'Seal', ar: 'سيل', trim: 'Design RWD', grades: ['Dynamic', 'Premium', 'Performance AWD'], year: 2026, body: 'Sedan', cat: 'electric', origin: 'الصين', engine: 'محرك كهربائي — بطارية 82.5 ك.و.س', cc: 0, hp: 308, tq: 360, trans: 'ناقل حركة أحادي السرعة', drive: 'RWD', fuel: 'كهربائي', seats: 5, price: 186000, margin: 10, demand: 1.6, close: 0.7, wiki: ['BYD Seal'], q: 'BYD Seal', token: 'seal' }
  ];
  V.forEach((v) => { v.brandAr = BRANDS[v.brand].ar; v.full = v.brand + ' ' + v.model; });

  const BODY_AR = { Sedan: 'سيدان', SUV: 'دفع رباعي / SUV', Pickup: 'بيك أب' };
  const CAT_AR = { standard: 'قياسية', luxury: 'فاخرة', hybrid: 'هجينة', electric: 'كهربائية' };

  /* ---------- Branches & sales team (أسماء وهمية) ---------- */
  const BRANCHES = [
    { id: 'RUH', ar: 'الرياض — طريق الملك فهد', w: 1.45 },
    { id: 'JED', ar: 'جدة — طريق الملك عبدالعزيز', w: 1.2 },
    { id: 'DMM', ar: 'الدمام — طريق الخليج', w: 0.95 },
    { id: 'AHB', ar: 'أبها — طريق الملك خالد', w: 0.7 }
  ];
  const TEAM = [
    { id: 'S01', ar: 'فهد السبيعي', branch: 'RUH', skill: 1.2 },
    { id: 'S02', ar: 'نورة القحطاني', branch: 'RUH', skill: 1.05 },
    { id: 'S03', ar: 'عبدالله المطيري', branch: 'RUH', skill: 0.85 },
    { id: 'S04', ar: 'ريم الغامدي', branch: 'JED', skill: 1.15 },
    { id: 'S05', ar: 'ماجد الحربي', branch: 'JED', skill: 0.95 },
    { id: 'S06', ar: 'سلطان الزهراني', branch: 'JED', skill: 0.8 },
    { id: 'S07', ar: 'خالد الدوسري', branch: 'DMM', skill: 1.1 },
    { id: 'S08', ar: 'هيفاء الشمري', branch: 'DMM', skill: 0.9 },
    { id: 'S09', ar: 'تركي العنزي', branch: 'DMM', skill: 0.8 },
    { id: 'S10', ar: 'محمد الشهري', branch: 'AHB', skill: 1.15 },
    { id: 'S11', ar: 'أمل العسيري', branch: 'AHB', skill: 1.0 },
    { id: 'S12', ar: 'بندر القرني', branch: 'AHB', skill: 0.85 }
  ];

  /* ---------- Marketing channels ----------
     cpi: تكلفة الاستفسار الواحد (ر.س، تجريبي) | adViews: مشاهدات إعلانية لكل استفسار
     q: جودة القناة (احتمالات مراحل القمع) */
  const CHANNELS = [
    { id: 'instagram', ar: 'إنستغرام', w: 1.35, cpi: 58, adViews: 140, q: { lead: 0.52, visit: 0.42, td: 0.62, quote: 0.72, close: 0.34 } },
    { id: 'tiktok', ar: 'تيك توك', w: 1.25, cpi: 42, adViews: 210, q: { lead: 0.44, visit: 0.36, td: 0.58, quote: 0.70, close: 0.30 } },
    { id: 'snapchat', ar: 'سناب شات', w: 1.1, cpi: 49, adViews: 170, q: { lead: 0.47, visit: 0.39, td: 0.60, quote: 0.70, close: 0.32 } },
    { id: 'google', ar: 'إعلانات قوقل', w: 0.95, cpi: 96, adViews: 55, q: { lead: 0.66, visit: 0.52, td: 0.68, quote: 0.76, close: 0.40 } },
    { id: 'website', ar: 'الموقع الإلكتروني', w: 0.75, cpi: 30, adViews: 35, q: { lead: 0.62, visit: 0.50, td: 0.66, quote: 0.75, close: 0.38 } },
    { id: 'whatsapp', ar: 'واتساب', w: 1.15, cpi: 18, adViews: 25, q: { lead: 0.60, visit: 0.47, td: 0.64, quote: 0.74, close: 0.37 } },
    { id: 'walkin', ar: 'زيارة مباشرة للمعرض', w: 0.7, cpi: 0, adViews: 0, q: { lead: 0.80, visit: 1.0, td: 0.72, quote: 0.80, close: 0.44 } },
    { id: 'phone', ar: 'اتصال هاتفي', w: 0.6, cpi: 12, adViews: 20, q: { lead: 0.58, visit: 0.45, td: 0.62, quote: 0.72, close: 0.36 } },
    { id: 'referral', ar: 'توصية عميل', w: 0.4, cpi: 0, adViews: 0, referralBonus: 1500, q: { lead: 0.84, visit: 0.72, td: 0.76, quote: 0.84, close: 0.52 } }
  ];

  const PAYMENTS = [
    { id: 'cash', ar: 'كاش' },
    { id: 'bank', ar: 'تمويل بنكي' },
    { id: 'company', ar: 'تمويل شركة' },
    { id: 'lease', ar: 'تأجير منتهي بالتمليك' }
  ];
  const BANKS = ['مصرف الراجحي', 'البنك الأهلي السعودي', 'بنك الرياض', 'مصرف الإنماء', 'بنك البلاد', 'البنك السعودي الفرنسي'];
  const FIN_COS = ['شركة تمويل (أ) — وهمية', 'شركة تمويل (ب) — وهمية', 'شركة تمويل (ج) — وهمية'];
  const COLORS = ['أبيض لؤلؤي', 'أسود', 'فضي', 'رمادي', 'أبيض', 'كحلي', 'بيج', 'أحمر'];
  const LOST = ['السعر أعلى من المتوقع', 'رفض التمويل', 'اشترى من منافس', 'عدم توفر اللون/الفئة', 'لم يرد على المتابعة', 'أجّل قرار الشراء'];

  const FIRST = ['محمد', 'عبدالرحمن', 'سعد', 'فيصل', 'نايف', 'عبدالعزيز', 'مشعل', 'يوسف', 'ناصر', 'أحمد', 'سارة', 'منيرة', 'لمى', 'عبير', 'حصة', 'وليد', 'راكان', 'زياد', 'بدر', 'هند', 'مها', 'عمر', 'سامي', 'طلال'];
  const LAST = ['العتيبي', 'القحطاني', 'الشهري', 'الغامدي', 'الزهراني', 'الحربي', 'الدوسري', 'المطيري', 'العمري', 'الأحمدي', 'السهلي', 'البقمي', 'العسيري', 'الشمراني', 'المالكي', 'الرشيدي', 'السلمي', 'الجهني', 'اليامي', 'البلوي'];
  const custName = () => pick(FIRST) + ' ' + pick(LAST);

  /* ---------- Seasonality & growth (وهمي) ---------- */
  function monthFactor(i) {
    const mo = MONTHS[i].m;
    const season = { 0: 1.0, 1: 1.2, 2: 1.28, 3: 1.05, 4: 0.95, 5: 0.9, 6: 0.82, 7: 0.85, 8: 1.0, 9: 1.05, 10: 1.08, 11: 1.22 }[mo];
    const growth = 1 + 0.14 * (i / 23);
    return season * growth;
  }

  /* ---------- Generate inquiries & funnel ---------- */
  const inquiries = [];
  const sales = [];
  let inqSeq = 0, invSeq = 0, stkSeq = 0;
  const BASE_PER_MONTH = 320;

  function modelYearFor(dateMs) {
    return dateMs >= Date.UTC(2025, 8, 1) ? 2026 : 2025;
  }

  for (let mi = 0; mi < MONTHS.length; mi++) {
    const mo = MONTHS[mi];
    const n = Math.round(BASE_PER_MONTH * monthFactor(mi) * rand(0.93, 1.07));
    const start = Date.UTC(mo.y, mo.m, 1);
    const daysInMonth = new Date(Date.UTC(mo.y, mo.m + 1, 0)).getUTCDate();
    const maxDay = (mo.y === 2026 && mo.m === 8) ? 29 : daysInMonth;
    for (let k = 0; k < n; k++) {
      const v = pickW(V, (x) => x.demand);
      const ch = pickW(CHANNELS, (c) => {
        let w = c.w;
        if (v.cat === 'luxury' && (c.id === 'google' || c.id === 'referral' || c.id === 'walkin')) w *= 1.8;
        if (BRANDS[v.brand].origin === 'الصين' && (c.id === 'tiktok' || c.id === 'snapchat')) w *= 1.6;
        return w;
      });
      const br = pickW(BRANCHES, (b) => b.w);
      const team = TEAM.filter((t) => t.branch === br.id);
      const sp = pickW(team, (t) => t.skill);
      const date = start + (randInt(1, maxDay) - 1) * DAY;
      const q = ch.q;
      const f = v.close * sp.skill;
      let stage = 0; // 0 استفسار ,1 Lead ,2 زيارة ,3 تجربة قيادة ,4 عرض سعر ,5 اعتماد الدفع/التمويل ,6 بيع
      if (chance(q.lead)) {
        stage = 1;
        if (chance(q.visit)) {
          stage = 2;
          if (chance(q.td)) {
            stage = 3;
            if (chance(q.quote)) {
              stage = 4;
              if (chance(Math.min(0.92, q.close * 1.55 * f))) {
                stage = 5;
                if (chance(0.9)) stage = 6;
              }
            }
          }
        }
      }
      const ageDays = (TODAY - date) / DAY;
      let status;
      if (stage === 6) status = 'won';
      else if (stage >= 1 && ageDays < 35 && chance(0.7)) status = 'open';
      else status = 'lost';
      const rec = {
        id: 'Q' + String(++inqSeq).padStart(5, '0'), date, mi, vid: v.id, brand: v.brand, body: v.body, cat: v.cat,
        year: modelYearFor(date), branch: br.id, sp: sp.id, ch: ch.id, stage, status,
        lost: status === 'lost' ? (stage === 5 ? 'رفض التمويل' : pick(LOST)) : null,
        cost: ch.cpi ? Math.round(ch.cpi * rand(0.75, 1.25)) : 0
      };
      inquiries.push(rec);

      if (stage === 6) {
        const saleDate = Math.min(TODAY.getTime(), date + randInt(3, 21) * DAY);
        const disc = rand(0, 0.035);
        const price = Math.round(v.price * (1 - disc) / 100) * 100;
        const cost = Math.round(v.price * (1 - v.margin / 100) * rand(0.985, 1.015) / 100) * 100;
        const cheap = v.price < 110000, lux = v.price > 280000;
        const pay = pickW(PAYMENTS, (p) => ({
          cash: lux ? 0.42 : cheap ? 0.24 : 0.3,
          bank: lux ? 0.4 : cheap ? 0.36 : 0.42,
          company: cheap ? 0.3 : 0.16,
          lease: cheap ? 0.1 : 0.12
        }[p.id]));
        const financier = pay.id === 'bank' ? pick(BANKS) : pay.id === 'company' || pay.id === 'lease' ? pick(FIN_COS) : null;
        // collection terms
        let upfront, dueDate;
        if (pay.id === 'cash') {
          upfront = chance(0.82) ? price : Math.round(price * rand(0.1, 0.4) / 1000) * 1000;
          dueDate = saleDate + randInt(7, 30) * DAY;
        } else {
          upfront = Math.round(price * rand(0.1, 0.3) / 1000) * 1000;
          dueDate = saleDate + (pay.id === 'bank' ? randInt(10, 30) : randInt(20, 45)) * DAY;
        }
        let paid = upfront;
        const pays = [{ d: saleDate, a: upfront }]; // سجل الدفعات (لحساب الرصيد في أي تاريخ)
        const overdueNow = (TODAY - dueDate) / DAY;
        const cap = (ms) => Math.min(TODAY.getTime(), ms);
        if (paid < price && overdueNow > 0) {
          const pCollected = overdueNow > 150 ? 0.985 : overdueNow > 60 ? 0.86 : overdueNow > 20 ? 0.72 : 0.55;
          if (chance(pCollected)) {
            const d = chance(0.6) ? dueDate - randInt(0, 5) * DAY : dueDate + randInt(1, Math.max(1, Math.min(overdueNow, 75))) * DAY;
            pays.push({ d: cap(Math.max(saleDate, d)), a: price - paid }); paid = price;
          } else if (chance(0.35)) {
            const part = Math.min(price - paid, Math.round((price - paid) * rand(0.3, 0.7) / 1000) * 1000);
            pays.push({ d: cap(dueDate + randInt(0, Math.floor(overdueNow)) * DAY), a: part }); paid += part;
          }
        } else if (paid < price && chance(0.18)) { // early payment
          pays.push({ d: cap(saleDate + randInt(2, Math.max(2, Math.floor((Math.min(TODAY.getTime(), dueDate) - saleDate) / DAY))) * DAY), a: price - paid });
          paid = price;
        }
        const remaining = price - paid;
        const daysOverdue = remaining > 0 ? Math.max(0, Math.floor((TODAY - dueDate) / DAY)) : 0;
        const coll = remaining === 0 ? 'paid' : daysOverdue > 0 ? 'overdue' : 'pending';
        const daysToSell = Math.max(3, Math.round(rand(8, 55) * (6 / (v.demand + 2)) * 1.4 + rand(0, 12)));
        sales.push({
          inv: 'INV-' + new Date(saleDate).getUTCFullYear() + '-' + String(++invSeq).padStart(4, '0'),
          qid: rec.id, date: saleDate, mi: monthIndex(saleDate), vid: v.id, brand: v.brand, body: v.body, cat: v.cat, year: rec.year,
          branch: br.id, sp: sp.id, ch: ch.id, customer: custName(), price, cost, profit: price - cost,
          pay: pay.id, financier, upfront, paid, remaining, dueDate, daysOverdue, coll, pays,
          stock: 'STK-' + String(++stkSeq).padStart(5, '0'), color: pick(COLORS), daysToSell,
          referralCost: ch.referralBonus || 0
        });
      }
    }
  }
  function monthIndex(ms) {
    const d = new Date(ms);
    return (d.getUTCFullYear() - 2024) * 12 + d.getUTCMonth() - 9;
  }
  sales.sort((a, b) => a.date - b.date);
  sales.forEach((s, i) => { s.inv = 'INV-' + new Date(s.date).getUTCFullYear() + '-' + String(i + 1).padStart(4, '0'); });

  /* ---------- Current inventory (متوفر / محجوز) ---------- */
  const inventory = [];
  V.forEach((v) => {
    const units = Math.max(2, Math.round(v.demand * rand(0.9, 1.5) + (v.close < 0.9 ? 3 : 1)));
    const slow = v.close < 0.9 || v.demand < 3;
    for (let u = 0; u < units; u++) {
      const days = Math.round(slow ? rand(10, 150) : rand(2, 70) * (chance(0.1) ? 1.7 : 1));
      const arrival = TODAY - days * DAY;
      const br = pickW(BRANCHES, (b) => b.w);
      const cost = Math.round(v.price * (1 - v.margin / 100) * rand(0.985, 1.015) / 100) * 100;
      inventory.push({
        stock: 'STK-' + String(++stkSeq).padStart(5, '0'), vid: v.id, brand: v.brand, body: v.body, cat: v.cat,
        year: days > 200 ? 2025 : (arrival < Date.UTC(2025, 8, 1) ? 2025 : 2026), color: pick(COLORS), branch: br.id,
        cost, price: v.price, days, arrival, status: chance(0.16) ? 'reserved' : 'available',
        vin: 'DEMO' + Math.floor(R() * 1e12).toString(36).toUpperCase().padStart(9, '0')
      });
    }
  });
  // units sold also become stock records (status: sold)
  sales.forEach((s) => {
    const v = V.find((x) => x.id === s.vid);
    inventory.push({
      stock: s.stock, vid: s.vid, brand: s.brand, body: s.body, cat: s.cat, year: s.year, color: s.color, branch: s.branch,
      cost: s.cost, price: v.price, days: s.daysToSell, arrival: s.date - s.daysToSell * DAY, status: 'sold', saleInv: s.inv, saleDate: s.date,
      vin: 'DEMO' + Math.floor(R() * 1e12).toString(36).toUpperCase().padStart(9, '0')
    });
  });

  window.DB = {
    TODAY: TODAY.getTime(), DAY, MONTHS, MONTH_AR, BRANDS, V, BODY_AR, CAT_AR, BRANCHES, TEAM, CHANNELS, PAYMENTS, BANKS,
    inquiries, sales, inventory,
    byId: Object.fromEntries(V.map((v) => [v.id, v])),
    chById: Object.fromEntries(CHANNELS.map((c) => [c.id, c])),
    brById: Object.fromEntries(BRANCHES.map((b) => [b.id, b])),
    spById: Object.fromEntries(TEAM.map((t) => [t.id, t])),
    payById: Object.fromEntries(PAYMENTS.map((p) => [p.id, p])),
    STAGES: ['استفسار', 'عميل محتمل Lead', 'زيارة المعرض', 'تجربة قيادة', 'عرض سعر', 'اعتماد الدفع / التمويل', 'بيع']
  };
})();
