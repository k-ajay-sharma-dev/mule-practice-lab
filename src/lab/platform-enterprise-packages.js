// The enterprise estate of Brightmart in the open console: an ecommerce business with its supply chain, in 37 APIs over the
// three API-led layers. This file holds the definitions of the APIs and the Mule packages made from them. It imports only
// platform-log.js and platform-led.js, so platform-packages.js can load it without an import cycle.
// platform-enterprise.js turns the same definitions into Exchange assets, API instances and applications.
import { muleError, needs } from './platform-log.js'
import { BACKENDS } from './platform-led.js'

// The systems of record behind the System APIs. They join the backends of the lab, so the Backends page can stop one
// and Visualizer names them. Seven of them are systems of the Platform and systems tab: a call of the API client
// reaches that system (see REAL below). The others are stand ins that answer with the example of the route.
export const ENTERPRISE_BACKENDS = {
  erp: { name: 'SAP S/4HANA (HRP)', ms: 70 },
  crm: { name: 'Salesforce', ms: 50 },
  pim: { name: 'PIM', ms: 40 },
  oms: { name: 'Order management system', ms: 45 },
  psp: { name: 'Tidewater Pay (PSP)', ms: 160 },
  wms: { name: 'Warehouse management system', ms: 60 },
  carriers: { name: 'Carrier APIs', ms: 180 },
  posdb: { name: 'SQL Server brightmart-sql (POS)', ms: 35 },
  planning: { name: 'Snowflake', ms: 90 },
  loyalty: { name: 'Loyalty platform', ms: 55 },
  pricing: { name: 'Price and promotion engine', ms: 30 },
  commerce: { name: 'Commerce platform', ms: 40 },
  edi: { name: 'Anypoint Partner Manager', ms: 110 },
  notify: { name: 'Mail server and SMS gateway', ms: 80 },
  hr: { name: 'Workday', ms: 65 },
}
Object.assign(BACKENDS, ENTERPRISE_BACKENDS)

// The value each URI parameter has in the examples and in the sample request of the API client
export const SAMPLE = { orderId: 'O-2001', sku: 'H-100', customerId: 'C-7', cartId: 'K-55', poId: 'PO-7781', storeId: 'S-12', returnId: 'R-310', trackingId: 'BL-55102', releaseId: 'W-881', employeeId: 'E-140', paymentId: 'PAY-9001', promotionId: 'P-12', invoiceId: 'INV-6601', name: 'Mara Quinn' }

// route: method, path, example answer, calls [target app, method, path, 'fallback'?], status
const r = (m, p, out, calls = [], status) => ({ m, p, out, calls, status: status ?? (m === 'POST' ? 201 : 200) })
// backend: id, the property with its host, the value in Sandbox and Production, the secure property, the kind of connector
const be = (id, key, sbx, prd, secret, kind = 'http') => ({ id, key, sbx, prd, secret, kind })
// The value of the secure property that the backend accepts. The Production key of the carriers was rotated, and
// carriers-sys-api in Production still has the old one: that is the fault behind the carrier alert.
export const secretOf = (def, env) => `${def.backend.id}-${env === 'Production' ? 'prd' : 'sbx'}-2026`

const sys = (name, title, domain, team, who, backend, routes, extra = {}) => ({ name, title, layer: 'System', domain, team, who, backend, routes, ...extra })
const prc = (name, title, domain, team, who, routes, extra = {}) => ({ name, title, layer: 'Process', domain, team, who, routes, ...extra })
const exp = (name, title, domain, team, who, routes, extra = {}) => ({ name, title, layer: 'Experience', domain, team, who, routes, ...extra })

const PRODUCT = { sku: '{sku}', name: 'Brightmart Oat Milk 1L', category: 'Dairy alternatives' }

