// Wrong and other correct diagrams for batch G (case studies cs-063 to cs-077). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }) => {
  // CS-063
  // The web shop calls the TMS System API itself, so the slot rules leak into the channel.
  await failsOn('cs-063', 'passes through the slots Process API', (d) => draw(d, 'web -> stms'))
  // The app skips the Experience API and calls the Process API.
  await failsOn('cs-063', 'Both channels call the checkout Experience API', (d) => {
    cut(d, 'mob -> exp')
    draw(d, 'mob -> prc')
  })
  // The Process API speaks SOAP to the TMS directly.
  await failsOn('cs-063', 'The TMS is reached only', (d) => {
    cut(d, 'prc -> stms')
    draw(d, 'prc -> tms')
  })
  // No cache: every page view becomes a TMS call.
  await failsOn('cs-063', 'Slot answers are cached', (d) => cut(d, 'prc -> cache'))
  // The checkout fires a message and cannot show slots.
  await failsOn('cs-063', 'calls one delivery-slots Process API', (d) => swap(d, 'exp -> prc'))
  await failsOn('cs-063', 'Checkout calls are synchronous', (d) => swap(d, 'exp -> prc'))
  // The Process API reads Oracle EBS tables itself.
  await failsOn('cs-063', 'The ERP is reached only', (d) => {
    unbox(d, 'serp')
    draw(d, 'prc -> erp')
  })
  await failsOn('cs-063', 'gets stock dates from the ERP', (d) => cut(d, 'prc -> serp'))
  // API Manager in front of the Experience API.
  await passes('cs-063', (d) => {
    box(d, 'gw', 'api-gateway', 'API Manager policies')
    cut(d, 'web -> exp', 'mob -> exp')
    draw(d, 'web -> gw', 'mob -> gw', 'gw -> exp')
  })
  // A separate Experience API for the app, sharing the same Process API.
  await passes('cs-063', (d) => {
    box(d, 'em', 'experience-api', 'exp-mobile-checkout-api')
    cut(d, 'mob -> exp')
    draw(d, 'mob -> em', 'em -> prc')
  })
  // Next year's showroom tablets reuse the Experience API.
  await passes('cs-063', (d) => {
    box(d, 'tab', 'internal-app', 'Showroom tablets')
    draw(d, 'tab -> exp')
  })

  // CS-064
  // The portal request triggers the refund at once, before anything comes back.
  await failsOn('cs-064', 'No synchronous route from the returns portal', (d) => draw(d, 'prc -> pref'))
  // The refunds Process API calls Adyen directly.
  await failsOn('cs-064', 'The payment provider is reached only', (d) => {
    cut(d, 'pref -> spay')
    draw(d, 'pref -> pay')
  })
  // The POS calls the Process API without the Experience API.
  await failsOn('cs-064', 'The returns portal and the store POS both use', (d) => {
    cut(d, 'pos -> eret')
    draw(d, 'pos -> prc')
  })
  // Nobody publishes return-received.
  await failsOn('cs-064', 'A received return is published as an event', (d) => cut(d, 'swms ~> rec', 'prc ~> rec'))
  await failsOn('cs-064', 'A refunds Process API acts on the event', (d) => flip(d, 'rec ~> pref'))
  await failsOn('cs-064', 'Every refund also reaches SAP', (d) => cut(d, 'pref -> ssap'))
  await failsOn('cs-064', 'SAP is reached only', (d) => draw(d, 'pref -> sap'))
  await failsOn('cs-064', 'Refunds that keep failing', (d) => unbox(d, 'dlq'))
  // A queue per subscriber between the topic and the refunds Process API.
  await passes('cs-064', (d) => {
    box(d, 'qr', 'queue', 'refunds.return-received')
    cut(d, 'rec ~> pref')
    draw(d, 'rec ~> qr', 'qr ~> pref')
  })
  // Stores get their own Experience API over the same Process API.
  await passes('cs-064', (d) => {
    box(d, 'es', 'experience-api', 'exp-store-returns-api')
    cut(d, 'pos -> eret')
    draw(d, 'pos -> es', 'es -> prc')
  })
  // Kafka instead of an Anypoint MQ exchange.
  await passes('cs-064', (d) => {
    d.nodes.find((n) => n.id === 'rec').type = 'event-stream'
  })

  // CS-065
  // The contractor's prototype: one flow calls every channel in turn.
  await failsOn('cs-065', 'fans out to at least three', (d) => {
    unbox(d, 'qm')
    unbox(d, 'qs')
    unbox(d, 'pm')
    unbox(d, 'ps')
    draw(d, 'pc -> mkt', 'pc -> spos')
  })
  // Two channels share one queue, so a throttled marketplace holds up the website.
  await failsOn('cs-065', 'Each subscriber queue feeds exactly one', (d) => draw(d, 'qc ~> pm'))
  // The PIM System API calls every channel synchronously.
  await failsOn('cs-065', 'No synchronous chain runs from the PIM', (d) => {
    unbox(d, 'top')
    draw(d, 'spim -> pc', 'spim -> pm', 'spim -> ps')
  })
  // The marketplace flow reads the PIM API itself and blows the rate limit.
  await failsOn('cs-065', 'The PIM is reached only through its System API', (d) => {
    cut(d, 'pm -> spim')
    draw(d, 'pm -> pim')
  })
  await failsOn('cs-065', 'Every channel Process API fetches the full product', (d) => cut(d, 'ps -> spim'))
  await failsOn('cs-065', 'The store systems are reached only', (d) => {
    cut(d, 'ps -> spos')
    draw(d, 'ps -> pos')
  })
  await failsOn('cs-065', 'Every line into or out of a queue', (d) => swap(d, 'qs ~> ps'))
  await failsOn('cs-065', 'A marketplace Process API sends listings', (d) => {
    cut(d, 'pm -> mkt')
    draw(d, 'qm ~> mkt')
  })
  // Next year's print catalogue: a new queue and Process API, nothing else changes.
  await passes('cs-065', (d) => {
    box(d, 'qp', 'queue', 'product.print')
    box(d, 'pp', 'process-api', 'prc-print-catalogue')
    box(d, 'pr', 'external-api', 'Print catalogue supplier')
    draw(d, 'top ~> qp', 'qp ~> pp', 'pp -> spim', 'pp -> pr')
  })
  // A dead-letter queue on every channel queue.
  await passes('cs-065', (d) => draw(d, 'qc ~> dlq', 'qs ~> dlq'))
  await passes('cs-065', (d) => rename(d, 'pim', 'Akeneo PIM'))

  // CS-066
  // The import job loads the WMS straight away, with no buffer.
  await failsOn('cs-066', 'No synchronous chain runs from a scheduled job', (d) => draw(d, 'imp -> swms'))
  // One queue for everything.
  await failsOn('cs-066', 'splits proposals onto separate', (d) => {
    unbox(d, 'qsup')
    draw(d, 'qdc ~> psup')
  })
  // RELEX is expected to push the file into the import job.
  await failsOn('cs-066', 'move files both to and from', (d) => flip(d, 'imp -> sftp'))
  await failsOn('cs-066', 'The WMS is reached only', (d) => {
    cut(d, 'pdc -> swms')
    draw(d, 'pdc -> wms')
  })
  await failsOn('cs-066', 'sent out over EDI', (d) => unbox(d, 'sedi'))
  await failsOn('cs-066', 'creates purchase orders in SAP', (d) => cut(d, 'psup -> ssap'))
  await failsOn('cs-066', 'Orders that cannot be processed', (d) => unbox(d, 'dlq'))
  await failsOn('cs-066', 'reads the sales data warehouse', (d) => swap(d, 'ext -> dw'))
  // A queue per DC for the DC orders.
  await passes('cs-066', (d) => {
    box(d, 'qn', 'queue', 'replenishment.dc-north')
    draw(d, 'imp ~> qn', 'qn ~> pdc', 'qn ~> dlq')
  })
  // RELEX drawn as reading from the job's folder the other way round.
  await passes('cs-066', (d) => flip(d, 'relex -> sftp'))
  await passes('cs-066', (d) => {
    box(d, 'mon', 'monitoring', 'Deadline monitor (04:45)')
    draw(d, 'pdc -> mon')
  })

  // CS-067
  // The Process API writes the claim into the IBM i while the dealer waits.
  await failsOn('cs-067', 'The dealer call never waits', (d) => draw(d, 'pc -> swar'))
  await failsOn('cs-067', 'An accepted claim is put on a queue', (d) => swap(d, 'pc ~> q'))
  // Photos go nowhere: still emailed.
  await failsOn('cs-067', 'Photos and diagnostic files are stored', (d) => cut(d, 'pc -> s3'))
  // The portal calls the Experience API without API Manager.
  await failsOn('cs-067', 'both enter through the API gateway', (d) => {
    cut(d, 'portal -> gw')
    draw(d, 'portal -> exp')
  })
  // The loader writes the DB2 staging table itself.
  await failsOn('cs-067', 'The IBM i warranty system is reached only', (d) => {
    cut(d, 'pl -> swar')
    draw(d, 'pl -> ibmi')
  })
  await failsOn('cs-067', 'Claim decisions are published once', (d) => unbox(d, 'pn'))
  // Credits are called by the poller, not driven by the event.
  await failsOn('cs-067', 'Approved claims become dealer credits', (d) => {
    cut(d, 'dec ~> pcr')
    draw(d, 'poll -> pcr')
  })
  await failsOn('cs-067', 'Claims that cannot be loaded', (d) => unbox(d, 'dlq'))
  await failsOn('cs-067', 'An accepted claim is put on a queue', (d) => cut(d, 'pc ~> q'))
  // Attachments in Azure Blob Storage instead of S3.
  await passes('cs-067', (d) => {
    d.nodes.find((n) => n.id === 's3').type = 'azure-blob'
  })
  // The portal has its own Experience API behind the same gateway.
  await passes('cs-067', (d) => {
    box(d, 'ep', 'experience-api', 'exp-dealer-portal-claims-api')
    draw(d, 'gw -> ep', 'ep -> pc')
  })
  // Decisions also feed a claim status store the portal reads.
  await passes('cs-067', (d) => {
    box(d, 'pst', 'process-api', 'prc-claim-status')
    box(d, 'db', 'database', 'Claim status store')
    draw(d, 'dec ~> pst', 'pst -> db')
  })

  // CS-069
  // The in-house poller posts to SAP itself.
  await failsOn('cs-069', 'Plant adapters never call SAP', (d) => draw(d, 'poll -> ssap'))
  await failsOn('cs-069', 'No synchronous chain runs from a plant adapter', (d) => draw(d, 'poll -> ssap'))
  // No adapter for the in-house MES: the central Process API reads its table across the WAN.
  await failsOn('cs-069', 'Each of the three MES platforms', (d) => {
    unbox(d, 'poll')
    draw(d, 'pc -> nm')
  })
  // The Opcenter adapter calls the Process API synchronously, so a WAN outage stops it.
  await failsOn('cs-069', 'No synchronous chain runs from a plant adapter', (d) => {
    cut(d, 'sop ~> q')
    draw(d, 'sop -> pc')
  })
  await failsOn('cs-069', 'All three adapters publish', (d) => cut(d, 'sft ~> q'))
  await failsOn('cs-069', 'records processed confirmation IDs', (d) => cut(d, 'pc -> ids'))
  await failsOn('cs-069', 'SAP is reached only', (d) => {
    cut(d, 'pc -> ssap')
    draw(d, 'pc -> sap')
  })
  await failsOn('cs-069', 'Confirmations SAP rejects', (d) => unbox(d, 'dlq'))
  await failsOn('cs-069', 'One confirmations Process API takes the queue', (d) => flip(d, 'q ~> pc'))
  // A queue per plant group.
  await passes('cs-069', (d) => {
    box(d, 'q2', 'queue', 'factorytalk plants confirmations')
    cut(d, 'sft ~> q')
    draw(d, 'sft ~> q2', 'q2 ~> pc', 'q2 ~> dlq')
  })
  // Processed IDs kept in a database table.
  await passes('cs-069', (d) => {
    d.nodes.find((n) => n.id === 'ids').type = 'database'
  })
  // FactoryTalk read by a scheduled poller instead of a System API.
  await passes('cs-069', (d) => {
    d.nodes.find((n) => n.id === 'sft').type = 'batch-job'
    rename(d, 'sft', 'FactoryTalk poller (every 2 min)')
  })

  // CS-070
  // Availability falls back to SIM when the cache misses.
  await failsOn('cs-070', 'never waits on SIM or the POS', (d) => draw(d, 'pav -> ssim'))
  // The updater asks each POS for stock instead of receiving events.
  await failsOn('cs-070', 'POS stock movements leave the stores as events', (d) => {
    cut(d, 'pos ~> es')
    draw(d, 'pupd -> pos')
  })
  // Reservations kept only in the cache, so the store never knows about them.
  await failsOn('cs-070', 'Both the reservations and the updater', (d) => {
    cut(d, 'pres -> avs')
    draw(d, 'pres -> cache')
  })
  await failsOn('cs-070', 'releases expired reservations', (d) => unbox(d, 'expj'))
  // The OMS calls the reservations API synchronously.
  await failsOn('cs-070', 'Placed orders confirm reservations', (d) => {
    cut(d, 'oms ~> ord')
    draw(d, 'oms -> pres')
  })
  // Reconciliation reads the SIM database directly.
  await failsOn('cs-070', 'SIM is reached only', (d) => {
    cut(d, 'rec -> ssim')
    draw(d, 'rec -> sim')
  })
  await failsOn('cs-070', 'An updater consumes the stock events', (d) => flip(d, 'es ~> pupd'))
  await failsOn('cs-070', 'answered from a store or cache', (d) => cut(d, 'pav -> cache', 'pav -> avs'))
  // A queue between the order topic and the reservations Process API.
  await passes('cs-070', (d) => {
    box(d, 'q', 'queue', 'reservations.order-placed')
    cut(d, 'ord ~> pres')
    draw(d, 'ord ~> q', 'q ~> pres')
  })
  // The app has its own Experience API.
  await passes('cs-070', (d) => {
    box(d, 'em', 'experience-api', 'exp-app-availability-api')
    cut(d, 'mob -> exp')
    draw(d, 'mob -> em', 'em -> pav', 'em -> pres')
  })
  await passes('cs-070', (d) => rename(d, 'avs', 'Redis availability store'))

  // CS-071
  // Last year's outage: the stream feeds the WMS System API directly.
  await failsOn('cs-071', 'Robot events reach the WMS only through', (d) => draw(d, 'es ~> swms'))
  // The fleet manager writes to the WMS itself.
  await failsOn('cs-071', 'The WMS is reached only', (d) => draw(d, 'fm -> wms'))
  // Tasks are pushed synchronously with no buffer.
  await failsOn('cs-071', 'Released pick tasks reach the fleet manager through a queue', (d) => {
    unbox(d, 'tq')
    draw(d, 'swms -> pt')
  })
  await failsOn('cs-071', 'The fleet manager is reached only', (d) => {
    cut(d, 'pt -> sfl')
    draw(d, 'pt -> fm')
  })
  // Telemetry goes through the alerts flow instead of the stream.
  await failsOn('cs-071', 'Telemetry goes from the stream to the data lake', (d) => {
    cut(d, 'es ~> dl')
    draw(d, 'pa -> dl')
  })
  await failsOn('cs-071', 'feeds at least three consumers', (d) => cut(d, 'es ~> pa'))
  await failsOn('cs-071', 'Every line into or out of the event stream', (d) => swap(d, 'es ~> ps'))
  await failsOn('cs-071', 'Fleet events go into an event stream', (d) => flip(d, 'fm ~> es'))
  await failsOn('cs-071', 'The task-status Process API updates the WMS', (d) => cut(d, 'ps -> swms'))
  await failsOn('cs-071', 'Tasks the fleet manager rejects', (d) => unbox(d, 'dlq'))
  // Task results queued in front of the WMS System API.
  await passes('cs-071', (d) => {
    box(d, 'rq', 'queue', 'task-results')
    cut(d, 'ps -> swms')
    draw(d, 'ps ~> rq', 'rq ~> swms')
  })
  // A fourth consumer for productivity reporting.
  await passes('cs-071', (d) => {
    box(d, 'pp', 'process-api', 'prc-picker-productivity')
    draw(d, 'es ~> pp')
  })
  await passes('cs-071', (d) => rename(d, 'ps', 'prc-task-completions'))

  // CS-072
  // The VIN check falls back to the vehicle registry.
  await failsOn('cs-072', 'never reaches the quality system or the vehicle registry', (d) => draw(d, 'pvin -> sveh'))
  // Dealer systems call the Experience API without API Manager.
  await failsOn('cs-072', 'Every dealer system enters through the API gateway', (d) => {
    cut(d, 'dealer -> gw')
    draw(d, 'dealer -> edl')
  })
  // Owner notifications read Salesforce directly.
  await failsOn('cs-072', 'Owner contact details come from the CRM', (d) => {
    cut(d, 'pown -> scrm')
    draw(d, 'pown -> crm')
  })
  await failsOn('cs-072', 'The campaign store is reached only', (d) => {
    cut(d, 'job -> scamp')
    draw(d, 'job -> cdb')
  })
  // One Process API does notifications and OTA, so a slow OTA platform delays letters.
  await failsOn('cs-072', 'feeds at least two Process APIs', (d) => {
    unbox(d, 'pota')
    draw(d, 'pown -> ota')
  })
  // The job calls the consumers one by one.
  await failsOn('cs-072', 'Affected VINs are published as events', (d) => {
    cut(d, 'job ~> top')
    draw(d, 'job -> pown', 'job -> pota')
  })
  await failsOn('cs-072', 'expands the campaign into VINs', (d) => {
    cut(d, 'job -> sveh')
    draw(d, 'job -> veh')
  })
  await failsOn('cs-072', 'Software campaigns reach the over-the-air', (d) => cut(d, 'pota -> ota'))
  await failsOn('cs-072', 'Owners are notified', (d) => cut(d, 'pown -> nt'))
  // Kafka instead of a topic.
  await passes('cs-072', (d) => {
    d.nodes.find((n) => n.id === 'top').type = 'event-stream'
  })
  // The dealer portal uses the same API through the gateway.
  await passes('cs-072', (d) => {
    box(d, 'dp', 'web-app', 'Dealer portal')
    draw(d, 'dp -> gw')
  })
  await passes('cs-072', (d) => rename(d, 'pown', 'prc-owner-letters-and-notifications'))

  // CS-074
  // The pilot: the OMS calls dispatch synchronously.
  await failsOn('cs-074', 'through a queue', (d) => {
    unbox(d, 'rq')
    draw(d, 'oms -> pd')
  })
  // One System API for both partners.
  await failsOn('cs-074', 'No System API talks to more than one carrier', (d) => {
    unbox(d, 'sb')
    draw(d, 'sa -> cb')
  })
  // The dispatch Process API has the carrier hard-coded.
  await failsOn('cs-074', 'picks the carrier from a rules store', (d) => cut(d, 'pd -> rules'))
  await failsOn('cs-074', 'Carrier webhooks enter through the API gateway', (d) => {
    cut(d, 'cp -> gw')
    draw(d, 'cp -> ewh')
  })
  // The webhook API processes the update while the carrier waits.
  await failsOn('cs-074', 'acknowledges and queues', (d) => {
    cut(d, 'ewh ~> sq')
    draw(d, 'ewh -> ps')
  })
  await failsOn('cs-074', 'normalises updates into one status event', (d) => cut(d, 'ps ~> tp'))
  // The app asks the carrier for live status.
  await failsOn('cs-074', 'The customer app never reaches a carrier', (d) => draw(d, 'etr -> sa'))
  await failsOn('cs-074', 'driven by the status event', (d) => {
    cut(d, 'tp ~> pn')
    draw(d, 'ps -> pn')
  })
  await failsOn('cs-074', 'Carriers are reached only', (d) => draw(d, 'pd -> ca'))
  await failsOn('cs-074', 'All three carriers are drawn', (d) => unbox(d, 'tms'))
  // A third partner next year.
  await passes('cs-074', (d) => {
    box(d, 'sc', 'system-api', 'sys-carrier-c-api')
    box(d, 'cc', 'external-api', 'Carrier C')
    draw(d, 'pd -> sc', 'sc -> cc')
  })
  // Tracking reads go through a Process API.
  await passes('cs-074', (d) => {
    box(d, 'ptr', 'process-api', 'prc-order-tracking')
    cut(d, 'etr -> stk')
    draw(d, 'etr -> ptr', 'ptr -> stk')
  })
  await passes('cs-074', (d) => {
    d.nodes.find((n) => n.id === 'rules').type = 'cache'
  })

  // CS-075
  // The tracking Process API asks the MES for the latest station.
  await failsOn('cs-075', 'never reach a source system', (d) => draw(d, 'ptr -> smes'))
  // Each Experience API gets its own tracking Process API.
  await failsOn('cs-075', 'share one tracking Process API', (d) => {
    box(d, 'ptr2', 'process-api', 'prc-buyer-tracking')
    cut(d, 'ecu -> ptr')
    draw(d, 'ecu -> ptr2', 'ptr2 -> sjs')
  })
  // MES and logistics are polled instead of publishing.
  await failsOn('cs-075', 'At least four source domains', (d) => cut(d, 'smes ~> es', 'stms ~> es'))
  await failsOn('cs-075', 'The journey store is reached only', (d) => {
    cut(d, 'pj -> sjs')
    draw(d, 'pj -> js')
  })
  // Buyer contact details travel in the events, so no CRM lookup.
  await failsOn('cs-075', 'Notifications look up buyer contact details', (d) => {
    unbox(d, 'scrm')
    unbox(d, 'crm')
  })
  await failsOn('cs-075', 'Every line into or out of the event stream', (d) => swap(d, 'es ~> pj'))
  await failsOn('cs-075', 'Buyers sign in', (d) => cut(d, 'app -> idp'))
  await failsOn('cs-075', 'Carrier EDI enters through an Experience API', (d) => {
    cut(d, 'car -> eedi')
    draw(d, 'car -> stms')
  })
  await failsOn('cs-075', 'are reached only through System APIs', (d) => draw(d, 'pj -> sap'))
  await failsOn('cs-075', 'builds the journey store', (d) => cut(d, 'es ~> pj'))
  // The identity provider drawn the other way round.
  await passes('cs-075', (d) => {
    cut(d, 'app -> idp')
    draw(d, 'idp -> app')
  })
  // ETA in its own Process API, also consuming the stream.
  await passes('cs-075', (d) => {
    box(d, 'peta', 'process-api', 'prc-eta')
    draw(d, 'es ~> peta', 'peta -> sjs')
  })
  // The dealer portal goes through API Manager.
  await passes('cs-075', (d) => {
    box(d, 'gw', 'api-gateway', 'API Manager')
    cut(d, 'dp -> edl')
    draw(d, 'dp -> gw', 'gw -> edl')
  })
}
