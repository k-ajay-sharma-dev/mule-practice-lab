// Wrong and other correct diagrams for batch K (commerce Integration Scenarios uc-075 to uc-090).
// See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }) => {
  // UC-075
  // The webhook API sends the email itself instead of queueing.
  await failsOn('uc-075', 'puts the order on a queue', (d) => {
    unbox(d, 'q')
    draw(d, 'wh -> prc')
  })
  await failsOn('uc-075', 'never waits on the email', (d) => {
    unbox(d, 'q')
    draw(d, 'wh -> prc')
  })
  // A queue drawn, but as a sync hand-off.
  await failsOn('uc-075', 'puts the order on a queue', (d) => swap(d, 'wh ~> q'))
  // The consumer calls the email service directly.
  await failsOn('uc-075', 'only through a System API', (d) => draw(d, 'prc -> mail'))
  // No record of sent orders, so every platform retry sends again.
  await failsOn('uc-075', 'Sent order numbers', (d) => unbox(d, 'sent'))
  await failsOn('uc-075', 'Both an email and an SMS', (d) => unbox(d, 'sms'))
  await failsOn('uc-075', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  await failsOn('uc-075', 'calls a webhook API you expose', (d) => flip(d, 'shop -> wh'))
  // API Manager policies drawn as a gateway in front of the webhook API.
  await passes('uc-075', (d) => {
    box(d, 'gw', 'api-gateway', 'IP allowlist and rate limit')
    cut(d, 'shop -> wh')
    draw(d, 'shop -> gw', 'gw -> wh')
  })
  // One System API per provider.
  await passes('uc-075', (d) => {
    box(d, 'ssms', 'system-api', 'sys-sms')
    cut(d, 'snot -> sms')
    draw(d, 'prc -> ssms', 'ssms -> sms')
  })
  await passes('uc-075', (d) => rename(d, 'sent', 'Processed order IDs'))

  // UC-076
  // Each store posts its own totals to the ERP.
  await failsOn('uc-076', 'never post to the ERP directly', (d) => draw(d, 'pos -> serp'))
  await failsOn('uc-076', 'only through a System API', (d) => {
    cut(d, 'job -> serp')
    draw(d, 'job -> erp')
  })
  // No record of posted files: a resent file posts twice.
  await failsOn('uc-076', 'never posted twice', (d) => unbox(d, 'done'))
  await failsOn('uc-076', 'Finance is told', (d) => unbox(d, 'mail'))
  await failsOn('uc-076', 'Stores drop their end-of-day files', (d) => flip(d, 'pos -> sftp'))
  await failsOn('uc-076', 'job and the SFTP server are connected', (d) => cut(d, 'job -> sftp'))
  await failsOn('uc-076', 'Journals reach the ERP', (d) => flip(d, 'serp -> erp'))
  // A file listener drawn as the SFTP server feeding the job.
  await passes('uc-076', (d) => flip(d, 'job -> sftp'))
  // A copy to the data warehouse as well.
  await passes('uc-076', (d) => {
    box(d, 'dw', 'data-warehouse', 'Sales warehouse')
    draw(d, 'job -> dw')
  })
  await passes('uc-076', (d) => {
    rename(d, 'done', 'Posted journals table (store, date)')
    d.nodes.find((n) => n.id === 'done').type = 'database'
  })

  // UC-077
  // The job calls the store platform directly.
  await failsOn('uc-077', 'online store is reached only', (d) => draw(d, 'job -> shop'))
  // The SAP System API pushes prices to the store System API.
  await failsOn('uc-077', 'do not call each other', (d) => {
    cut(d, 'job -> sshop')
    draw(d, 'serp -> sshop')
  })
  // Every price every week.
  await failsOn('uc-077', 'Only changed prices', (d) => unbox(d, 'last'))
  await failsOn('uc-077', 'merchandising team gets a report', (d) => unbox(d, 'mail'))
  await failsOn('uc-077', 'SAP is reached only', (d) => draw(d, 'job -> sap'))
  await failsOn('uc-077', 'reads the promotions from SAP', (d) => flip(d, 'job -> serp'))
  await failsOn('uc-077', 'Prices reach the online store', (d) => flip(d, 'sshop -> shop'))
  // A Process API does the mapping between the job and the System APIs.
  await passes('uc-077', (d) => {
    box(d, 'prc', 'process-api', 'prc-promo-prices')
    cut(d, 'job -> serp', 'job -> sshop')
    draw(d, 'job -> prc', 'prc -> serp', 'prc -> sshop')
  })
  await passes('uc-077', (d) => {
    rename(d, 'last', 'Price history table')
    d.nodes.find((n) => n.id === 'last').type = 'database'
  })

  // UC-078
  // The storefront calls the tracker synchronously.
  await failsOn('uc-078', 'published asynchronously', (d) => {
    cut(d, 'exp ~> q')
    draw(d, 'exp -> trk')
  })
  await failsOn('uc-078', 'published asynchronously', (d) => swap(d, 'exp ~> q'))
  // The storefront sends the reminder email itself.
  await failsOn('uc-078', 'never waits on the CRM', (d) => draw(d, 'exp -> snot'))
  // Order events are missing, so paid carts are chased.
  await failsOn('uc-078', 'Order placed events', (d) => unbox(d, 'oms'))
  await failsOn('uc-078', 'Consent is checked', (d) => cut(d, 'job -> scrm'))
  await failsOn('uc-078', 'only through System APIs', (d) => draw(d, 'job -> mail'))
  await failsOn('uc-078', 'Cart state', (d) => unbox(d, 'carts'))
  await failsOn('uc-078', 'Website and app', (d) => flip(d, 'mob -> exp'))
  // A topic instead of a queue.
  await passes('uc-078', (d) => {
    d.nodes.find((n) => n.id === 'q').type = 'topic'
  })
  // The scan job hands due carts to a Process API.
  await passes('uc-078', (d) => {
    box(d, 'prc', 'process-api', 'prc-cart-reminders')
    cut(d, 'job -> scrm', 'job -> snot')
    draw(d, 'job -> prc', 'prc -> scrm', 'prc -> snot')
  })
  // A separate Experience API for the app.
  await passes('uc-078', (d) => {
    box(d, 'expm', 'experience-api', 'exp-mobile')
    cut(d, 'mob -> exp')
    draw(d, 'mob -> expm', 'expm ~> q')
  })

  // UC-079
  // The webhook API runs the whole order synchronously.
  await failsOn('uc-079', 'acknowledged fast and queued', (d) => {
    cut(d, 'wh ~> qo')
    draw(d, 'wh -> cap')
  })
  await failsOn('uc-079', 'never calls the ERP or WMS synchronously', (d) => {
    cut(d, 'wh ~> qo')
    draw(d, 'wh -> cap')
  })
  await failsOn('uc-079', 'Duplicate webhooks', (d) => unbox(d, 'seen'))
  // Orders never reach the WMS.
  await failsOn('uc-079', 'both the ERP and the WMS', (d) => cut(d, 'cap -> swms'))
  await failsOn('uc-079', 'ERP and WMS are reached only', (d) => draw(d, 'cap -> erp'))
  // The WMS calls the fulfilment API synchronously.
  await failsOn('uc-079', 'shipment confirmations as async', (d) => {
    unbox(d, 'qs')
    draw(d, 'wms -> ful')
  })
  await failsOn('uc-079', 'store platform is updated only', (d) => {
    cut(d, 'sshop -> shop')
    draw(d, 'ful -> shop')
  })
  await failsOn('uc-079', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // WMS orders sent through their own queue.
  await passes('uc-079', (d) => {
    box(d, 'qw', 'queue', 'wms-orders')
    cut(d, 'cap -> swms')
    draw(d, 'cap ~> qw', 'qw ~> swms')
  })
  await passes('uc-079', (d) => {
    d.nodes.find((n) => n.id === 'qs').type = 'topic'
  })
  await passes('uc-079', (d) => {
    box(d, 'gw', 'api-gateway', 'Gateway (IP allowlist)')
    cut(d, 'shop -> wh')
    draw(d, 'shop -> gw', 'gw -> wh')
  })

  // UC-080
  // The canonical API calls every channel itself: no topic.
  await failsOn('uc-080', 'no sync route', (d) => {
    unbox(d, 'top')
    draw(d, 'prc -> sg', 'prc -> sm', 'prc -> smk')
  })
  await failsOn('uc-080', 'published once to a topic', (d) => swap(d, 'prc ~> top'))
  // One shared subscriber for every channel.
  await failsOn('uc-080', 'own subscriber', (d) => {
    unbox(d, 'm')
    unbox(d, 'mk')
    draw(d, 'g -> sm', 'g -> smk')
  })
  await failsOn('uc-080', 'only through System APIs', (d) => draw(d, 'g -> eg'))
  await failsOn('uc-080', 'Prices are joined', (d) => cut(d, 'prc -> serp'))
  await failsOn('uc-080', 'written back to the PIM', (d) => cut(d, 'g -> spim', 'm -> spim', 'mk -> spim'))
  await failsOn('uc-080', 'Three channels', (d) => unbox(d, 'smk'))
  // A queue per channel bound to the topic.
  await passes('uc-080', (d) => {
    box(d, 'qg', 'queue', 'google-feed-q')
    cut(d, 'top ~> g')
    draw(d, 'top ~> qg', 'qg ~> g')
  })
  await passes('uc-080', (d) => {
    d.nodes.find((n) => n.id === 'top').type = 'event-stream'
  })

  // UC-081
  // The job calls the loyalty API member by member.
  await failsOn('uc-081', 'member by member', (d) => {
    box(d, 'sle', 'system-api', 'sys-loyalty')
    draw(d, 'job -> sle', 'sle -> le')
  })
  // The job sends straight away, with no queue to throttle.
  await failsOn('uc-081', 'Due notifications are queued', (d) => {
    unbox(d, 'q')
    draw(d, 'job -> snot')
  })
  await failsOn('uc-081', 'Due notifications are queued', (d) => swap(d, 'job ~> q'))
  await failsOn('uc-081', 'Sent reminders are recorded', (d) => unbox(d, 'sent'))
  await failsOn('uc-081', 'Consent and preferred channel', (d) => cut(d, 'snd -> scrm'))
  await failsOn('uc-081', 'Email, SMS and push are reached only', (d) => draw(d, 'snd -> msg'))
  await failsOn('uc-081', 'CRM is reached only', (d) => draw(d, 'snd -> crm'))
  await failsOn('uc-081', 'reads the nightly export', (d) => cut(d, 'job -> s3'))
  // The consumer keeps the sent log instead of the job.
  await passes('uc-081', (d) => {
    cut(d, 'job -> sent')
    draw(d, 'snd -> sent')
    rename(d, 'sent', 'Sent reminders (Object Store)')
    d.nodes.find((n) => n.id === 'sent').type = 'cache'
  })
  // The export arrives on SFTP, drawn in the other direction.
  await passes('uc-081', (d) => {
    d.nodes.find((n) => n.id === 's3').type = 'sftp-server'
    flip(d, 'le -> s3')
  })
  await passes('uc-081', (d) => {
    box(d, 'ssms', 'system-api', 'sys-sms')
    box(d, 'sms', 'notification', 'SMS provider')
    draw(d, 'snd -> ssms', 'ssms -> sms')
  })

  // UC-082
  // Every search goes to the provider.
  await failsOn('uc-082', 'Locker searches are cached', (d) => unbox(d, 'cache'))
  await failsOn('uc-082', 'locker provider is called only', (d) => draw(d, 'prc -> lk'))
  // The webhook API processes events inline.
  await failsOn('uc-082', 'one sync chain', (d) => {
    cut(d, 'wh ~> q')
    draw(d, 'wh -> ev')
  })
  await failsOn('uc-082', 'queued before processing', (d) => {
    cut(d, 'wh ~> q')
    draw(d, 'wh -> ev')
  })
  // No webhook: nothing tells us the parcel arrived.
  await failsOn('uc-082', 'arrive on a webhook API', (d) => unbox(d, 'wh'))
  await failsOn('uc-082', 'Refunds for parcels', (d) => draw(d, 'ev -> pay'))
  await failsOn('uc-082', 'pickup code', (d) => cut(d, 'ev -> snot'))
  await failsOn('uc-082', 'Web and app', (d) => flip(d, 'web -> exp'))
  await passes('uc-082', (d) => {
    box(d, 'gw', 'api-gateway', 'Gateway (signature policy)')
    cut(d, 'lk -> wh')
    draw(d, 'lk -> gw', 'gw -> wh')
  })
  // The System API owns the cache.
  await passes('uc-082', (d) => {
    cut(d, 'prc -> cache')
    draw(d, 'slk -> cache')
  })
  await passes('uc-082', (d) => {
    d.nodes.find((n) => n.id === 'q').type = 'cloud-queue'
  })

  // UC-083
  // The tablet asks the stores live.
  await failsOn('uc-083', 'not 220 stores', (d) => draw(d, 'ea -> pos'))
  await failsOn('uc-083', 'never call System APIs directly', (d) => draw(d, 'exp -> sinv'))
  // Stores update the central stock synchronously.
  await failsOn('uc-083', 'arrive as async events', (d) => swap(d, 'pos ~> q'))
  await failsOn('uc-083', 'Every line into or out of a queue', (d) => swap(d, 'pos ~> q'))
  await failsOn('uc-083', 'inventory database is reached only', (d) => {
    cut(d, 'sync -> sinv')
    draw(d, 'sync -> db')
  })
  await failsOn('uc-083', 'pick task asynchronously', (d) => cut(d, 'ea ~> tq'))
  // DC stock is not in the central view.
  await failsOn('uc-083', 'arrive as async events', (d) => unbox(d, 'wms'))
  await failsOn('uc-083', 'created in the OMS', (d) => cut(d, 'ea -> soms'))
  await passes('uc-083', (d) => {
    d.nodes.find((n) => n.id === 'q').type = 'topic'
  })
  // A separate queue for DC movements.
  await passes('uc-083', (d) => {
    box(d, 'q2', 'queue', 'stock-movements-dc')
    cut(d, 'wms ~> q')
    draw(d, 'wms ~> q2', 'q2 ~> sync')
  })
  await passes('uc-083', (d) => {
    box(d, 'c', 'cache', 'Nearby stores cache')
    draw(d, 'ea -> c')
  })

  // UC-084
  // The purchase emails the recipient at once.
  await failsOn('uc-084', 'never sends the recipient email', (d) => draw(d, 'prc -> snot'))
  await failsOn('uc-084', 'reached only through System APIs', (d) => draw(d, 'prc -> gc'))
  // The scheduler calls the sender directly.
  await failsOn('uc-084', 'finds due deliveries and queues them', (d) => {
    cut(d, 'job ~> q')
    draw(d, 'job -> snd')
  })
  await failsOn('uc-084', 'orders database is reached only', (d) => {
    cut(d, 'job -> sdb')
    draw(d, 'job -> db')
  })
  await failsOn('uc-084', 'liability is posted', (d) => unbox(d, 'fin'))
  // Payment taken, but the card is never activated.
  await failsOn('uc-084', 'card is activated', (d) => cut(d, 'prc -> sgc'))
  await failsOn('uc-084', 'Payment is taken', (d) => cut(d, 'prc -> spay'))
  await failsOn('uc-084', 'website calls an Experience API', (d) => flip(d, 'web -> exp'))
  // One job does both deliveries and the posting.
  await passes('uc-084', (d) => {
    unbox(d, 'fin')
    draw(d, 'job -> serp')
  })
  await passes('uc-084', (d) => {
    box(d, 'gw', 'api-gateway', 'Gateway')
    cut(d, 'web -> exp')
    draw(d, 'web -> gw', 'gw -> exp')
  })
  await passes('uc-084', (d) => {
    d.nodes.find((n) => n.id === 'q').type = 'topic'
  })

  // UC-085
  // One queue shared by all nodes.
  await failsOn('uc-085', 'its own queue (3 nodes)', (d) => {
    unbox(d, 'qs')
    unbox(d, 'q3')
    draw(d, 'qn ~> ss', 'qn ~> s3pl')
  })
  // The router calls DC North directly.
  await failsOn('uc-085', 'sync chain', (d) => {
    cut(d, 'rt ~> qn')
    draw(d, 'rt -> sn')
  })
  // The WMSs call the status API synchronously.
  await failsOn('uc-085', 'report shipments as async', (d) => {
    cut(d, 'wn ~> ev', 'wsouth ~> ev')
    draw(d, 'wn -> st', 'wsouth -> st')
  })
  await failsOn('uc-085', 'Line status', (d) => unbox(d, 'sdb'))
  await failsOn('uc-085', 'refunded through a System API', (d) => draw(d, 'st -> pay'))
  await failsOn('uc-085', 'All three fulfilment nodes', (d) => unbox(d, 's3pl'))
  await failsOn('uc-085', 'only through System APIs', (d) => draw(d, 'qn ~> wn'))
  await failsOn('uc-085', 'publishes released orders as async', (d) => swap(d, 'oms ~> top'))
  await passes('uc-085', (d) => {
    rename(d, 'sdb', 'Line status (Object Store)')
    d.nodes.find((n) => n.id === 'sdb').type = 'cache'
  })
  // The 3PL offers a REST API instead of EDI files.
  await passes('uc-085', (d) => {
    rename(d, 'sftp', '3PL REST API')
    d.nodes.find((n) => n.id === 'sftp').type = 'external-api'
  })
  await passes('uc-085', (d) => {
    box(d, 'mon', 'monitoring', 'Queue age alerts')
    draw(d, 'st -> mon')
  })

  // UC-086
  // The webhook API gathers the evidence inline.
  await failsOn('uc-086', 'queues the event', (d) => {
    cut(d, 'wh ~> q')
    draw(d, 'wh -> prc')
  })
  await failsOn('uc-086', 'only through a System API', (d) => draw(d, 'prc -> pp'))
  await failsOn('uc-086', 'OMS and the carrier', (d) => cut(d, 'prc -> scar'))
  await failsOn('uc-086', 'Event IDs', (d) => unbox(d, 'seen'))
  // The analyst decision is pushed into the flow synchronously.
  await failsOn('uc-086', 'async events', (d) => {
    cut(d, 'crm ~> q')
    draw(d, 'crm -> prc')
  })
  await failsOn('uc-086', 'async events', (d) => cut(d, 'crm ~> q'))
  await failsOn('uc-086', 'watchdog', (d) => unbox(d, 'job'))
  await failsOn('uc-086', 'analyst cases in Salesforce', (d) => cut(d, 'prc -> scrm'))
  await passes('uc-086', (d) => {
    box(d, 'gw', 'api-gateway', 'Gateway (IP allowlist)')
    cut(d, 'pp -> wh')
    draw(d, 'pp -> gw', 'gw -> wh')
  })
  // Decisions on their own queue.
  await passes('uc-086', (d) => {
    box(d, 'dq', 'queue', 'dispute-decisions')
    cut(d, 'crm ~> q')
    draw(d, 'crm ~> dq', 'dq ~> prc')
  })
  await passes('uc-086', (d) => {
    box(d, 'snot', 'system-api', 'sys-notifications')
    cut(d, 'job -> alert')
    draw(d, 'job -> snot', 'snot -> alert')
  })

  // UC-087
  // Allocation charges every card itself.
  await failsOn('uc-087', 'never charges cards', (d) => draw(d, 'alloc -> spay'))
  // The WMS calls allocation directly.
  await failsOn('uc-087', 'goods receipts as async', (d) => {
    unbox(d, 'rq')
    draw(d, 'wms -> alloc')
  })
  await failsOn('uc-087', 'pre-order database is reached only', (d) => draw(d, 'alloc -> db'))
  await failsOn('uc-087', 'releases holds', (d) => unbox(d, 'job'))
  await failsOn('uc-087', 'dead-letter queue', (d) => unbox(d, 'pdlq'))
  await failsOn('uc-087', 'payment provider is reached only', (d) => {
    cut(d, 'payp -> spay')
    draw(d, 'payp -> pay')
  })
  await failsOn('uc-087', 'created in the OMS', (d) => cut(d, 'payp -> soms'))
  await failsOn('uc-087', 'Web and app', (d) => flip(d, 'web -> exp'))
  await passes('uc-087', (d) => {
    d.nodes.find((n) => n.id === 'rq').type = 'topic'
  })
  // The hold job puts reallocated pre-orders back on the payment queue.
  await passes('uc-087', (d) => {
    cut(d, 'job -> alloc')
    draw(d, 'job ~> pq')
  })
  await passes('uc-087', (d) => {
    box(d, 'expm', 'experience-api', 'exp-mobile')
    cut(d, 'mob -> exp')
    draw(d, 'mob -> expm', 'expm -> pre')
  })

  // UC-088
  // Every scan calls the engine live.
  await failsOn('uc-088', 'Offer lookups read a cache', (d) => unbox(d, 'cache'))
  await failsOn('uc-088', 'nightly job loads offers', (d) => unbox(d, 'load'))
  await failsOn('uc-088', 'offers engine is reached only', (d) => draw(d, 'prc -> eng'))
  // Tills call the API without the gateway.
  await failsOn('uc-088', 'through the gateway', (d) => {
    unbox(d, 'gw')
    draw(d, 'pos -> exp')
  })
  // The redemption writes to the warehouse inline.
  await failsOn('uc-088', 'never waits on the data warehouse', (d) => draw(d, 'red -> dw'))
  await failsOn('uc-088', 'store queue', (d) => unbox(d, 'sq'))
  await failsOn('uc-088', 'redemptions database is reached only', (d) => draw(d, 'red -> db'))
  await failsOn('uc-088', 'published for the engine and the warehouse', (d) => unbox(d, 'top'))
  await passes('uc-088', (d) => {
    d.nodes.find((n) => n.id === 'top').type = 'event-stream'
  })
  // The cache is loaded from the engine export file.
  await passes('uc-088', (d) => {
    box(d, 's3', 's3-bucket', 'Offers export')
    cut(d, 'load -> seng')
    draw(d, 'load -> s3')
  })
  // The store outbox forwards through the gateway.
  await passes('uc-088', (d) => {
    cut(d, 'sq ~> red')
    draw(d, 'sq ~> gw')
  })

  // UC-089
  await failsOn('uc-089', 'Every tender system', (d) => draw(d, 'saga -> gc'))
  // The saga calls the OMS inside checkout.
  await failsOn('uc-089', 'never waits on the OMS', (d) => {
    unbox(d, 'oq')
    draw(d, 'saga -> soms')
  })
  // Reversals are attempted once, inline.
  await failsOn('uc-089', 'retried queue', (d) => unbox(d, 'rq'))
  await failsOn('uc-089', 'idempotency store', (d) => unbox(d, 'idem'))
  await failsOn('uc-089', 'dead-letter queue', (d) => unbox(d, 'rdlq'))
  await failsOn('uc-089', 'tender ledger', (d) => cut(d, 'saga -> sled', 'rev -> sled', 'rec -> sled'))
  await failsOn('uc-089', 'Checkout reaches the loyalty engine', (d) => unbox(d, 'sloy'))
  await failsOn('uc-089', 'through the gateway', (d) => {
    cut(d, 'web -> gw')
    draw(d, 'web -> exp')
  })
  await passes('uc-089', (d) => {
    d.nodes.find((n) => n.id === 'oq').type = 'event-stream'
  })
  // The saga consumes its own reversal queue.
  await passes('uc-089', (d) => {
    unbox(d, 'rev')
    draw(d, 'rq ~> saga')
  })
  // Idempotency checked at the Experience API.
  await passes('uc-089', (d) => {
    cut(d, 'saga -> idem')
    draw(d, 'exp -> idem')
  })

  // UC-090
  // The old cron export still sends Magento orders straight to SAP.
  await failsOn('uc-090', 'only through the canonical topic', (d) => draw(d, 'mag -> ssap'))
  // No country routing: no way to switch back.
  await failsOn('uc-090', 'Country routing', (d) => {
    unbox(d, 'lb')
    draw(d, 'web -> mag', 'web -> saas')
  })
  await failsOn('uc-090', 'write to each platform only', (d) => {
    cut(d, 'ssaas -> saas')
    draw(d, 'stat -> saas')
  })
  // Updates only go to the new platform.
  await failsOn('uc-090', 'back to both platforms', (d) => cut(d, 'stat -> smag'))
  await failsOn('uc-090', 'order origin is recorded', (d) => unbox(d, 'map'))
  await failsOn('uc-090', 'SAP and the WMS are reached only', (d) => draw(d, 'erpP -> sap'))
  await failsOn('uc-090', 'old platform reach SAP', (d) => cut(d, 'mag ~> inq'))
  await failsOn('uc-090', 'new platform reach SAP', (d) => cut(d, 'saas -> wh'))
  await passes('uc-090', (d) => {
    d.nodes.find((n) => n.id === 'top').type = 'event-stream'
  })
  // A separate normaliser for Magento orders.
  await passes('uc-090', (d) => {
    box(d, 'n2', 'process-api', 'prc-magento-orders')
    cut(d, 'mag ~> inq')
    draw(d, 'mag ~> n2', 'n2 ~> top')
  })
  await passes('uc-090', (d) => {
    box(d, 'gw', 'api-gateway', 'Gateway (webhook signature)')
    cut(d, 'saas -> wh')
    draw(d, 'saas -> gw', 'gw -> wh')
  })
}
