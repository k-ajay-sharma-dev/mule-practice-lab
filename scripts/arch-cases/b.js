// Wrong and other correct diagrams for batch B. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename, set }) => {
  // AR-068
  await failsOn('ar-068', 'Run: A store replays a week of sales', (d) => set(d, 'prc', { vCores: undefined }))
  // No rate limit: the hub drains straight into Oracle at its full 100 a second.
  await failsOn('ar-068', 'Run: A store replays a week of sales', (d) => set(d, 'serp', { rateLimit: undefined }))
  await failsOn('ar-068', 'Run: Oracle is down and the brokers restart', (d) => set(d, 'hq', { persistent: 'no' }))
  // A redelivery limit with no DLQ on the hub queue drops sales while Oracle is down.
  await failsOn('ar-068', 'Run: Oracle is down and the brokers restart', (d) => set(d, 'hq', { maxRedelivery: 3 }))
  await failsOn('ar-068', 'Run: Price changes reach an offline store', (d) => set(d, 'spq', { persistent: 'no' }))
  await failsOn('ar-068', 'Run: Price changes reach an offline store', (d) => set(d, 'price', { vCores: undefined }))
  await failsOn('ar-068', 'store broker and then the HQ hub', (d) => cut(d, 'sq ~> hq'))
  // One HQ broker over the WAN: a reboot or outage at the store loses sales again.
  await failsOn('ar-068', 'store broker and then the HQ hub', (d) => {
    unbox(d, 'sq')
    draw(d, 'pos ~> hq')
  })
  await failsOn('ar-068', 'An HQ Process API consumes', (d) => cut(d, 'hq ~> prc'))
  await failsOn('ar-068', 'reaches Oracle through the brokers', (d) => cut(d, 'prc -> serp'))
  await failsOn('ar-068', 'connects to its backend', (d) => cut(d, 'serp -> erp'))
  await failsOn('ar-068', 'sync calls. Async work', (d) => swap(d, 'prc -> serp'))
  await failsOn('ar-068', 'only from a broker', (d) => draw(d, 'price -> pos'))
  await failsOn('ar-068', 'Price changes reach the store POS', (d) => cut(d, 'spq ~> pos'))
  await failsOn('ar-068', 'async message', (d) => swap(d, 'pos ~> sq'))
  await passes('ar-068', (d) => cut(d, 'price -> serp'))
  // Prices fan out on a topic at the hub.
  await passes('ar-068', (d) => {
    d.nodes.find((n) => n.id === 'pq').type = 'topic'
  })
  await passes('ar-068', (d) => {
    cut(d, 'prc ~> dlq')
    draw(d, 'hq ~> dlq')
  })

  // AR-069
  await failsOn('ar-069', 'Run: Checkout spike on Black Friday', (d) => set(d, 'sinv', { rateLimit: undefined }))
  // Every API on 4 × 4 vCores "to be safe" blows the budget.
  await failsOn('ar-069', 'Run: Checkout spike on Black Friday', (d) => {
    for (const id of ['ecom', 'resv', 'sinv']) set(d, id, { replicas: 4, vCores: '4' })
  })
  await failsOn('ar-069', 'Run: Stock events keep availability fresh', (d) => set(d, 'atp', { replicas: undefined, vCores: undefined }))
  await failsOn('ar-069', 'Run: A zone goes down during checkout', (d) => set(d, 'resv', { replicas: undefined }))
  await failsOn('ar-069', 'Reservations go synchronously', (d) => swap(d, 'resv -> sinv'))
  await failsOn('ar-069', 'Availability reads never call Oracle', (d) => draw(d, 'atp -> sinv'))
  await failsOn('ar-069', 'reads availability from the ATP', (d) => cut(d, 'estore -> atp'))
  await failsOn('ar-069', 'Checkout on the web reserves', (d) => cut(d, 'ecom -> resv'))
  await failsOn('ar-069', 'publishes its stock changes', (d) => cut(d, 'swms ~> topic'))
  await failsOn('ar-069', 'store POS each sit behind', (d) => unbox(d, 'spos'))
  await failsOn('ar-069', 'connects to its backend', (d) => cut(d, 'swms -> wms'))
  await failsOn('ar-069', 'sync calls. Async work', (d) => swap(d, 'ecom -> atp'))
  await failsOn('ar-069', 'Web, mobile and store channels', (d) => unbox(d, 'mob'))
  // One Experience API for every channel.
  await passes('ar-069', (d) => {
    unbox(d, 'estore')
    draw(d, 'store -> ecom')
  })
  await passes('ar-069', (d) => {
    box(d, 'q', 'queue', 'atp-updates-q')
    cut(d, 'topic ~> atp')
    draw(d, 'topic ~> q', 'q ~> atp')
  })
  await passes('ar-069', (d) => {
    d.nodes.find((n) => n.id === 'topic').type = 'event-stream'
  })

  // AR-070
  await failsOn('ar-070', 'Run: A runaway store report', (d) => set(d, 'estore', { rateLimit: undefined }))
  await failsOn('ar-070', 'Run: The finance warehouse is down', (d) => set(d, 'pfin', { vCores: undefined }))
  // A redelivery limit with no DLQ drops the changes finance needs.
  await failsOn('ar-070', 'Run: The finance warehouse is down', (d) => set(d, 'topic', { maxRedelivery: 3 }))
  // The System API feeds the warehouse in the request, so a warehouse outage fails checkout.
  await failsOn('ar-070', 'Run: The finance warehouse is down', (d) => {
    cut(d, 'sinv ~> topic')
    draw(d, 'sinv -> dw')
  })
  await failsOn('ar-070', 'called by a Process API', (d) => cut(d, 'prc -> swms'))
  await failsOn('ar-070', 'not from a direct feed', (d) => draw(d, 'sinv -> dw'))
  await failsOn('ar-070', 'fed from events', (d) => cut(d, 'topic ~> pfin'))
  await failsOn('ar-070', 'fed from events', (d) => cut(d, 'sinv ~> topic'))
  await failsOn('ar-070', 'sync calls. Async work', (d) => swap(d, 'eweb -> prc'))
  // The old database link from the WMS.
  await failsOn('ar-070', 'database is reached only through', (d) => draw(d, 'wms -> db'))
  await failsOn('ar-070', 'connects to its backend', (d) => cut(d, 'swms -> wms'))
  // The warehouse reads the topic itself.
  await passes('ar-070', (d) => {
    unbox(d, 'pfin')
    draw(d, 'topic ~> dw')
  })
  // Each channel gets its own Process API.
  await passes('ar-070', (d) => {
    box(d, 'prc2', 'process-api', 'prc-store-stock')
    cut(d, 'estore -> prc')
    draw(d, 'estore -> prc2', 'prc2 -> sinv')
  })
  await passes('ar-070', (d) => rename(d, 'topic', 'stock-events'))

  // AR-071
  // The canonical events go on a queue: Shopify and Salesforce compete for them, so each gets about half.
  await failsOn('ar-071', 'Run: Every change reaches all three consumers', (d) => {
    d.nodes.find((n) => n.id === 'canon').type = 'queue'
  })
  await failsOn('ar-071', 'Run: Salesforce is down for 30 minutes', (d) => set(d, 'pcrm', { vCores: undefined }))
  await failsOn('ar-071', 'Run: Salesforce is down for 30 minutes', (d) => set(d, 'canon', { maxRedelivery: 5 }))
  await failsOn('ar-071', 'Run: A vendor batch job changes 72,000 rows', (d) => set(d, 'prc', { vCores: undefined }))
  await failsOn('ar-071', 'Run: A vendor batch job changes 72,000 rows', (d) => set(d, 'pecom', { vCores: undefined }))
  // A consumer reads raw row changes, the coupling the question warns about.
  await failsOn('ar-071', 'never the raw rows', (d) => {
    cut(d, 'canon ~> pecom')
    draw(d, 'raw ~> pecom')
  })
  await failsOn('ar-071', 'never the raw rows', (d) => cut(d, 'pcrm -> scrm'))
  await failsOn('ar-071', 'does not poll', (d) => draw(d, 'prc -> db'))
  await failsOn('ar-071', 'sync calls. Async work', (d) => swap(d, 'pecom -> sshop'))
  await failsOn('ar-071', 'connects to its backend', (d) => cut(d, 'sshop -> shop'))
  await failsOn('ar-071', 'canonical business events', (d) => cut(d, 'prc ~> canon'))
  // Analytics takes the canonical events, or its own mapper over the raw feed.
  await passes('ar-071', (d) => {
    cut(d, 'raw ~> dw')
    draw(d, 'canon ~> dw')
  })
  await passes('ar-071', (d) => {
    // The loader takes every raw change, a vendor batch burst included, so it needs 0.5 vCore.
    box(d, 'pdw', 'process-api', 'prc-lake-loader', { vCores: '0.5' })
    cut(d, 'raw ~> dw')
    draw(d, 'raw ~> pdw', 'pdw -> dw')
  })
  await passes('ar-071', (d) => {
    d.nodes.find((n) => n.id === 'canon').type = 'event-stream'
  })

  // AR-073
  await failsOn('ar-073', 'Run: A zone fails at peak', (d) => set(d, 'soms', { replicas: undefined }))
  await failsOn('ar-073', 'Run: Peak day orders and an unknown caller', (d) => set(d, 'emkt', { auth: undefined }))
  await failsOn('ar-073', 'Run: A zone fails at peak', (d) => set(d, 'pcap', { replicas: undefined }))
  // A redelivery limit with no DLQ drops the releases for an offline store.
  await failsOn('ar-073', 'Run: A store system is offline', (d) => set(d, 'topic', { maxRedelivery: 3 }))
  await failsOn('ar-073', 'hands its orders to a Process API', (d) => cut(d, 'estore -> pcap'))
  await failsOn('ar-073', 'DC WMS and the stores', (d) => cut(d, 'pful -> swms'))
  await failsOn('ar-073', 'go back to the OMS', (d) => cut(d, 'pful -> soms'))
  await failsOn('ar-073', 'sync calls. Async work', (d) => swap(d, 'pcap -> soms'))
  await failsOn('ar-073', 'connects to its backend', (d) => cut(d, 'spos -> pos'))
  // Camp A: Mule builds the order state machine and no OMS is drawn.
  await failsOn('ar-073', 'OMS is reached only through', (d) => {
    unbox(d, 'oms')
    box(d, 'db', 'database', 'Oracle order schema')
    draw(d, 'soms -> db')
  })
  // Order capture keeps its own copy of the orders in Oracle.
  await failsOn('ar-073', 'Mule keeps no order database', (d) => {
    box(d, 'db', 'database', 'Oracle order schema')
    draw(d, 'pcap -> db')
  })
  // The fulfilment Process API tracks order state in its own table.
  await failsOn('ar-073', 'Mule keeps no order database', (d) => {
    box(d, 'db', 'oracle-db', 'Fulfilment state')
    draw(d, 'pful -> db')
  })
  // Order capture keeps client order ids in an Object Store for idempotency.
  await passes('ar-073', (d) => {
    box(d, 'os', 'cache', 'Object Store: client order ids')
    draw(d, 'pcap -> os')
  })
  // The OMS publishes its own events.
  await passes('ar-073', (d) => {
    cut(d, 'soms ~> topic')
    draw(d, 'oms ~> topic')
  })
  // One Experience API for every channel.
  await passes('ar-073', (d) => {
    unbox(d, 'estore')
    unbox(d, 'emkt')
    draw(d, 'store -> ecom', 'mkt -> ecom')
    // Marketplaces now call the shared Experience API, so it enforces client ids.
    set(d, 'ecom', { auth: 'client-id' })
  })
  await passes('ar-073', (d) => {
    box(d, 'q', 'queue', 'fulfilment-q')
    cut(d, 'topic ~> pful')
    draw(d, 'topic ~> q', 'q ~> pful')
  })

  // AR-074
  await failsOn('ar-074', 'Run: A caller without a client id', (d) => set(d, 'gw', { auth: undefined }))
  await failsOn('ar-074', 'Run: A supplier script floods the portal', (d) => set(d, 'esup', { rateLimit: undefined }))
  await failsOn('ar-074', 'Run: The TMS hangs', (d) => set(d, 'pful', { onFailure: undefined }))
  // A partial answer with the default 10 second timeout: staff wait 10 seconds for every screen.
  await failsOn('ar-074', 'Run: The TMS hangs', (d) => set(d, 'pful', { timeoutMs: undefined, circuitBreaker: undefined }))
  await failsOn('ar-074', 'never bypass the gateway', (d) => draw(d, 'sup -> esup'))
  await failsOn('ar-074', 'Supplier requests reach both Oracle and the WMS', (d) => cut(d, 'psup -> swms'))
  await failsOn('ar-074', 'Oracle, the WMS and the TMS', (d) => cut(d, 'pful -> stms'))
  await failsOn('ar-074', 'sync calls. Async work', (d) => swap(d, 'estore -> pful'))
  await failsOn('ar-074', 'gateway forwards live requests', (d) => swap(d, 'gw -> esup'))
  await failsOn('ar-074', 'goes through a Process API', (d) => cut(d, 'esup -> psup'))
  // Staff calls go through the gateway too.
  await passes('ar-074', (d) => {
    cut(d, 'store -> estore')
    draw(d, 'store -> gw', 'gw -> estore')
    // Staff traffic now passes the gateway too, so exp-store-app gets its own rate limit, like every API the gateway exposes.
    set(d, 'estore', { rateLimit: 25 })
  })
  await passes('ar-074', (d) => draw(d, 'psup -> stms'))
  await passes('ar-074', (d) => rename(d, 'sinv', 'sys-ebs-inventory'))

  // AR-075
  // The ingest on 0.1 vCore cannot drain the doorbuster backlog in two hours.
  await failsOn('ar-075', 'Run: The doorbuster burst', (d) => set(d, 'ping', { vCores: undefined }))
  // "Scale everything": 8 replicas per front API blows the budget.
  await failsOn('ar-075', 'Run: The doorbuster burst', (d) => {
    for (const id of ['exp', 'pchk', 'spay']) set(d, id, { replicas: 8 })
  })
  await failsOn('ar-075', 'Run: Oracle is down and the broker restarts', (d) => set(d, 'q', { persistent: 'no' }))
  // A redelivery limit on the queue with the DLQ drawn only from the ingest app: orders are dropped while Oracle is down.
  await failsOn('ar-075', 'Run: Oracle is down and the broker restarts', (d) => set(d, 'q', { maxRedelivery: 3 }))
  await failsOn('ar-075', 'Run: Bots push past the tested capacity', (d) => set(d, 'gw', { rateLimit: undefined }))
  await failsOn('ar-075', 'No chain of sync calls', (d) => draw(d, 'exp -> sord'))
  await failsOn('ar-075', 'does not write orders to Oracle synchronously', (d) => draw(d, 'pchk -> sord'))
  await failsOn('ar-075', 'through the queue', (d) => cut(d, 'ping -> sord'))
  await failsOn('ar-075', 'Card authorisation stays in the request', (d) => cut(d, 'pchk -> spay'))
  await failsOn('ar-075', 'sync calls. Async work', (d) => swap(d, 'pchk -> spay'))
  await failsOn('ar-075', 'forwards checkouts to the Experience API', (d) => cut(d, 'gw -> exp'))
  await failsOn('ar-075', 'never bypass the gateway', (d) => draw(d, 'web -> exp'))
  await failsOn('ar-075', 'its lines are sync calls', (d) => swap(d, 'mob -> gw'))
  await passes('ar-075', (d) => {
    box(d, 't', 'topic', 'order.created')
    draw(d, 'ping ~> t')
  })
  await passes('ar-075', (d) => {
    cut(d, 'ping ~> dlq')
    draw(d, 'q ~> dlq')
  })
  await passes('ar-075', (d) => rename(d, 'pchk', 'prc-order-capture'))

  // AR-077
  await failsOn('ar-077', 'Run: A busy day of lot movements', (d) => set(d, 'ping', { vCores: undefined }))
  await failsOn('ar-077', 'Run: A busy day of lot movements', (d) => set(d, 'swms', { vCores: undefined }))
  // The System API on 0.1 vCore cannot catch up after the outage.
  await failsOn('ar-077', 'Run: The traceability store is down for an hour', (d) => set(d, 'strace', { vCores: undefined }))
  // A redelivery limit with no DLQ drops movements while the store is down.
  await failsOn('ar-077', 'Run: The traceability store is down for an hour', (d) => set(d, 'tev', { maxRedelivery: 5 }))
  await failsOn('ar-077', 'Run: A recall while customer alerts are down', (d) => set(d, 'prec', { onFailure: undefined }))
  await failsOn('ar-077', 'WMS lot events reach', (d) => cut(d, 'swms ~> tev'))
  await failsOn('ar-077', 'Supplier ASN lots reach', (d) => cut(d, 'pasn ~> tev'))
  await failsOn('ar-077', 'Every Experience API calls a Process API', (d) => cut(d, 'erec -> prec'))
  await failsOn('ar-077', 'sync calls. Async work', (d) => swap(d, 'prec -> strace'))
  await failsOn('ar-077', 'connects to its backend', (d) => cut(d, 'spos -> pos'))
  await failsOn('ar-077', 'Recall notices reach the store', (d) => cut(d, 'rtopic ~> pstore'))
  await passes('ar-077', (d) => unbox(d, 'notif'))
  // Recall notices sent to the store Process API directly.
  await passes('ar-077', (d) => {
    unbox(d, 'rtopic')
    draw(d, 'prec -> pstore')
  })
  await passes('ar-077', (d) => {
    d.nodes.find((n) => n.id === 'tev').type = 'queue'
  })

  // AR-080
  // The EU sales process also writes to the US loyalty System API.
  await failsOn('ar-080', 'Run: Peak trading stays in each region', (d) => draw(d, 'peu -> sus'))
  await failsOn('ar-080', 'Run: Peak trading stays in each region', (d) => set(d, 'peu', { vCores: undefined }))
  await failsOn('ar-080', 'Run: Global analytics is down for an hour', (d) => set(d, 'pg', { vCores: undefined }))
  // A redelivery limit with no DLQ drops aggregates while the warehouse is down.
  await failsOn('ar-080', 'Run: Global analytics is down for an hour', (d) => set(d, 'g', { maxRedelivery: 3 }))
  await failsOn('ar-080', 'publish aggregated', (d) => cut(d, 'peu ~> g'))
  await failsOn('ar-080', 'processed into the customer store of each region', (d) => cut(d, 'qeu ~> peu'))
  await failsOn('ar-080', 'No route carries regional customer data', (d) => draw(d, 'dbus ~> dw'))
  // The global process reads straight from a regional System API.
  await failsOn('ar-080', 'No route carries regional customer data', (d) => draw(d, 'sus -> pg'))
  await failsOn('ar-080', 'Every Experience API calls a Process API', (d) => cut(d, 'eloy -> ploy'))
  await failsOn('ar-080', 'sync calls. Async work', (d) => swap(d, 'peu -> seu'))
  // The EU sales process writes raw sales straight to the warehouse.
  await failsOn('ar-080', 'only through the aggregate stream', (d) => draw(d, 'peu -> dw'))
  // US sales cross the border on a raw topic.
  await failsOn('ar-080', 'only through the aggregate stream', (d) => {
    box(d, 'raw', 'topic', 'global.sales.lines')
    draw(d, 'pus ~> raw', 'raw ~> pg')
  })
  // The global topic carries pseudonymised member metrics.
  await passes('ar-080', (d) => rename(d, 'g', 'global.loyalty.pseudonymised'))
  // One aggregate topic per region.
  await passes('ar-080', (d) => {
    box(d, 'g2', 'topic', 'us.sales.aggregates (no PII)')
    cut(d, 'pus ~> g')
    draw(d, 'pus ~> g2', 'g2 ~> pg')
  })
  await passes('ar-080', (d) => {
    d.nodes.find((n) => n.id === 'dbus').type = 'crm'
  })

  // AR-081
  // The loader keeps 0.1 vCore: it takes 50 records a second and the queue never drains.
  await failsOn('ar-081', 'Run: Morning file burst', (d) => set(d, 'load', { vCores: undefined }))
  // The intake keeps 0.1 vCore and cannot read the burst.
  await failsOn('ar-081', 'Run: Morning file burst', (d) => set(d, 'job', { vCores: undefined }))
  // Oversized intake: over the 2 vCore budget.
  await failsOn('ar-081', 'Run: Morning file burst', (d) => set(d, 'job', { vCores: '2' }))
  // The intake loads records straight into the Process API, so the burst hits Oracle.
  await failsOn('ar-081', 'Run: Morning file burst', (d) => {
    cut(d, 'job ~> q')
    draw(d, 'job -> load')
  })
  // A redelivery limit of 3 parks records in the DLQ during a routine maintenance window.
  await failsOn('ar-081', 'Run: Oracle maintenance window', (d) => set(d, 'q', { maxRedelivery: 3 }))
  // No redelivery limit: records Oracle keeps rejecting are retried forever.
  await failsOn('ar-081', 'Run: Oracle rejects every record', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // A limit but no DLQ drawn: the failing records are dropped.
  await failsOn('ar-081', 'Run: Oracle rejects every record', (d) => cut(d, 'q ~> dlq'))
  await failsOn('ar-081', 'Every partner delivers', (d) => cut(d, 'p2 -> ftp'))
  await failsOn('ar-081', 'picks up from every file server', (d) => cut(d, 'job -> ftp'))
  await failsOn('ar-081', 'both Oracle and SQL Server through the queue', (d) => cut(d, 'q ~> load'))
  await failsOn('ar-081', 'both Oracle and SQL Server through the queue', (d) => cut(d, 'load -> sbil'))
  await failsOn('ar-081', 'sync calls. Async work', (d) => swap(d, 'load -> sord'))
  await failsOn('ar-081', 'connects to its backend', (d) => cut(d, 'sord -> ora'))
  await failsOn('ar-081', 'receives files from partners', (d) => unbox(d, 'p1'))
  await passes('ar-081', (d) => unbox(d, 'mon'))
  // One System API writes to both databases.
  await failsOn('ar-081', 'none connects to both', (d) => draw(d, 'sord -> mss'))
  // The System APIs also report to the tracking dashboard.
  await passes('ar-081', (d) => draw(d, 'sord -> mon', 'sbil -> mon'))
  // One SFTP server for every partner.
  await passes('ar-081', (d) => {
    unbox(d, 'ftp')
    draw(d, 'p2 -> sftp')
  })
  // A loader per database on one shared queue. The loaders compete for every record, so the billing loader takes
  // order records it cannot load and acknowledges them: orders that failed against Oracle never get there.
  // (This used to be listed as a correct design; the run shows why each loader needs its own queue.)
  await failsOn('ar-081', 'Run: Oracle maintenance window', (d) => {
    box(d, 'load2', 'process-api', 'prc-partner-billing')
    cut(d, 'load -> sbil')
    draw(d, 'q ~> load2', 'load2 -> sbil')
  })
  // A loader per database, each with its own queue and the same redelivery limit.
  await passes('ar-081', (d) => {
    box(d, 'load2', 'process-api', 'prc-partner-billing')
    box(d, 'q2', 'queue', 'partner.billing.records', { maxRedelivery: 20 })
    cut(d, 'load -> sbil')
    draw(d, 'job ~> q2', 'q2 ~> load2', 'q2 ~> dlq', 'load2 -> sbil')
  })

  // AR-082
  // The archive Process API keeps 0.1 vCore and fails a third of the storm surge.
  await failsOn('ar-082', 'Run: Claims surge after a storm', (d) => set(d, 'prc', { vCores: undefined }))
  await failsOn('ar-082', 'Run: Claims surge after a storm', (d) => set(d, 'sidx', { vCores: undefined }))
  // The S3 copy is made in the user's request: an S3 outage fails the uploads.
  await failsOn('ar-082', 'Run: S3 is down for 30 minutes', (d) => draw(d, 'prc -> ss3'))
  // A redelivery limit of 5 parks thousands of good requests during a normal outage.
  await failsOn('ar-082', 'Run: S3 is down for 30 minutes', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // No redelivery limit: refused copies are retried forever and never reach the DLQ.
  await failsOn('ar-082', 'Run: S3 refuses every copy', (d) => set(d, 'q', { maxRedelivery: undefined }))
  await failsOn('ar-082', 'stored in Azure Blob in the user', (d) => cut(d, 'prc -> sblob'))
  await failsOn('ar-082', 'indexed in the user', (d) => cut(d, 'prc -> sidx'))
  await failsOn('ar-082', 'No chain of sync calls', (d) => draw(d, 'prc -> ss3'))
  await failsOn('ar-082', 'archived through a Process API', (d) => {
    cut(d, 'job -> prc')
    draw(d, 'job -> sblob')
  })
  await failsOn('ar-082', 'reads the old DMS', (d) => cut(d, 'job -> sdms'))
  await failsOn('ar-082', 'DMS is reached only through', (d) => draw(d, 'job -> dms'))
  await failsOn('ar-082', 'sync calls. Async work', (d) => swap(d, 'exp -> prc'))
  await failsOn('ar-082', 'replicator reads the document', (d) => cut(d, 'rep -> sblob'))
  await failsOn('ar-082', 'staff channel calls', (d) => unbox(d, 'staff'))
  await passes('ar-082', (d) => cut(d, 'rep -> sidx'))
  // Azure Service Bus as the replication queue.
  await passes('ar-082', (d) => {
    d.nodes.find((n) => n.id === 'q').type = 'cloud-queue'
  })
  // The migration job queues its own replication requests.
  await passes('ar-082', (d) => draw(d, 'job ~> q'))

  // AR-083
  // The apply Process API keeps 0.1 vCore: Kafka falls further behind every minute.
  await failsOn('ar-083', 'Run: Dual run at peak', (d) => set(d, 'sync', { vCores: undefined }))
  // 0.2 vCore for the SQL Server System API is still under 120 changes a second.
  await failsOn('ar-083', 'Run: Dual run at peak', (d) => set(d, 'smss', { vCores: '0.2' }))
  await failsOn('ar-083', 'Run: SQL Server is down for 15 minutes', (d) => set(d, 'sync', { vCores: '0.2' }))
  // A broker that does not keep its events loses the waiting changes on a restart.
  await failsOn('ar-083', 'Run: Kafka restarts while changes wait', (d) => set(d, 'cdc', { persistent: 'no' }))
  await failsOn('ar-083', 'still reach Oracle in sync calls', (d) => cut(d, 'prc -> sora'))
  await failsOn('ar-083', 'route channel requests to SQL Server', (d) => cut(d, 'prc -> smss'))
  // The System API reads Kafka itself, so nobody maps the Oracle types.
  await failsOn('ar-083', 'maps each change', (d) => {
    cut(d, 'cdc ~> sync')
    draw(d, 'cdc ~> smss')
  })
  await failsOn('ar-083', 'sync calls. Async work', (d) => swap(d, 'sync -> smss'))
  await failsOn('ar-083', 'reads both sides', (d) => cut(d, 'rec -> sora'))
  await failsOn('ar-083', 'Every Experience API calls a Process API', (d) => cut(d, 'exp -> prc'))
  await failsOn('ar-083', 'Every channel calls', (d) => unbox(d, 'cs'))
  await passes('ar-083', (d) => unbox(d, 'mon'))
  await passes('ar-083', (d) => {
    cut(d, 'sync ~> dlq')
    draw(d, 'cdc ~> dlq')
  })
  await passes('ar-083', (d) => {
    d.nodes.find((n) => n.id === 'cdc').type = 'topic'
  })

  // AR-086
  // No token policy on the gateway.
  await failsOn('ar-086', 'Run: Calls without a valid token', (d) => set(d, 'gw', { auth: undefined }))
  // Client ID Enforcement instead of token enforcement lets a bare client id through.
  await failsOn('ar-086', 'Run: Calls without a valid token', (d) => set(d, 'gw', { auth: 'client-id' }))
  // The default 10 second timeout waits for slow core banking on every call.
  await failsOn('ar-086', 'Run: Core banking slows down', (d) => set(d, 'sc', { timeoutMs: undefined, circuitBreaker: undefined }))
  await failsOn('ar-086', 'Every Experience API is reached through the gateway', (d) => cut(d, 'gw -> ep'))
  await failsOn('ar-086', 'Every Experience API calls a Process API', (d) => cut(d, 'ep -> pp'))
  await failsOn('ar-086', 'Every Process API calls a System API', (d) => cut(d, 'pp -> sc'))
  await failsOn('ar-086', 'Token requests and gateway traffic', (d) => swap(d, 'gw -> idp'))
  await failsOn('ar-086', 'sync calls. Async work', (d) => swap(d, 'pa -> sc'))
  await failsOn('ar-086', 'validates tokens', (d) => flip(d, 'gw -> idp'))
  await passes('ar-086', (d) => unbox(d, 'mon'))
  await passes('ar-086', (d) => {
    unbox(d, 'pp')
    draw(d, 'ep -> pa')
  })
  await passes('ar-086', (d) => {
    box(d, 'mob', 'mobile-app', 'Mobile banking app')
    draw(d, 'mob -> idp', 'mob -> gw')
  })

  // AR-087
  // The app never checks the client certificate the DLB reports.
  await failsOn('ar-087', 'Run: Callers without a client certificate', (d) => set(d, 'exp', { auth: undefined }))
  // An API key check instead of the certificate check.
  await failsOn('ar-087', 'Run: Callers without a client certificate', (d) => set(d, 'exp', { auth: 'client-id' }))
  // Policy admin and sanctions called one after the other: about 1.5 seconds.
  await failsOn('ar-087', 'Run: Treaty requests at peak', (d) => set(d, 'prc', { calls: undefined }))
  await failsOn('ar-087', 'called by a Process API', (d) => cut(d, 'prc -> sb'))
  await failsOn('ar-087', 'sanctions service end to end', (d) => cut(d, 'prc -> sb'))
  await failsOn('ar-087', 'Every hop is a live HTTPS call', (d) => swap(d, 'exp -> prc'))
  await failsOn('ar-087', 'Every hop is a live HTTPS call', (d) => swap(d, 'sb -> ext'))
  await failsOn('ar-087', 'never call System APIs directly', (d) => draw(d, 'exp -> sl'))
  await failsOn('ar-087', 'connects to its backend', (d) => cut(d, 'sl -> leg'))
  // A Process API per backend.
  // The Experience API now makes the two calls, so it calls them in parallel to stay under 1.2 seconds.
  await passes('ar-087', (d) => {
    box(d, 'prc2', 'process-api', 'prc-sanctions')
    cut(d, 'prc -> sb')
    draw(d, 'exp -> prc2', 'prc2 -> sb')
    set(d, 'exp', { calls: 'in parallel' })
  })
  await passes('ar-087', (d) => rename(d, 'lb', 'DLB with client cert validation'))

  // AR-088
  // No SLA limit: the partner's 300 a second overload the APIs and fail with 503.
  await failsOn('ar-088', 'Run: A partner goes over its plan', (d) => set(d, 'gw', { rateLimit: undefined }))
  // A Premium plan of 100 a second with the shared Process API left at 0.1 vCore.
  await failsOn('ar-088', 'Run: A partner goes over its plan', (d) => {
    set(d, 'pr', { vCores: undefined })
    set(d, 'gw', { rateLimit: 100 })
  })
  // No Client ID Enforcement: calls with no contract get through.
  await failsOn('ar-088', 'Run: Calls without a client id', (d) => set(d, 'gw', { auth: undefined }))
  await failsOn('ar-088', 'called by a Process API', (d) => cut(d, 'pr -> st'))
  await failsOn('ar-088', 'Transport management is reached only', (d) => draw(d, 'pr -> tms'))
  await failsOn('ar-088', 'connects to its backend', (d) => cut(d, 'st -> tms'))
  await failsOn('ar-088', 'its lines to the APIs are sync calls', (d) => swap(d, 'gw -> et'))
  await failsOn('ar-088', 'sync calls. Async work', (d) => swap(d, 'et -> pr'))
  await passes('ar-088', (d) => rename(d, 'portal', 'API Experience Hub'))
  // Shipments get their own Process API.
  await passes('ar-088', (d) => {
    box(d, 'ps', 'process-api', 'prc-shipment-booking')
    cut(d, 'es -> pr')
    draw(d, 'es -> ps', 'ps -> st')
  })
  await passes('ar-088', (d) => swap(d, 'gw -> mon'))
  // Every Experience API gets its own Process API, so nothing is shared.
  await failsOn('ar-088', 'One Process API is shared', (d) => {
    box(d, 'pt', 'process-api', 'prc-tracking')
    box(d, 'pq', 'process-api', 'prc-rates')
    cut(d, 'et -> pr', 'er -> pr')
    draw(d, 'et -> pt', 'er -> pq', 'pt -> st', 'pq -> se')
  })

  // AR-089
  // No quota on the claims proxy: bursts reach the vendor and fail.
  await failsOn('ar-089', 'Run: Partners flood the claims service', (d) => set(d, 'gw1', { rateLimit: undefined }))
  // A server group: each of four nodes counts 100 on its own, so 400 a second can reach the vendor.
  await failsOn('ar-089', 'Run: Partners flood the claims service', (d) => set(d, 'gw1', { rateLimit: 400 }))
  // No spike control on the quotes proxy.
  await failsOn('ar-089', 'Run: A burst of quote requests', (d) => set(d, 'gw2', { rateLimit: undefined }))
  // No Client ID Enforcement on the claims proxy.
  await failsOn('ar-089', 'Run: Calls without a client id', (d) => set(d, 'gw1', { auth: undefined }))
  await failsOn('ar-089', 'Every proxy is reached through the load balancer', (d) => cut(d, 'lb -> gw2'))
  await failsOn('ar-089', 'both enter through the load balancer', (d) => cut(d, 'i -> lb'))
  await failsOn('ar-089', 'Every proxy sends its monitoring data', (d) => cut(d, 'gw2 -> mon'))
  await failsOn('ar-089', 'No client has a direct line', (d) => draw(d, 'i -> q'))
  await failsOn('ar-089', 'lines to the services are sync calls', (d) => swap(d, 'gw1 -> v'))
  await failsOn('ar-089', 'Separate proxies', (d) => {
    unbox(d, 'gw2')
    draw(d, 'gw1 -> q')
  })
  // Agents ship monitoring data in the background.
  await passes('ar-089', (d) => swap(d, 'gw1 -> mon'))
  await passes('ar-089', (d) => rename(d, 'lb', 'F5 load balancer'))

  // AR-095
  // A migrated app left with one replica stops the chain when its zone fails.
  await failsOn('ar-095', 'Run: One availability zone fails', (d) => set(d, 'pr', { replicas: undefined }))
  // The CloudHub 1.0 portal API kept on one worker.
  await failsOn('ar-095', 'Run: One availability zone fails', (d) => set(d, 'e2', { replicas: undefined }))
  // The partner API moved without its client certificate check.
  await failsOn('ar-095', 'Run: Partner calls without a client certificate', (d) => set(d, 'e1', { auth: undefined }))
  await failsOn('ar-095', 'reaches SAP back through the DLB', (d) => cut(d, 'dlb -> s1'))
  await failsOn('ar-095', 'calls back through the DLB', (d) => cut(d, 'pr -> dlb'))
  await failsOn('ar-095', 'directly or through ingress', (d) => cut(d, 'e2 -> ing'))
  await failsOn('ar-095', 'Ingress routes calls to the migrated Process API', (d) => cut(d, 'ing -> pr'))
  await failsOn('ar-095', 'never call ingress directly', (d) => draw(d, 'p1 -> ing'))
  await failsOn('ar-095', 'database is reached only through', (d) => draw(d, 'pr -> db'))
  await failsOn('ar-095', 'connects to its backend', (d) => cut(d, 's2 -> db'))
  await failsOn('ar-095', 'sync calls. Async work', (d) => swap(d, 'e1 -> pr'))
  await failsOn('ar-095', 'called by the Process API', (d) => cut(d, 'pr -> s2'))
  await failsOn('ar-095', 'still enter through', (d) => unbox(d, 'web'))
  await passes('ar-095', (d) => unbox(d, 'mon'))
  // The migrated System API is also called through ingress.
  await passes('ar-095', (d) => {
    cut(d, 'pr -> s2')
    draw(d, 'pr -> ing', 'ing -> s2')
  })
}
