// Wrong and other correct diagrams for batch A. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }) => {
  // AR-001
  await failsOn('ar-001', 'sync calls. Async work', (d) => swap(d, 'em -> prc'))
  await failsOn('ar-001', 'mobile app gets order status from SAP over sync calls', (d) => swap(d, 'ssap -> sap'))
  await failsOn('ar-001', 'web portal gets order status', (d) => cut(d, 'ew -> prc'))
  await failsOn('ar-001', 'called by a Process API', (d) => flip(d, 'prc -> scar'))
  await failsOn('ar-001', 'connects to its backend', (d) => {
    cut(d, 'scar -> car')
    box(d, 'scar2', 'system-api', 'sys-carrier-api')
    draw(d, 'prc -> scar2', 'scar2 -> car')
  })
  await failsOn('ar-001', 'Order status is cached', (d) => flip(d, 'prc -> cache'))
  // One shared Experience API for both channels.
  await passes('ar-001', (d) => {
    unbox(d, 'ew')
    draw(d, 'web -> em')
  })
  // The cache sits at the SAP System API.
  await passes('ar-001', (d) => {
    cut(d, 'prc -> cache')
    draw(d, 'ssap -> cache')
  })

  // AR-002
  await failsOn('ar-002', 'quote from the pricing engine over sync calls', (d) => swap(d, 'sp -> pe'))
  await failsOn('ar-002', 'sync calls. Async work', (d) => swap(d, 'eq -> sp'))
  await failsOn('ar-002', 'publishes PolicyIssued', (d) => {
    cut(d, 'pas ~> ex')
    draw(d, 'ec ~> ex')
  })
  await failsOn('ar-002', 'reaches all four consumer systems', (d) => unbox(d, 'crm'))
  await failsOn('ar-002', 'stored during the request', (d) => cut(d, 'ec -> fs'))
  await failsOn('ar-002', 'takes each claim from the queue', (d) => cut(d, 'pci -> cls'))
  // Ingestion inside the HTTP call, with the queue left beside it.
  await failsOn('ar-002', 'No chain of sync calls', (d) => draw(d, 'ec -> pci'))
  // A System API in front of the policy admin system publishes the event.
  await passes('ar-002', (d) => {
    box(d, 'spas', 'system-api', 'sys-policy-admin-api')
    cut(d, 'pas ~> ex')
    draw(d, 'spas -> pas', 'spas ~> ex')
  })
  // A Process API takes the upload and hands it to the queue.
  await passes('ar-002', (d) => {
    box(d, 'pin', 'process-api', 'prc-claim-intake')
    cut(d, 'ec ~> cq', 'ec -> fs')
    draw(d, 'ec -> pin', 'pin -> fs', 'pin ~> cq')
  })
  // The app uploads straight to object storage.
  await passes('ar-002', (d) => {
    cut(d, 'ec -> fs')
    draw(d, 'cust -> fs')
  })

  // AR-003
  await failsOn('ar-003', 'writes to its own store', (d) => cut(d, 'trk -> tdb'))
  await failsOn('ar-003', 'bound to the exchange', (d) => {
    box(d, 'xq', 'queue', 'extra-q')
    draw(d, 'exp ~> xq', 'xq ~> dlq', 'xq ~> ana')
  })
  await failsOn('ar-003', 'drained by a consumer', (d) => {
    box(d, 'xq', 'queue', 'audit-q')
    draw(d, 'ex ~> xq', 'xq ~> dlq')
  })
  await failsOn('ar-003', 'sync HTTP calls', (d) => swap(d, 'dev -> exp'))
  await failsOn('ar-003', 'reads from its own queue', (d) => flip(d, 'aq ~> ana'))
  // One dead-letter queue per queue, and billing deduplicates on a unique DB key alone.
  await passes('ar-003', (d) => {
    unbox(d, 'os')
    box(d, 'dlq2', 'dlq', 'billing-dlq')
    cut(d, 'bq ~> dlq')
    draw(d, 'bq ~> dlq2')
  })

  // AR-004
  await failsOn('ar-004', 'never skip the mTLS ingress', (d) => draw(d, 'fin -> gw'))
  await failsOn('ar-004', 'through the mobile backend', (d) => cut(d, 'mob -> mbk'))
  await failsOn('ar-004', 'reads payments through a System API', (d) => cut(d, 'api -> sp'))
  await failsOn('ar-004', 'consumers to the API are sync calls', (d) => swap(d, 'gw -> api'))
  await failsOn('ar-004', 'reached only through the policy gateway', (d) => draw(d, 'mbk -> api'))
  // A Process API between the Experience and System layers.
  await passes('ar-004', (d) => {
    box(d, 'prc', 'process-api', 'prc-payments-status')
    cut(d, 'api -> sp')
    draw(d, 'api -> prc', 'prc -> sp')
  })
  // The batch job uses client ID enforcement instead of a token.
  await passes('ar-004', (d) => cut(d, 'bat -> idp'))

  // AR-010
  await failsOn('ar-010', 'reads the approved prices', (d) => cut(d, 'job -> mer'))
  await failsOn('ar-010', 'stores pick up their nightly prices', (d) => cut(d, 'pos -> fs'))
  await failsOn('ar-010', 'stock from the inventory database over sync calls', (d) => swap(d, 'ss -> ora'))
  await failsOn('ar-010', 'sync calls. Async work', (d) => swap(d, 'es -> ss'))
  await failsOn('ar-010', 'reach both the loyalty and the finance', (d) => cut(d, 'lq ~> loy'))
  await failsOn('ar-010', 'reach both the loyalty and the finance', (d) => cut(d, 'fin -> fsys'))
  // Finance reads its queue in a nightly job.
  await passes('ar-010', (d) => {
    unbox(d, 'fin')
    box(d, 'fjob', 'batch-job', 'Nightly finance load')
    draw(d, 'fq ~> fjob', 'fjob -> fsys')
  })
  // Consumers read the topic directly, and the stock cache sits at the Experience API.
  await passes('ar-010', (d) => {
    unbox(d, 'lq')
    unbox(d, 'fq')
    draw(d, 'tp ~> loy', 'tp ~> fin', 'loy ~> dlq')
    cut(d, 'ss -> c')
    draw(d, 'es -> c')
  })
  await passes('ar-010', (d) => {
    d.nodes.find((n) => n.id === 'ora').type = 'oracle-db'
  })

  // AR-016
  await failsOn('ar-016', 'never by a System API calling it', (d) => draw(d, 'ssf -> hub'))
  await failsOn('ar-016', 'never sync with each other', (d) => draw(d, 'ssap -> secom'))
  await failsOn('ar-016', 'hub calls System APIs with sync calls', (d) => swap(d, 'hub -> ssap'))
  await failsOn('ar-016', 'applies owned attributes to all three', (d) => cut(d, 'hub -> secom'))
  await failsOn('ar-016', 'Every system publishes', (d) => flip(d, 'ssf ~> ev'))
  await failsOn('ar-016', 'each receive changes from their System API', (d) => cut(d, 'ssap -> sap'))
  await failsOn('ar-016', 'each receive changes from their System API', (d) => unbox(d, 'ecom'))
  // Kafka instead of an exchange, and the cross-reference in an Object Store.
  await passes('ar-016', (d) => {
    d.nodes.find((n) => n.id === 'ev').type = 'event-stream'
    d.nodes.find((n) => n.id === 'xref').type = 'cache'
  })
  // System APIs poll their systems for changes instead of being pushed.
  await passes('ar-016', (d) => cut(d, 'sf ~> ssf', 'sap ~> ssap', 'ecom ~> secom'))

  // AR-020
  await failsOn('ar-020', 'Brokers reach the read store', (d) => cut(d, 'eb -> pp'))
  await failsOn('ar-020', 'fed from the mainframe change stream', (d) => cut(d, 'cdc ~> upd'))
  await failsOn('ar-020', 'sync calls. Async work', (d) => swap(d, 'pp -> spol'))
  await failsOn('ar-020', 'served from an off-mainframe read store', (d) => cut(d, 'spol -> rs'))
  // Address changes go over the existing MQ request queue.
  await passes('ar-020', (d) => {
    box(d, 'mq', 'queue', 'IBM MQ address-change queue')
    cut(d, 'spol -> mf')
    draw(d, 'spol ~> mq', 'mq ~> mf')
  })
  // The read store is a cache.
  await passes('ar-020', (d) => {
    d.nodes.find((n) => n.id === 'rs').type = 'cache'
  })

  // AR-021
  await failsOn('ar-021', 'sends its documents into the B2B layer', (d) => cut(d, 'sml -> gw'))
  // SAP inside the transmission: the parser calls the order process directly.
  await failsOn('ar-021', 'No chain of sync calls', (d) => draw(d, 'edi -> po'))
  await failsOn('ar-021', 'never straight to a retailer', (d) => {
    cut(d, 'ob -> gw')
    draw(d, 'ob -> ret')
  })
  await failsOn('ar-021', 'sync calls. Async work', (d) => swap(d, 'po -> ssap'))
  await failsOn('ar-021', 'flow from SAP back', (d) => cut(d, 'ssap ~> oq'))
  // The System API polls SAP for shipped orders instead of SAP pushing IDocs.
  await passes('ar-021', (d) => cut(d, 'sap ~> ssap'))
  await passes('ar-021', (d) => {
    box(d, 'web', 'web-app', 'CSV upload portal')
    cut(d, 'sml -> gw')
    draw(d, 'sml -> web', 'web -> gw')
  })

  // AR-022
  await failsOn('ar-022', 'through the query Process API', (d) => cut(d, 'eh -> ph'))
  await failsOn('ar-022', 'through the query Process API', (d) => cut(d, 'ph -> rs'))
  await failsOn('ar-022', 'never calls core banking synchronously', (d) => draw(d, 'ph -> score'))
  await failsOn('ar-022', 'from the app go to core banking', (d) => cut(d, 'eh -> pp'))
  await failsOn('ar-022', 'sync calls. Async work', (d) => swap(d, 'eh -> ph'))
  await failsOn('ar-022', 'Core banking changes reach the read model', (d) => cut(d, 'core ~> ev'))
  // Core banking changes come through a CDC listener queue, card changes not drawn.
  await passes('ar-022', (d) => {
    rename(d, 'ph', 'prc-accounts-query-api')
    box(d, 'q', 'queue', 'core-cdc-q')
    cut(d, 'core ~> ev')
    draw(d, 'core ~> q', 'q ~> proj')
  })

  // AR-032
  await failsOn('ar-032', 'calls Salesforce through the System API', (d) => cut(d, 'oc -> ssf'))
  await failsOn('ar-032', 'takes its invoices from the billing system', (d) => cut(d, 'job -> bil'))
  await failsOn('ar-032', 'never straight to a consumer', (d) => draw(d, 'ecom -> oc'))
  await failsOn('ar-032', 'Consumers and the bulk job call the System API with sync calls', (d) => swap(d, 'cc -> ssf'))
  await failsOn('ar-032', 'Queued events reach Salesforce', (d) => cut(d, 'ssf -> sf'))
  // E-commerce posts to an Experience API that queues the event.
  await passes('ar-032', (d) => {
    box(d, 'ein', 'experience-api', 'exp-order-events-api')
    cut(d, 'ecom ~> oq')
    draw(d, 'ecom -> ein', 'ein ~> oq')
  })
  // One consumer drains both queues, and billing pushes its extract.
  await passes('ar-032', (d) => {
    unbox(d, 'cc')
    draw(d, 'cq ~> oc')
    flip(d, 'job -> bil')
  })

  // AR-033
  await failsOn('ar-033', 'upload attachments straight to object storage', (d) => cut(d, 'mob -> fs'))
  await failsOn('ar-033', 'never carries the files', (d) => draw(d, 'ec -> fs'))
  await failsOn('ar-033', 'reaches all three consumers', (d) => cut(d, 'fq ~> fr'))
  await failsOn('ar-033', 'sync calls. Async work', (d) => swap(d, 'ec -> pc'))
  await failsOn('ar-033', 'storage are sync calls', (d) => swap(d, 'di -> fs'))
  await failsOn('ar-033', 'Both clients send the claim data', (d) => cut(d, 'web -> ec'))
  await failsOn('ar-033', 'fetches the files by reference', (d) => cut(d, 'di -> fs', 'scc -> fs'))
  // Consumers read the topic directly.
  await passes('ar-033', (d) => {
    unbox(d, 'fq')
    unbox(d, 'dq')
    unbox(d, 'cq')
    draw(d, 'ex ~> fr', 'ex ~> di', 'ex ~> scc')
  })
  await passes('ar-033', (d) => cut(d, 'pc -> fs'))

  // AR-035
  await failsOn('ar-035', 'balance is read live from billing', (d) => swap(d, 'sbil -> bil'))
  await failsOn('ar-035', 'called by the Process API', (d) => {
    cut(d, 'prc -> scrm')
    box(d, 'scrm2', 'system-api', 'sys-crm-profile-api')
    draw(d, 'prc -> scrm2', 'scrm2 -> crm')
  })
  await failsOn('ar-035', 'connects to its backend', (d) => {
    cut(d, 'scrm -> crm')
    box(d, 'scrm2', 'system-api', 'sys-crm-profile-api')
    draw(d, 'prc -> scrm2', 'scrm2 -> crm')
  })
  await failsOn('ar-035', 'sync calls. Async work', (d) => swap(d, 'exp -> prc'))
  await failsOn('ar-035', 'never cached', (d) => draw(d, 'sbil -> ccache'))
  await passes('ar-035', (d) => {
    unbox(d, 'gw')
    draw(d, 'mob -> exp')
  })
  await passes('ar-035', (d) => {
    cut(d, 'prc -> pcache')
    draw(d, 'scrm -> pcache')
  })

  // AR-037
  await failsOn('ar-037', 'reached only through the API gateway', (d) => draw(d, 'mob -> exp'))
  await failsOn('ar-037', 'lead on to the push provider', (d) => cut(d, 'ev ~> pnot'))
  // Push sent inside the request, with the topic left beside it.
  await failsOn('ar-037', 'No chain of sync calls', (d) => draw(d, 'pacc -> pnot'))
  await failsOn('ar-037', 'called by a Process API', (d) => cut(d, 'pcard -> scard'))
  await failsOn('ar-037', 'sync calls. Async work', (d) => swap(d, 'exp -> pacc'))
  // The notification Process API calls the push provider directly, and there is no WAF.
  await passes('ar-037', (d) => {
    unbox(d, 'spush')
    draw(d, 'pnot -> push')
    unbox(d, 'waf')
    draw(d, 'mob -> gw')
  })
  await passes('ar-037', (d) => unbox(d, 'cache'))

  // AR-042
  await failsOn('ar-042', 'caller sends the customer update', (d) => cut(d, 'cli -> prc'))
  await failsOn('ar-042', 'only through the outbox relay', (d) => {
    box(d, 'pub', 'system-api', 'sys-publisher-api')
    draw(d, 'prc -> pub', 'pub ~> ex')
  })
  await failsOn('ar-042', 'relay events reach the consumer', (d) => cut(d, 'ex ~> q'))
  await failsOn('ar-042', 'applies the change through a System API', (d) => cut(d, 'ploy -> sloy'))
  await failsOn('ar-042', 'sync calls. Async work', (d) => swap(d, 'cli -> prc'))
  // Kafka with the consumer on the topic, and an Experience API as the caller.
  await passes('ar-042', (d) => {
    d.nodes.find((n) => n.id === 'ex').type = 'event-stream'
    unbox(d, 'q')
    draw(d, 'ex ~> ploy', 'ex ~> dlq')
    unbox(d, 'cli')
    box(d, 'exp', 'experience-api', 'exp-customer-api')
    draw(d, 'exp -> prc')
  })

  // AR-048
  await failsOn('ar-048', 'has its own Experience API', (d) => {
    cut(d, 'mkt -> ep')
    draw(d, 'mkt -> em')
  })
  await failsOn('ar-048', 'never uses the partner Experience API', (d) => draw(d, 'mob -> ep'))
  await failsOn('ar-048', 'called by a Process API', (d) => cut(d, 'pc -> ssf'))
  await failsOn('ar-048', 'each have a System API', (d) => unbox(d, 'sfdc'))
  await failsOn('ar-048', 'sync calls. Async work', (d) => swap(d, 'po -> swms'))
  // The partner also calls the mobile Experience API.
  await failsOn('ar-048', 'No Experience API is shared', (d) => draw(d, 'mkt -> em'))
  // The partner has two Experience APIs of its own.
  await passes('ar-048', (d) => {
    box(d, 'ep2', 'experience-api', 'exp-partner-catalog-api')
    draw(d, 'mkt -> ep2', 'ep2 -> pc')
  })
  // One Process API for both domains, and the WMS drawn as a warehouse system.
  await passes('ar-048', (d) => {
    unbox(d, 'pc')
    draw(d, 'po -> ssf')
    d.nodes.find((n) => n.id === 'wms').type = 'wms'
  })

  // AR-054
  await failsOn('ar-054', 'never use the partner Experience API', (d) => draw(d, 'web -> ep'))
  await failsOn('ar-054', 'Both end-user channels log in', (d) => cut(d, 'web -> idp'))
  await failsOn('ar-054', 'called by the Process API', (d) => cut(d, 'po -> so'))
  await failsOn('ar-054', 'connects to the order backend', (d) => {
    cut(d, 'so -> erp')
    box(d, 'so2', 'system-api', 'sys-order-history-api')
    draw(d, 'po -> so2', 'so2 -> erp')
  })
  await failsOn('ar-054', 'sync calls. Async work', (d) => swap(d, 'ep -> po'))
  // Each Experience API gets its own copy of the order rules.
  await failsOn('ar-054', 'share the existing order Process API', (d) => {
    box(d, 'pm', 'process-api', 'prc-mobile-order-api')
    box(d, 'pw', 'process-api', 'prc-web-order-api')
    cut(d, 'em -> po', 'ew -> po')
    draw(d, 'em -> pm', 'ew -> pw', 'pm -> so', 'pw -> so')
  })
  // The partner Experience API also calls a pricing Process API.
  await passes('ar-054', (d) => {
    box(d, 'pp', 'process-api', 'prc-partner-pricing-api')
    draw(d, 'ep -> pp', 'pp -> so')
  })
  // One digital Experience API for mobile and web.
  await passes('ar-054', (d) => {
    unbox(d, 'ew')
    draw(d, 'web -> em')
  })
  await passes('ar-054', (d) => draw(d, 'mkt -> idp'))

  // AR-056
  await failsOn('ar-056', 'never skip the public gateway', (d) => draw(d, 'mob -> em'))
  await failsOn('ar-056', 'never skip the public gateway', (d) => draw(d, 'fin -> pa'))
  await failsOn('ar-056', 'called by a Process API', (d) => cut(d, 'pa -> scrm'))
  await failsOn('ar-056', 'connects to its backend', (d) => {
    cut(d, 'scrm -> crm')
    box(d, 'scrm2', 'system-api', 'sys-crm-api')
    draw(d, 'pa -> scrm2', 'scrm2 -> crm')
  })
  await failsOn('ar-056', 'sync calls. Async work', (d) => swap(d, 'gw -> ep'))
  await failsOn('ar-056', 'sits behind the public gateway', (d) => cut(d, 'gw -> em'))
  // An internal app calls the Process API on a private endpoint, and the gateway introspects tokens.
  await passes('ar-056', (d) => {
    box(d, 'int', 'internal-app', 'Branch staff app')
    draw(d, 'int -> pa', 'gw -> idp')
  })

  // AR-062
  await failsOn('ar-062', 'no longer touch SAP directly', (d) => draw(d, 'idoc -> ecc'))
  await failsOn('ar-062', 'called by an API or integration', (d) => cut(d, 'po -> sm'))
  await failsOn('ar-062', 'partner still reaches SAP', (d) => cut(d, 'ep -> po'))
  await failsOn('ar-062', 'sync calls. Async work', (d) => swap(d, 'pf -> so'))
  await failsOn('ar-062', 'routes to both SAP ECC and S/4HANA', (d) => cut(d, 'so -> s4'))
  // The second legacy integration is an internal app, and the routing table is a cache.
  await passes('ar-062', (d) => {
    box(d, 'int2', 'internal-app', 'Former IDoc integration 2')
    draw(d, 'int2 -> so')
    d.nodes.find((n) => n.id === 'rt').type = 'cache'
  })
  // The material master moves to S/4 in one go.
  await passes('ar-062', (d) => cut(d, 'sm -> ecc'))
}