export const ESTATE = [
  // ---------- System layer ----------
  sys('products-sys-api', 'Products System API', 'Catalog', 'Catalog team', 'System layer over the PIM. Version 2 adds brand, images and attributes. Called by catalog-prc-api.', be('pim', 'pim.host', 'pim-test.brightmart.lab', 'pim.brightmart.lab', 'pim.token'), [
    r('GET', '/products/{sku}', { ...PRODUCT, brand: 'Brightmart', images: ['h-100.jpg'], attributes: { vegan: true } }),
    r('GET', '/products', { items: [{ sku: 'H-100' }, { sku: 'H-200' }], page: 1 }),
  ], { asset: 'products-sys-api', version: '2.0.1', apiVersion: 'v2', type: 'Product', build: '2.0.1', prd: [2, 0.2] }),
  sys('products-sys-api-v1', 'Products System API', 'Catalog', 'Catalog team', 'Version 1 of the Products System API over the PIM. store-ops-prc-api still calls it. Consumers move to v2 this quarter.', be('pim', 'pim.host', 'pim-test.brightmart.lab', 'pim.brightmart.lab', 'pim.token'), [
    r('GET', '/products/{sku}', PRODUCT),
  ], { asset: 'products-sys-api', version: '1.3.0', apiVersion: 'v1', type: 'Product', build: '1.3.0' }),
  sys('prices-sys-api', 'Prices System API', 'Pricing', 'Pricing team', 'System layer over the price engine. Called by catalog-prc-api.', be('pricing', 'price.engine.host', 'prices-test.brightmart.lab', 'prices.brightmart.lab', 'price.engine.token'), [
    r('GET', '/prices/{sku}', { sku: '{sku}', currency: 'EUR', list: 2.49, sale: 1.99 }),
    r('GET', '/price-lists', { lists: ['retail', 'b2b', 'staff'] }),
  ], { type: 'Price', build: '1.4.0' }),
  sys('promotions-sys-api', 'Promotions System API', 'Pricing', 'Pricing team', 'System layer over the promotion engine. Built ahead of cart-prc-api, which calls it from phase 3.', be('pricing', 'promo.engine.url', 'https://promo-test.brightmart.lab', 'https://promo.brightmart.lab', 'promo.engine.key'), [
    r('POST', '/promotions/evaluate', { cartId: 'K-55', discount: 0.5, codes: ['WINTER5'] }, [], 200),
    r('GET', '/promotions/{promotionId}', { promotionId: '{promotionId}', name: 'Winter five', percent: 5 }),
  ], { type: 'Promotion', build: '1.1.0' }),
  sys('carts-sys-api', 'Carts System API', 'Cart and checkout', 'Checkout team', 'Planned for phase 3. System layer over the commerce platform that keeps the carts. cart-prc-api will call it.', be('commerce', 'commerce.host', 'commerce-test.brightmart.lab', 'commerce.brightmart.lab', 'commerce.token'), [
    r('GET', '/carts/{cartId}', { cartId: '{cartId}', items: [{ sku: 'H-100', qty: 2 }], total: 3.98 }),
    r('POST', '/carts/{cartId}/items', { cartId: '{cartId}', items: 2 }),
  ], { type: 'Cart', build: '0.9.0', planned: true }),
  sys('orders-sys-api', 'Orders System API', 'Orders', 'Order Management team', 'System layer over the order management system. Called by orders-prc-api, shipments-prc-api, returns-prc-api and finance-prc-api.', be('oms', 'oms.host', 'oms-test.brightmart.lab', 'oms.brightmart.lab', 'oms.password'), [
    r('POST', '/orders', { orderId: 'O-2001', status: 'CREATED' }),
    r('GET', '/orders/{orderId}', { orderId: '{orderId}', status: 'SHIPPED', customerId: 'C-7', trackingId: 'BL-55102', total: 24.9 }),
  ], { type: 'Order', build: '2.3.0', prd: [2, 0.5] }),
  sys('payments-sys-api', 'Payments System API', 'Payments', 'Payments team', 'System layer over Tidewater Pay, the payment provider. Authorizes payments and sends refunds. Called by orders-prc-api and returns-prc-api.', be('psp', 'psp.url', 'https://sandbox.tidewaterpay.example', 'https://api.tidewaterpay.example', 'psp.api.key'), [
    r('POST', '/payments', { paymentId: 'PAY-9001', status: 'AUTHORIZED', amount: 24.9 }),
    r('GET', '/payments/{paymentId}', { paymentId: '{paymentId}', status: 'CAPTURED', amount: 24.9 }),
    r('POST', '/refunds', { refundId: 'RF-301', status: 'PENDING', amount: 3.98 }),
  ], { type: 'Payment', build: '1.8.2', prd: [2, 0.5] }),
  sys('customers-sys-api', 'Customers System API', 'Customers', 'Customer team', 'System layer over the Salesforce CRM. Reads the customer Account by its External ID Brightmart_Customer_Id__c. Version 2 adds the segment and the consent. Called by customers-prc-api and orders-prc-api.', be('crm', 'crm.host', 'crm-test.brightmart.lab', 'crm.brightmart.lab', 'crm.password', 'salesforce'), [
    r('GET', '/customers/{customerId}', { customerId: '{customerId}', name: 'Mara Quinn', email: 'mara.quinn@mail.example', segment: 'GOLD', consent: { email: true } }),
    r('GET', '/customers', { items: [{ customerId: 'C-7' }], page: 1 }),
  ], { asset: 'customers-sys-api', version: '2.2.0', apiVersion: 'v2', type: 'Customer', build: '2.2.0', prd: [2, 0.2] }),
  sys('customers-sys-api-v1', 'Customers System API', 'Customers', 'Customer team', 'Deprecated. Version 1 over the Salesforce CRM retires on 31 January 2027. Move to v2. returns-prc-api is the last consumer.', be('crm', 'crm.host', 'crm-test.brightmart.lab', 'crm.brightmart.lab', 'crm.password', 'salesforce'), [
    r('GET', '/customers/{customerId}', { id: '{customerId}', fullName: 'Mara Quinn', email: 'mara.quinn@mail.example' }),
  ], { asset: 'customers-sys-api', version: '1.6.0', apiVersion: 'v1', lifecycle: 'deprecated', type: 'Customer', build: '1.6.0' }),
  sys('loyalty-sys-api', 'Loyalty System API', 'Loyalty', 'Loyalty team', 'System layer over the loyalty platform. Called by customers-prc-api.', be('loyalty', 'loyalty.url', 'https://loyalty-test.brightmart.lab', 'https://loyalty.brightmart.lab', 'loyalty.token'), [
    r('GET', '/members/{customerId}', { customerId: '{customerId}', tier: 'Gold', points: 1280 }),
    r('POST', '/points', { customerId: 'C-7', added: 25 }),
  ], { type: 'Member', build: '1.0.4' }),
  sys('inventory-sys-api', 'Inventory System API', 'Inventory', 'Supply Chain team', 'System layer over the stock in SAP S/4HANA. Reads the availability with BAPI_MATERIAL_AVAILABILITY and reserves stock for an order with a sales order of the web shop. Called by availability-prc-api, orders-prc-api and replenishment-prc-api.', be('erp', 'erp.host', 'erp-qa.brightmart.lab', 'erp.brightmart.lab', 'erp.password', 'sap'), [
    r('GET', '/stock/{sku}', { sku: '{sku}', dc: 'DUB-1', onHand: 340, reserved: 22 }),
    r('POST', '/reservations', { reservationId: 'RS-501', sku: 'H-100', qty: 2 }),
  ], { type: 'Stock', build: '3.1.0', prd: [2, 0.5] }),
  sys('warehouse-sys-api', 'Warehouse System API', 'Warehouse', 'Warehouse team', 'System layer over the WMS. Releases orders to pick, pack and ship, and books receipts. Called by orders-prc-api, returns-prc-api and purchasing-prc-api.', be('wms', 'wms.host', 'wms-test.brightmart.lab', 'wms.brightmart.lab', 'wms.password'), [
    r('POST', '/releases', { releaseId: 'W-881', wave: 'WV-14', status: 'RELEASED' }),
    r('GET', '/releases/{releaseId}', { releaseId: '{releaseId}', status: 'PACKED', packedAt: '2026-11-03T08:40:00Z' }),
    r('POST', '/receipts', { receiptId: 'RC-77', status: 'RECEIVED' }),
  ], { type: 'Release', build: '1.5.0' }),
  sys('carriers-sys-api', 'Carriers System API', 'Transport', 'Transport team', 'System layer over the carrier APIs of Bayline Logistics and Kestrel Parcel. Books labels and reads tracking. Called by orders-prc-api and shipments-prc-api.', be('carriers', 'carrier.url', 'https://sandbox.bayline.example/v3', 'https://api.bayline.example/v3', 'carrier.apikey'), [
    r('POST', '/labels', { trackingId: 'BL-55102', carrier: 'Bayline Logistics', labelUrl: 'https://labels.bayline.example/BL-55102.pdf' }),
    r('GET', '/tracking/{trackingId}', { trackingId: '{trackingId}', status: 'IN_TRANSIT', eta: '2026-11-05' }),
  ], { type: 'Shipment', build: '1.9.1' }),
  sys('purchase-orders-sys-api', 'Purchase Orders System API', 'Purchasing', 'Procurement team', 'System layer over purchasing in SAP S/4HANA. Creates purchase orders with BAPI_PO_CREATE1 and reads them with BAPI_PO_GETDETAIL1. Called by purchasing-prc-api.', be('erp', 'erp.host', 'erp-qa.brightmart.lab', 'erp.brightmart.lab', 'erp.password', 'sap'), [
    r('POST', '/purchase-orders', { poId: 'PO-7781', status: 'OPEN' }),
    r('GET', '/purchase-orders/{poId}', { poId: '{poId}', supplier: 'Northwind Supplies', status: 'CONFIRMED', lines: 3 }),
  ], { type: 'PurchaseOrder', build: '1.3.2' }),
  sys('edi-sys-api', 'EDI System API', 'Purchasing', 'Procurement team', 'System layer over Anypoint Partner Manager. Sends X12 850 purchase orders to Northwind Supplies over AS2 and reads their 855 acknowledgments and 856 ship notices. Called by purchasing-prc-api.', be('edi', 'edi.host', 'edi-test.brightmart.lab', 'edi.brightmart.lab', 'edi.as2.password'), [
    r('POST', '/documents/850', { poId: 'PO-7781', document: '850', status: 'SENT' }),
    r('GET', '/documents/855/{poId}', { poId: '{poId}', document: '855', status: 'ACCEPTED' }),
    r('POST', '/documents/856', { poId: 'PO-7781', document: '856', status: 'RECEIVED' }),
  ], { type: 'EdiDocument', build: '1.0.9' }),
  sys('planning-sys-api', 'Planning System API', 'Planning', 'Planning team', 'Planned for phase 3. System layer over the demand forecasts in Snowflake. Will give forecasts and replenishment proposals to replenishment-prc-api.', be('planning', 'planning.url', 'https://planning-test.brightmart.lab', 'https://planning.brightmart.lab', 'planning.token'), [
    r('GET', '/forecasts/{sku}', { sku: '{sku}', weeks: [120, 135, 128] }),
    r('GET', '/replenishment-proposals', { items: [{ sku: 'H-100', qty: 480, dc: 'DUB-1' }] }),
  ], { type: 'Forecast', build: '0.9.0', planned: true }),
  sys('pos-sys-api', 'POS System API', 'Stores', 'Store Systems team', 'System layer over the POS tables of the stores on SQL Server brightmart-sql. Called by availability-prc-api and store-ops-prc-api.', be('posdb', 'pos.db.host', 'posdb-test.brightmart.lab', 'posdb.brightmart.lab', 'pos.db.password', 'db'), [
    r('GET', '/stores/{storeId}/stock/{sku}', { storeId: '{storeId}', sku: '{sku}', onHand: 14 }),
    r('GET', '/stores/{storeId}/sales', { storeId: '{storeId}', date: '2026-11-03', tickets: 812, revenue: 14250 }),
  ], { type: 'StoreStock', build: '2.0.0' }),
  sys('invoices-sys-api', 'Invoices System API', 'Finance', 'Finance Systems team', 'Planned for phase 3. System layer over finance in SAP S/4HANA. Will create invoices, post them and send INVOIC IDocs for finance-prc-api.', be('erp', 'erp.host', 'erp-qa.brightmart.lab', 'erp.brightmart.lab', 'erp.password'), [
    r('POST', '/invoices', { invoiceId: 'INV-6601', status: 'CREATED' }),
    r('GET', '/invoices/{invoiceId}', { invoiceId: '{invoiceId}', total: 2490, status: 'OPEN' }),
    r('POST', '/postings', { document: '5100004411', status: 'POSTED' }),
  ], { type: 'Invoice', build: '0.9.0', planned: true }),
  sys('notifications-sys-api', 'Notifications System API', 'Notifications', 'Customer Comms team', 'System layer over the Brightmart mail server and the SMS gateway. Sends the customer mail from no-reply@brightmart.example over SMTP. Called by orders-prc-api, shipments-prc-api and returns-prc-api.', be('notify', 'mail.gateway.url', 'https://mail-test.brightmart.lab', 'https://mail.brightmart.lab', 'mail.gateway.token', 'email'), [
    r('POST', '/emails', { messageId: 'M-4411', status: 'QUEUED' }, [], 202),
    r('POST', '/sms', { messageId: 'M-4412', status: 'QUEUED' }, [], 202),
  ], { type: 'Message', build: '1.6.0' }),
  sys('employees-sys-api', 'Employees System API', 'Workforce', 'People Systems team', 'Planned for phase 3. System layer over Workday. Will give the workers and the rota of each store to store-ops-prc-api.', be('hr', 'hr.host', 'hr-test.brightmart.lab', 'hr.brightmart.lab', 'hr.password'), [
    r('GET', '/employees/{employeeId}', { employeeId: '{employeeId}', name: 'Ivo Brand', store: 'S-12', role: 'Shift lead' }),
    r('GET', '/stores/{storeId}/rota', { storeId: '{storeId}', date: '2026-11-03', shifts: 6 }),
  ], { type: 'Employee', build: '0.9.0', planned: true }),

  // ---------- Process layer ----------
  prc('catalog-prc-api', 'Catalog Process API', 'Catalog', 'Catalog team', 'Process layer. Joins product, price and availability. Called by web-shop-exp-api, mobile-app-exp-api and partner-b2b-exp-api.', [
    r('GET', '/products/{sku}', { sku: '{sku}', name: 'Brightmart Oat Milk 1L', price: 1.99, currency: 'EUR', available: true }, [['products-sys-api', 'GET', '/products/{sku}'], ['prices-sys-api', 'GET', '/prices/{sku}'], ['availability-prc-api', 'GET', '/availability/{sku}']]),
    r('GET', '/products', { items: [{ sku: 'H-100' }, { sku: 'H-200' }] }, [['products-sys-api', 'GET', '/products']]),
  ], { type: 'CatalogItem', build: '2.2.0', prd: [2, 0.5] }),
  prc('cart-prc-api', 'Cart Process API', 'Cart and checkout', 'Checkout team', 'Planned for phase 3. Process layer that keeps the cart and applies promotions. web-shop-exp-api will call it.', [
    r('GET', '/carts/{cartId}', { cartId: '{cartId}', total: 3.48, discount: 0.5 }, [['carts-sys-api', 'GET', '/carts/{cartId}'], ['promotions-sys-api', 'POST', '/promotions/evaluate']]),
    r('POST', '/carts/{cartId}/items', { cartId: '{cartId}', items: 2 }, [['carts-sys-api', 'POST', '/carts/{cartId}/items']]),
  ], { type: 'CartView', build: '0.9.0', planned: true }),
  prc('orders-prc-api', 'Orders Process API', 'Orders', 'Order Management team', 'Process layer. Runs checkout and the order to delivery flow: the customer from Salesforce, payment, stock reservation in SAP, order, warehouse release, carrier label and the customer mail. Called by web-shop-exp-api and partner-b2b-exp-api.', [
    r('POST', '/orders', { orderId: '{orderId}', status: 'CONFIRMED', trackingId: 'BL-55102' }, [['customers-sys-api', 'GET', '/customers/{customerId}'], ['payments-sys-api', 'POST', '/payments'], ['inventory-sys-api', 'POST', '/reservations'], ['orders-sys-api', 'POST', '/orders'], ['warehouse-sys-api', 'POST', '/releases'], ['carriers-sys-api', 'POST', '/labels'], ['notifications-sys-api', 'POST', '/emails']]),
    r('GET', '/orders/{orderId}', { orderId: '{orderId}', status: 'SHIPPED', total: 24.9 }, [['orders-sys-api', 'GET', '/orders/{orderId}']]),
  ], { type: 'OrderSummary', build: '3.2.0', prd: [3, 1] }),
  prc('customers-prc-api', 'Customers Process API', 'Customers', 'Customer team', 'Process layer. Joins the Salesforce profile and the loyalty account. Called by mobile-app-exp-api.', [
    r('GET', '/customers/{customerId}/profile', { customerId: '{customerId}', name: '{name}', tier: 'Gold', points: 1280 }, [['customers-sys-api', 'GET', '/customers/{customerId}'], ['loyalty-sys-api', 'GET', '/members/{customerId}']]),
  ], { type: 'Profile', build: '1.7.0' }),
  prc('availability-prc-api', 'Availability Process API', 'Inventory', 'Supply Chain team', 'Process layer. Available to promise over the distribution centers and the stores. Called by catalog-prc-api and store-tablet-exp-api.', [
    r('GET', '/availability/{sku}', { sku: '{sku}', atp: 332, dc: 318, stores: 14 }, [['inventory-sys-api', 'GET', '/stock/{sku}'], ['pos-sys-api', 'GET', '/stores/S-12/stock/{sku}']]),
  ], { type: 'Availability', build: '1.3.0', prd: [2, 0.2] }),
  prc('shipments-prc-api', 'Shipments Process API', 'Transport', 'Transport team', 'Process layer. Tracks shipments and tells the customer. When the carrier does not answer it answers with the order status only. Called by web-shop-exp-api and mobile-app-exp-api, and later by carrier-exp-api.', [
    r('GET', '/shipments/{orderId}', { orderId: '{orderId}', trackingId: 'BL-55102', status: 'IN_TRANSIT', eta: '2026-11-05' }, [['orders-sys-api', 'GET', '/orders/{orderId}'], ['carriers-sys-api', 'GET', '/tracking/BL-55102', 'fallback']]),
    r('POST', '/shipment-events', { received: true }, [['orders-sys-api', 'GET', '/orders/O-2001'], ['notifications-sys-api', 'POST', '/sms']], 202),
  ], { type: 'Tracking', build: '1.5.2', fallback: { status: 'TRACKING_UNAVAILABLE', eta: null } }),
  prc('returns-prc-api', 'Returns Process API', 'Returns', 'Returns team', 'Process layer for reverse logistics: the return, the receipt in the warehouse and the refund. Called by store-tablet-exp-api. It still calls customers-sys-api v1.', [
    r('POST', '/returns', { returnId: 'R-310', status: 'REFUND_PENDING' }, [['orders-sys-api', 'GET', '/orders/O-2001'], ['customers-sys-api-v1', 'GET', '/customers/C-7'], ['warehouse-sys-api', 'POST', '/receipts'], ['payments-sys-api', 'POST', '/refunds'], ['notifications-sys-api', 'POST', '/emails']]),
    r('GET', '/returns/{returnId}', { returnId: '{returnId}', orderId: 'O-2001', status: 'REFUNDED' }, [['orders-sys-api', 'GET', '/orders/O-2001'], ['customers-sys-api-v1', 'GET', '/customers/C-7']]),
  ], { type: 'Return', build: '1.3.0' }),
  prc('purchasing-prc-api', 'Purchasing Process API', 'Purchasing', 'Procurement team', 'Process layer. Purchase orders to suppliers with EDI 850, 855 and 856. Called by supplier-exp-api and replenishment-prc-api.', [
    r('GET', '/purchase-orders/{poId}', { poId: '{poId}', status: 'CONFIRMED', acknowledged: true }, [['purchase-orders-sys-api', 'GET', '/purchase-orders/{poId}'], ['edi-sys-api', 'GET', '/documents/855/{poId}']]),
    r('POST', '/purchase-orders', { poId: '{poId}', status: 'SENT' }, [['purchase-orders-sys-api', 'POST', '/purchase-orders'], ['edi-sys-api', 'POST', '/documents/850']]),
    r('POST', '/asn', { poId: 'PO-7781', asn: 'RECEIVED' }, [['edi-sys-api', 'POST', '/documents/856'], ['warehouse-sys-api', 'POST', '/receipts']]),
  ], { type: 'PurchaseOrderStatus', build: '1.2.4' }),
  prc('replenishment-prc-api', 'Replenishment Process API', 'Planning', 'Planning team', 'Planned for phase 3. Process layer. Will turn the proposals of the planning platform into purchase orders. Until then replenishment-nightly-job loads them every night.', [
    r('POST', '/replenishment-runs', { runId: 'RUN-88', purchaseOrders: 1 }, [['planning-sys-api', 'GET', '/replenishment-proposals'], ['inventory-sys-api', 'GET', '/stock/H-100'], ['purchasing-prc-api', 'POST', '/purchase-orders']]),
  ], { type: 'ReplenishmentRun', build: '0.9.0', planned: true }),
  prc('store-ops-prc-api', 'Store Operations Process API', 'Stores', 'Store Systems team', 'Process layer. The store dashboard with the sales and the top product. Called by store-tablet-exp-api. It still calls products-sys-api v1.', [
    r('GET', '/stores/{storeId}/dashboard', { storeId: '{storeId}', revenue: 14250, topProduct: 'H-100' }, [['pos-sys-api', 'GET', '/stores/{storeId}/sales'], ['products-sys-api-v1', 'GET', '/products/H-100']]),
  ], { type: 'StoreDashboard', build: '1.1.0' }),
  prc('finance-prc-api', 'Finance Process API', 'Finance', 'Finance Systems team', 'Planned for phase 3. Process layer for invoices and ERP postings. partner-b2b-exp-api will read B2B invoices through it.', [
    r('GET', '/invoices/{invoiceId}', { invoiceId: '{invoiceId}', total: 2490, status: 'OPEN' }, [['invoices-sys-api', 'GET', '/invoices/{invoiceId}']]),
    r('POST', '/invoices', { invoiceId: 'INV-6601', status: 'POSTED' }, [['orders-sys-api', 'GET', '/orders/O-2001'], ['invoices-sys-api', 'POST', '/invoices'], ['invoices-sys-api', 'POST', '/postings']]),
  ], { type: 'InvoiceView', build: '0.9.0', planned: true }),

  // ---------- Experience layer ----------
  exp('web-shop-exp-api', 'Web Shop Experience API', 'Web shop', 'Digital team', 'Experience layer for the Brightmart web shop. Called by the Brightmart Web Shop client.', [
    r('GET', '/products/{sku}', { sku: '{sku}', name: 'Brightmart Oat Milk 1L', price: 1.99, available: true }, [['catalog-prc-api', 'GET', '/products/{sku}']]),
    r('POST', '/checkout', { orderId: 'O-2001', status: 'CONFIRMED' }, [['orders-prc-api', 'POST', '/orders']]),
    r('GET', '/orders/{orderId}/tracking', { orderId: '{orderId}', status: 'IN_TRANSIT' }, [['shipments-prc-api', 'GET', '/shipments/{orderId}']]),
  ], { type: 'WebProduct', build: '4.0.2', prd: [3, 0.5] }),
  exp('mobile-app-exp-api', 'Mobile App Experience API', 'Mobile app', 'Digital team', 'Experience layer for the Brightmart mobile app. Short answers. Called by the Brightmart Mobile App client.', [
    r('GET', '/products/{sku}', { sku: '{sku}', name: 'Brightmart Oat Milk 1L', price: 1.99 }, [['catalog-prc-api', 'GET', '/products/{sku}']]),
    r('GET', '/me/{customerId}', { customerId: '{customerId}', tier: 'Gold', points: 1280 }, [['customers-prc-api', 'GET', '/customers/{customerId}/profile']]),
    r('GET', '/orders/{orderId}/tracking', { orderId: '{orderId}', status: 'IN_TRANSIT' }, [['shipments-prc-api', 'GET', '/shipments/{orderId}']]),
  ], { type: 'MobileProduct', build: '3.1.0', prd: [2, 0.5] }),
  exp('store-tablet-exp-api', 'Store Tablet Experience API', 'Stores', 'Store Systems team', 'Experience layer for the tablet of the store staff. Called by the Store Tablet client.', [
    r('GET', '/availability/{sku}', { sku: '{sku}', atp: 332 }, [['availability-prc-api', 'GET', '/availability/{sku}']]),
    r('POST', '/returns', { returnId: 'R-310', status: 'REFUND_PENDING' }, [['returns-prc-api', 'POST', '/returns']]),
    r('GET', '/returns/{returnId}', { returnId: '{returnId}', status: 'REFUNDED' }, [['returns-prc-api', 'GET', '/returns/{returnId}']]),
    r('GET', '/stores/{storeId}/dashboard', { storeId: '{storeId}', revenue: 14250 }, [['store-ops-prc-api', 'GET', '/stores/{storeId}/dashboard']]),
  ], { type: 'TabletView', build: '1.6.0' }),
  exp('partner-b2b-exp-api', 'Partner B2B Experience API', 'B2B', 'B2B team', 'Experience layer for wholesale customers. JWT and SLA tiers. Called by Driftwood Cafes and Pelican Wholesale. B2B invoices follow in phase 3.', [
    r('GET', '/catalog/{sku}', { sku: '{sku}', name: 'Brightmart Oat Milk 1L', price: 1.99 }, [['catalog-prc-api', 'GET', '/products/{sku}']]),
    r('POST', '/orders', { orderId: 'O-2001', status: 'CONFIRMED' }, [['orders-prc-api', 'POST', '/orders']]),
    r('GET', '/orders/{orderId}', { orderId: '{orderId}', status: 'SHIPPED' }, [['orders-prc-api', 'GET', '/orders/{orderId}']]),
  ], { type: 'PartnerOrder', build: '2.0.0', prd: [2, 0.2] }),
  exp('supplier-exp-api', 'Supplier Experience API', 'Purchasing', 'Procurement team', 'Experience layer for suppliers without EDI. They read purchase orders and send ship notices. JWT and SLA tiers. Called by Northwind Supplies and Marlow Paper Goods.', [
    r('GET', '/purchase-orders/{poId}', { poId: '{poId}', status: 'CONFIRMED' }, [['purchasing-prc-api', 'GET', '/purchase-orders/{poId}']]),
    r('POST', '/asn', { poId: 'PO-7781', asn: 'RECEIVED' }, [['purchasing-prc-api', 'POST', '/asn']]),
  ], { type: 'SupplierOrder', build: '1.2.0' }),
  exp('carrier-exp-api', 'Carrier Experience API', 'Transport', 'Transport team', 'Planned for phase 3. Experience layer where the carriers will post shipment events. Bayline Logistics and Kestrel Parcel will call it.', [
    r('POST', '/shipment-events', { received: true }, [['shipments-prc-api', 'POST', '/shipment-events']], 202),
  ], { type: 'ShipmentEvent', build: '0.9.0', planned: true }),
]
export const estateDef = (name) => ESTATE.find((d) => d.name === name)
// the property that holds the address of an app: orders-prc-api is called through orders-prc.url
export const urlKey = (name) => `${name.replace('-api', '')}.url`
// a planned API is designed and published in Exchange, and not deployed yet
export const DEPLOYED = ESTATE.filter((d) => !d.planned)
export const callsOf = (def) => [...new Set(def.routes.flatMap((x) => x.calls.map((c) => c[0])))]

