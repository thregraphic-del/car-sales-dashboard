/* =====================================================================
   VEHICLE MASTER CATALOG — Saudi-market brands
   Brand → Model → Model Year (generation) → Trim / Grade
   ---------------------------------------------------------------------
   • Each model lists ONLY the model years it is offered in this dataset,
     grouped by generation. Trims are model- and generation-specific.
   • Prices are REALISTIC DEMO VALUES in SAR (incl. VAT), listed for the
     latest year of each generation; earlier years are derived (−3%/yr).
     Specs are indicative. Verify against the official distributor price
     lists before production use.
   • Demand parameters (vol = group units/month, dts = base days-to-sell,
     conv = conversion factor, mg = base gross margin) drive the demo
     generator only and are ignored in production mode.
   Trim row: [grade, msrp, powertrain(P|H|PH|E), engine, hp, transmission, drivetrain]
   ===================================================================== */
(function(){
  const C = {
  Toyota: [
    {m:'Yaris', body:'Sedan', style:'compactSedan', vol:30, dts:16, conv:1.3, mg:.065, gens:[
      {y:[2024,2025,2026], g:'AC100', t:[['Y',69900,'P','1.5L I4',106,'CVT','FWD'],['YX',76900,'P','1.5L I4',106,'CVT','FWD']]}]},
    {m:'Corolla', body:'Sedan', style:'sedan', vol:26, dts:18, conv:1.25, mg:.07, gens:[
      {y:[2024,2025,2026], g:'E210', t:[['XLI 1.6',89900,'P','1.6L I4',121,'CVT','FWD'],['XLI Executive 2.0',99900,'P','2.0L I4',169,'CVT','FWD'],['Hybrid',112900,'H','1.8L I4 Hybrid',138,'e-CVT','FWD']]}]},
    {m:'Camry', body:'Sedan', style:'sedan', vol:24, dts:20, conv:1.2, mg:.075, gens:[
      {y:[2024], g:'XV70', t:[['LE',119900,'P','2.5L I4',203,'8AT','FWD'],['GLE',132900,'P','2.5L I4',203,'8AT','FWD'],['Grande',159900,'P','3.5L V6',301,'8AT','FWD']]},
      {y:[2025,2026], g:'XV80', t:[['LE Hybrid',139900,'H','2.5L I4 Hybrid',225,'e-CVT','FWD'],['SE Hybrid',149900,'H','2.5L I4 Hybrid',225,'e-CVT','FWD'],['Grande Hybrid',169900,'H','2.5L I4 Hybrid',232,'e-CVT','AWD']]}]},
    {m:'Raize', body:'Crossover', style:'crossover', vol:8, dts:24, conv:1.05, mg:.065, gens:[
      {y:[2024,2025,2026], g:'A200', t:[['E',79900,'P','1.2L I3',87,'CVT','FWD'],['G Turbo',89900,'P','1.0L Turbo I3',98,'CVT','FWD']]}]},
    {m:'Corolla Cross', body:'Crossover', style:'crossover', vol:10, dts:22, conv:1.1, mg:.075, gens:[
      {y:[2024,2025,2026], g:'XG10', t:[['GLI 2.0',112900,'P','2.0L I4',169,'CVT','FWD'],['Hybrid Limited',134900,'H','1.8L I4 Hybrid',138,'e-CVT','FWD']]}]},
    {m:'RAV4', body:'SUV', style:'suv', vol:12, dts:21, conv:1.15, mg:.08, gens:[
      {y:[2024,2025,2026], g:'XA50', t:[['LE',124900,'P','2.5L I4',203,'8AT','FWD'],['XLE AWD',139900,'P','2.5L I4',203,'8AT','AWD'],['Hybrid Adventure',159900,'H','2.5L I4 Hybrid',219,'e-CVT','AWD']]}]},
    {m:'Fortuner', body:'SUV', style:'boxy', vol:9, dts:25, conv:1.05, mg:.08, gens:[
      {y:[2024,2025,2026], g:'AN160', t:[['GX',142900,'P','2.7L I4',164,'6AT','4WD'],['VX',168900,'P','4.0L V6',235,'6AT','4WD'],['GR Sport',189900,'P','4.0L V6',235,'6AT','4WD']]}]},
    {m:'Highlander', body:'SUV', style:'largeSUV', vol:5, dts:32, conv:.95, mg:.09, gens:[
      {y:[2024,2025,2026], g:'XU70', t:[['GXR Hybrid',199900,'H','2.5L I4 Hybrid',243,'e-CVT','AWD'],['Limited Hybrid',229900,'H','2.5L I4 Hybrid',243,'e-CVT','AWD']]}]},
    {m:'Land Cruiser Prado', body:'SUV', style:'boxy', vol:11, dts:19, conv:1.2, mg:.085, gens:[
      {y:[2024], g:'J150', t:[['TX',199900,'P','2.7L I4',161,'6AT','4WD'],['VX',239900,'P','4.0L V6',271,'6AT','4WD']]},
      {y:[2025,2026], g:'J250', t:[['TX-L',239900,'P','2.4L Turbo I4',278,'8AT','4WD'],['VX',269900,'P','2.4L Turbo I4',278,'8AT','4WD']]}]},
    {m:'Land Cruiser', body:'SUV', style:'largeSUV', vol:16, dts:14, conv:1.35, mg:.08, gens:[
      {y:[2024,2025,2026], g:'J300', t:[['GXR',289900,'P','3.5L Twin Turbo V6',409,'10AT','4WD'],['VXR',339900,'P','3.5L Twin Turbo V6',409,'10AT','4WD'],['GR Sport',389900,'P','3.5L Twin Turbo V6',409,'10AT','4WD']]}]},
    {m:'Sequoia', body:'SUV', style:'largeSUV', vol:2, dts:45, conv:.8, mg:.1, gens:[
      {y:[2024,2025,2026], g:'XK80', t:[['Platinum Hybrid',339900,'H','3.4L Twin Turbo V6 Hybrid',437,'10AT','4WD'],['Capstone',389900,'H','3.4L Twin Turbo V6 Hybrid',437,'10AT','4WD']]}]},
    {m:'Hilux', body:'Pickup', style:'pickup', vol:22, dts:15, conv:1.35, mg:.07, gens:[
      {y:[2024,2025,2026], g:'AN120', t:[['Single Cab 2.7',84900,'P','2.7L I4',164,'5MT','RWD'],['Double Cab GLX',109900,'P','2.7L I4',164,'6AT','4WD'],['Double Cab Adventure',149900,'P','4.0L V6',235,'6AT','4WD']]}]},
    {m:'Hiace', body:'MPV', style:'van', vol:7, dts:22, conv:1.2, mg:.07, gens:[
      {y:[2024,2025,2026], g:'H300', t:[['Standard Roof 13-Seat',139900,'P','3.5L V6',277,'6AT','RWD'],['High Roof Cargo',129900,'P','3.5L V6',277,'6AT','RWD']]}]}
  ],
  Lexus: [
    {m:'ES', body:'Sedan', style:'sedan', vol:5, dts:30, conv:.95, mg:.11, gens:[
      {y:[2024,2025], g:'XZ10', t:[['ES 250',209900,'P','2.5L I4',203,'8AT','FWD'],['ES 300h',229900,'H','2.5L I4 Hybrid',215,'e-CVT','FWD'],['ES 350',239900,'P','3.5L V6',302,'8AT','FWD']]}]},
    {m:'LS', body:'Sedan', style:'sedan', vol:1, dts:55, conv:.7, mg:.13, gens:[
      {y:[2024,2025,2026], g:'XF50', t:[['LS 500',449900,'P','3.5L Twin Turbo V6',416,'10AT','AWD'],['LS 500h',469900,'H','3.5L V6 Hybrid',354,'e-CVT','AWD']]}]},
    {m:'IS', body:'Sedan', style:'sedan', vol:1.5, dts:40, conv:.85, mg:.11, gens:[
      {y:[2024,2025,2026], g:'XE30', t:[['IS 300',189900,'P','2.0L Turbo I4',241,'8AT','RWD'],['IS 350 F Sport',219900,'P','3.5L V6',311,'8AT','RWD']]}]},
    {m:'UX', body:'Crossover', style:'crossover', vol:2, dts:36, conv:.9, mg:.1, gens:[
      {y:[2024,2025,2026], g:'ZA10', t:[['UX 300h',169900,'H','2.0L I4 Hybrid',196,'e-CVT','FWD']]}]},
    {m:'NX', body:'SUV', style:'suv', vol:4, dts:30, conv:.95, mg:.11, gens:[
      {y:[2024,2025,2026], g:'AZ20', t:[['NX 250',179900,'P','2.5L I4',203,'8AT','FWD'],['NX 350',209900,'P','2.4L Turbo I4',275,'8AT','AWD'],['NX 350h',214900,'H','2.5L I4 Hybrid',240,'e-CVT','AWD'],['NX 450h+',259900,'PH','2.5L I4 Plug-in Hybrid',304,'e-CVT','AWD']]}]},
    {m:'RX', body:'SUV', style:'suv', vol:4, dts:28, conv:1.0, mg:.115, gens:[
      {y:[2024,2025,2026], g:'AL30', t:[['RX 350',249900,'P','2.4L Turbo I4',275,'8AT','AWD'],['RX 350h',264900,'H','2.5L I4 Hybrid',246,'e-CVT','AWD'],['RX 500h',319900,'H','2.4L Turbo Hybrid',366,'6AT','AWD']]}]},
    {m:'GX', body:'SUV', style:'boxy', vol:2.5, dts:26, conv:1.05, mg:.12, gens:[
      {y:[2024], g:'J150', t:[['GX 460',299900,'P','4.6L V8',301,'6AT','4WD']]},
      {y:[2025,2026], g:'J250', t:[['GX 550 Premium',369900,'P','3.4L Twin Turbo V6',349,'10AT','4WD'],['GX 550 Overtrail',389900,'P','3.4L Twin Turbo V6',349,'10AT','4WD']]}]},
    {m:'LX', body:'SUV', style:'largeSUV', vol:6, dts:20, conv:1.2, mg:.12, gens:[
      {y:[2024,2025], g:'J310', t:[['LX 600 Premier',469900,'P','3.5L Twin Turbo V6',409,'10AT','4WD'],['LX 600 F Sport',494900,'P','3.5L Twin Turbo V6',409,'10AT','4WD']]},
      {y:[2026], g:'J310', t:[['LX 600 Premier',469900,'P','3.5L Twin Turbo V6',409,'10AT','4WD'],['LX 600 F Sport',494900,'P','3.5L Twin Turbo V6',409,'10AT','4WD'],['LX 700h',529900,'H','3.5L Twin Turbo V6 Hybrid',457,'10AT','4WD']]}]},
    {m:'LC', body:'Sports Car', style:'coupe', vol:.5, dts:60, conv:.7, mg:.13, gens:[
      {y:[2024,2025,2026], g:'Z100', t:[['LC 500',529900,'P','5.0L V8',471,'10AT','RWD']]}]}
  ],
  Nissan: [
    {m:'Sunny', body:'Sedan', style:'compactSedan', vol:22, dts:17, conv:1.25, mg:.06, gens:[
      {y:[2024,2025,2026], g:'N18', t:[['S',64900,'P','1.6L I4',118,'CVT','FWD'],['SV',71900,'P','1.6L I4',118,'CVT','FWD'],['SL',77900,'P','1.6L I4',118,'CVT','FWD']]}]},
    {m:'Sentra', body:'Sedan', style:'sedan', vol:6, dts:26, conv:1.0, mg:.07, gens:[
      {y:[2024,2025], g:'B18', t:[['S',84900,'P','2.0L I4',149,'CVT','FWD'],['SV',94900,'P','2.0L I4',149,'CVT','FWD'],['SR',104900,'P','2.0L I4',149,'CVT','FWD']]},
      {y:[2026], g:'B19', t:[['SV',99900,'P','2.0L I4',149,'CVT','FWD'],['SR',109900,'P','2.0L I4',149,'CVT','FWD']]}]},
    {m:'Altima', body:'Sedan', style:'sedan', vol:6, dts:28, conv:.95, mg:.075, gens:[
      {y:[2024,2025,2026], g:'L34', t:[['S',109900,'P','2.5L I4',182,'CVT','FWD'],['SV',119900,'P','2.5L I4',182,'CVT','FWD'],['SL',134900,'P','2.5L I4',182,'CVT','FWD']]}]},
    {m:'Kicks', body:'Crossover', style:'crossover', vol:7, dts:24, conv:1.05, mg:.065, gens:[
      {y:[2024], g:'P15', t:[['S',79900,'P','1.6L I4',118,'CVT','FWD'],['SV',86900,'P','1.6L I4',118,'CVT','FWD']]},
      {y:[2025,2026], g:'P16', t:[['S',84900,'P','2.0L I4',141,'CVT','FWD'],['SV',92900,'P','2.0L I4',141,'CVT','FWD'],['SR',99900,'P','2.0L I4',141,'CVT','FWD']]}]},
    {m:'X-Trail', body:'SUV', style:'suv', vol:6, dts:27, conv:1.0, mg:.075, gens:[
      {y:[2024,2025,2026], g:'T33', t:[['S',114900,'P','2.5L I4',181,'CVT','FWD'],['SV',129900,'P','2.5L I4',181,'CVT','AWD'],['SL 4WD',149900,'P','2.5L I4',181,'CVT','AWD']]}]},
    {m:'Pathfinder', body:'SUV', style:'largeSUV', vol:4, dts:33, conv:.9, mg:.08, gens:[
      {y:[2024,2025,2026], g:'R53', t:[['SV',164900,'P','3.5L V6',284,'9AT','4WD'],['Platinum',199900,'P','3.5L V6',284,'9AT','4WD']]}]},
    {m:'Patrol', body:'SUV', style:'largeSUV', vol:15, dts:17, conv:1.3, mg:.09, gens:[
      {y:[2024], g:'Y62', t:[['LE Titanium',309900,'P','5.6L V8',400,'7AT','4WD'],['Nismo',399900,'P','5.6L V8',428,'7AT','4WD']]},
      {y:[2025], g:'Y63', t:[['XE',239900,'P','3.5L Twin Turbo V6',425,'9AT','4WD'],['LE Platinum',329900,'P','3.5L Twin Turbo V6',425,'9AT','4WD']]},
      {y:[2026], g:'Y63', t:[['XE',239900,'P','3.5L Twin Turbo V6',425,'9AT','4WD'],['LE Platinum',329900,'P','3.5L Twin Turbo V6',425,'9AT','4WD'],['Nismo',419900,'P','3.5L Twin Turbo V6',495,'9AT','4WD']]}]},
    {m:'Navara', body:'Pickup', style:'pickup', vol:5, dts:24, conv:1.1, mg:.065, gens:[
      {y:[2024,2025,2026], g:'D23', t:[['SE',94900,'P','2.5L I4',158,'6MT','4WD'],['LE Double Cab',119900,'P','2.5L I4',158,'7AT','4WD']]}]}
  ],
  Hyundai: [
    {m:'Accent', body:'Sedan', style:'compactSedan', vol:20, dts:17, conv:1.25, mg:.06, gens:[
      {y:[2024], g:'HC', t:[['Smart',62900,'P','1.6L I4',121,'6AT','FWD']]},
      {y:[2025,2026], g:'BN7', t:[['Smart',69900,'P','1.5L I4',113,'CVT','FWD'],['Comfort',76900,'P','1.5L I4',113,'CVT','FWD']]}]},
    {m:'Elantra', body:'Sedan', style:'sedan', vol:15, dts:20, conv:1.15, mg:.065, gens:[
      {y:[2024,2025,2026], g:'CN7', t:[['Smart',79900,'P','2.0L I4',147,'CVT','FWD'],['Comfort',89900,'P','2.0L I4',147,'CVT','FWD'],['N Line',104900,'P','1.6L Turbo I4',201,'7DCT','FWD']]}]},
    {m:'Sonata', body:'Sedan', style:'sedan', vol:5, dts:30, conv:.95, mg:.07, gens:[
      {y:[2024,2025,2026], g:'DN8', t:[['Smart',109900,'P','2.5L I4',191,'8AT','FWD'],['Premium',129900,'P','2.5L I4',191,'8AT','FWD'],['Hybrid Premium',139900,'H','2.0L I4 Hybrid',192,'6AT','FWD']]}]},
    {m:'Venue', body:'Crossover', style:'crossover', vol:6, dts:24, conv:1.05, mg:.06, gens:[
      {y:[2024,2025,2026], g:'QX', t:[['Smart',69900,'P','1.6L I4',121,'CVT','FWD'],['Comfort',76900,'P','1.6L I4',121,'CVT','FWD']]}]},
    {m:'Creta', body:'Crossover', style:'crossover', vol:10, dts:20, conv:1.15, mg:.065, gens:[
      {y:[2024], g:'SU2', t:[['Smart',79900,'P','1.5L I4',113,'CVT','FWD']]},
      {y:[2025,2026], g:'SU2 FL', t:[['Smart',84900,'P','1.5L I4',113,'CVT','FWD'],['Comfort',94900,'P','1.5L I4',113,'CVT','FWD']]}]},
    {m:'Tucson', body:'SUV', style:'suv', vol:12, dts:21, conv:1.15, mg:.075, gens:[
      {y:[2024,2025,2026], g:'NX4', t:[['Smart',104900,'P','2.0L I4',154,'6AT','FWD'],['Comfort',119900,'P','2.0L I4',154,'6AT','FWD'],['Hybrid Premium',139900,'H','1.6L Turbo Hybrid',226,'6AT','AWD']]}]},
    {m:'Santa Fe', body:'SUV', style:'boxy', vol:7, dts:26, conv:1.0, mg:.08, gens:[
      {y:[2024], g:'TM', t:[['Smart',129900,'P','2.5L I4',178,'8AT','FWD']]},
      {y:[2025,2026], g:'MX5', t:[['Smart',144900,'P','2.5L I4',191,'8AT','FWD'],['Premium AWD',169900,'P','2.5L Turbo I4',277,'8DCT','AWD'],['Hybrid Calligraphy',189900,'H','1.6L Turbo Hybrid',231,'6AT','AWD']]}]},
    {m:'Palisade', body:'SUV', style:'largeSUV', vol:5, dts:29, conv:.95, mg:.085, gens:[
      {y:[2024,2025], g:'LX2', t:[['Smart',169900,'P','3.8L V6',291,'8AT','FWD'],['Calligraphy',209900,'P','3.8L V6',291,'8AT','AWD']]},
      {y:[2026], g:'LX3', t:[['Premium',189900,'P','3.5L V6',287,'8AT','AWD'],['Calligraphy Hybrid',239900,'H','2.5L Turbo Hybrid',329,'6AT','AWD']]}]},
    {m:'Staria', body:'MPV', style:'mpv', vol:5, dts:26, conv:1.0, mg:.07, gens:[
      {y:[2024,2025,2026], g:'US4', t:[['Standard 11-Seat',129900,'P','3.5L V6',272,'8AT','RWD'],['Premium 9-Seat',159900,'P','3.5L V6',272,'8AT','RWD']]}]}
  ],
  Kia: [
    {m:'Pegas', body:'Sedan', style:'compactSedan', vol:12, dts:18, conv:1.2, mg:.055, gens:[
      {y:[2024,2025,2026], g:'AB', t:[['LX',57900,'P','1.4L I4',94,'4AT','FWD'],['EX',63900,'P','1.4L I4',94,'4AT','FWD']]}]},
    {m:'K3', body:'Sedan', style:'sedan', vol:8, dts:22, conv:1.1, mg:.065, gens:[
      {y:[2024], g:'BD', t:[['LX',72900,'P','1.6L I4',121,'CVT','FWD'],['GT-Line',86900,'P','1.6L I4',121,'CVT','FWD']]},
      {y:[2025,2026], g:'BL7', t:[['LX',74900,'P','1.5L I4',113,'CVT','FWD'],['EX',82900,'P','1.5L I4',113,'CVT','FWD']]}]},
    {m:'K5', body:'Sedan', style:'sedan', vol:5, dts:28, conv:.95, mg:.07, gens:[
      {y:[2024], g:'DL3', t:[['LX',99900,'P','2.5L I4',191,'8AT','FWD'],['GT-Line',119900,'P','2.5L I4',191,'8AT','FWD']]},
      {y:[2025,2026], g:'DL3 FL', t:[['LX',104900,'P','2.5L I4',191,'8AT','FWD'],['GT-Line',124900,'P','2.5L I4',191,'8AT','FWD']]}]},
    {m:'Seltos', body:'Crossover', style:'crossover', vol:6, dts:23, conv:1.05, mg:.065, gens:[
      {y:[2024,2025,2026], g:'SP2', t:[['LX',79900,'P','2.0L I4',147,'CVT','FWD'],['EX',89900,'P','2.0L I4',147,'CVT','FWD']]}]},
    {m:'Sportage', body:'SUV', style:'suv', vol:9, dts:22, conv:1.1, mg:.075, gens:[
      {y:[2024,2025,2026], g:'NQ5', t:[['LX',104900,'P','2.0L I4',154,'6AT','FWD'],['EX',119900,'P','2.0L I4',154,'6AT','FWD'],['GT-Line AWD',139900,'P','1.6L Turbo I4',178,'7DCT','AWD']]}]},
    {m:'Sorento', body:'SUV', style:'suv', vol:6, dts:26, conv:1.0, mg:.08, gens:[
      {y:[2024,2025,2026], g:'MQ4', t:[['LX',139900,'P','2.5L I4',191,'8AT','FWD'],['EX',159900,'P','3.5L V6',272,'8AT','AWD'],['Hybrid SX',179900,'H','1.6L Turbo Hybrid',227,'6AT','AWD']]}]},
    {m:'Telluride', body:'SUV', style:'largeSUV', vol:3, dts:31, conv:.95, mg:.085, gens:[
      {y:[2024,2025,2026], g:'ON', t:[['EX',189900,'P','3.8L V6',291,'8AT','AWD'],['SX',219900,'P','3.8L V6',291,'8AT','AWD']]}]},
    {m:'Carnival', body:'MPV', style:'mpv', vol:5, dts:25, conv:1.05, mg:.075, gens:[
      {y:[2024], g:'KA4', t:[['LX',149900,'P','3.5L V6',290,'8AT','FWD'],['EX',174900,'P','3.5L V6',290,'8AT','FWD']]},
      {y:[2025,2026], g:'KA4 FL', t:[['LX',154900,'P','3.5L V6',287,'8AT','FWD'],['EX',179900,'P','3.5L V6',287,'8AT','FWD'],['Hybrid SX',199900,'H','1.6L Turbo Hybrid',242,'6AT','FWD']]}]}
  ],
  Chevrolet: [
    {m:'Groove', body:'Crossover', style:'crossover', vol:5, dts:26, conv:1.0, mg:.07, gens:[
      {y:[2024,2025,2026], g:'CN202S', t:[['LS',64900,'P','1.5L I4',107,'CVT','FWD'],['Premier',74900,'P','1.5L I4',107,'CVT','FWD']]}]},
    {m:'Captiva', body:'Crossover', style:'crossover', vol:4, dts:30, conv:.95, mg:.07, gens:[
      {y:[2024,2025,2026], g:'CN202M', t:[['LS',84900,'P','1.5L Turbo I4',145,'CVT','FWD'],['Premier',94900,'P','1.5L Turbo I4',145,'CVT','FWD']]}]},
    {m:'Trax', body:'Crossover', style:'crossover', vol:3, dts:28, conv:.95, mg:.07, gens:[
      {y:[2024,2025,2026], g:'VSS-F', t:[['LS',84900,'P','1.2L Turbo I3',137,'6AT','FWD'],['RS',94900,'P','1.2L Turbo I3',137,'6AT','FWD']]}]},
    {m:'Equinox', body:'SUV', style:'suv', vol:3, dts:31, conv:.9, mg:.075, gens:[
      {y:[2024], g:'Gen 3', t:[['LT',109900,'P','1.5L Turbo I4',170,'6AT','FWD']]},
      {y:[2025,2026], g:'Gen 4', t:[['LT',119900,'P','1.5L Turbo I4',175,'8AT','FWD'],['RS AWD',134900,'P','1.5L Turbo I4',175,'8AT','AWD']]}]},
    {m:'Traverse', body:'SUV', style:'largeSUV', vol:3, dts:32, conv:.9, mg:.08, gens:[
      {y:[2024], g:'Gen 2', t:[['LT',164900,'P','3.6L V6',310,'9AT','FWD']]},
      {y:[2025,2026], g:'Gen 3', t:[['LT',179900,'P','2.5L Turbo I4',328,'8AT','FWD'],['Z71',199900,'P','2.5L Turbo I4',328,'8AT','AWD']]}]},
    {m:'Tahoe', body:'SUV', style:'boxy', vol:6, dts:24, conv:1.05, mg:.09, gens:[
      {y:[2024,2025,2026], g:'GMT T1', t:[['LT',239900,'P','5.3L V8',355,'10AT','4WD'],['Z71',269900,'P','5.3L V8',355,'10AT','4WD'],['High Country',309900,'P','6.2L V8',420,'10AT','4WD']]}]},
    {m:'Suburban', body:'SUV', style:'boxy', vol:2.5, dts:30, conv:.95, mg:.09, gens:[
      {y:[2024,2025,2026], g:'GMT T1', t:[['LT',259900,'P','5.3L V8',355,'10AT','4WD'],['High Country',329900,'P','6.2L V8',420,'10AT','4WD']]}]},
    {m:'Corvette', body:'Sports Car', style:'coupe', vol:.6, dts:52, conv:.75, mg:.12, gens:[
      {y:[2024,2025,2026], g:'C8', t:[['Stingray',399900,'P','6.2L V8',495,'8DCT','RWD'],['Z06',579900,'P','5.5L V8',670,'8DCT','RWD']]}]}
  ],
  GMC: [
    {m:'Terrain', body:'SUV', style:'suv', vol:2.5, dts:32, conv:.9, mg:.075, gens:[
      {y:[2024], g:'Gen 2', t:[['SLE',109900,'P','1.5L Turbo I4',170,'9AT','FWD']]},
      {y:[2025,2026], g:'Gen 3', t:[['Elevation',129900,'P','1.5L Turbo I4',175,'8AT','FWD'],['AT4',144900,'P','1.5L Turbo I4',175,'8AT','AWD']]}]},
    {m:'Acadia', body:'SUV', style:'largeSUV', vol:2.5, dts:33, conv:.9, mg:.08, gens:[
      {y:[2024], g:'Gen 2', t:[['SLE',144900,'P','2.0L Turbo I4',228,'9AT','FWD']]},
      {y:[2025,2026], g:'Gen 3', t:[['Elevation',179900,'P','2.5L Turbo I4',328,'8AT','FWD'],['AT4',204900,'P','2.5L Turbo I4',328,'8AT','AWD'],['Denali',229900,'P','2.5L Turbo I4',328,'8AT','AWD']]}]},
    {m:'Yukon', body:'SUV', style:'boxy', vol:5, dts:25, conv:1.0, mg:.095, gens:[
      {y:[2024,2025,2026], g:'GMT T1', t:[['SLE',249900,'P','5.3L V8',355,'10AT','4WD'],['AT4',299900,'P','6.2L V8',420,'10AT','4WD'],['Denali',339900,'P','6.2L V8',420,'10AT','4WD']]}]},
    {m:'Yukon XL', body:'SUV', style:'boxy', vol:2, dts:31, conv:.95, mg:.095, gens:[
      {y:[2024,2025,2026], g:'GMT T1', t:[['SLT',279900,'P','5.3L V8',355,'10AT','4WD'],['Denali',359900,'P','6.2L V8',420,'10AT','4WD']]}]},
    {m:'Sierra', body:'Pickup', style:'pickup', vol:3.5, dts:27, conv:1.0, mg:.085, gens:[
      {y:[2024,2025,2026], g:'GMT T1', t:[['Pro',139900,'P','5.3L V8',355,'10AT','4WD'],['Elevation',179900,'P','5.3L V8',355,'10AT','4WD'],['AT4',239900,'P','6.2L V8',420,'10AT','4WD'],['Denali',279900,'P','6.2L V8',420,'10AT','4WD']]}]}
  ],
  Ford: [
    {m:'Territory', body:'SUV', style:'suv', vol:5, dts:26, conv:1.0, mg:.075, gens:[
      {y:[2024,2025,2026], g:'CX743', t:[['Trend',94900,'P','1.5L Turbo I4',168,'7DCT','FWD'],['Titanium',109900,'P','1.5L Turbo I4',168,'7DCT','FWD']]}]},
    {m:'Explorer', body:'SUV', style:'largeSUV', vol:4, dts:30, conv:.95, mg:.08, gens:[
      {y:[2024,2025,2026], g:'U625', t:[['XLT',169900,'P','2.3L Turbo I4',300,'10AT','4WD'],['ST-Line',189900,'P','2.3L Turbo I4',300,'10AT','4WD'],['Platinum',219900,'P','3.0L Twin Turbo V6',400,'10AT','4WD']]}]},
    {m:'Everest', body:'SUV', style:'boxy', vol:4, dts:27, conv:1.0, mg:.08, gens:[
      {y:[2024,2025,2026], g:'U704', t:[['Trend',159900,'P','2.3L Turbo I4',296,'10AT','4WD'],['Titanium 4WD',189900,'P','2.3L Turbo I4',296,'10AT','4WD'],['Platinum',209900,'P','2.3L Turbo I4',296,'10AT','4WD']]}]},
    {m:'Expedition', body:'SUV', style:'boxy', vol:3, dts:30, conv:.95, mg:.09, gens:[
      {y:[2024], g:'U553', t:[['XLT',229900,'P','3.5L Twin Turbo V6',375,'10AT','4WD'],['Platinum',299900,'P','3.5L Twin Turbo V6',400,'10AT','4WD']]},
      {y:[2025,2026], g:'U554', t:[['XLT',249900,'P','3.5L Twin Turbo V6',400,'10AT','4WD'],['Tremor',299900,'P','3.5L Twin Turbo V6',440,'10AT','4WD'],['Platinum',319900,'P','3.5L Twin Turbo V6',440,'10AT','4WD']]}]},
    {m:'Mustang', body:'Sports Car', style:'coupe', vol:1.5, dts:40, conv:.85, mg:.1, gens:[
      {y:[2024,2025,2026], g:'S650', t:[['EcoBoost',179900,'P','2.3L Turbo I4',315,'10AT','RWD'],['GT',239900,'P','5.0L V8',480,'10AT','RWD'],['Dark Horse',289900,'P','5.0L V8',500,'10AT','RWD']]}]},
    {m:'Bronco', body:'SUV', style:'boxy', vol:2, dts:34, conv:.9, mg:.09, gens:[
      {y:[2024,2025,2026], g:'U725', t:[['Big Bend',189900,'P','2.7L Twin Turbo V6',330,'10AT','4WD'],['Badlands',229900,'P','2.7L Twin Turbo V6',330,'10AT','4WD'],['Raptor',349900,'P','3.0L Twin Turbo V6',418,'10AT','4WD']]}]},
    {m:'Ranger', body:'Pickup', style:'pickup', vol:5, dts:24, conv:1.05, mg:.07, gens:[
      {y:[2024,2025,2026], g:'P703', t:[['XL Single Cab',89900,'P','2.5L I4',164,'6MT','RWD'],['XLT Double Cab',114900,'P','2.3L Turbo I4',270,'10AT','4WD'],['Wildtrak',144900,'P','2.3L Turbo I4',270,'10AT','4WD'],['Raptor',219900,'P','3.0L Twin Turbo V6',392,'10AT','4WD']]}]},
    {m:'F-150', body:'Pickup', style:'pickup', vol:3, dts:28, conv:1.0, mg:.085, gens:[
      {y:[2024,2025,2026], g:'P702', t:[['XLT',179900,'P','3.5L Twin Turbo V6',400,'10AT','4WD'],['Lariat',229900,'P','3.5L Twin Turbo V6',400,'10AT','4WD'],['Raptor',339900,'P','3.5L Twin Turbo V6',450,'10AT','4WD']]}]}
  ],
  MG: [
    {m:'MG 3', body:'Hatchback', style:'hatch', vol:5, dts:24, conv:1.05, mg:.075, gens:[
      {y:[2024], g:'Gen 2', t:[['STD',49900,'P','1.5L I4',112,'4AT','FWD']]},
      {y:[2025,2026], g:'Gen 3', t:[['STD',54900,'P','1.5L I4',108,'CVT','FWD'],['Hybrid+',74900,'H','1.5L I4 Hybrid',192,'e-DHT','FWD']]}]},
    {m:'MG 5', body:'Sedan', style:'compactSedan', vol:9, dts:20, conv:1.15, mg:.08, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['STD',57900,'P','1.5L I4',112,'CVT','FWD'],['LUX',64900,'P','1.5L I4',112,'CVT','FWD']]}]},
    {m:'MG GT', body:'Sedan', style:'sedan', vol:4, dts:26, conv:1.0, mg:.08, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['STD',64900,'P','1.5L I4',112,'CVT','FWD'],['LUX',72900,'P','1.5L Turbo I4',170,'7DCT','FWD']]}]},
    {m:'MG ZS', body:'Crossover', style:'crossover', vol:6, dts:22, conv:1.1, mg:.08, gens:[
      {y:[2024], g:'Gen 1', t:[['STD',62900,'P','1.5L I4',112,'CVT','FWD']]},
      {y:[2025,2026], g:'Gen 2', t:[['LUX',79900,'P','1.5L I4',108,'CVT','FWD'],['Hybrid+',89900,'H','1.5L I4 Hybrid',194,'e-DHT','FWD']]}]},
    {m:'MG ZS EV', body:'Crossover', style:'crossover', vol:.8, dts:48, conv:.75, mg:.07, gens:[
      {y:[2024,2025], g:'Gen 1', t:[['LUX',109900,'E','Electric motor 51 kWh',174,'1-speed','FWD']]}]},
    {m:'MG RX5', body:'SUV', style:'suv', vol:4, dts:26, conv:1.0, mg:.085, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['STD',74900,'P','1.5L Turbo I4',170,'7DCT','FWD'],['LUX',84900,'P','1.5L Turbo I4',170,'7DCT','FWD']]}]},
    {m:'MG HS', body:'SUV', style:'suv', vol:4, dts:25, conv:1.0, mg:.085, gens:[
      {y:[2024], g:'Gen 1', t:[['STD',84900,'P','1.5L Turbo I4',160,'7DCT','FWD']]},
      {y:[2025,2026], g:'Gen 2', t:[['LUX',99900,'P','1.5L Turbo I4',170,'7DCT','FWD'],['Trophy',109900,'P','2.0L Turbo I4',231,'7DCT','FWD']]}]},
    {m:'MG 7', body:'Sedan', style:'sedan', vol:2.5, dts:30, conv:.95, mg:.09, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['LUX',104900,'P','2.0L Turbo I4',231,'9AT','FWD'],['Trophy',119900,'P','2.0L Turbo I4',261,'9AT','FWD']]}]},
    {m:'MG Whale', body:'Crossover', style:'crossover', vol:2, dts:32, conv:.9, mg:.085, gens:[
      {y:[2025,2026], g:'Gen 1', t:[['LUX',94900,'P','1.5L Turbo I4',181,'7DCT','FWD']]}]}
  ],
  Geely: [
    {m:'Emgrand', body:'Sedan', style:'compactSedan', vol:7, dts:22, conv:1.1, mg:.085, gens:[
      {y:[2024,2025,2026], g:'SS11', t:[['GS',59900,'P','1.5L I4',121,'CVT','FWD'],['GL',66900,'P','1.5L I4',121,'CVT','FWD']]}]},
    {m:'Coolray', body:'Crossover', style:'crossover', vol:6, dts:23, conv:1.05, mg:.09, gens:[
      {y:[2024], g:'SX11', t:[['Sport',79900,'P','1.5L Turbo I3',174,'7DCT','FWD']]},
      {y:[2025,2026], g:'SX11 Gen 2', t:[['Flagship',89900,'P','1.5L Turbo I4',181,'7DCT','FWD']]}]},
    {m:'Monjaro', body:'SUV', style:'suv', vol:4, dts:26, conv:1.0, mg:.095, gens:[
      {y:[2024,2025,2026], g:'KX11', t:[['Flagship',139900,'P','2.0L Turbo I4',238,'8AT','AWD'],['Ultimate',154900,'P','2.0L Turbo I4',238,'8AT','AWD']]}]},
    {m:'Okavango', body:'SUV', style:'suv', vol:3, dts:28, conv:.95, mg:.09, gens:[
      {y:[2024,2025,2026], g:'VX11', t:[['GF',99900,'P','1.5L Turbo I3',177,'7DCT','FWD'],['GS',109900,'P','1.5L Turbo I3',177,'7DCT','FWD']]}]},
    {m:'Starray', body:'SUV', style:'suv', vol:3, dts:27, conv:1.0, mg:.09, gens:[
      {y:[2025,2026], g:'FX11', t:[['Flagship',109900,'P','2.0L Turbo I4',218,'7DCT','FWD'],['Ultimate',119900,'P','2.0L Turbo I4',218,'7DCT','AWD']]}]},
    {m:'Preface', body:'Sedan', style:'sedan', vol:2.5, dts:30, conv:.95, mg:.09, gens:[
      {y:[2024,2025,2026], g:'FS11', t:[['GF',84900,'P','2.0L Turbo I4',218,'7DCT','FWD'],['Flagship',94900,'P','2.0L Turbo I4',218,'7DCT','FWD']]}]}
  ],
  Changan: [
    {m:'Alsvin', body:'Sedan', style:'compactSedan', vol:8, dts:21, conv:1.1, mg:.085, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['Comfort',49900,'P','1.5L I4',107,'7DCT','FWD'],['Luxury',55900,'P','1.5L I4',107,'7DCT','FWD']]}]},
    {m:'Eado Plus', body:'Sedan', style:'sedan', vol:3, dts:27, conv:1.0, mg:.085, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['Comfort',64900,'P','1.4L Turbo I4',158,'7DCT','FWD'],['Luxury',71900,'P','1.4L Turbo I4',158,'7DCT','FWD']]}]},
    {m:'CS35 Plus', body:'Crossover', style:'crossover', vol:5, dts:24, conv:1.05, mg:.09, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['Comfort',69900,'P','1.4L Turbo I4',158,'7DCT','FWD'],['Luxury',76900,'P','1.4L Turbo I4',158,'7DCT','FWD']]}]},
    {m:'CS55 Plus', body:'Crossover', style:'crossover', vol:4, dts:25, conv:1.0, mg:.09, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['Luxury',84900,'P','1.5L Turbo I4',178,'7DCT','FWD'],['Flagship',92900,'P','1.5L Turbo I4',178,'7DCT','FWD']]}]},
    {m:'CS75 Plus', body:'SUV', style:'suv', vol:4, dts:26, conv:1.0, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 3', t:[['Luxury',99900,'P','1.5L Turbo I4',178,'8AT','FWD'],['Flagship',109900,'P','2.0L Turbo I4',233,'8AT','FWD']]}]},
    {m:'UNI-T', body:'Crossover', style:'crossover', vol:3, dts:27, conv:.95, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Luxury',99900,'P','1.5L Turbo I4',178,'7DCT','FWD'],['Flagship',109900,'P','1.5L Turbo I4',178,'7DCT','FWD']]}]},
    {m:'UNI-K', body:'SUV', style:'suv', vol:2.5, dts:30, conv:.95, mg:.1, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Luxury',124900,'P','2.0L Turbo I4',233,'8AT','FWD'],['Flagship',139900,'P','2.0L Turbo I4',233,'8AT','AWD']]}]},
    {m:'UNI-V', body:'Sedan', style:'sedan', vol:2, dts:31, conv:.9, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Luxury',99900,'P','1.5L Turbo I4',178,'7DCT','FWD'],['Flagship',109900,'P','1.5L Turbo I4',178,'7DCT','FWD']]}]},
    {m:'Hunter', body:'Pickup', style:'pickup', vol:2, dts:30, conv:.95, mg:.085, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Double Cab 2.0T',89900,'P','2.0L Turbo I4',231,'8AT','RWD'],['Double Cab 4WD',99900,'P','2.0L Turbo I4',231,'8AT','4WD']]}]}
  ],
  Jetour: [
    {m:'X50', body:'Crossover', style:'crossover', vol:4, dts:24, conv:1.05, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Luxury',69900,'P','1.5L Turbo I4',154,'7DCT','FWD']]}]},
    {m:'X70', body:'SUV', style:'suv', vol:4, dts:24, conv:1.05, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Luxury',79900,'P','1.5L Turbo I4',154,'6DCT','FWD']]}]},
    {m:'X70 Plus', body:'SUV', style:'suv', vol:4, dts:25, conv:1.0, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Luxury',89900,'P','1.6L Turbo I4',194,'7DCT','FWD'],['Flagship',96900,'P','1.6L Turbo I4',194,'7DCT','FWD']]}]},
    {m:'X90', body:'SUV', style:'largeSUV', vol:2, dts:30, conv:.95, mg:.095, gens:[
      {y:[2024,2025], g:'Gen 1', t:[['Luxury',99900,'P','1.6L Turbo I4',194,'7DCT','FWD']]}]},
    {m:'X90 Plus', body:'SUV', style:'largeSUV', vol:2.5, dts:29, conv:.95, mg:.1, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Flagship',114900,'P','2.0L Turbo I4',251,'7DCT','FWD']]}]},
    {m:'Dashing', body:'Crossover', style:'crossover', vol:3, dts:27, conv:1.0, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Luxury',89900,'P','1.6L Turbo I4',194,'7DCT','FWD'],['Flagship',99900,'P','1.6L Turbo I4',194,'7DCT','FWD']]}]},
    {m:'T2', body:'SUV', style:'boxy', vol:3, dts:22, conv:1.1, mg:.1, gens:[
      {y:[2025,2026], g:'Gen 1', t:[['Luxury',129900,'P','2.0L Turbo I4',251,'7DCT','4WD'],['Flagship',144900,'P','2.0L Turbo I4',251,'7DCT','4WD']]}]}
  ],
  GAC: [
    {m:'GS3', body:'Crossover', style:'crossover', vol:3, dts:26, conv:1.0, mg:.09, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['GL',69900,'P','1.5L Turbo I4',168,'7DCT','FWD'],['GE',76900,'P','1.5L Turbo I4',168,'7DCT','FWD']]}]},
    {m:'GS4', body:'SUV', style:'suv', vol:3, dts:27, conv:1.0, mg:.09, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['GL',84900,'P','1.5L Turbo I4',175,'7DCT','FWD'],['GE',94900,'P','1.5L Turbo I4',175,'7DCT','FWD']]}]},
    {m:'GS8', body:'SUV', style:'largeSUV', vol:2, dts:30, conv:.95, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['GL',139900,'P','2.0L Turbo I4',248,'8AT','FWD'],['GT',159900,'P','2.0L Turbo I4',248,'8AT','AWD']]}]},
    {m:'Empow', body:'Sedan', style:'sedan', vol:1.5, dts:32, conv:.9, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['R-Style',99900,'P','2.0L Turbo I4',248,'7DCT','FWD']]}]},
    {m:'Emkoo', body:'SUV', style:'suv', vol:2, dts:29, conv:.95, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['GL',109900,'P','2.0L Turbo I4',248,'7DCT','FWD'],['GT',119900,'P','2.0L Turbo I4',248,'7DCT','FWD']]}]},
    {m:'M8', body:'MPV', style:'mpv', vol:1.5, dts:34, conv:.9, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['GL',149900,'P','2.0L Turbo I4',248,'8AT','FWD'],['Master',189900,'H','2.0L Turbo Hybrid',365,'e-CVT','FWD']]}]}
  ],
  Haval: [
    {m:'Jolion', body:'Crossover', style:'crossover', vol:5, dts:24, conv:1.05, mg:.09, gens:[
      {y:[2024,2025,2026], g:'A01', t:[['Active',69900,'P','1.5L Turbo I4',148,'7DCT','FWD'],['Supreme',79900,'P','1.5L Turbo I4',148,'7DCT','FWD']]}]},
    {m:'H6', body:'SUV', style:'suv', vol:5, dts:24, conv:1.05, mg:.09, gens:[
      {y:[2024,2025,2026], g:'Gen 3', t:[['Active',89900,'P','1.5L Turbo I4',181,'7DCT','FWD'],['Supreme',99900,'P','2.0L Turbo I4',208,'7DCT','AWD']]}]},
    {m:'H6 HEV', body:'SUV', style:'suv', vol:2, dts:28, conv:.95, mg:.09, gens:[
      {y:[2024,2025,2026], g:'Gen 3', t:[['Supreme',114900,'H','1.5L Turbo Hybrid',240,'DHT','FWD']]}]},
    {m:'H9', body:'SUV', style:'boxy', vol:2, dts:28, conv:.95, mg:.095, gens:[
      {y:[2024], g:'Gen 1', t:[['Supreme',139900,'P','2.0L Turbo I4',224,'8AT','4WD']]},
      {y:[2025,2026], g:'Gen 2', t:[['Supreme',149900,'P','2.0L Turbo I4',218,'8AT','4WD']]}]},
    {m:'Dargo', body:'SUV', style:'boxy', vol:2.5, dts:26, conv:1.0, mg:.095, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Active',99900,'P','2.0L Turbo I4',208,'7DCT','FWD'],['Supreme',109900,'P','2.0L Turbo I4',208,'7DCT','AWD']]}]}
  ],
  BYD: [
    {m:'Atto 3', body:'Crossover', style:'crossover', vol:1.5, dts:38, conv:.85, mg:.08, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Standard',139900,'E','Electric motor 50 kWh',201,'1-speed','FWD'],['Extended',149900,'E','Electric motor 60 kWh',201,'1-speed','FWD']]}]},
    {m:'Seal', body:'Sedan', style:'sedan', vol:1, dts:42, conv:.8, mg:.085, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Premium',179900,'E','Electric motor 82 kWh',308,'1-speed','RWD'],['Performance AWD',199900,'E','Dual electric motors 82 kWh',523,'1-speed','AWD']]}]},
    {m:'Song Plus', body:'SUV', style:'suv', vol:1.2, dts:36, conv:.85, mg:.08, gens:[
      {y:[2025,2026], g:'DM-i', t:[['Flagship',129900,'PH','1.5L Plug-in Hybrid',215,'e-CVT','FWD']]}]},
    {m:'Han', body:'Sedan', style:'sedan', vol:.6, dts:46, conv:.75, mg:.085, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['EV',199900,'E','Dual electric motors 85 kWh',510,'1-speed','AWD']]}]},
    {m:'Tang', body:'SUV', style:'largeSUV', vol:.6, dts:48, conv:.75, mg:.085, gens:[
      {y:[2024,2025,2026], g:'Gen 2', t:[['EV AWD',229900,'E','Dual electric motors 108 kWh',509,'1-speed','AWD']]}]},
    {m:'Dolphin', body:'Hatchback', style:'hatch', vol:1, dts:40, conv:.8, mg:.08, gens:[
      {y:[2024,2025,2026], g:'Gen 1', t:[['Standard',99900,'E','Electric motor 44.9 kWh',94,'1-speed','FWD']]}]},
    {m:'Qin Plus', body:'Sedan', style:'sedan', vol:1.2, dts:34, conv:.9, mg:.08, gens:[
      {y:[2025,2026], g:'DM-i', t:[['Flagship',89900,'PH','1.5L Plug-in Hybrid',178,'e-CVT','FWD']]}]}
  ]};

  const PT = {P:'Petrol', H:'Hybrid', PH:'Plug-in Hybrid', E:'Full Electric'};
  const priceSegment = p => p < 90000 ? 'Economy' : p < 180000 ? 'Mainstream' : p < 350000 ? 'Premium' : 'Luxury';
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  const TRIMS = [];
  for(const [brand, models] of Object.entries(C)){
    const B = window.BRANDS.find(b=>b.name===brand);
    for(const md of models){
      for(const gen of md.gens){
        const latest = Math.max(...gen.y);
        for(const y of gen.y){
          const f = Math.pow(0.97, latest - y);
          for(const [trim,msrp,pt,engine,hp,transmission,drivetrain] of gen.t){
            const price = Math.round(msrp*f/100)*100;
            TRIMS.push({
              trimId: slug(`${brand}-${md.m}-${y}-${trim}`), modelKey: slug(`${brand}-${md.m}`),
              brand, brandId:B.id, distributorId:B.distributor,
              model:md.m, generation:gen.g, year:y, trim,
              bodyType:md.body, powertrain:PT[pt], fuelType:PT[pt], engine, hp, transmission, drivetrain,
              msrp:price, priceSegment:priceSegment(price),
              asset:{ image:null, model3d:null, studioStyle:md.style, sourceUrl:null, license:null,
                      note:'No licensed image or 3D asset — body-type studio representation only' },
              _demo:{ baseMargin:md.mg, mix:1/gen.t.length, vol:md.vol, dts:md.dts, conv:md.conv }
            });
          }
        }
      }
    }
  }

  const COLORS = [
    {id:'white',  name:'Pearl White',    ar:'أبيض لؤلؤي',   hex:'#ECEAE4', paint:'#e9e7e1', prem:0,    w:.38},
    {id:'silver', name:'Silver Metallic',ar:'فضي',          hex:'#B9BCC1', paint:'#a9adb3', prem:0,    w:.16},
    {id:'black',  name:'Black',          ar:'أسود',         hex:'#0E0F11', paint:'#0b0c0e', prem:1500, w:.14},
    {id:'grey',   name:'Graphite Grey',  ar:'رمادي',        hex:'#4A4D52', paint:'#3d4045', prem:1500, w:.12},
    {id:'sand',   name:'Desert Beige',   ar:'بيج',          hex:'#C8B79A', paint:'#bda985', prem:1500, w:.10},
    {id:'blue',   name:'Deep Blue',      ar:'أزرق داكن',    hex:'#1C2A44', paint:'#14223d', prem:1500, w:.05},
    {id:'red',    name:'Red',            ar:'أحمر',         hex:'#8E1B1E', paint:'#7d1417', prem:1500, w:.05}
  ];
  const INTERIORS = [
    {id:'black', name:'Black', ar:'أسود', hex:'#1b1b1c', prem:0},
    {id:'beige', name:'Beige', ar:'بيج',  hex:'#D9C7A7', prem:0},
    {id:'brown', name:'Brown', ar:'بني',  hex:'#7A4E2F', prem:2500}
  ];

  window.CATALOG_REFERENCE = { trims:TRIMS, colors:COLORS, interiors:INTERIORS, modelYears:[2024,2025,2026],
    bodyTypes:['Sedan','SUV','Crossover','Pickup','MPV','Hatchback','Sports Car'],
    powertrains:['Petrol','Hybrid','Plug-in Hybrid','Full Electric'],
    priceSegments:['Economy','Mainstream','Premium','Luxury'],
    dataClass:'demo', note:'Demo catalog — realistic Saudi-market structure; prices/specs indicative, verify before production.' };
})();
