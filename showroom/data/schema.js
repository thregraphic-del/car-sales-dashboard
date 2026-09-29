/* =====================================================================
   DATA SCHEMA — the contract between the dashboard and its data source.
   ---------------------------------------------------------------------
   Demo data (data/demo-generator.js) and production data (API / DB export)
   must both produce exactly these tables. DataSource validates required
   fields on load and reports problems in DB.meta.validation.

   Dates are ISO strings 'YYYY-MM-DD'. Money is SAR (number, VAT incl.).
   Enumerations are listed so the UI can label them; unknown values are
   still accepted and shown as-is.
   ===================================================================== */
window.DATA_SCHEMA = {
  version: '1.0.0',
  enums: {
    vehicleStatus: ['Available','Reserved','In Transit','Sold','Delivered'],
    leadSource: ['Website','Google','Instagram','TikTok','Snapchat','WhatsApp','Facebook','Marketplace','Walk-in','Phone','Referral','Campaign','Other'],
    customerType: ['Individual','Family','Executive','Fleet','Corporate','Government'],
    bodyType: ['Sedan','SUV','Crossover','Pickup','MPV','Hatchback','Sports Car'],
    powertrain: ['Petrol','Hybrid','Plug-in Hybrid','Full Electric'],
    priceSegment: ['Economy','Mainstream','Premium','Luxury'],
    paymentStatus: ['Paid','Not Yet Due','Overdue','90+ Days Overdue'],
    paymentMethod: ['Cash','Bank Transfer','Finance','Mixed'],
    paymentType: ['Cash','Transfer','Down Payment','Installment','Balance'],
    deliveryStatus: ['Delivered','Scheduled'],
    leadStatus: ['Won','Open','Lost']
  },
  tables: {
    branches:    { key:'branchId', required:['branchId','name'],
                   fields:{branchId:'string', name:'string', city:'string', region:'string'} },
    brands:      { key:'id', required:['id','name'],
                   fields:{id:'string', name:'string', ar:'string', origin:'string', logo:'embedded mark id|null', logoFile:'path|null', distributor:'distributor id'} },
    distributors:{ key:'id', required:['id','name'],
                   fields:{id:'string', name:'string', ar:'string', brands:'string[]', confidence:'reported|verified|unassigned', note:'string'} },
    salespeople: { key:'salespersonId', required:['salespersonId','name','branchId'],
                   fields:{salespersonId:'string', name:'string', branchId:'string'} },
    trims:       { key:'trimId', required:['trimId','brand','model','year','trim','msrp'],
                   fields:{trimId:'string', brand:'string', brandId:'string', distributorId:'string', model:'string', generation:'string', year:'number', trim:'string',
                           bodyType:'enum:bodyType', powertrain:'enum:powertrain', priceSegment:'enum:priceSegment', engine:'string', transmission:'string', drivetrain:'string',
                           hp:'number', msrp:'number',
                           asset:'{image, model3d, sourceUrl, license, note}'} },
    vehicles:    { key:'vehicleId', required:['vehicleId','trimId','branchId','arrivalDate','purchaseCost','listPrice','status'],
                   fields:{vehicleId:'string', vin:'string', trimId:'string', distributorId:'string', exteriorColor:'string', interiorColor:'string', branchId:'string',
                           arrivalDate:'date (ETA if In Transit)', purchaseCost:'number (dealer cost)', listPrice:'number (current price)', status:'enum:vehicleStatus',
                           soldDate:'date|null', saleId:'string|null', reservedLeadId:'string|null', reservationDate:'date|null',
                           transferFrom:'branchId|null', transferDate:'date|null'} },
    customers:   { key:'customerId', required:['customerId','name','type'],
                   fields:{customerId:'string', name:'string', type:'enum:customerType', city:'string', region:'string'} },
    campaigns:   { key:'campaignId', required:['campaignId','name'],
                   fields:{campaignId:'string', name:'string', sources:'string[]', start:'date', end:'date', alwaysOn:'boolean'} },
    marketingSpend: { key:null, required:['month','source','amount'],
                   fields:{month:'YYYY-MM', source:'enum:leadSource', campaignId:'string|null', amount:'number'} },
    leads:       { key:'leadId', required:['leadId','date','source','branchId'],
                   fields:{leadId:'string', date:'date', source:'enum:leadSource', campaignId:'string|null', branchId:'string',
                           trimId:'string (vehicle of interest)', customerId:'string', salespersonId:'string',
                           qualified:'boolean', qualifiedDate:'date|null', testDriveDate:'date|null', offerDate:'date|null',
                           reservationDate:'date|null', saleId:'string|null', status:'enum:leadStatus', nextAction:'string|null', lostReason:'string|null'} },
    sales:       { key:'saleId', required:['saleId','date','vehicleId','branchId','sellingPrice','cost'],
                   fields:{saleId:'string', date:'date', vehicleId:'string', trimId:'string', leadId:'string|null', customerId:'string',
                           salespersonId:'string', branchId:'string', source:'enum:leadSource', campaignId:'string|null', customerType:'enum:customerType',
                           msrp:'number', optionsPrice:'number', listPrice:'number', sellingPrice:'number', discount:'number', cost:'number',
                           financeIncome:'number', otherIncome:'number', acquisitionCost:'number',
                           paymentMethod:'enum:paymentMethod', cashAmount:'number', financedAmount:'number', downPayment:'number',
                           installmentAmount:'number', installments:'number', financeCharge:'number',
                           deliveryStatus:'enum:deliveryStatus', deliveryDate:'date|null'} },
    payments:    { key:'paymentId', required:['paymentId','saleId','dueDate','amount'],
                   fields:{paymentId:'string', saleId:'string', type:'enum:paymentType', seq:'number', dueDate:'date', amount:'number',
                           paidDate:'date|null', paidAmount:'number'} }
  },
  // Flat "vehicle record" view requested by management — assembled by DataSource.vehicleRecord(vehicleId)
  vehicleRecordFields: ['Vehicle ID','VIN','Brand','Model','Generation','Year','Trim','Body Type','Price Segment','Powertrain','Engine','Transmission','Drive Type','Distributor',
    'Exterior Color','Interior Color','MSRP','Dealer Cost','Current Price','Selling Price','Discount','Gross Profit','Margin','Status','Stock','Reserved','Sold',
    'Days in Inventory','Average Days to Sell','Branch','Transferred From','Salesperson','Lead Source','Campaign','Customer Type','Payment Method',
    'Cash Amount','Financed Amount','Down Payment','Installment Amount','Outstanding Amount','Collection Status','Delivery Status',
    'Image','3D Asset','Source URL','Asset License / Source Metadata']
};