const json = (value) => JSON.stringify(value)
const fill = (text, params) => text.replace(/\{(\w+)\}/g, (all, k) => params[k] ?? SAMPLE[k] ?? all)
const flowOf = (m, p) => `${m.toLowerCase()}:${p.replace(/\//g, '\\').replace(/\{(\w+)\}/g, '($1)')}`
// the pattern of each route, made once: every call of the console goes through match
const PATTERNS = new WeakMap()
const patternOf = (route) => {
  if (!PATTERNS.has(route)) {
    const names = []
    const re = new RegExp(`^${route.p.replace(/\{(\w+)\}/g, (_, k) => (names.push(k), '([\\w-]+)'))}$`)
    PATTERNS.set(route, { re, names })
  }
  return PATTERNS.get(route)
}
function match(routes, method, path) {
  for (const route of routes) {
    if (route.m !== method) continue
    const { re, names } = patternOf(route)
    const hit = path.match(re)
    if (hit) return { route, params: Object.fromEntries(names.map((k, i) => [k, hit[i + 1]])) }
  }
  return null
}
const OUTCOME = { 'HTTP:NOT_FOUND': 404, 'HTTP:TIMEOUT': 504, 'HTTP:GATEWAY_TIMEOUT': 504, 'HTTP:CONNECTIVITY': 503, 'HTTP:SERVICE_UNAVAILABLE': 503, 'HTTP:TOO_MANY_REQUESTS': 503, 'HTTP:INTERNAL_SERVER_ERROR': 502, 'HTTP:BAD_GATEWAY': 502 }
const configName = (name) => `${name.replace(/-api(-v\d)?$/, '').replace(/(^|-)(\w)/g, (_, d, c) => c.toUpperCase())}_Config`
// Lab simplification: a backend that keeps failing would fill the log, so the error block is written once in 12 hours.
// The Mule runtime writes it for every failed event.
const loggedLately = (ctx) => (ctx.app.logs ?? []).some((l) => l.level === 'ERROR' && l.t > ctx.now - 12 * 3600000)

