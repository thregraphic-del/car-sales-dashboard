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
    vehicleStatus: ['Available','Reserved','Sold','In Service'],
    leadSource: ['Website','Google','Instagram','TikTok','Snapchat','WhatsApp','Facebook','Marketplace','Walk-in','Phone','Referral','Campaign','Other'],
    customerType: ['Individual','Corporate','Fleet','Government'],
    paymentMethod: ['Cash','Bank Transfer','Finance','Mixed'],
    paymentType: ['Cash','Transfer','Down Payment','Installment','Balance'],
    deliveryStatus: ['Delivered','Scheduled'],
    leadStatus: ['Won','Open','Lost']
  },
  tables: {
    branches:    { key:'branchId', required:['branchId','name'],
                   fields:{branchId:'string', name:'string', city:'string'} },
    salespeople: { key:'salespersonId', required:['salespersonId','name','branchId'],
                   fields:{salespersonId:'string', name:'string', branchId:'string'} },
    trims:       { key:'trimId', required:['trimId','brand','model','year','trim','msrp'],
                   fields:{trimId:'string', brand:'string', model:'string', generation:'string', year:'number', trim:'string',
                           bodyType:'string', segment:'string', fuelType:'string', engine:'string', transmission:'string', drivetrain:'string',
                           hp:'number', torque:'number', accel:'number', topSpeed:'number', efficiency:'string', msrp:'number',
                           asset:'{image, model3d, sourceUrl, license, note}'} },
    vehicles:    { key:'vehicleId', required:['vehicleId','trimId','branchId','arrivalDate','purchaseCost','listPrice','status'],
                   fields:{vehicleId:'string', vin:'string', trimId:'string', exteriorColor:'string', interiorColor:'string', branchId:'string',
                           arrivalDate:'date', purchaseCost:'number', listPrice:'number', status:'enum:vehicleStatus',
                           soldDate:'date|null', saleId:'string|null', reservedLeadId:'string|null'} },
    customers:   { key:'customerId', required:['customerId','name','type'],
                   fields:{customerId:'string', name:'string', type:'enum:customerType', city:'string'} },
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
  vehicleRecordFields: ['Vehicle ID','VIN','Brand','Model','Generation','Year','Trim','Body Type','Segment','Fuel Type','Engine','Transmission',
    'Exterior Color','Interior Color','MSRP','Selling Price','Discount','Cost','Gross Profit','Margin','Stock','Reserved','Sold',
    'Days in Inventory','Average Days to Sell','Branch','Salesperson','Lead Source','Campaign','Customer Type','Payment Method',
    'Cash Amount','Financed Amount','Down Payment','Installment Amount','Outstanding Amount','Collection Status','Delivery Status',
    'Image','3D Asset','Source URL','Asset License / Source Metadata']
};
