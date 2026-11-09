// Wrong and other correct diagrams for integration scenarios uc-106 to uc-120. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }) => {
  // UC-106
  // The Experience API keeps its own cache beside the Process API.
  await failsOn('uc-106', 'Only the Process API touches the cache', (d) => draw(d, 'exp -> cache'))
  // The Experience API calls the System API on its own, so reads skip the cache.
  await failsOn('uc-106', 'never skips the Process API', (d) => draw(d, 'exp -> sys'))
  // The Process API calls the mainframe directly.
  await failsOn('uc-106', 'only through the System API', (d) => {
    cut(d, 'prc -> sys')
    draw(d, 'prc -> mf')
  })
  await failsOn('uc-106', 'reads and fills the cache', (d) => cut(d, 'prc -> cache'))
  // No eviction: stale entries live for the full TTL.
  await failsOn('uc-106', 'evict entries', (d) => unbox(d, 'chg'))
  await failsOn('uc-106', 'Both channels', (d) => {
    cut(d, 'mob -> exp')
    draw(d, 'mob -> prc')
  })
  await failsOn('uc-106', 'sync calls', (d) => swap(d, 'prc -> cache'))
  // A separate Experience API per channel, both on the same Process API.
  await passes('uc-106', (d) => {
    box(d, 'em', 'experience-api', 'exp-customer-app-api')
    cut(d, 'mob -> exp')
    draw(d, 'mob -> em', 'em -> prc')
  })
  // Redis instead of Object Store, and change events on a topic.
  await passes('uc-106', (d) => {
    rename(d, 'cache', 'Redis policy cache')
    d.nodes.find((n) => n.id === 'chg').type = 'topic'
  })

  // UC-107
  // No idempotency store: every retry is processed again.
  await failsOn('uc-107', 'checks the scan ID', (d) => {
    cut(d, 'prc -> ids')
    cut(d, 'push -> ids')
  })
  // The queue consumer trusts the queue to deliver once.
  await failsOn('uc-107', 'including the queue consumer', (d) => cut(d, 'push -> ids'))
  // The entry API updates the ticketing platform inside the gate request.
  await failsOn('uc-107', 'never waits on the ticketing platform', (d) => draw(d, 'prc -> st'))
  await failsOn('uc-107', 'only through a System API', (d) => {
    cut(d, 'push -> st')
    draw(d, 'push -> tk')
  })
  await failsOn('uc-107', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // The queue is drawn, but the entry API never puts anything on it.
  await failsOn('uc-107', 'updated through a queue', (d) => cut(d, 'prc ~> q'))
  await failsOn('uc-107', 'Gate scanners call the Experience API', (d) => {
    unbox(d, 'exp')
    draw(d, 'gate -> prc')
  })
  // Entry state is not kept, so a shared screenshot opens the gate twice.
  await failsOn('uc-107', 'Entry state per ticket', (d) => unbox(d, 'entry'))
  await passes('uc-107', (d) => {
    rename(d, 'ids', 'Dedup table (scan id, answer)')
    d.nodes.find((n) => n.id === 'ids').type = 'database'
  })
  // The Experience API also checks the store, which is allowed.
  await passes('uc-107', (d) => draw(d, 'exp -> ids'))

  // UC-108
  await failsOn('uc-108', 'publishes events to the Kafka topic', (d) => swap(d, 'prc ~> k'))
  // Analytics forgotten: only two consumer apps.
  await failsOn('uc-108', 'three consumer apps', (d) => unbox(d, 'c3'))
  // The order service calls the ledger app directly as well.
  await failsOn('uc-108', 'never waits on a consumer', (d) => draw(d, 'prc -> c2'))
  await failsOn('uc-108', 'only through a System API', (d) => {
    cut(d, 'c2 -> sl')
    draw(d, 'c2 -> erp')
  })
  await failsOn('uc-108', 'dead-letter topic', (d) => unbox(d, 'dlt'))
  await failsOn('uc-108', 'into the warehouse', (d) => unbox(d, 'dw'))
  // A consumer reads Kafka with a sync call.
  await failsOn('uc-108', 'Every line into or out of Kafka is async', (d) => swap(d, 'k ~> c1'))
  // A retry topic for the ledger consumer.
  await passes('uc-108', (d) => {
    box(d, 'rt', 'event-stream', 'orders.v1.finance-ledger.retry')
    draw(d, 'c2 ~> rt', 'rt ~> c2')
  })
  // The analytics loader drawn as a scheduled micro-batch job.
  await passes('uc-108', (d) => {
    d.nodes.find((n) => n.id === 'c3').type = 'batch-job'
  })

  // UC-109
  // A garage app is given the Experience API URL directly.
  await failsOn('uc-109', 'without the gateway', (d) => draw(d, 'p2 -> exp'))
  await failsOn('uc-109', 'forwards to the partner Experience API', (d) => {
    cut(d, 'gw -> exp')
    draw(d, 'gw -> prc')
  })
  await failsOn('uc-109', 'identity provider', (d) => unbox(d, 'idp'))
  // The gateway is drawn beside the partners, but nothing goes through it.
  await failsOn('uc-109', 'Partners connect to the gateway', (d) => {
    cut(d, 'p1 -> gw', 'p2 -> gw')
    draw(d, 'p1 -> exp', 'p2 -> exp')
  })
  await failsOn('uc-109', 'only through System APIs', (d) => {
    cut(d, 'prc -> ssap')
    draw(d, 'prc -> sap')
  })
  // Two Process APIs, one per back end.
  await failsOn('uc-109', 'combined in one Process API', (d) => {
    box(d, 'p2x', 'process-api', 'prc-stock')
    cut(d, 'prc -> swms')
    draw(d, 'exp -> p2x', 'p2x -> swms')
  })
  await failsOn('uc-109', 'Prices are cached', (d) => cut(d, 'prc -> cache'))
  await failsOn('uc-109', 'Usage per client', (d) => unbox(d, 'mon'))
  // A load balancer in front of the gateway.
  await passes('uc-109', (d) => {
    box(d, 'lb', 'load-balancer', 'Ingress')
    cut(d, 'p1 -> gw', 'p2 -> gw')
    draw(d, 'p1 -> lb', 'p2 -> lb', 'lb -> gw')
  })
  // A third tier drawn, and the identity provider drawn calling into the gateway.
  await passes('uc-109', (d) => {
    box(d, 'p3', 'partner', 'Gold partners')
    draw(d, 'p3 -> gw')
    flip(d, 'gw -> idp')
  })

  // UC-110
  // No queue: the listener calls the mapping API and waits for FHIR before the ACK.
  await failsOn('uc-110', 'on a queue before the ACK', (d) => {
    unbox(d, 'raw')
    draw(d, 'lsn -> prc')
  })
  await failsOn('uc-110', 'never waits on the FHIR server', (d) => {
    unbox(d, 'raw')
    draw(d, 'lsn -> prc')
  })
  await failsOn('uc-110', 'FHIR server is reached only', (d) => {
    cut(d, 'prc -> sfh')
    draw(d, 'prc -> fhir')
  })
  await failsOn('uc-110', 'Raw HL7 is archived', (d) => unbox(d, 'arch'))
  // The EHR is drawn writing files to the queue broker, with no MLLP listener.
  await failsOn('uc-110', 'MLLP listener API', (d) => {
    unbox(d, 'lsn')
    draw(d, 'ehr ~> raw', 'ehr -> arch')
  })
  await failsOn('uc-110', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // The app API reads patient data from the EHR listener.
  await failsOn('uc-110', 'no route to the EHR', (d) => draw(d, 'exp -> ehr'))
  await failsOn('uc-110', 'reads FHIR through its Experience API', (d) => {
    cut(d, 'app -> exp')
    draw(d, 'app -> sfh')
  })
  await failsOn('uc-110', 'reads the queue', (d) => swap(d, 'raw ~> prc'))
  // The archive is written by the mapping app.
  await passes('uc-110', (d) => {
    cut(d, 'lsn -> arch')
    draw(d, 'prc -> arch')
  })
  // The listener drawn as a Process API, the archive as S3.
  await passes('uc-110', (d) => {
    d.nodes.find((n) => n.id === 'lsn').type = 'process-api'
    d.nodes.find((n) => n.id === 'arch').type = 's3-bucket'
  })

  // UC-111
  // The webhook API updates the pharmacy system before answering.
  await failsOn('uc-111', 'queues each event', (d) => {
    unbox(d, 'q')
    draw(d, 'wh -> trk')
  })
  await failsOn('uc-111', 'never waits on the pharmacy system', (d) => {
    unbox(d, 'q')
    draw(d, 'wh -> trk')
  })
  // The carrier posts straight to the webhook API.
  await failsOn('uc-111', 'without the gateway', (d) => draw(d, 'car -> wh'))
  await failsOn('uc-111', 'pharmacy system is reached only', (d) => {
    cut(d, 'trk -> sph')
    draw(d, 'trk -> ph')
  })
  // The label is requested over a queue, so the packer has no label to print.
  await failsOn('uc-111', 'Labels are created with sync calls', (d) => swap(d, 'prc -> scar'))
  await failsOn('uc-111', 'carrier API is called only', (d) => {
    cut(d, 'prc -> scar')
    draw(d, 'prc -> car')
  })
  await failsOn('uc-111', 'SMS updates', (d) => unbox(d, 'sms'))
  await failsOn('uc-111', 'enter through the gateway', (d) => {
    unbox(d, 'gw')
    draw(d, 'car -> wh')
  })
  // A DLQ on the tracking queue.
  await passes('uc-111', (d) => {
    box(d, 'dlq', 'dlq', 'tracking-events-dlq')
    draw(d, 'q ~> dlq')
  })
  // A label retry queue for carrier outages.
  await passes('uc-111', (d) => {
    box(d, 'lq', 'queue', 'label-retry')
    draw(d, 'prc ~> lq', 'lq ~> prc')
  })

  // UC-112
  // The Process API calls the bureau gateway and waits.
  await failsOn('uc-112', 'never waits on the bureau', (d) => draw(d, 'prc -> bur'))
  // One queue for requests and replies.
  await failsOn('uc-112', 'two different queues', (d) => {
    unbox(d, 'rep')
    draw(d, 'bur ~> req', 'req ~> rl')
  })
  await failsOn('uc-112', 'Replies come back on a queue', (d) => {
    unbox(d, 'rep')
    draw(d, 'bur ~> rl')
  })
  // The listener keeps pending checks in memory.
  await failsOn('uc-112', 'Both the sender and the listener', (d) => cut(d, 'rl -> st'))
  await failsOn('uc-112', 'times out checks', (d) => unbox(d, 'job'))
  await failsOn('uc-112', 'result reaches the store app', (d) => unbox(d, 'push'))
  await failsOn('uc-112', 'reads the reply queue', (d) => swap(d, 'rep ~> rl'))
  await failsOn('uc-112', 'through a request queue', (d) => swap(d, 'req ~> bur'))
  // Results go out on a topic that feeds the push service.
  await passes('uc-112', (d) => {
    box(d, 't', 'topic', 'credit.results')
    cut(d, 'rl -> push')
    draw(d, 'rl ~> t', 't ~> push')
  })
  // The store app polls as well, and the queues are renamed.
  await passes('uc-112', (d) => {
    rename(d, 'req', 'credit.request')
    rename(d, 'rep', 'credit.reply')
    draw(d, 'store -> exp')
  })

  // UC-113
  // The breaker state is kept by the Process API instead.
  await failsOn('uc-113', 'System API keeps shared circuit state', (d) => {
    cut(d, 'sys -> cb')
    draw(d, 'prc -> cb')
  })
  await failsOn('uc-113', 'Only the System API reads and writes the circuit state', (d) => draw(d, 'prc -> cb'))
  await failsOn('uc-113', 'fallback source', (d) => unbox(d, 'fb'))
  // The SOAP wrapper answers with the fallback itself.
  await failsOn('uc-113', 'business choice in the Process API', (d) => {
    cut(d, 'prc -> fb')
    draw(d, 'sys -> fb')
  })
  await failsOn('uc-113', 'called only through a System API', (d) => draw(d, 'prc -> soap'))
  await failsOn('uc-113', 'raises an alert', (d) => unbox(d, 'mon'))
  await failsOn('uc-113', 'sync request with a timeout', (d) => swap(d, 'sys -> soap'))
  await failsOn('uc-113', 'through the API layers', (d) => {
    cut(d, 'web -> exp')
    draw(d, 'web -> prc')
  })
  await passes('uc-113', (d) => rename(d, 'cb', 'Redis breaker state'))
  // Fallback lead times held in a cache, alert sent as a sync call.
  await passes('uc-113', (d) => {
    d.nodes.find((n) => n.id === 'fb').type = 'cache'
    swap(d, 'sys ~> mon')
  })

  // UC-114
  // Turbines publish straight to the central ingress, with nothing kept at the site.
  await failsOn('uc-114', 'buffer at the site first', (d) => {
    unbox(d, 'edge')
    draw(d, 'scada ~> hub')
  })
  // The site gateway forwards with HTTP calls that fail when the link drops.
  await failsOn('uc-114', 'only by async hops', (d) => swap(d, 'edge ~> hub'))
  // A turbine calls the dashboard API directly.
  await failsOn('uc-114', 'never call central APIs synchronously', (d) => draw(d, 'scada -> exp'))
  await failsOn('uc-114', 'data lake', (d) => unbox(d, 'lake'))
  // Mule reads the raw stream and creates orders from every fault code.
  await failsOn('uc-114', 'does not feed SAP directly', (d) => draw(d, 'k ~> wo'))
  await failsOn('uc-114', 'Faults are published on their own topic', (d) => {
    unbox(d, 'fault')
    draw(d, 'det ~> wo')
  })
  await failsOn('uc-114', 'SAP PM is reached only', (d) => {
    cut(d, 'wo -> ssap')
    draw(d, 'wo -> sap')
  })
  await failsOn('uc-114', 'grid report', (d) => {
    cut(d, 'rep -> ts')
    draw(d, 'rep -> k')
  })
  await failsOn('uc-114', 'grid operator is reached only', (d) => draw(d, 'rep -> grid'))
  await failsOn('uc-114', 'never reads Kafka directly', (d) => {
    cut(d, 'exp -> ts')
    draw(d, 'exp -> k')
  })
  await failsOn('uc-114', 'through its Experience API', (d) => {
    cut(d, 'dash -> exp')
    draw(d, 'dash -> ts')
  })
  // A site Kafka cluster as the buffer, and the lake drawn as file storage.
  await passes('uc-114', (d) => {
    d.nodes.find((n) => n.id === 'edge').type = 'event-stream'
    d.nodes.find((n) => n.id === 'lake').type = 'file-store'
  })
  // Work order flow also pages the on-call engineer.
  await passes('uc-114', (d) => {
    box(d, 'page', 'notification', 'On-call engineer')
    draw(d, 'wo -> page')
  })

  // UC-115
  // Back to polling: a job queries the vendor tables and publishes.
  await failsOn('uc-115', 'Changes flow from the policy database', (d) => {
    unbox(d, 'dbz')
    box(d, 'poll', 'batch-job', 'Poll every minute')
    draw(d, 'poll -> pas', 'poll ~> k')
  })
  await failsOn('uc-115', 'No integration queries the vendor primary database', (d) => draw(d, 'agg -> pas'))
  await failsOn('uc-115', 'Salesforce is updated only', (d) => {
    cut(d, 'agg -> ssf')
    draw(d, 'agg -> sf')
  })
  await failsOn('uc-115', 'read from the replica only through a System API', (d) => draw(d, 'agg -> rep'))
  await failsOn('uc-115', 'dead-letter topic', (d) => unbox(d, 'dlq'))
  await failsOn('uc-115', 'Search and the warehouse', (d) => unbox(d, 'dw'))
  await failsOn('uc-115', 'Mule consumes the change topics', (d) => swap(d, 'k ~> agg'))
  await failsOn('uc-115', 'reconciliation job', (d) => unbox(d, 'recon'))
  // Mule feeds the search index itself.
  await passes('uc-115', (d) => {
    cut(d, 'k ~> srch')
    draw(d, 'agg -> srch')
  })
  // The connector drawn as a job box.
  await passes('uc-115', (d) => {
    rename(d, 'dbz', 'Kafka Connect CDC source')
    d.nodes.find((n) => n.id === 'dbz').type = 'batch-job'
  })

  // UC-116
  // Today's dual write: save, then publish from the order service.
  await failsOn('uc-116', 'Events leave only after the commit', (d) => draw(d, 'prc ~> ex'))
  await failsOn('uc-116', 'Only the outbox relay publishes', (d) => draw(d, 'prc ~> ex'))
  // The order service hands the event to the relay in memory.
  await failsOn('uc-116', 'Events leave only after the commit', (d) => draw(d, 'prc ~> relay'))
  await failsOn('uc-116', 'relay reads the outbox table', (d) => cut(d, 'relay -> pg'))
  // The order service keeps orders in the billing platform instead of its own database.
  await failsOn('uc-116', 'writes the order and outbox row', (d) => {
    cut(d, 'prc -> pg')
    draw(d, 'prc -> sbill')
  })
  // Billing reads the exchange directly, with no queue of its own.
  await failsOn('uc-116', 'its own queue', (d) => {
    unbox(d, 'qb')
    draw(d, 'ex ~> pbill')
  })
  await failsOn('uc-116', 'only through System APIs', (d) => {
    cut(d, 'pprov -> sprov')
    draw(d, 'pprov -> hss')
  })
  await failsOn('uc-116', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  await failsOn('uc-116', 'exchange and queues is async', (d) => swap(d, 'qb ~> pbill'))
  // A database listener drawn as the database feeding the relay.
  await passes('uc-116', (d) => flip(d, 'relay -> pg'))
  await passes('uc-116', (d) => {
    rename(d, 'relay', 'prc-outbox-relay')
    d.nodes.find((n) => n.id === 'relay').type = 'process-api'
  })

  // UC-117
  await failsOn('uc-117', 'at least four supplier System APIs', (d) => {
    unbox(d, 's4')
    unbox(d, 'e4')
  })
  // A shared System API that calls two suppliers.
  await failsOn('uc-117', 'exactly one supplier', (d) => draw(d, 's1 -> e2'))
  await failsOn('uc-117', 'only through System APIs', (d) => {
    cut(d, 's3 -> e3')
    draw(d, 'prc -> e3')
  })
  // Supplier B is called over a queue, so the answer cannot come back in time.
  await failsOn('uc-117', 'sync calls with timeouts', (d) => swap(d, 'prc -> s2'))
  await failsOn('uc-117', 'quotes are cached', (d) => cut(d, 'prc -> cache'))
  // The Experience API calls a supplier itself.
  await failsOn('uc-117', 'never the suppliers', (d) => draw(d, 'exp -> s1'))
  await failsOn('uc-117', 'FX rates', (d) => unbox(d, 'fxdb'))
  await failsOn('uc-117', 'monitored', (d) => unbox(d, 'mon'))
  // A fifth supplier.
  await passes('uc-117', (d) => {
    box(d, 's5', 'system-api', 'sys-supplier-e-api')
    box(d, 'e5', 'external-api', 'Supplier E')
    draw(d, 'prc -> s5', 's5 -> e5')
  })
  // Procurement systems come in through gateway policies.
  await passes('uc-117', (d) => {
    box(d, 'gw', 'api-gateway', 'Client ID and rate limit')
    cut(d, 'buy -> exp')
    draw(d, 'buy -> gw', 'gw -> exp')
  })

  // UC-118
  // The job service still calls a customer endpoint inline.
  await failsOn('uc-118', 'never waits on a customer endpoint', (d) => draw(d, 'src -> cust'))
  await failsOn('uc-118', 'called only by the delivery worker', (d) => draw(d, 'fan -> cust'))
  // The fan-out calls the delivery worker directly, so slow endpoints back up into it.
  await failsOn('uc-118', 'queued separately', (d) => {
    unbox(d, 'dq')
    draw(d, 'fan -> dlv')
  })
  // Retries are parked but nothing reads them again.
  await failsOn('uc-118', 'feeds delivery again', (d) => cut(d, 'retry ~> dlv'))
  await failsOn('uc-118', 'dead-lettered', (d) => unbox(d, 'dlq'))
  await failsOn('uc-118', 'from the delivery log', (d) => cut(d, 'exp -> log'))
  // The portal reads the log database itself.
  await failsOn('uc-118', 'admin portal calls its own Experience API', (d) => {
    cut(d, 'portal -> exp')
    draw(d, 'portal -> log')
  })
  await failsOn('uc-118', 'never calls the delivery worker directly', (d) => draw(d, 'fan -> dlv'))
  await failsOn('uc-118', 'emailed', (d) => unbox(d, 'mail'))
  await failsOn('uc-118', 'reads the subscriptions', (d) => unbox(d, 'subs'))
  await failsOn('uc-118', 'publishes events to a stream', (d) => swap(d, 'src ~> k'))
  // Anypoint MQ exchange instead of Kafka, and SQS-style delayed retries.
  await passes('uc-118', (d) => {
    d.nodes.find((n) => n.id === 'k').type = 'topic'
    d.nodes.find((n) => n.id === 'retry').type = 'cloud-queue'
  })
  // A dedicated delivery queue for large customers.
  await passes('uc-118', (d) => {
    box(d, 'dq2', 'queue', 'webhook-deliveries-premium')
    draw(d, 'fan ~> dq2', 'dq2 ~> dlv')
  })

  // UC-119
  // Today's design: the website waits for all three steps.
  await failsOn('uc-119', 'accepted and queued', (d) => {
    unbox(d, 'breq')
    draw(d, 'exp -> orch')
  })
  await failsOn('uc-119', 'never waits on the insurer', (d) => {
    unbox(d, 'breq')
    draw(d, 'exp -> orch')
  })
  // Choreography by direct calls: fleet calls payments, payments calls the insurer.
  await failsOn('uc-119', 'never call each other', (d) => {
    cut(d, 'orch -> spay', 'orch -> sins')
    draw(d, 'sfleet -> spay', 'spay -> sins')
  })
  await failsOn('uc-119', 'One orchestrator calls all three', (d) => {
    cut(d, 'orch -> spay', 'orch -> sins')
    draw(d, 'sfleet -> spay', 'spay -> sins')
  })
  await failsOn('uc-119', 'only through System APIs', (d) => {
    cut(d, 'sins -> ins')
    draw(d, 'orch -> ins')
  })
  await failsOn('uc-119', 'Saga state is recorded', (d) => cut(d, 'orch -> st'))
  await failsOn('uc-119', 'manual review', (d) => unbox(d, 'manual'))
  await failsOn('uc-119', 'sweeper', (d) => unbox(d, 'sweep'))
  await failsOn('uc-119', 'published as events', (d) => swap(d, 'orch ~> evt'))
  // Compensations queued for retry.
  await passes('uc-119', (d) => {
    box(d, 'cq', 'queue', 'saga-compensations')
    draw(d, 'orch ~> cq', 'cq ~> orch')
  })
  // A gateway in front of the Experience API, and the sweeper only reads the log.
  await passes('uc-119', (d) => {
    box(d, 'gw', 'api-gateway', 'Booking API policies')
    cut(d, 'web -> exp', 'sweep -> orch')
    draw(d, 'web -> gw', 'gw -> exp')
  })

  // UC-120
  // Dual write: the shipment service also publishes itself.
  await failsOn('uc-120', 'publishes only through its outbox', (d) => draw(d, 'shp ~> k1'))
  // The shipment service hands events to the relay in memory.
  await failsOn('uc-120', 'publishes only through its outbox', (d) => draw(d, 'shp ~> relay'))
  await failsOn('uc-120', 'relay reads the shipment database', (d) => cut(d, 'relay -> shpdb'))
  // Polling the AS/400 is kept beside CDC.
  await failsOn('uc-120', 'Nothing polls the AS/400', (d) => {
    box(d, 'poll', 'batch-job', 'AS/400 poller (5 min)')
    draw(d, 'poll -> as400', 'poll ~> k2')
  })
  await failsOn('uc-120', 'through a CDC connector', (d) => unbox(d, 'cdc'))
  await failsOn('uc-120', 'schema registry', (d) => cut(d, 'c1 -> reg', 'c2 -> reg'))
  await failsOn('uc-120', 'two consumer apps read the same topic', (d) => unbox(d, 'c1'))
  await failsOn('uc-120', 'dead-letter topic', (d) => cut(d, 'c2 ~> dlt'))
  // Partners are given a consumer on the internal cluster.
  await failsOn('uc-120', 'Partners never connect to Kafka', (d) => draw(d, 'part ~> k1'))
  await failsOn('uc-120', 'shipment service never calls partners', (d) => draw(d, 'shp -> part'))
  await failsOn('uc-120', 'warehouse', (d) => unbox(d, 'dw'))
  await failsOn('uc-120', 'Every line into or out of Kafka is async', (d) => swap(d, 'relay ~> k1'))
  // A log-based relay drawn as the database feeding it.
  await passes('uc-120', (d) => flip(d, 'relay -> shpdb'))
  // A third consumer group.
  await passes('uc-120', (d) => {
    box(d, 'c3', 'process-api', 'prc-eta-predictor (group eta)')
    draw(d, 'k1 ~> c3', 'c3 ~> dlt', 'c3 -> reg')
  })
}