// The connectors of the System APIs over the systems of the lab, with the error the connector raises when the backend
// is stopped on the Backends page or the host is wrong (down), or when the secure property is wrong (login)
const CONNECTOR = {
  salesforce: { type: 'SALESFORCE:CONNECTIVITY', op: { name: 'Query', dsl: '<salesforce:query doc:name="Query" config-ref="Salesforce_Config">' }, down: (host) => `java.net.UnknownHostException: ${host}`, login: 'INVALID_LOGIN: Invalid username, password, security token; or user locked out.' },
  sap: { type: 'SAP:CONNECTIVITY', op: { name: 'Execute BAPI', dsl: '<sap:execute-synchronous-remote-function-call doc:name="Execute BAPI" config-ref="SAP_Config">' }, down: (host) => `(102) JCO_ERROR_COMMUNICATION: Connect to SAP gateway failed. Connection parameters: TYPE=A ASHOST=${host} SYSNR=00. ERROR partner '${host}:3300' not reached`, login: '(103) JCO_ERROR_LOGON_FAILURE: Name or password is incorrect (repeat logon)' },
  email: { type: 'EMAIL:CONNECTIVITY', op: { name: 'Send', dsl: '<email:send doc:name="Send" config-ref="Email_SMTP">' }, down: (host) => `Error while sending email: Could not connect to SMTP host: ${host}, port: 587; nested exception is: java.net.ConnectException: Connection refused`, login: 'Error while sending email: 535 5.7.8 Error: authentication failed' },
}

