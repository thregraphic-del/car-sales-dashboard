/* =====================================================================
   VEHICLE CATALOG — reference data (Brand → Model → Generation/Year → Trim)
   ---------------------------------------------------------------------
   Pure data. No UI code reads this file directly; everything goes through
   DataSource → DB.trims. To add a vehicle, add a trim (or a model) here:
   no dashboard code needs to change.

   Specifications and prices are REALISTIC DEMO VALUES (SAR, incl. VAT)
   for illustration only. Replace with the production catalog feed.

   Model-level demand parameters (vol, dts, conv) are used ONLY by the
   demo generator and are ignored in production mode.
   ===================================================================== */
(function(){
  // trim row: [trim, msrp2026, engine, fuelType, hp, torqueNm, transmission, drivetrain, accel0to100, topSpeed, efficiency, baseMargin, mixShare]
  const CATALOG = [
    {brand:'Range Rover', origin:'UK', wmi:'SAL', models:[
      {model:'Range Rover', generation:'L460', bodyType:'SUV', segment:'Luxury SUV', style:'luxurySUV', vol:9, dts:34, conv:1.0, trims:[
        ['SE', 575000,'3.0L Turbo I6 MHEV','Petrol MHEV',395,550,'8-Speed Automatic','AWD',5.9,234,'9.4 km/L',.235,.45],
        ['Autobiography', 685000,'4.4L Twin Turbo V8','Petrol',615,750,'8-Speed Automatic','AWD',4.6,250,'8.5 km/L',.252,.40],
        ['SV', 895000,'4.4L Twin Turbo V8','Petrol',606,750,'8-Speed Automatic','AWD',4.5,250,'8.3 km/L',.27,.15]]},
      {model:'Range Rover Sport', generation:'L461', bodyType:'SUV', segment:'Performance SUV', style:'sportSUV', vol:15, dts:29, conv:1.05, trims:[
        ['Dynamic SE', 480000,'3.0L Turbo I6 MHEV','Petrol MHEV',395,550,'8-Speed Automatic','AWD',5.9,242,'9.8 km/L',.22,.6],
        ['Autobiography', 585000,'4.4L Twin Turbo V8','Petrol',523,750,'8-Speed Automatic','AWD',4.5,250,'8.6 km/L',.235,.4]]},
      {model:'Velar', generation:'L560', bodyType:'SUV', segment:'Mid-size Luxury SUV', style:'sportSUV', vol:11, dts:42, conv:.85, trims:[
        ['S', 330000,'2.0L Turbo I4','Petrol',247,365,'8-Speed Automatic','AWD',7.5,217,'11.6 km/L',.19,.6],
        ['Dynamic HSE', 395000,'2.0L Turbo I4','Petrol',297,400,'8-Speed Automatic','AWD',6.6,234,'11.2 km/L',.205,.4]]},
      {model:'Evoque', generation:'L551', bodyType:'SUV', segment:'Compact Luxury SUV', style:'compactSUV', vol:13, dts:27, conv:1.1, trims:[
        ['S', 225000,'2.0L Turbo I4','Petrol',247,365,'9-Speed Automatic','AWD',7.6,230,'12.0 km/L',.17,.55],
        ['Dynamic SE', 255000,'2.0L Turbo I4','Petrol',247,365,'9-Speed Automatic','AWD',7.6,230,'11.8 km/L',.18,.45]]}
    ]},
    {brand:'Defender', origin:'UK', wmi:'SAL', models:[
      {model:'Defender 110', generation:'L663', bodyType:'SUV', segment:'Off-Road SUV', style:'boxy', vol:17, dts:24, conv:1.15, trims:[
        ['S', 360000,'2.0L Turbo I4','Petrol',296,400,'8-Speed Automatic','4WD',7.4,191,'10.4 km/L',.2,.35],
        ['X-Dynamic HSE', 425000,'3.0L Turbo I6 MHEV','Petrol MHEV',395,550,'8-Speed Automatic','4WD',6.1,209,'9.6 km/L',.215,.45],
        ['V8', 545000,'5.0L Supercharged V8','Petrol',518,625,'8-Speed Automatic','4WD',5.2,240,'6.9 km/L',.23,.2]]},
      {model:'Defender 130', generation:'L663', bodyType:'SUV', segment:'8-Seat Off-Road SUV', style:'boxyLong', vol:7, dts:31, conv:1.0, trims:[
        ['SE', 445000,'3.0L Turbo I6 MHEV','Petrol MHEV',395,550,'8-Speed Automatic','4WD',6.6,191,'9.3 km/L',.205,.6],
        ['Outbound', 495000,'3.0L Turbo I6 MHEV','Petrol MHEV',395,550,'8-Speed Automatic','4WD',6.6,191,'9.3 km/L',.21,.4]]}
    ]},
    {brand:'Mercedes-Benz', origin:'Germany', wmi:'W1N', models:[
      {model:'G-Class', generation:'W465', bodyType:'SUV', segment:'Luxury Off-Roader', style:'gclass', vol:9, dts:36, conv:.95, trims:[
        ['G 500', 690000,'3.0L Turbo I6 MHEV','Petrol MHEV',443,560,'9-Speed Automatic','AWD',5.4,210,'8.4 km/L',.235,.45],
        ['AMG G 63', 890000,'4.0L Twin Turbo V8','Petrol',577,850,'9-Speed Automatic','AWD',4.4,220,'6.9 km/L',.25,.55]]},
      {model:'S-Class', generation:'W223', bodyType:'Sedan', segment:'Flagship Sedan', style:'sedan', vol:9, dts:38, conv:.9, trims:[
        ['S 450 4MATIC', 520000,'3.0L Turbo I6 MHEV','Petrol MHEV',362,500,'9-Speed Automatic','AWD',5.1,250,'10.2 km/L',.2,.5],
        ['S 580 4MATIC', 640000,'4.0L Twin Turbo V8 MHEV','Petrol MHEV',496,700,'9-Speed Automatic','AWD',4.4,250,'9.1 km/L',.215,.5]]},
      {model:'GLE', generation:'V167', bodyType:'SUV', segment:'Luxury SUV', style:'sportSUV', vol:12, dts:30, conv:1.0, trims:[
        ['GLE 450 4MATIC', 395000,'3.0L Turbo I6 MHEV','Petrol MHEV',375,500,'9-Speed Automatic','AWD',5.6,250,'10.0 km/L',.175,.65],
        ['AMG GLE 53', 485000,'3.0L Turbo I6 MHEV','Petrol MHEV',429,560,'9-Speed Automatic','AWD',5.3,250,'9.3 km/L',.19,.35]]},
      {model:'EQS', generation:'V297', bodyType:'Sedan', segment:'Electric Sedan', style:'gt', vol:4, dts:55, conv:.7, trims:[
        ['EQS 580 4MATIC', 545000,'Dual Electric Motors','Electric',516,855,'Single-Speed','AWD',4.3,210,'19.6 kWh/100km',.125,1]]}
    ]},
    {brand:'BMW', origin:'Germany', wmi:'WBA', models:[
      {model:'X5', generation:'G05 LCI', bodyType:'SUV', segment:'Luxury SUV', style:'sportSUV', vol:16, dts:27, conv:1.05, trims:[
        ['xDrive40i', 375000,'3.0L Turbo I6 MHEV','Petrol MHEV',375,520,'8-Speed Steptronic','AWD',5.4,250,'10.9 km/L',.165,.7],
        ['M60i', 470000,'4.4L Twin Turbo V8 MHEV','Petrol MHEV',523,750,'8-Speed Steptronic','AWD',4.3,250,'8.7 km/L',.18,.3]]},
      {model:'X7', generation:'G07 LCI', bodyType:'SUV', segment:'Full-size Luxury SUV', style:'luxurySUV', vol:11, dts:31, conv:1.0, trims:[
        ['xDrive40i', 435000,'3.0L Turbo I6 MHEV','Petrol MHEV',375,520,'8-Speed Steptronic','AWD',5.8,250,'10.2 km/L',.16,.6],
        ['M60i', 545000,'4.4L Twin Turbo V8 MHEV','Petrol MHEV',523,750,'8-Speed Steptronic','AWD',4.7,250,'8.3 km/L',.175,.4]]},
      {model:'7 Series', generation:'G70', bodyType:'Sedan', segment:'Luxury Sedan', style:'sedan', vol:7, dts:37, conv:.9, trims:[
        ['740i', 480000,'3.0L Turbo I6 MHEV','Petrol MHEV',375,520,'8-Speed Steptronic','RWD',5.4,250,'11.2 km/L',.16,.7],
        ['760i xDrive', 610000,'4.4L Twin Turbo V8 MHEV','Petrol MHEV',536,750,'8-Speed Steptronic','AWD',4.2,250,'9.0 km/L',.17,.3]]},
      {model:'i7', generation:'G70', bodyType:'Sedan', segment:'Electric Luxury Sedan', style:'sedan', vol:3, dts:55, conv:.7, trims:[
        ['xDrive60', 580000,'Dual Electric Motors','Electric',536,745,'Single-Speed','AWD',4.7,240,'19.5 kWh/100km',.12,1]]}
    ]},
    {brand:'Audi', origin:'Germany', wmi:'WAU', models:[
      {model:'Q8', generation:'4M LCI', bodyType:'SUV', segment:'Luxury Coupé SUV', style:'sportSUV', vol:10, dts:44, conv:.82, trims:[
        ['55 TFSI quattro', 355000,'3.0L Turbo V6 MHEV','Petrol MHEV',335,500,'8-Speed Tiptronic','AWD',5.9,250,'9.4 km/L',.15,.7],
        ['SQ8', 465000,'4.0L Twin Turbo V8','Petrol',500,770,'8-Speed Tiptronic','AWD',4.1,250,'8.1 km/L',.165,.3]]},
      {model:'RS 6 Avant', generation:'C8', bodyType:'Wagon', segment:'Performance Avant', style:'wagon', vol:4, dts:33, conv:1.0, trims:[
        ['performance', 560000,'4.0L Twin Turbo V8','Petrol MHEV',621,850,'8-Speed Tiptronic','AWD',3.4,305,'8.0 km/L',.19,1]]},
      {model:'e-tron GT', generation:'J1', bodyType:'Sedan', segment:'Electric Gran Turismo', style:'gt', vol:3, dts:49, conv:.75, trims:[
        ['quattro', 470000,'Dual Electric Motors','Electric',469,630,'2-Speed Automatic','AWD',4.1,245,'21.1 kWh/100km',.13,.6],
        ['RS', 590000,'Dual Electric Motors','Electric',845,1027,'2-Speed Automatic','AWD',2.8,250,'21.8 kWh/100km',.135,.4]]}
    ]},
    {brand:'Porsche', origin:'Germany', wmi:'WP1', models:[
      {model:'Cayenne', generation:'E3 II', bodyType:'SUV', segment:'Performance SUV', style:'sportSUV', vol:13, dts:28, conv:1.08, trims:[
        ['Cayenne', 425000,'3.0L Turbo V6','Petrol',348,500,'8-Speed Tiptronic S','AWD',6.0,248,'9.2 km/L',.19,.5],
        ['Cayenne S', 520000,'4.0L Twin Turbo V8','Petrol',474,600,'8-Speed Tiptronic S','AWD',4.7,273,'8.4 km/L',.2,.35],
        ['Turbo E-Hybrid', 780000,'4.0L Twin Turbo V8 PHEV','Plug-in Hybrid',739,950,'8-Speed Tiptronic S','AWD',3.7,295,'11.2 km/L',.205,.15]]},
      {model:'911', generation:'992.2', bodyType:'Coupe', segment:'Sports Coupé', style:'coupe', vol:6, dts:25, conv:1.1, trims:[
        ['Carrera', 510000,'3.0L Twin Turbo Flat-6','Petrol',388,450,'8-Speed PDK','RWD',4.1,294,'9.6 km/L',.2,.35],
        ['Carrera GTS', 690000,'3.6L T-Hybrid Flat-6','Hybrid',532,610,'8-Speed PDK','RWD',3.0,312,'9.4 km/L',.215,.35],
        ['Turbo S', 1050000,'3.7L Twin Turbo Flat-6','Petrol',641,800,'8-Speed PDK','AWD',2.7,330,'8.3 km/L',.23,.3]]},
      {model:'Taycan', generation:'J1 II', bodyType:'Sedan', segment:'Electric Sports Sedan', style:'gt', vol:4, dts:46, conv:.8, trims:[
        ['4S', 495000,'Dual Electric Motors','Electric',536,710,'2-Speed Automatic','AWD',3.7,250,'20.4 kWh/100km',.135,1]]}
    ]},
    {brand:'Lexus', origin:'Japan', wmi:'JTJ', models:[
      {model:'LX', generation:'J310', bodyType:'SUV', segment:'Full-size Luxury SUV', style:'luxurySUV', vol:19, dts:22, conv:1.2, trims:[
        ['LX 600 Premier', 470000,'3.5L Twin Turbo V6','Petrol',409,650,'10-Speed Automatic','4WD',6.9,210,'7.9 km/L',.14,.6],
        ['LX 600 F Sport', 495000,'3.5L Twin Turbo V6','Petrol',409,650,'10-Speed Automatic','4WD',6.9,210,'7.9 km/L',.145,.4]]},
      {model:'LS', generation:'XF50', bodyType:'Sedan', segment:'Luxury Sedan', style:'sedan', vol:5, dts:40, conv:.85, trims:[
        ['LS 500 Luxury', 395000,'3.5L Twin Turbo V6','Petrol',416,600,'10-Speed Automatic','AWD',4.8,250,'10.0 km/L',.135,1]]}
    ]},
    {brand:'Toyota', origin:'Japan', wmi:'JTM', models:[
      {model:'Land Cruiser', generation:'J300', bodyType:'SUV', segment:'Full-size SUV', style:'luxurySUV', vol:30, dts:16, conv:1.35, trims:[
        ['GXR', 295000,'3.5L Twin Turbo V6','Petrol',409,650,'10-Speed Automatic','4WD',6.7,210,'8.2 km/L',.085,.55],
        ['VXR', 345000,'3.5L Twin Turbo V6','Petrol',409,650,'10-Speed Automatic','4WD',6.7,210,'8.2 km/L',.09,.45]]}
    ]},
    {brand:'Nissan', origin:'Japan', wmi:'JN8', models:[
      {model:'Patrol', generation:'Y63', bodyType:'SUV', segment:'Full-size SUV', style:'luxurySUV', vol:24, dts:19, conv:1.3, trims:[
        ['LE Platinum', 330000,'3.5L Twin Turbo V6','Petrol',425,700,'9-Speed Automatic','4WD',6.6,210,'8.0 km/L',.095,.7],
        ['Nismo', 420000,'3.5L Twin Turbo V6','Petrol',495,700,'9-Speed Automatic','4WD',5.9,210,'7.6 km/L',.11,.3]]}
    ]},
    {brand:'Genesis', origin:'South Korea', wmi:'KMU', models:[
      {model:'GV80', generation:'JX1', bodyType:'SUV', segment:'Luxury SUV', style:'sportSUV', vol:7, dts:39, conv:.9, trims:[
        ['3.5T Royal', 330000,'3.5L Twin Turbo V6','Petrol',375,530,'8-Speed Automatic','AWD',5.5,240,'9.0 km/L',.145,1]]},
      {model:'G90', generation:'RS4', bodyType:'Sedan', segment:'Flagship Sedan', style:'sedan', vol:3, dts:58, conv:.7, trims:[
        ['3.5T Royal', 415000,'3.5L Twin Turbo V6 MHEV','Petrol MHEV',409,550,'8-Speed Automatic','AWD',5.3,250,'9.2 km/L',.14,1]]}
    ]},
    {brand:'Cadillac', origin:'USA', wmi:'1GY', models:[
      {model:'Escalade', generation:'GMT1XX', bodyType:'SUV', segment:'Full-size Luxury SUV', style:'luxurySUV', vol:6, dts:47, conv:.8, trims:[
        ['Premium Luxury', 450000,'6.2L V8','Petrol',420,624,'10-Speed Automatic','4WD',6.1,180,'6.4 km/L',.15,.6],
        ['Sport Platinum', 545000,'6.2L V8','Petrol',420,624,'10-Speed Automatic','4WD',6.1,180,'6.4 km/L',.16,.4]]}
    ]}
  ];

  const MODEL_YEARS = [2025, 2026];   // generations on sale in the demo window
  const PREV_YEAR_PRICE_FACTOR = 0.97; // MY2025 list price relative to MY2026

  const COLORS = [
    {id:'black',  name:'Obsidian Black',  ar:'أسود أوبسيديان', hex:'#0E0F11', paint:'#0b0c0e', prem:0,    w:.29},
    {id:'white',  name:'Pearl White',     ar:'أبيض لؤلؤي',     hex:'#ECEAE4', paint:'#e9e7e1', prem:5600, w:.34},
    {id:'silver', name:'Silver',          ar:'فضي',            hex:'#B9BCC1', paint:'#a9adb3', prem:0,    w:.12},
    {id:'grey',   name:'Graphite Grey',   ar:'رمادي جرافيت',   hex:'#4A4D52', paint:'#3d4045', prem:3200, w:.09},
    {id:'blue',   name:'Deep Blue',       ar:'أزرق داكن',      hex:'#1C2A44', paint:'#14223d', prem:4200, w:.07},
    {id:'green',  name:'British Racing Green', ar:'أخضر بريطاني', hex:'#1F3A2C', paint:'#15301f', prem:9800, w:.04},
    {id:'sand',   name:'Desert Sand',     ar:'بيج صحراوي',     hex:'#C8B79A', paint:'#bda985', prem:3600, w:.05}
  ];
  const INTERIORS = [
    {id:'black', name:'Ebony', ar:'أسود', hex:'#1b1b1c', prem:0},
    {id:'tan',   name:'Tan',   ar:'بني', hex:'#A8744A', prem:6200},
    {id:'ivory', name:'Ivory', ar:'عاجي', hex:'#E6DCC6', prem:8400}
  ];

  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  // Flatten to one row per Brand/Model/Year/Trim — the unit the dashboard selects.
  const TRIMS = [];
  for(const b of CATALOG) for(const m of b.models) for(const y of MODEL_YEARS) for(const t of m.trims){
    const [trim,msrp,engine,fuelType,hp,torque,transmission,drivetrain,accel,topSpeed,efficiency,baseMargin,mix] = t;
    TRIMS.push({
      trimId: slug(`${b.brand}-${m.model}-${y}-${trim}`),
      modelKey: slug(`${b.brand}-${m.model}`),
      brand:b.brand, model:m.model, generation:m.generation, year:y, trim,
      bodyType:m.bodyType, segment:m.segment, fuelType, engine, transmission, drivetrain,
      hp, torque, accel, topSpeed, efficiency,
      msrp: y===2026 ? msrp : Math.round(msrp*PREV_YEAR_PRICE_FACTOR/500)*500,
      // 3D / media asset metadata. `model3d` may point at a licensed GLB/GLTF file.
      asset:{ image:null, model3d:null, studioStyle:m.style, sourceUrl:null, license:null,
              note:'No licensed 3D asset — procedural studio representation' },
      // demo-only generator parameters
      _demo:{ baseMargin, mix, vol:m.vol, dts:m.dts, conv:m.conv, wmi:b.wmi }
    });
  }

  window.CATALOG_REFERENCE = { brands:CATALOG, trims:TRIMS, colors:COLORS, interiors:INTERIORS, modelYears:MODEL_YEARS,
    dataClass:'demo', note:'Demo catalog — realistic, fictional pricing. Replace with production catalog feed.' };
})();
