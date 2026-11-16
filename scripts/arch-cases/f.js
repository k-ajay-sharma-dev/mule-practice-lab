// Wrong and other correct diagrams for batch F. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename, set }) => {
  // AR-060
  // Replacing v1 on one release date: everyone moved and v1 is gone.
  await failsOn('ar-060', 'v1 System API still runs', (d) => {
    unbox(d, 'sv1')
    draw(d, 'pord -> sv2', 'ponb -> sv2', 'pmkt -> sv2')
  })
  // v2 is published, but nobody has moved yet.
  await failsOn('ar-060', 'Each version is in use', (d) => {
    cut(d, 'p360 -> sv2')
    draw(d, 'p360 -> sv1')
  })
  // A Process API calls Salesforce directly during the transition.
  await failsOn('ar-060', 'only through System APIs', (d) => {
    cut(d, 'pord -> sv1')
    draw(d, 'pord -> sf')
  })
  // The Experience API is moved to v2 as well, so the change leaks upwards.
  await failsOn('ar-060', 'stops at the Process layer', (d) => draw(d, 'ep -> sv2'))
  await failsOn('ar-060', 'All four Process APIs', (d) => cut(d, 'ponb -> sv1'))
  await failsOn('ar-060', 'v2 reaches Salesforce', (d) => flip(d, 'sv2 -> sf'))
  await failsOn('ar-060', 'All three Experience APIs', (d) => unbox(d, 'em'))
  await failsOn('ar-060', 'sync calls', (d) => swap(d, 'p360 -> sv2'))
  // v1 as a thin adapter over the v2 logic.
  await passes('ar-060', (d) => {
    cut(d, 'sv1 -> sf')
    draw(d, 'sv1 -> sv2')
  })
  // A later point in the run-both period: two have moved.
  await passes('ar-060', (d) => {
    cut(d, 'pord -> sv1')
    draw(d, 'pord -> sv2')
  })
  // Experience APIs that call several Process APIs, and external consumers drawn in front.
  await passes('ar-060', (d) => {
    box(d, 'ext', 'partner', '40 external consumers')
    draw(d, 'ext -> ep', 'ep -> pord')
  })
  // v1 has no limit of its own, so the bulk sync uses up the Salesforce limit.
  await failsOn('ar-060', 'Run: Marketing bulk sync on v1', (d) => set(d, 'sv1', { rateLimit: undefined }))
  await failsOn('ar-060', 'Run: Customer 360 at peak', (d) => set(d, 'p360', { vCores: undefined }))

  // AR-066
  // The consultant's design: an Experience API in front of every sync.
  await failsOn('ar-066', 'Only one partner-facing API', (d) => {
    box(d, 'ecus', 'experience-api', 'exp-customer-sync-api')
    draw(d, 'ecus -> cus')
  })
  // A System API for Shopify that only one app uses.
  await failsOn('ar-066', 'at least two sync apps share it', (d) => {
    box(d, 'sshop', 'system-api', 'sys-shopify-api')
    cut(d, 'ord -> shop')
    draw(d, 'ord -> sshop', 'sshop -> shop')
  })
  // The partner is given a direct line into a sync app.
  await failsOn('ar-066', 'around the partner API', (d) => draw(d, 'tpl -> ord'))
  // Each app keeps its own Salesforce connection, so auth and limits are repeated.
  await failsOn('ar-066', 'Salesforce is reached only', (d) => draw(d, 'cus -> sf'))
  await failsOn('ar-066', 'NetSuite is reached only', (d) => draw(d, 'fin -> ns'))
  await failsOn('ar-066', 'hands its work', (d) => cut(d, 'papi -> ord'))
  await failsOn('ar-066', 'All four systems', (d) => unbox(d, 'pg'))
  await failsOn('ar-066', 'connects to its system', (d) => flip(d, 'sns -> ns'))
  await failsOn('ar-066', 'sync calls', (d) => swap(d, 'papi -> ord'))
  await failsOn('ar-066', 'data store', (d) => swap(d, 'cus -> pg'))
  // A shared System API for Shopify too, once a second app uses it.
  await passes('ar-066', (d) => {
    box(d, 'sshop', 'system-api', 'sys-shopify-api')
    cut(d, 'ord -> shop')
    draw(d, 'ord -> sshop', 'fin -> sshop', 'sshop -> shop')
  })
  // API Manager policies drawn as a gateway in front of the partner API.
  await passes('ar-066', (d) => {
    box(d, 'gw', 'api-gateway', 'client-id and rate limit policies')
    cut(d, 'tpl -> papi')
    draw(d, 'tpl -> gw', 'gw -> papi')
  })
  await passes('ar-066', (d) => {
    rename(d, 'sf', 'SFDC')
    d.nodes.find((n) => n.id === 'sf').type = 'saas'
  })
  // The partner API with no client-id enforcement.
  await failsOn('ar-066', 'Run: The 3PL partner at its peak', (d) => set(d, 'papi', { auth: undefined }))
  // Two large replicas for an order sync that needs a fraction of one.
  await failsOn('ar-066', 'Run: The 3PL partner at its peak', (d) => set(d, 'ord', { replicas: 2, vCores: '1' }))
  await failsOn('ar-066', 'Run: The partner floods the API', (d) => set(d, 'papi', { rateLimit: undefined }))

  // AR-067
  // The POS calls HQ over HTTPS with retries: nothing survives a long outage.
  await failsOn('ar-067', 'passes the store broker', (d) => draw(d, 'pos -> ps'))
  // Each POS publishes straight to Anypoint MQ in the cloud.
  await failsOn('ar-067', 'passes the store broker', (d) => {
    box(d, 'amq', 'cloud-queue', 'Anypoint MQ sales queue')
    unbox(d, 'sOut')
    draw(d, 'pos ~> amq', 'amq ~> ps')
  })
  // No local buffer: the POS publishes to the HQ hub directly.
  await failsOn('ar-067', 'store broker as an async message', (d) => {
    unbox(d, 'sOut')
    draw(d, 'pos ~> hSales')
  })
  // A non-durable topic at HQ that the stores subscribe to directly.
  await failsOn('ar-067', 'its own durable queue', (d) => {
    box(d, 'prices', 'topic', 'prices (non-durable topic)')
    unbox(d, 'sIn')
    unbox(d, 'hPrices')
    draw(d, 'pp ~> prices', 'prices ~> pos')
  })
  await failsOn('ar-067', 'forwards to the HQ hub', (d) => flip(d, 'sOut ~> hSales'))
  await failsOn('ar-067', 'Sales reach Oracle Retail', (d) => cut(d, 'hSales ~> ps'))
  await failsOn('ar-067', 'only through a System API', (d) => draw(d, 'ps -> ora'))
  await failsOn('ar-067', 'Price changes leave HQ', (d) => cut(d, 'hPrices ~> sIn'))
  await failsOn('ar-067', 'async message', (d) => swap(d, 'hSales ~> ps'))
  await failsOn('ar-067', 'sync calls', (d) => swap(d, 'ps -> so'))
  await passes('ar-067', (d) => unbox(d, 'kafka'))
  // A virtual topic at HQ with a consumer queue per store.
  await passes('ar-067', (d) => {
    box(d, 'vt', 'topic', 'VirtualTopic.prices')
    cut(d, 'pp ~> hPrices')
    draw(d, 'pp ~> vt', 'vt ~> hPrices')
  })
  // Kafka fed from the hub by a bridge rather than by prc-store-sales.
  await passes('ar-067', (d) => {
    box(d, 'br', 'process-api', 'prc-sales-to-kafka')
    cut(d, 'ps ~> kafka')
    draw(d, 'hSales ~> br', 'br ~> kafka')
  })
  // The POS also calls HQ over HTTPS, so sales fail while HQ is unreachable.
  await failsOn('ar-067', 'Run: HQ cannot take sales for two hours', (d) => draw(d, 'pos -> ps'))
  // The HQ consumer only keeps up with the normal rate, so the backlog never clears.
  await failsOn('ar-067', 'Run: HQ cannot take sales for two hours', (d) => set(d, 'ps', { vCores: undefined }))
  await failsOn('ar-067', 'Run: The hub broker restarts', (d) => set(d, 'hSales', { persistent: 'no' }))
  await failsOn('ar-067', 'Run: A store is offline when prices change', (d) => set(d, 'sIn', { persistent: 'no' }))

  // AR-078
  // Today's dual write: the receipt app publishes right after the insert.
  await failsOn('ar-078', 'never publishes the event itself', (d) => {
    unbox(d, 'relay')
    draw(d, 'gr ~> top')
  })
  // The receipt app hands the event to the relay itself, so the crash window remains.
  await failsOn('ar-078', 'never publishes the event itself', (d) => draw(d, 'gr ~> relay'))
  // A relay that does not read the outbox table.
  await failsOn('ar-078', 'reads the OUTBOX table', (d) => cut(d, 'relay -> ora'))
  // The relay is drawn, but the app still publishes beside it.
  await failsOn('ar-078', 'Only the outbox relay publishes', (d) => draw(d, 'gr ~> top'))
  await failsOn('ar-078', 'through the wms.receipts queue', (d) => {
    unbox(d, 'inq')
    draw(d, 'wms ~> gr')
  })
  await failsOn('ar-078', 'writes the receipt', (d) => cut(d, 'gr -> ora'))
  await failsOn('ar-078', 'all three subscribers', (d) => unbox(d, 'portal'))
  await failsOn('ar-078', 'async message', (d) => swap(d, 'relay ~> top'))
  await failsOn('ar-078', 'data store', (d) => swap(d, 'gr -> ora'))
  // A db:listener on OUTBOX, drawn as Oracle feeding the relay.
  await passes('ar-078', (d) => flip(d, 'relay -> ora'))
  // Subscribers each read their own queue from the topic.
  await passes('ar-078', (d) => {
    box(d, 'qap', 'queue', 'ap.receipts')
    cut(d, 'top ~> ap')
    draw(d, 'top ~> qap', 'qap ~> ap')
  })
  await passes('ar-078', (d) => {
    rename(d, 'relay', 'prc-outbox-publisher')
    d.nodes.find((n) => n.id === 'relay').type = 'process-api'
  })
  // Like IMMEDIATE ack: one delivery and no dead-letter queue, so receipts that fail are dropped.
  await failsOn('ar-078', 'Run: Oracle fails for ten minutes', (d) => set(d, 'inq', { maxRedelivery: 1 }))
  // receipt.posted on a queue: the three subscribers compete for each event.
  await failsOn('ar-078', 'Run: Every subscriber gets each event', (d) => {
    d.nodes.find((n) => n.id === 'top').type = 'queue'
  })
  await failsOn('ar-078', 'Run: Catch-up after a stock take', (d) => set(d, 'gr', { vCores: undefined }))
}