function backendFault(ctx, def, flow) {
  const b = def.backend
  const env = ctx.app.env
  const host = ctx.props[b.key]
  const live = ctx.backend(b.id)
  const at = { flow, file: def.name, at: 1 }
  const own = CONNECTOR[b.kind]
  if (!live.up || host !== (env === 'Production' ? b.prd : b.sbx)) {
    if (b.kind === 'db') return { ...at, name: 'Select', dsl: '<db:select doc:name="Select" config-ref="Database_Config">', type: 'DB:CONNECTIVITY', message: `Cannot get connection for URL jdbc:sqlserver://${host}:1433: The TCP/IP connection to the host has failed.` }
    if (own) return { ...at, ...own.op, type: own.type, message: own.down(host) }
    return { ...at, name: `Call ${ENTERPRISE_BACKENDS[b.id].name}`, dsl: `<http:request method="GET" doc:name="Call backend" config-ref="${configName(def.name)}">`, type: 'HTTP:CONNECTIVITY', message: `HTTP request to '${host}' failed: Connection refused.` }
  }
  if (ctx.props[b.secret] !== secretOf(def, env) && own) return { ...at, ...own.op, type: own.type, message: own.login }
  if (ctx.props[b.secret] !== secretOf(def, env))
    return b.kind === 'db'
      ? { ...at, name: 'Select', dsl: '<db:select doc:name="Select" config-ref="Database_Config">', type: 'DB:CONNECTIVITY', message: `Login failed for user 'mule_${def.name.split('-')[0]}'.` }
      : { ...at, name: `Call ${ENTERPRISE_BACKENDS[b.id].name}`, dsl: `<http:request method="GET" doc:name="Call backend" config-ref="${configName(def.name)}">`, type: 'HTTP:UNAUTHORIZED', message: `HTTP GET on resource '${host}' failed: unauthorized (401). The API key is not valid or has expired.` }
  return null
}

