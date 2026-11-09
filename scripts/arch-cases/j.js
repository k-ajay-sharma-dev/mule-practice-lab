// Wrong and other correct diagrams for case studies cs-107 to cs-120. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }) => {
  // CS-107
  // Retailers call the Experience API directly and skip the policies.
  await failsOn('cs-107', 'passes the gateway policies', (d) => draw(d, 'ret -> exp'))
  // Today's design: the website reads DB2 over JDBC.
  await failsOn('cs-107', 'DB2 tracking system is reached only through a System API', (d) => draw(d, 'web -> db2'))
  // The Experience API skips the Process API.
  await failsOn('cs-107', 'never calls a System API directly', (d) => draw(d, 'exp -> sys'))
  await failsOn('cs-107', 'passes the tracking Process API', (d) => {
    cut(d, 'exp -> prc')
    draw(d, 'exp -> sys')
  })
  // No cache: every refresh is a DB2 query.
  await failsOn('cs-107', 'cached for a short time', (d) => unbox(d, 'cache'))
  // Photos streamed straight from S3 by the Process API.
  await failsOn('cs-107', 'photos are fetched only through a System API', (d) => draw(d, 'prc -> s3'))
  await failsOn('cs-107', 'synchronous calls', (d) => swap(d, 'gw -> exp'))
  await failsOn('cs-107', 'each call through the gateway', (d) => unbox(d, 'mob'))
  await failsOn('cs-107', 'DB2 tracking system is reached only through a System API', (d) => flip(d, 'sys -> db2'))
  // The cache sits on the System API instead.
  await passes('cs-107', (d) => {
    cut(d, 'prc -> cache')
    draw(d, 'sys -> cache')
  })
  // A separate Experience API for retailers.
  await passes('cs-107', (d) => {
    box(d, 'exp2', 'experience-api', 'exp-partner-tracking-api')
    draw(d, 'gw -> exp2', 'exp2 -> prc')
  })
  await passes('cs-107', (d) => {
    d.nodes.find((n) => n.id === 's3').type = 'file-store'
    rename(d, 'db2', 'AS/400 tracking DB')
  })

  // CS-108
  // The callback is processed inside the HTTP request.
  await failsOn('cs-108', 'through a queue', (d) => {
    unbox(d, 'q')
    draw(d, 'scb -> prc')
  })
  await failsOn('cs-108', 'No synchronous chain', (d) => draw(d, 'scb -> prc'))
  // The Process API calls the clearing house without a System API.
  await failsOn('cs-108', 'clearing house is called only through its System API', (d) => draw(d, 'prc -> ch'))
  // The store app changes routing directly through the Experience API.
  await failsOn('cs-108', 'passes the porting Process API', (d) => draw(d, 'exp -> soss'))
  await failsOn('cs-108', 'keeps the state', (d) => unbox(d, 'db'))
  await failsOn('cs-108', 'HLR number routing is changed only through a System API', (d) => draw(d, 'prc -> hlr'))
  await failsOn('cs-108', 'Billing is activated only through a System API', (d) => draw(d, 'prc -> bill'))
  await failsOn('cs-108', 'async messages', (d) => swap(d, 'scb ~> q'))
  await failsOn('cs-108', 'Stores and the self-care app', (d) => unbox(d, 'app'))
  await failsOn('cs-108', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // The callback receiver drawn as an Experience API.
  await passes('cs-108', (d) => {
    d.nodes.find((n) => n.id === 'scb').type = 'experience-api'
    rename(d, 'scb', 'exp-clearing-house-callback-api')
  })
  // SMS sent through a notification System API.
  await passes('cs-108', (d) => {
    box(d, 'sn', 'system-api', 'sys-notification-api')
    cut(d, 'prc ~> sms')
    draw(d, 'prc -> sn', 'sn -> sms')
  })
  // A second queue for port window messages.
  await passes('cs-108', (d) => {
    box(d, 'q2', 'queue', 'port-windows')
    draw(d, 'scb ~> q2', 'q2 ~> prc')
  })

  // CS-109
  // The distribution Process API calls the channel manager itself.
  await failsOn('cs-109', 'channel manager is called only through its System API', (d) => draw(d, 'pari -> cm'))
  // The reservation webhook writes to the CRS while the channel manager waits.
  await failsOn('cs-109', 'queued before they reach the CRS', (d) => {
    unbox(d, 'resq')
    draw(d, 'hook -> pres')
  })
  // ARI changes handed over with a synchronous call, so the 06:00 burst hits the distribution API at once.
  await failsOn('cs-109', 'ARI changes leave the CRS System API', (d) => {
    unbox(d, 'ariq')
    draw(d, 'scrs -> pari')
  })
  await failsOn('cs-109', 'merge bursts', (d) => unbox(d, 'cache'))
  await failsOn('cs-109', 'CRS is reached only through its System API', (d) => draw(d, 'pres -> crs'))
  await failsOn('cs-109', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  await failsOn('cs-109', 'async messages', (d) => swap(d, 'resq ~> pres'))
  // One Process API doing both jobs.
  await failsOn('cs-109', 'separate Process APIs', (d) => {
    unbox(d, 'pres')
    draw(d, 'resq ~> pari', 'pari -> scrs')
  })
  await failsOn('cs-109', 'written to the CRS through a System API', (d) => cut(d, 'pres -> scrs'))
  // A topic in front of the ARI queue.
  await passes('cs-109', (d) => {
    box(d, 'tp', 'topic', 'ari-changed')
    cut(d, 'scrs ~> ariq')
    draw(d, 'scrs ~> tp', 'tp ~> ariq')
  })
  // The webhook receiver drawn as a System API for the channel manager.
  await passes('cs-109', (d) => {
    d.nodes.find((n) => n.id === 'hook').type = 'system-api'
    rename(d, 'hook', 'sys-channel-manager-webhook')
  })
  await passes('cs-109', (d) => rename(d, 'pari', 'prc-availability-distribution'))

  // CS-110
  // Today's design: the WMS calls a carrier itself.
  await failsOn('cs-110', 'passes the shipping Process API', (d) => draw(d, 'wms -> dhl'))
  await failsOn('cs-110', 'Carriers are called only by System APIs', (d) => draw(d, 'pl -> dhl'))
  // One generic carrier System API.
  await failsOn('cs-110', 'choose among at least three carriers', (d) => {
    unbox(d, 'sups')
    unbox(d, 'sdpd')
    draw(d, 'sdhl -> ups', 'sdhl -> dpd')
  })
  await failsOn('cs-110', 'No System API serves two carriers', (d) => {
    unbox(d, 'sups')
    draw(d, 'sdhl -> ups')
  })
  // The webhook receiver calls the tracking Process API while the carrier waits.
  await failsOn('cs-110', 'No synchronous chain', (d) => draw(d, 'ev -> pt'))
  // File events go to their own queue.
  await failsOn('cs-110', 'One tracking queue receives both', (d) => {
    box(d, 'tq2', 'queue', 'file-tracking-events')
    cut(d, 'job ~> tq')
    draw(d, 'job ~> tq2', 'tq2 ~> pt')
  })
  await failsOn('cs-110', 'synchronous call for every carrier', (d) => swap(d, 'pl -> sdhl'))
  await failsOn('cs-110', 'OMS is updated only through a System API', (d) => draw(d, 'pt -> oms'))
  await failsOn('cs-110', 'reads the carrier status files', (d) => cut(d, 'job -> sftp'))
  await failsOn('cs-110', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // A gateway in front of the webhook receiver.
  await passes('cs-110', (d) => {
    box(d, 'gw', 'api-gateway', 'Carrier webhook policies')
    cut(d, 'dhl -> ev', 'ups -> ev')
    draw(d, 'dhl -> gw', 'ups -> gw', 'gw -> ev')
  })
  // A fourth carrier.
  await passes('cs-110', (d) => {
    box(d, 'sgls', 'system-api', 'sys-carrier-gls-api')
    box(d, 'gls', 'external-api', 'GLS API')
    draw(d, 'pl -> sgls', 'sgls -> gls')
  })
  // Rules held in a cache instead of a database.
  await passes('cs-110', (d) => {
    unbox(d, 'rules')
    box(d, 'rc', 'cache', 'Carrier rules cache')
    draw(d, 'pl -> rc')
  })

  // CS-111
  // Today's design: the partner waits while the loyalty platform is called.
  await failsOn('cs-111', 'never waits for the loyalty platform', (d) => draw(d, 'exp -> prc'))
  await failsOn('cs-111', 'SAP is not called once per accrual', (d) => draw(d, 'prc -> sfin'))
  await failsOn('cs-111', 'Duplicate partner transactions', (d) => unbox(d, 'ids'))
  await failsOn('cs-111', 'loyalty platform is reached only through its System API', (d) => draw(d, 'prc -> loy'))
  await failsOn('cs-111', 'only through the gateway', (d) => draw(d, 'part -> exp'))
  // The file loader calls the Process API instead of the shared queue.
  await failsOn('cs-111', 'same queue', (d) => {
    cut(d, 'job ~> q')
    draw(d, 'job -> prc')
  })
  // Billing posts to SAP directly.
  await failsOn('cs-111', 'nightly billing job sends partner totals', (d) => {
    cut(d, 'bill -> sfin')
    draw(d, 'bill -> sap')
  })
  await failsOn('cs-111', 'reads the partner SFTP drop', (d) => cut(d, 'job -> sftp'))
  await failsOn('cs-111', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // Duplicates kept in a ledger database.
  await passes('cs-111', (d) => {
    unbox(d, 'ids')
    box(d, 'led', 'database', 'Accrual ledger')
    draw(d, 'prc -> led')
  })
  // Billing reads totals from the data warehouse.
  await passes('cs-111', (d) => {
    box(d, 'dw', 'data-warehouse', 'Loyalty data warehouse')
    cut(d, 'bill -> sloy')
    draw(d, 'bill -> dw')
  })
  // Files land on SFTP and the loader is drawn the other way round.
  await passes('cs-111', (d) => flip(d, 'job -> sftp'))

  // CS-113
  // Today's design: the orchestrator waits on the provisioning gateway.
  await failsOn('cs-113', 'never waits on a synchronous call', (d) => {
    cut(d, 'orch ~> pq')
    draw(d, 'orch -> sprov')
  })
  await failsOn('cs-113', 'reached only through System APIs', (d) => draw(d, 'orch -> smdp'))
  // Salesforce calls the orchestrator synchronously from Apex.
  await failsOn('cs-113', 'Submitted orders reach the orchestrator', (d) => {
    unbox(d, 'oq')
    draw(d, 'sf -> orch')
  })
  await failsOn('cs-113', 'keeps the state', (d) => unbox(d, 'st'))
  await failsOn('cs-113', 'Provisioning results come back', (d) => unbox(d, 'rq'))
  await failsOn('cs-113', 'Order status goes back to Salesforce only through its System API', (d) => draw(d, 'orch -> sf'))
  await failsOn('cs-113', 'async messages', (d) => swap(d, 'ssf ~> oq'))
  await failsOn('cs-113', 'at least four System APIs', (d) => {
    unbox(d, 'scred')
    unbox(d, 'snum')
  })
  await failsOn('cs-113', 'requested through a queue', (d) => {
    unbox(d, 'pq')
    draw(d, 'orch -> sprov')
  })
  // Order events go through a topic first.
  await passes('cs-113', (d) => {
    box(d, 'tp', 'topic', 'order-events')
    cut(d, 'ssf ~> oq')
    draw(d, 'ssf ~> tp', 'tp ~> oq')
  })
  // Customer notification through a System API.
  await passes('cs-113', (d) => {
    box(d, 'sn', 'system-api', 'sys-notification-api')
    box(d, 'n', 'notification', 'QR code e-mail and SMS')
    draw(d, 'orch -> sn', 'sn -> n')
  })
  // Provisioning results published through a topic.
  await passes('cs-113', (d) => {
    box(d, 'rt', 'topic', 'provisioning-results topic')
    cut(d, 'sprov ~> rq')
    draw(d, 'sprov ~> rt', 'rt ~> rq')
  })

  // CS-114
  // The Process API calls each platform in turn.
  await failsOn('cs-114', 'fans out to at least two consumers', (d) => {
    unbox(d, 'tp')
    unbox(d, 'qott')
    unbox(d, 'qpart')
    draw(d, 'p -> sott', 'p -> spart')
  })
  // One queue shared by both platforms.
  await failsOn('cs-114', 'No queue is shared', (d) => {
    unbox(d, 'qpart')
    draw(d, 'qott ~> spart')
  })
  await failsOn('cs-114', 'fed straight from the topic', (d) => draw(d, 'tp ~> sott'))
  // Windows are handled by hand, with no scheduler trigger.
  await failsOn('cs-114', 'triggered by a scheduler', (d) => unbox(d, 'sched'))
  // The scheduler calls the Process API directly, so a midnight peak hits it all at once.
  await failsOn('cs-114', 'triggered by a scheduler', (d) => {
    cut(d, 'sched ~> rcq', 'sched -> sr')
    draw(d, 'sched -> p')
  })
  await failsOn('cs-114', 'rights database is reached only through its System API', (d) => draw(d, 'p -> rdb'))
  await failsOn('cs-114', 'audit store', (d) => unbox(d, 'audit'))
  await failsOn('cs-114', 'nightly reconciliation', (d) => cut(d, 'recon -> sott'))
  await failsOn('cs-114', 'async messages', (d) => swap(d, 'qott ~> sott'))
  await failsOn('cs-114', 'Rights edits also reach', (d) => cut(d, 'sr ~> rcq'))
  await failsOn('cs-114', 'updated only through System APIs', (d) => draw(d, 'p -> ott'))
  // A third platform with its own queue.
  await passes('cs-114', (d) => {
    box(d, 'qf', 'queue', 'fast-availability')
    box(d, 'sf', 'system-api', 'sys-fast-playout-api')
    box(d, 'fast', 'saas', 'FAST channel playout')
    draw(d, 'tp ~> qf', 'qf ~> sf', 'sf -> fast')
  })
  // Kafka instead of a topic.
  await passes('cs-114', (d) => {
    d.nodes.find((n) => n.id === 'tp').type = 'event-stream'
  })
  // The audit store fed by the Process API.
  await passes('cs-114', (d) => {
    cut(d, 'tp ~> audit')
    draw(d, 'p ~> audit')
  })

  // CS-115
  // A custom flow per forwarder instead of Partner Manager.
  await failsOn('cs-115', 'AS2 forwarders send into Partner Manager', (d) => {
    cut(d, 'as2 -> pm')
    draw(d, 'as2 -> pb')
  })
  await failsOn('cs-115', 'never call a System API directly', (d) => draw(d, 'pm -> sb'))
  // A separate queue per channel.
  await failsOn('cs-115', 'one canonical booking queue', (d) => {
    box(d, 'bq2', 'queue', 'api-bookings')
    cut(d, 'eapi ~> bq')
    draw(d, 'eapi ~> bq2', 'bq2 ~> pb')
  })
  await failsOn('cs-115', 'only through the gateway', (d) => draw(d, 'api -> eapi'))
  await failsOn('cs-115', 'mainframe booking system is reached only through its System API', (d) => draw(d, 'pb -> mf'))
  await failsOn('cs-115', 'shared code lists', (d) => unbox(d, 'xref'))
  await failsOn('cs-115', 'published once', (d) => swap(d, 'sb ~> st'))
  // Status messages sent straight to forwarders, outside Partner Manager.
  await failsOn('cs-115', 'Only Partner Manager sends', (d) => {
    unbox(d, 'pmo')
    draw(d, 'ps -> as2')
  })
  // Status events are published but nothing sends them on.
  await failsOn('cs-115', 'Status events from the topic reach', (d) => cut(d, 'st ~> sq'))
  // The booking API waits on the mainframe.
  await failsOn('cs-115', 'never waits on the mainframe', (d) => draw(d, 'eapi -> pb'))
  await failsOn('cs-115', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // Kafka for status events.
  await passes('cs-115', (d) => {
    d.nodes.find((n) => n.id === 'st').type = 'event-stream'
  })
  // One Partner Manager box for both directions.
  await passes('cs-115', (d) => {
    unbox(d, 'pmo')
    draw(d, 'ps -> pm', 'pm -> as2')
  })
  // Code lists in a reference database.
  await passes('cs-115', (d) => {
    d.nodes.find((n) => n.id === 'xref').type = 'database'
  })

  // CS-116
  // The portal is pointed at the new Mule URL.
  await failsOn('cs-116', 'passes the routing facade', (d) => draw(d, 'web -> mexp'))
  // The migrated Process API reuses a BusinessWorks service.
  await failsOn('cs-116', 'never call BusinessWorks', (d) => draw(d, 'prc -> bw'))
  await failsOn('cs-116', 'never touch the billing database directly', (d) => draw(d, 'prc -> bill'))
  // The new consumer reads EMS directly.
  await failsOn('cs-116', 'EMS events reach Anypoint MQ through a bridge', (d) => {
    unbox(d, 'bridge')
    unbox(d, 'amq')
    draw(d, 'ems ~> cons')
  })
  // Big bang: BusinessWorks is gone on day one.
  await failsOn('cs-116', 'still routes services not yet migrated', (d) => unbox(d, 'bw'))
  await failsOn('cs-116', 'async messages', (d) => swap(d, 'bridge ~> amq'))
  // The consumer calls Salesforce on its own.
  await failsOn('cs-116', 'One Salesforce System API is shared', (d) => {
    cut(d, 'cons -> scrm')
    draw(d, 'cons -> crm')
  })
  await failsOn('cs-116', 'reaches billing through a System API', (d) => {
    cut(d, 'prc -> sbill')
    draw(d, 'prc -> bill')
  })
  await failsOn('cs-116', 'each call the routing facade', (d) => {
    cut(d, 'agent -> lb')
    draw(d, 'agent -> bw')
  })
  // An API gateway behind the facade.
  await passes('cs-116', (d) => {
    box(d, 'gw', 'api-gateway', 'API Manager policies')
    cut(d, 'lb -> mexp')
    draw(d, 'lb -> gw', 'gw -> mexp')
  })
  // The bridge publishes to an Anypoint MQ exchange.
  await passes('cs-116', (d) => {
    d.nodes.find((n) => n.id === 'amq').type = 'topic'
    rename(d, 'amq', 'Anypoint MQ order-events exchange')
  })
  // A second migrated Experience API.
  await passes('cs-116', (d) => {
    box(d, 'mexp2', 'experience-api', 'exp-orders-api (migrated)')
    draw(d, 'lb -> mexp2', 'mexp2 -> prc')
  })

  // CS-118
  // The app calls Zuora directly for new sign-ups.
  await failsOn('cs-118', 'Channels never choose the billing platform', (d) => draw(d, 'app -> sz'))
  // The vendor's big bang: legacy billing is gone on day one.
  await failsOn('cs-118', 'not yet migrated stay on legacy billing', (d) => unbox(d, 'sl'))
  // Mule takes card details and charges the payment provider.
  await failsOn('cs-118', 'Card data never passes through Mule', (d) => draw(d, 'prc -> pay'))
  // Legacy keeps writing entitlements its own way, so it never publishes.
  await failsOn('cs-118', 'Both billing System APIs publish', (d) => cut(d, 'sl ~> tp'))
  await failsOn('cs-118', 'never updates entitlements with a synchronous call', (d) => draw(d, 'prc -> sent'))
  await failsOn('cs-118', 'migration cohort', (d) => unbox(d, 'map'))
  await failsOn('cs-118', 'Migration and reconciliation batches', (d) => cut(d, 'rec -> sl'))
  await failsOn('cs-118', 'reached only through System APIs', (d) => {
    cut(d, 'mig -> sz')
    draw(d, 'mig -> z')
  })
  await failsOn('cs-118', 'App store subscriptions', (d) => cut(d, 'es ~> tp'))
  await failsOn('cs-118', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // Kafka instead of a topic.
  await passes('cs-118', (d) => {
    d.nodes.find((n) => n.id === 'tp').type = 'event-stream'
  })
  // The cohort map kept in a database table.
  await passes('cs-118', (d) => {
    d.nodes.find((n) => n.id === 'map').type = 'database'
    rename(d, 'map', 'Cohort map table')
  })
  // Customer care gets its own queue from the same topic.
  await passes('cs-118', (d) => {
    box(d, 'qc', 'queue', 'care-updates')
    box(d, 'sc', 'system-api', 'sys-care-crm-api')
    box(d, 'crm', 'crm', 'Customer care CRM')
    draw(d, 'tp ~> qc', 'qc ~> sc', 'sc -> crm')
  })
}
