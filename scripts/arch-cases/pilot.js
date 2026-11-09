// Wrong and other correct diagrams for the pilot problems. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }) => {
  // AR-064
  await failsOn('ar-064', 'one Policy Process API', (d) => cut(d, 'ec -> pp'))
  await failsOn('ar-064', 'one Policy System API', (d) => cut(d, 'pp -> sp'))
  await failsOn('ar-064', 'claim eligibility', (d) => cut(d, 'eb -> pcl'))
  await failsOn('ar-064', 'called by a Process API', (d) => flip(d, 'pcl -> scl'))
  await failsOn('ar-064', 'connects to its backend', (d) => cut(d, 'scrm -> crm'))
  await failsOn('ar-064', 'publishes its events', (d) => cut(d, 'pp ~> ev'))
  await failsOn('ar-064', 'lead on to the SMS', (d) => cut(d, 'pn -> smsg'))
  await failsOn('ar-064', 'async message', (d) => swap(d, 'pp ~> ev'))
  await failsOn('ar-064', 'sync calls. Async work', (d) => swap(d, 'em -> pp'))
  // The old smell, with a topic still drawn beside it: notifications stay on the critical path.
  await failsOn('ar-064', 'No chain of sync calls', (d) => draw(d, 'pp -> pn'))
  await passes('ar-064', (d) => {
    box(d, 'web', 'web-app', 'Web portal')
    box(d, 'ew', 'experience-api', 'exp-web-api')
    draw(d, 'web -> ew', 'ew -> pp')
  })
  // The mainframe is often reached over MQ, as the old call centre API did.
  await passes('ar-064', (d) => swap(d, 'sp -> mf'))
  await passes('ar-064', (d) => cut(d, 'ec -> pcl', 'pcl -> sp', 'pcl ~> ev'))
  await passes('ar-064', (d) => unbox(d, 'scrm'))
  await passes('ar-064', (d) => {
    unbox(d, 'smsg')
    draw(d, 'pn -> sms')
  })

  // AR-110
  await failsOn('ar-110', 'routes to the ingress in each region', (d) => flip(d, 'glb -> ingP'))
  await failsOn('ar-110', 'Every consumer', (d) => unbox(d, 'prt'))
  await failsOn('ar-110', 'Each ingress routes', (d) => cut(d, 'ingB -> expB'))
  await failsOn('ar-110', 'drained by a consumer', (d) => cut(d, 'qfb ~> prcB'))
  await failsOn('ar-110', 'Process APIs call System APIs in both regions', (d) => cut(d, 'prcB -> sysB'))
  await failsOn('ar-110', 'connects to its backend', (d) => flip(d, 'sysP -> db'))
  await failsOn('ar-110', 'polls claims through a System API', (d) => cut(d, 'jobB -> sysB'))
  await failsOn('ar-110', 'watermark', (d) => cut(d, 'jobB -> redis'))
  await failsOn('ar-110', 'reach a monitoring system', (d) => cut(d, 'expP -> mon', 'expB -> mon'))
  await failsOn('ar-110', 'Load balancers forward', (d) => swap(d, 'glb -> ingB'))
  await failsOn('ar-110', 'async message', (d) => swap(d, 'q ~> prcP'))
  await failsOn('ar-110', 'data store', (d) => swap(d, 'jobP -> redis'))
  // One copy of the job, moved by the DR flag, is a fair choice.
  await passes('ar-110', (d) => unbox(d, 'jobB'))
  await passes('ar-110', (d) => cut(d, 'expB -> mon'))
  // A Process API takes the claim and a worker drains the queue.
  await passes('ar-110', (d) => {
    box(d, 'intake', 'process-api', 'prc-claims-intake')
    cut(d, 'expP ~> q')
    draw(d, 'expP -> intake', 'intake ~> q')
  })
  await passes('ar-110', (d) => rename(d, 'glb', 'DNS failover with health checks'))

  // AR-084
  await failsOn('ar-084', 'enter through the public ingress', (d) => unbox(d, 'labs'))
  await failsOn('ar-084', 'Ward apps use the internal ingress', (d) => {
    cut(d, 'ward -> int')
    draw(d, 'ward -> pub')
  })
  await failsOn('ar-084', 'never touch the public ingress', (d) => draw(d, 'ward -> pub'))
  await failsOn('ar-084', 'public ingress routes', (d) => flip(d, 'pub -> expLabs'))
  await failsOn('ar-084', 'internal ingress routes', (d) => cut(d, 'int -> prcAppt'))
  await failsOn('ar-084', 'Every Experience API calls', (d) => cut(d, 'expLabs -> prcResults'))
  await failsOn('ar-084', 'called by a Process API', (d) => cut(d, 'prcAppt -> sysBill'))
  await failsOn('ar-084', 'through the queue', (d) => cut(d, 'q ~> prcAppt'))
  // The batch window: results go straight to the mainframe, with the queue left beside them.
  await failsOn('ar-084', 'No chain of sync calls', (d) => draw(d, 'prcResults -> sysBill'))
  await failsOn('ar-084', 'portal reads patient records', (d) => unbox(d, 'expPortal'))
  await failsOn('ar-084', 'async message', (d) => swap(d, 'prcResults ~> q'))
  await passes('ar-084', (d) => unbox(d, 'dlq'))
  await passes('ar-084', (d) => unbox(d, 'idp'))
  await passes('ar-084', (d) => unbox(d, 'mon'))
  await passes('ar-084', (d) => swap(d, 'sysBill -> mf'))
  // Ward apps get their own Experience API behind the internal ingress.
  await passes('ar-084', (d) => {
    box(d, 'expWard', 'experience-api', 'exp-ward')
    cut(d, 'int -> prcAppt')
    draw(d, 'int -> expWard', 'pub -> expWard', 'expWard -> prcAppt')
  })
  // A separate worker drains the queue.
  await passes('ar-084', (d) => {
    box(d, 'wk', 'process-api', 'prc-billing-writer')
    cut(d, 'q ~> prcAppt')
    draw(d, 'q ~> wk', 'wk -> sysBill')
  })

  // AR-059
  await failsOn('ar-059', 'created in SAP synchronously', (d) => swap(d, 'po -> ssap'))
  await failsOn('ar-059', 'at least two subscribers', (d) => cut(d, 'ex ~> ql'))
  await failsOn('ar-059', 'at least two subscribers', (d) => flip(d, 'qf ~> pf'))
  await failsOn('ar-059', 'at least two subscribers', (d) => cut(d, 'swms -> wms'))
  // The old design, with the event drawn beside it: the order still fails when loyalty is down.
  await failsOn('ar-059', 'No chain of sync calls', (d) => draw(d, 'po -> sloy'))
  await failsOn('ar-059', 'joined to Salesforce', (d) => cut(d, 'ssf -> sfdc'))
  await failsOn('ar-059', 'subscribes to the Salesforce', (d) => cut(d, 'cev ~> pcs'))
  await failsOn('ar-059', 'does its work through a System API', (d) => cut(d, 'pcs -> sloy'))
  await failsOn('ar-059', 'async message', (d) => swap(d, 'ql ~> pl'))
  await failsOn('ar-059', 'sync calls. Async work', (d) => swap(d, 'pl -> sloy'))
  // Salesforce pushes its change events, so the arrow can point either way.
  await passes('ar-059', (d) => {
    flip(d, 'ssf -> sfdc')
    swap(d, 'sfdc -> ssf')
  })
  // Subscribers read the topic directly, without a queue each.
  await passes('ar-059', (d) => {
    unbox(d, 'qf')
    unbox(d, 'ql')
    draw(d, 'ex ~> pf', 'ex ~> pl')
  })
  // Fraud scoring can stay in the request, because it may have to block the order.
  await passes('ar-059', (d) => {
    box(d, 'sfr', 'system-api', 'sys-fraud-api')
    box(d, 'fr', 'external-api', 'Fraud service')
    draw(d, 'po -> sfr', 'sfr -> fr')
  })
  // Other subscribers with other names, and an email subscriber that uses the provider directly.
  await passes('ar-059', (d) => {
    rename(d, 'loy', 'Rewards platform')
    rename(d, 'sloy', 'sys-rewards-api')
    box(d, 'pn', 'process-api', 'prc-notify')
    box(d, 'mail', 'notification', 'Email provider')
    draw(d, 'ex ~> pn', 'pn -> mail')
  })

  // AR-085
  await failsOn('ar-085', 'Every client enters', (d) => unbox(d, 'portal'))
  await failsOn('ar-085', 'reached only through System APIs', (d) => draw(d, 'prcStatus -> plant'))
  await failsOn('ar-085', 'Every Process API calls', (d) => {
    cut(d, 'prcOrders -> sysSap')
    draw(d, 'prcStatus -> sysSap')
  })
  await failsOn('ar-085', 'connects to its backend', (d) => cut(d, 'sysSap -> sap'))
  await failsOn('ar-085', 'Dealer orders reach SAP', (d) => cut(d, 'expDealer -> prcOrders'))
  await failsOn('ar-085', 'plant status over sync calls', (d) => cut(d, 'ing -> expPlant'))
  await failsOn('ar-085', 'plant status over sync calls', (d) => {
    box(d, 'q2', 'queue', 'status.requests')
    cut(d, 'expPlant -> prcStatus')
    draw(d, 'expPlant ~> q2', 'q2 ~> prcStatus')
  })
  await failsOn('ar-085', 'Load balancers forward', (d) => swap(d, 'mes -> ing'))
  await failsOn('ar-085', 'data store', (d) => swap(d, 'prcOrders -> pg'))
  await passes('ar-085', (d) => unbox(d, 'q'))
  await passes('ar-085', (d) => unbox(d, 'idp'))
  await passes('ar-085', (d) => cut(d, 'prcStatus -> logs'))
  // One shared Experience API for all clients.
  await passes('ar-085', (d) => {
    unbox(d, 'expPlant')
    draw(d, 'expDealer -> prcStatus')
  })

  // AR-013
  await failsOn('ar-013', 'Partners get their own', (d) => {
    cut(d, 'ptn -> eptn')
    draw(d, 'ptn -> edig')
  })
  await failsOn('ar-013', 'Every Experience API calls', (d) => cut(d, 'eptn -> p360'))
  await failsOn('ar-013', 'none is a pass-through', (d) => cut(d, 'pon -> sbil', 'pon -> snet'))
  await failsOn('ar-013', 'called by a Process API', (d) => cut(d, 'p360 -> snet', 'pon -> snet'))
  await failsOn('ar-013', 'connects to its backend', (d) => flip(d, 'sbil -> bil'))
  await failsOn('ar-013', 'over sync calls', (d) => swap(d, 'mob -> edig'))
  await failsOn('ar-013', 'sync calls. Async work', (d) => swap(d, 'pon -> scrm'))
  await passes('ar-013', (d) => unbox(d, 'bo'))
  await passes('ar-013', (d) => unbox(d, 'pon'))
  await passes('ar-013', (d) => cut(d, 'p360 -> snet', 'pon -> scrm'))
  await passes('ar-013', (d) => swap(d, 'snet -> net'))
  await passes('ar-013', (d) => rename(d, 'eptn', 'exp-b2b-api'))

  // AR-105
  await failsOn('ar-105', 'Every client enters', (d) => unbox(d, 'branch'))
  await failsOn('ar-105', 'at least two Process APIs', (d) => {
    unbox(d, 'prcB')
    draw(d, 'expB -> prcA')
  })
  await failsOn('ar-105', 'Every Process API calls', (d) => cut(d, 'prcA -> sysA'))
  await failsOn('ar-105', 'connects to its backend', (d) => flip(d, 'sysB -> core'))
  await failsOn('ar-105', 'Both sites keep state', (d) => cut(d, 'prcB -> state'))
  await failsOn('ar-105', 'Both sites publish', (d) => cut(d, 'prcA ~> broker'))
  await failsOn('ar-105', 'Load balancers forward', (d) => swap(d, 'lb -> expA'))
  await failsOn('ar-105', 'async message', (d) => swap(d, 'prcB ~> broker'))
  await failsOn('ar-105', 'sync calls. Async work', (d) => swap(d, 'expA -> prcA'))
  await passes('ar-105', (d) => unbox(d, 'logs'))
  await passes('ar-105', (d) => swap(d, 'sysA -> core'))
  // State through the System layer, and a topic as the broker.
  await passes('ar-105', (d) => {
    cut(d, 'prcA -> state', 'prcB -> state')
    draw(d, 'sysA -> state', 'sysB -> state')
    d.nodes.find((n) => n.id === 'broker').type = 'topic'
  })
  await passes('ar-105', (d) => {
    box(d, 'web', 'web-app', 'Online banking')
    draw(d, 'web -> lb')
  })

  // AR-117
  await failsOn('ar-117', 'routes to the ingress in each region', (d) => flip(d, 'glb -> ingB'))
  await failsOn('ar-117', 'at least two System APIs', (d) => {
    unbox(d, 'sysB')
    draw(d, 'prcB -> sysA')
  })
  await failsOn('ar-117', 'Every Process API calls', (d) => cut(d, 'prcB -> sysB'))
  await failsOn('ar-117', 'connects to its backend', (d) => cut(d, 'sysA -> erp'))
  await failsOn('ar-117', 'Both regions keep', (d) => cut(d, 'prcA -> db'))
  await failsOn('ar-117', 'Load balancers forward', (d) => swap(d, 'ingA -> expA'))
  await failsOn('ar-117', 'sync calls. Async work', (d) => swap(d, 'prcA -> sysA'))
  await failsOn('ar-117', 'data store', (d) => swap(d, 'prcB -> db'))
  await passes('ar-117', (d) => unbox(d, 'mon'))
  await passes('ar-117', (d) => unbox(d, 'web'))
  await passes('ar-117', (d) => swap(d, 'job -> store'))
  await passes('ar-117', (d) => {
    d.nodes.find((n) => n.id === 'store').type = 's3-bucket'
  })

  // AR-072
  await failsOn('ar-072', 'from the gateway to a Process API', (d) => flip(d, 'gw -> pin'))
  await failsOn('ar-072', 'looks up partner profiles', (d) => cut(d, 'pout -> prof'))
  await failsOn('ar-072', 'both Oracle and the WMS', (d) => cut(d, 'pdoc -> swms'))
  await failsOn('ar-072', 'both Oracle and the WMS', (d) => cut(d, 'inq ~> pdoc'))
  await failsOn('ar-072', 'Released POs reach', (d) => cut(d, 'serp ~> outq'))
  await failsOn('ar-072', 'async message', (d) => swap(d, 'pin ~> dlq'))
  await failsOn('ar-072', 'sync calls. Async work', (d) => swap(d, 'pdoc -> serp'))
  await failsOn('ar-072', 'data store', (d) => swap(d, 'pin -> prof'))
  // AS2 with an async MDN and SFTP drops are both fair at the supplier edge.
  await passes('ar-072', (d) => swap(d, 'sup -> gw'))
  await passes('ar-072', (d) => cut(d, 'pout -> fs'))
  // Oracle publishes its own PO event.
  await passes('ar-072', (d) => {
    cut(d, 'serp ~> outq')
    draw(d, 'erp ~> outq')
  })
  await passes('ar-072', (d) => rename(d, 'pin', 'prc-edi-receiver'))

  // AR-061
  await failsOn('ar-061', 'mobile channel calls', (d) => flip(d, 'mob -> exp'))
  await failsOn('ar-061', 'through the queue', (d) => cut(d, 'q ~> wk'))
  await failsOn('ar-061', 'through the queue', (d) => cut(d, 'wk -> scard'))
  // The slow step stays in the request, with the queue left beside it.
  await failsOn('ar-061', 'No chain of sync calls', (d) => draw(d, 'prc -> scard'))
  await failsOn('ar-061', 'reached only through System APIs', (d) => draw(d, 'prc -> crm'))
  await failsOn('ar-061', 'connects to its backend', (d) => cut(d, 'score -> core'))
  await failsOn('ar-061', 'async message', (d) => swap(d, 'prc ~> q'))
  await failsOn('ar-061', 'sync calls. Async work', (d) => swap(d, 'exp -> prc'))
  await failsOn('ar-061', 'data store', (d) => swap(d, 'prc -> state'))
  await passes('ar-061', (d) => unbox(d, 'rec'))
  // The worker reports back through a queue, and the coordinator alone writes saga state.
  await passes('ar-061', (d) => {
    box(d, 'done', 'queue', 'card-result-q')
    cut(d, 'wk -> state')
    draw(d, 'wk ~> done', 'done ~> prc')
  })
  await passes('ar-061', (d) => {
    d.nodes.find((n) => n.id === 'state').type = 'cache'
  })
}