// ---------- the systems of the lab behind the System APIs ----------

// Lab made: the backend property and the secure property of a System API stand for its connector configuration.
// When they are right, the connector logs on with the integration user of the system below. Sandbox apps use the
// Sandbox org of Salesforce; both environments share the one SAP system, mail server and SQL Server of the lab.
const SF = {
  Sandbox: { 'salesforce.auth': 'basic', 'salesforce.url': 'https://test.salesforce.com/services/Soap/u/61.0', 'salesforce.username': 'mule.integration@brightmart.example.uat', 'salesforce.password': 'Hrb-Int-Uat-26', 'salesforce.securityToken': 'labTokenUat4k9' },
  Production: { 'salesforce.auth': 'basic', 'salesforce.url': 'https://login.salesforce.com/services/Soap/u/61.0', 'salesforce.username': 'mule.integration@brightmart.example', 'salesforce.password': 'Hrb-Int-Prod-26', 'salesforce.securityToken': 'labTokenProd7x2' },
}
const SAP = { applicationServerHost: 'sap.brightmart.lab', systemNumber: '00', client: '100', username: 'MULE_RFC', password: 'Rfc-Brightmart-2611' }
const SMTP = { protocol: 'smtp', host: 'mail.brightmart.lab', port: '587', user: 'no-reply@brightmart.example', password: 'nrpl-mule-0b93', tls: true }
const POS_DB = 'brightmart-sql'
const POS = { user: 'mule_reports', password: 'Reports-Lab-2026', database: 'BrightmartOrders' }
const SHOP_CUSTOMER = '4711' // the sold to party of the web shop in SAP
const SUPPLIER = { partner: 'northwind', vendor: '300100', name: 'Northwind Supplies' }
// the message flows edi-sys-api needs in Partner Manager
const EDI_FLOWS = [
  { id: 'brightmart-850-out', name: 'Purchase order 850 to Northwind', partner: 'northwind', dir: 'outbound', type: '850', send: 'AS2', source: { kind: 'API', name: 'EDI System API', app: 'edi-sys-api' }, alerts: { rejected997: false, negativeMdn: false, to: '' }, ackWindowMin: null },
  { id: 'nw-855-in', name: 'Northwind 855 to EDI System API', partner: 'northwind', dir: 'inbound', type: '855', receive: 'AS2', validate: true, ack997: true, target: { kind: 'API', name: 'EDI System API', app: 'edi-sys-api', url: 'https://edi-sys-api.internal.brightmart.example/api/documents/855' }, alerts: { rejected997: false, negativeMdn: false, to: '' }, ackWindowMin: null },
]
// the POS tables of the stores, made by pos-sys-api on its first call
const POS_TABLES = {
  'dbo.pos_store_stock': { columns: [['store_id', 'varchar(8)'], ['sku', 'varchar(12)'], ['on_hand', 'int'], ['counted_at', 'datetime2', true]], pk: ['store_id', 'sku'], rows: [
    { store_id: 'S-12', sku: 'H-100', on_hand: 14, counted_at: '2026-11-03 06:00:00' },
    { store_id: 'S-12', sku: 'H-200', on_hand: 31, counted_at: '2026-11-03 06:00:00' },
    { store_id: 'S-14', sku: 'H-100', on_hand: 6, counted_at: '2026-11-03 06:00:00' },
  ] },
  'dbo.pos_daily_sales': { columns: [['store_id', 'varchar(8)'], ['sales_date', 'date'], ['tickets', 'int'], ['revenue', 'decimal(12,2)']], pk: ['store_id', 'sales_date'], rows: [
    { store_id: 'S-12', sales_date: '2026-11-03', tickets: 812, revenue: 14250 },
    { store_id: 'S-14', sales_date: '2026-11-03', tickets: 455, revenue: 7980 },
  ] },
}

const linesOf = (body, sku = 'H-100', qty = 2) => (Array.isArray(body.lines) && body.lines.length ? body.lines : [{ sku: body.sku ?? sku, qty: body.qty ?? qty }]).map((l) => ({ sku: String(l.sku ?? sku), qty: Number(l.qty ?? qty) }))
const sapError = (r) => (r.RETURN ?? []).find((x) => x.TYPE === 'E' || x.TYPE === 'A')
const notFound = (message) => ({ status: 404, out: { message } })
const failed = (r, op) => ({ fail: { type: r.type ?? r.errorType, message: r.error ?? r.text, ...op } })
const SF_OP = CONNECTOR.salesforce.op
const SAP_OP = CONNECTOR.sap.op

function customerOf(ctx, env, id) {
  const sf = ctx.salesforce.withConfig(SF[env])
  const a = sf.query(`SELECT Id, Name, Loyalty_Tier__c FROM Account WHERE Brightmart_Customer_Id__c = '${id}'`)
  if (!a.ok) return { error: a }
  const acc = a.records[0]
  if (!acc) return { none: true }
  const c = sf.query(`SELECT Email FROM Contact WHERE AccountId = '${acc.Id}'`)
  if (!c.ok) return { error: c }
  return { acc, email: c.records[0]?.Email ?? null }
}
const readCustomer = (shape) => ({ ctx, env, params }) => {
  const r = customerOf(ctx, env, params.customerId)
  if (r.error) return failed(r.error, SF_OP)
  if (r.none) return notFound(`No customer ${params.customerId} in Salesforce`)
  return { ms: 60, out: shape(params.customerId, r.acc, r.email) }
}

