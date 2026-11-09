// Wrong and other correct diagrams for batch E. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }) => {
  // AR-044
  // A partner moved to the new Mule endpoint, which partners cannot be forced to do.
  await failsOn('ar-044', 'only through the routing layer', (d) => draw(d, 'ptn -> soap'))
  await failsOn('ar-044', 'call the routing layer', (d) => {
    cut(d, 'apps -> rtr')
    draw(d, 'apps -> esb')
  })
  // Big bang: the router no longer has the ESB behind it.
  await failsOn('ar-044', 'forwards unmigrated services', (d) => cut(d, 'rtr -> esb'))
  await failsOn('ar-044', 'Mule SOAP facade', (d) => cut(d, 'rtr -> soap'))
  // The facade calls System APIs and keeps the old ESB logic at the edge.
  await failsOn('ar-044', 'never call System APIs directly', (d) => draw(d, 'soap -> sdb'))
  await failsOn('ar-044', 'reached only through System APIs or the ESB', (d) => draw(d, 'prc -> db'))
  await failsOn('ar-044', 'called by a Process API', (d) => flip(d, 'prc -> ssap'))
  await failsOn('ar-044', 'still serves', (d) => cut(d, 'esb -> db', 'esb -> sap'))
  await failsOn('ar-044', 'SOAP and REST calls are sync', (d) => swap(d, 'rtr -> soap'))
  await failsOn('ar-044', 'database are sync', (d) => swap(d, 'esb -> db'))
  // A load balancer as the routing layer, and SAP reached over IDocs.
  await passes('ar-044', (d) => {
    d.nodes.find((n) => n.id === 'rtr').type = 'load-balancer'
    swap(d, 'ssap -> sap')
  })
  // New REST consumers get their own Experience API.
  await passes('ar-044', (d) => {
    box(d, 'web', 'web-app', 'New REST consumer')
    box(d, 'rest', 'experience-api', 'exp-customer-rest-api')
    draw(d, 'web -> rest', 'rest -> prc')
  })

  // AR-045
  // The penetration test finding: the low-value app calls Payments directly.
  await failsOn('ar-045', 'Only the Payments Process API', (d) => draw(d, 'low -> sys'))
  await failsOn('ar-045', 'Only the Payments Process API', (d) => draw(d, 'exp -> sys'))
  await failsOn('ar-045', 'own token from the identity provider', (d) => cut(d, 'prc -> idp'))
  await failsOn('ar-045', 'own token from the identity provider', (d) => flip(d, 'exp -> idp'))
  await failsOn('ar-045', 'low-value internal app has its own identity', (d) => cut(d, 'low -> idp'))
  await failsOn('ar-045', 'through the gateway', (d) => {
    cut(d, 'web -> gw')
    draw(d, 'web -> exp')
  })
  await failsOn('ar-045', 'connects to its backend', (d) => cut(d, 'sys -> core'))
  await failsOn('ar-045', 'token requests are sync', (d) => swap(d, 'prc -> sys'))
  // A mobile channel too, the user signing in at the IdP, and the core reached over MQ.
  await passes('ar-045', (d) => {
    box(d, 'mob', 'mobile-app', 'Mobile banking app')
    draw(d, 'mob -> gw')
    swap(d, 'sys -> core')
    cut(d, 'web -> idp')
  })
  await passes('ar-045', (d) => rename(d, 'sys', 'sys-payments-api'))

  // AR-047
  // One shared Experience API for both portals.
  await failsOn('ar-047', 'Each Experience API serves one portal', (d) => {
    unbox(d, 'eb')
    draw(d, 'brk -> ew')
  })
  // The broker project rebuilds its own Process API instead of reusing Quote.
  await failsOn('ar-047', 'reuse one Process API', (d) => {
    box(d, 'pq2', 'process-api', 'prc-broker-quote-api')
    cut(d, 'eb -> pq')
    draw(d, 'eb -> pq2', 'pq2 -> sp')
  })
  // A second integration to the mainframe, as before.
  await failsOn('ar-047', 'exactly one System API', (d) => {
    box(d, 'sp2', 'system-api', 'sys-policy-broker-api')
    draw(d, 'pq -> sp2', 'sp2 -> mf')
  })
  await failsOn('ar-047', 'never call System APIs directly', (d) => draw(d, 'eb -> sc'))
  await failsOn('ar-047', 'reached only through System APIs', (d) => draw(d, 'pq -> crm'))
  await failsOn('ar-047', 'connects to its backend', (d) => flip(d, 'sb -> bil'))
  await failsOn('ar-047', 'sync calls', (d) => swap(d, 'ew -> pq'))
  await passes('ar-047', (d) => {
    d.nodes.find((n) => n.id === 'brk').type = 'web-app'
    swap(d, 'sp -> mf')
  })
  // A Claims Process API next to Quote, as in the solution sketch.
  await passes('ar-047', (d) => {
    box(d, 'pcl', 'process-api', 'prc-claims-api')
    draw(d, 'ew -> pcl', 'pcl -> sp', 'pcl -> sc')
  })

  // AR-051
  // Case A with a pass-through Process API.
  await failsOn('ar-051', 'uses no Process API', (d) => {
    box(d, 'phr', 'process-api', 'prc-employee-api')
    cut(d, 'gw -> swd')
    draw(d, 'gw -> phr', 'phr -> swd')
  })
  // Case B with the aggregation in the Experience API.
  await failsOn('ar-051', 'aggregation lives in a Process API', (d) => {
    unbox(d, 'pprd')
    draw(d, 'emob -> smat', 'emob -> spim', 'emob -> swms')
  })
  await failsOn('ar-051', 'enters through an Experience API', (d) => {
    cut(d, 'mob -> emob')
    draw(d, 'mob -> pprd')
  })
  // Case D: the partner calls the System API directly.
  await failsOn('ar-051', 'external partner goes through an Experience API', (d) => {
    unbox(d, 'eptn')
    draw(d, 'ptn -> sord')
  })
  await failsOn('ar-051', 'writes to the data warehouse', (d) => flip(d, 'job -> dw'))
  await failsOn('ar-051', 'reached only through System APIs', (d) => draw(d, 'pprd -> wms'))
  await failsOn('ar-051', 'reads Workday through a System API', (d) => {
    cut(d, 'gw -> swd')
    draw(d, 'gw -> wd')
  })
  // Case C with the Salesforce connector (Bulk API) and no System API.
  await passes('ar-051', (d) => {
    unbox(d, 'ssf')
    draw(d, 'job -> sf')
  })
  // Case D with the Process API built now, and the dashboard without a gateway.
  await passes('ar-051', (d) => {
    box(d, 'pst', 'process-api', 'prc-order-status-api')
    cut(d, 'eptn -> sord')
    draw(d, 'eptn -> pst', 'pst -> sord')
    unbox(d, 'gw')
    draw(d, 'dash -> swd')
  })

  // AR-053
  // The pass-through smell: the summary reads only the Booking DB.
  await failsOn('ar-053', 'trip summary Process API reads', (d) => cut(d, 'psum -> sair', 'psum -> shot'))
  await failsOn('ar-053', 'pass-through', (d) => cut(d, 'pcust -> sloy'))
  // A direct backend connector in the Process API.
  await failsOn('ar-053', 'never with connectors in a Process API', (d) => draw(d, 'pbook -> pay'))
  await failsOn('ar-053', 'Booking DB is reached only through its System API', (d) => draw(d, 'psum -> db'))
  // State kept in memory: no durable store.
  await failsOn('ar-053', 'durable store', (d) => unbox(d, 'state'))
  await failsOn('ar-053', 'takes the payment', (d) => cut(d, 'pbook -> spay'))
  await failsOn('ar-053', 'called by a Process API', (d) => flip(d, 'pcust -> scrm'))
  await failsOn('ar-053', 'sync calls', (d) => swap(d, 'psum -> sbook'))
  await failsOn('ar-053', 'data store are sync', (d) => swap(d, 'pbook -> state'))
  // State in a persistent Object Store, and the loyalty cache at the System API.
  await passes('ar-053', (d) => {
    d.nodes.find((n) => n.id === 'state').type = 'cache'
    cut(d, 'pcust -> lcache')
    draw(d, 'sloy -> lcache')
  })
  await passes('ar-053', (d) => unbox(d, 'lcache'))

  // AR-058
  // The senior developer's idea: the mobile app calls the database.
  await failsOn('ar-058', 'never calls the databases directly', (d) => draw(d, 'mob -> pdb'))
  // Internal calls hairpin through the public load balancer.
  await failsOn('ar-058', 'never the public load balancer', (d) => {
    cut(d, 'exp -> prc')
    draw(d, 'exp -> lb', 'lb -> prc')
  })
  await failsOn('ar-058', 'cached at the Process or System layer', (d) => unbox(d, 'cache'))
  await failsOn('ar-058', 'three System APIs', (d) => cut(d, 'prc -> sstock'))
  await failsOn('ar-058', 'never call System APIs directly', (d) => draw(d, 'exp -> spim'))
  await failsOn('ar-058', 'connects to its backend', (d) => flip(d, 'sprice -> pdb'))
  await failsOn('ar-058', 'sync calls', (d) => swap(d, 'exp -> prc'))
  await failsOn('ar-058', 'data store are sync', (d) => swap(d, 'prc -> cache'))
  // The cache at the PIM System API, with an API gateway at the edge.
  await passes('ar-058', (d) => {
    cut(d, 'prc -> cache')
    draw(d, 'spim -> cache')
    d.nodes.find((n) => n.id === 'lb').type = 'api-gateway'
  })
  // The mobile app on a direct public URL with no load balancer drawn.
  await passes('ar-058', (d) => {
    unbox(d, 'lb')
    draw(d, 'mob -> exp')
  })
}