// Per System API and route: what a call of the API client does in the real system. It returns { out, status } to
// answer, { fail } for an error of the connector, or null to answer with the example, as when the record is part of
// the sample data and not in the system.
const REAL = {
  'customers-sys-api': {
    'GET /customers/{customerId}': readCustomer((id, acc, email) => ({ customerId: id, name: acc.Name, email, segment: String(acc.Loyalty_Tier__c ?? 'Standard').toUpperCase(), consent: { email: Boolean(email) }, salesforceId: acc.Id })),
    'GET /customers': ({ ctx, env }) => {
      const r = ctx.salesforce.withConfig(SF[env]).query('SELECT Brightmart_Customer_Id__c FROM Account')
      if (!r.ok) return failed(r, SF_OP)
      return { ms: 40, out: { items: r.records.map((x) => x.Brightmart_Customer_Id__c).filter((x) => /^C-/.test(x ?? '')).map((customerId) => ({ customerId })), page: 1 } }
    },
  },
  'customers-sys-api-v1': {
    'GET /customers/{customerId}': readCustomer((id, acc, email) => ({ id, fullName: acc.Name, email })),
  },
  'inventory-sys-api': {
    'GET /stock/{sku}': ({ ctx, params }) => {
      const r = ctx.sap.executeBapi(SAP, 'BAPI_MATERIAL_AVAILABILITY', { PLANT: '1000', MATERIAL: params.sku, UNIT: 'PC' })
      if (!r.ok) return failed(r, SAP_OP)
      const bad = sapError(r)
      if (bad) return notFound(bad.MESSAGE)
      const available = Number(r.export.AV_QTY_PLT)
      const reserved = Number(r.tables.WMDVEX?.[0]?.REQ_QTY ?? 0)
      return { ms: r.ms, out: { sku: params.sku, dc: 'Plant 1000', onHand: available + reserved, reserved, available } }
    },
    // the reservation is a sales order of the web shop: SAP counts its quantity as no longer available
    'POST /reservations': ({ ctx, body }) => {
      const lines = linesOf(body)
      const t = ctx.sap.begin(SAP)
      if (!t.ok) return failed(t, SAP_OP)
      const ref = String(body.orderId ?? body.cartId ?? '').slice(0, 20)
      const r = ctx.sap.executeBapi(SAP, 'BAPI_SALESORDER_CREATEFROMDAT2', {
        ORDER_HEADER_IN: { DOC_TYPE: 'TA', SALES_ORG: '1000', DISTR_CHAN: '10', DIVISION: '00', PURCH_NO_C: ref },
        ORDER_PARTNERS: [{ PARTN_ROLE: 'AG', PARTN_NUMB: SHOP_CUSTOMER }],
        ORDER_ITEMS_IN: lines.map((l, i) => ({ ITM_NUMBER: String((i + 1) * 10).padStart(6, '0'), MATERIAL: l.sku, TARGET_QTY: String(l.qty) })),
      }, { transaction: t.transaction })
      const bad = r.ok ? sapError(r) : null
      if (!r.ok || bad) {
        ctx.sap.rollback(t.transaction)
        return r.ok ? { status: 409, out: { message: bad.MESSAGE } } : failed(r, SAP_OP)
      }
      ctx.sap.commit(t.transaction)
      const vbeln = r.export.SALESDOCUMENT
      return { ms: r.ms + 60, out: { reservationId: `RS-${Number(vbeln)}`, salesOrder: vbeln, orderId: ref || null, lines } }
    },
  },
  'purchase-orders-sys-api': {
    'POST /purchase-orders': ({ ctx, body }) => {
      const lines = linesOf(body, 'H-100', 480)
      const r = ctx.sap.executeBapi(SAP, 'BAPI_PO_CREATE1', { POHEADER: { DOC_TYPE: 'NB', VENDOR: SUPPLIER.vendor, PURCH_ORG: '1000', COLLECT_NO: String(body.poId ?? '').slice(0, 10) }, POITEM: lines.map((l, i) => ({ PO_ITEM: String((i + 1) * 10).padStart(5, '0'), MATERIAL: l.sku, PLANT: '1000', QUANTITY: String(l.qty) })) })
      if (!r.ok) return failed(r, SAP_OP)
      const bad = sapError(r)
      if (bad) return { status: 400, out: { message: bad.MESSAGE } }
      return { ms: r.ms, out: { poId: r.export.EXPPURCHASEORDER, status: 'OPEN', supplier: SUPPLIER.name, lines } }
    },
    // the numbers of SAP purchase orders start with 45; the sample PO-7781 is not in SAP
    'GET /purchase-orders/{poId}': ({ ctx, params }) => {
      if (!/^45\d{8}$/.test(params.poId)) return null
      const r = ctx.sap.executeBapi(SAP, 'BAPI_PO_GETDETAIL1', { PURCHASEORDER: params.poId })
      if (!r.ok) return failed(r, SAP_OP)
      const bad = sapError(r)
      if (bad) return notFound(bad.MESSAGE)
      return { ms: r.ms, out: { poId: params.poId, supplier: SUPPLIER.name, status: 'OPEN', lines: r.tables.POITEM.length } }
    },
  },
  'edi-sys-api': {
    'POST /documents/850': ({ ctx, body }) => {
      const po = String(body.poId ?? SAMPLE.poId)
      ctx.b2b.addFlows(EDI_FLOWS)
      const r = ctx.b2b.sendDocument(SUPPLIER.partner, '850', { po, lines: linesOf(body, 'H-100', 480).map((l) => ({ qty: l.qty, uom: 'EA', price: '0.92', part: `NW-${l.sku}`, item: l.sku })) })
      if (!r.ok) return { fail: { type: r.type, message: r.error, name: 'Send 850', dsl: '<x12:write doc:name="Send 850" config-ref="X12_Config">' } }
      return { ms: 220, out: { poId: po, document: '850', status: 'SENT', interchange: r.isa, transmission: r.id } }
    },
    'GET /documents/855/{poId}': ({ ctx, params }) => {
      // takes the 855s that Partner Manager mapped for this app, so Tracking shows them as delivered
      ctx.b2b.receive('nw-855-in')
      const found = ctx.b2b.track(params.poId).filter((t) => t.ref === params.poId)
      const ack = found.find((t) => t.dir === 'in' && t.type === '855')
      if (ack) return { ms: 30, out: { poId: params.poId, document: '855', status: 'ACCEPTED', transmission: ack.id } }
      const sent = found.find((t) => t.dir === 'out' && t.type === '850')
      if (sent) return { ms: 30, out: { poId: params.poId, document: '855', status: 'PENDING', sent850: sent.status } }
      return params.poId === SAMPLE.poId ? null : notFound(`No 850 or 855 for ${params.poId} in Partner Manager`)
    },
  },
  'notifications-sys-api': {
    'POST /emails': ({ ctx, body }) => {
      const to = String(body.to ?? body.email ?? '').trim()
      if (!to) return { status: 400, out: { message: 'The request has no address: send to or email' } }
      const name = body.name ?? body.fullName ?? 'customer'
      const order = body.orderId ?? SAMPLE.orderId
      const back = body.returnId ?? body.refundId
      const [subject, text] = back
        ? [`Your return for order ${order} is registered`, `Hello ${name},\n\nwe have registered your return for order ${order}. The refund ${body.refundId ?? ''} follows when the parcel reaches our warehouse.\n\nBrightmart`]
        : [`Your Brightmart order ${order} is confirmed`, `Hello ${name},\n\nthank you for your order ${order}. We are packing it now${body.trackingId ? ` and send it with tracking number ${body.trackingId}` : ''}.\n\nBrightmart`]
      const r = ctx.mailbox.send(SMTP, { from: 'Brightmart <no-reply@brightmart.example>', to: [to], subject: body.subject ?? subject, text })
      if (!r.ok) return failed(r, CONNECTOR.email.op)
      return { ms: 90, out: { messageId: r.messageId, status: 'SENT', to } }
    },
  },
  'pos-sys-api': {
    'GET /stores/{storeId}/stock/{sku}': ({ ctx, params }) => {
      ctx.db.ensureTable(POS_DB, 'dbo.pos_store_stock', POS_TABLES['dbo.pos_store_stock'])
      const r = ctx.db.select(POS_DB, POS, 'SELECT store_id, sku, on_hand FROM dbo.pos_store_stock WHERE store_id = :store AND sku = :sku', { store: params.storeId, sku: params.sku })
      if (!r.ok) return failed(r, { name: 'Select', dsl: '<db:select doc:name="Select" config-ref="Database_Config">' })
      if (!r.rows.length) return notFound(`Store ${params.storeId} has no stock line for ${params.sku}`)
      return { ms: r.ms, out: { storeId: params.storeId, sku: params.sku, onHand: r.rows[0].on_hand } }
    },
    'GET /stores/{storeId}/sales': ({ ctx, params }) => {
      ctx.db.ensureTable(POS_DB, 'dbo.pos_daily_sales', POS_TABLES['dbo.pos_daily_sales'])
      const r = ctx.db.select(POS_DB, POS, 'SELECT store_id, sales_date, tickets, revenue FROM dbo.pos_daily_sales WHERE store_id = :store ORDER BY sales_date DESC', { store: params.storeId })
      if (!r.ok) return failed(r, { name: 'Select', dsl: '<db:select doc:name="Select" config-ref="Database_Config">' })
      if (!r.rows.length) return notFound(`No sales of store ${params.storeId}`)
      const x = r.rows[0]
      return { ms: r.ms, out: { storeId: params.storeId, date: x.sales_date, tickets: x.tickets, revenue: Number(x.revenue) } }
    },
  },
}
// the fields a Process API passes from one answer to the next calls: the customer's mail address for the mail, the
// number SAP gave a purchase order for the 850
const CARRY = ['email', 'name', 'fullName', 'poId', 'trackingId', 'refundId']
// a system state of an old save that an engine cannot read must not stop the console: the API answers with the example
const reach = (real, args) => {
  try {
    return real(args)
  } catch (e) {
    return { fail: { type: 'LAB:CONNECTIVITY', message: String(e?.message ?? e) } }
  }
}
const objectOf = (text) => {
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

function toPackage(def) {
  const file = def.name
  const first = def.routes.find((x) => x.m === 'GET') ?? def.routes[0]
  return {
    note: def.who,
    layer: def.layer,
    traced: true,
    ...(def.backend && { backend: def.backend.id }),
    calls: callsOf(def).map(urlKey),
    sample: { method: first.m, path: fill(first.p, {}) },
    boot: needs(...callsOf(def).map(urlKey), ...(callsOf(def).length ? ['client.id', 'client.secret'] : []), ...(def.backend ? [def.backend.key, def.backend.secret] : [])),
    handle(ctx, req) {
      const found = match(def.routes, req.method, req.path.split('?')[0])
      if (!found) return { status: 404, ms: 8, flow: `${file}-main`, error: 'APIKIT:NOT_FOUND', body: json({ message: 'Resource not found' }) }
      const { route, params } = found
      const flow = flowOf(route.m, route.p)
      let ms = 12
      if (def.backend) {
        const fault = backendFault(ctx, def, flow)
        if (fault) return { status: 500, ms: fault.type === 'HTTP:UNAUTHORIZED' ? 240 : 3000, flow, error: fault.type, log: loggedLately(ctx) ? undefined : [muleError(fault)], body: json({ message: 'Internal server error' }) }
        ms += ctx.backend(def.backend.id).ms
        ctx.say(`${ENTERPRISE_BACKENDS[def.backend.id].name} answered in ${ctx.backend(def.backend.id).ms} ms`)
        // A call of the API client, or a flow it started, reaches the system of the lab. Steady traffic gets the
        // example, so a week of the console writes nothing into the systems and fills none of them. When the system
        // cannot be reached (its state is missing, it is down or the logon fails) the API answers with the example too.
        const real = req.traced && REAL[def.name]?.[`${route.m} ${route.p}`]
        const r = real ? reach(real, { ctx, env: ctx.app.env, params, body: objectOf(req.body) ?? {} }) : null
        if (r && !(r.fail && /:CONNECTIVITY$/.test(r.fail.type ?? ''))) {
          ms += r.ms ?? 0
          if (r.fail) {
            const error = { flow, file, at: 2, name: r.fail.name, dsl: r.fail.dsl, type: r.fail.type, message: r.fail.message }
            return { status: 500, ms: ms + 10, flow, error: r.fail.type, log: [muleError(error)], body: json({ message: 'Internal server error' }) }
          }
          return { status: r.status ?? route.status, ms: ms + 8, flow, body: json(r.out) }
        }
        if (r?.fail) ctx.say(`${ENTERPRISE_BACKENDS[def.backend.id].name} could not be reached: ${r.fail.message}`)
      }
      let last = null
      let degraded = false
      const timeout = Number(ctx.props['http.timeout']) || 10000
      // the body of the request, with what earlier answers gave (see CARRY), and its plain values for the paths of the calls
      const base = objectOf(req.body)
      const carry = {}
      const vars = { ...Object.fromEntries(Object.entries(base ?? {}).filter(([, v]) => typeof v === 'string' && /^[\w-]+$/.test(v))), ...params }
      for (const [to, m, p, mode] of route.calls) {
        // an empty request still passes on what earlier answers gave, such as the email of the customer
        const body = base || Object.keys(carry).length ? json({ ...(base ?? {}), ...carry }) : req.body
        const res = ctx.call(urlKey(to), { method: m, path: fill(p, vars), body, clientId: ctx.props['client.id'], clientSecret: ctx.props['client.secret'] }, timeout)
        ms += res.ms
        if (res.error && mode === 'fallback') {
          degraded = true
          continue
        }
        if (res.error) {
          const status = OUTCOME[res.error] ?? 500
          const error = { flow, file, at: 2, name: `Call ${to}`, dsl: `<http:request method="${m}" doc:name="Call ${to}" config-ref="${configName(to)}" path="${res.path}">`, type: res.error, message: `HTTP ${m} on resource '${res.url}${res.path}' failed: ${res.text}.` }
          return { status, ms: ms + 10, flow, error: res.error, log: status === 404 ? undefined : [muleError(error)], body: json({ message: status === 404 ? 'Not found' : { 504: 'A system did not answer in time', 503: 'A system is not available' }[status] ?? 'Internal server error' }) }
        }
        last = res
        const got = objectOf(res.body)
        if (got) for (const k of CARRY) if (got[k] !== undefined && got[k] !== null) carry[k] = got[k]
      }
      // an Experience API passes on the answer of the Process API, so a degraded answer reaches the channel
      if (def.layer === 'Experience' && last) return { status: route.status, ms: ms + 8, flow, body: last.body }
      // the answer is the example, with the values of the request and of the answers before it
      const out = JSON.parse(fill(json(route.out), { ...vars, ...Object.fromEntries(Object.entries(carry).filter(([, v]) => typeof v === 'string' && /^[^"\\{}]*$/.test(v))) }))
      return { status: route.status, ms: ms + 8, flow, body: json(degraded ? { ...out, ...def.fallback } : out) }
    },
  }
}

// The nightly job of the supply chain. It reads the forecast export of the planning platform from SFTP and hands the
// proposals to the planning team. Jobs in the lab do not call APIs, so the run is a log of what it did.
const NIGHTLY = {
  note: 'Nightly job. Reads the forecast export of the planning platform over SFTP at 02:30 and loads the replenishment proposals.',
  layer: 'Process',
  boot: needs('sftp.host', 'sftp.password', 'forecast.folder'),
  schedules: [{ flow: 'replenishment-nightly-flow', type: 'cron', value: '0 30 2 * * ?', tz: 'UTC', enabled: true }],
  run: {
    'replenishment-nightly-flow': ({ props }) => ({ ok: true, ms: 95000, log: [{ level: 'INFO', text: 'Starting replenishment-nightly-flow', logger: 'org.mule.runtime.core.internal.processor.LoggerMessageProcessor' }, { level: 'INFO', text: `Loaded 37 proposals from ${props['forecast.folder']}/forecast_export.csv. Job finished.`, logger: 'org.mule.runtime.core.internal.processor.LoggerMessageProcessor' }] }),
  },
}

export const ENTERPRISE_PACKAGES = { ...Object.fromEntries(DEPLOYED.map((d) => [d.name, toPackage(d)])), 'replenishment-nightly-job': NIGHTLY }
