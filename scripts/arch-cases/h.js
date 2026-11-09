// Wrong and other correct diagrams for batch H (banking, insurance and payments case studies).
// See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }) => {
  // CS-078
  // A comparison site skips the gateway and calls the Experience API straight.
  await failsOn('cs-078', 'passes the gateway', (d) => draw(d, 'cmp -> exp'))
  // A site is given direct access to the System API.
  await failsOn('cs-078', 'only through the Experience API', (d) => draw(d, 'cmp -> sys'))
  // The Experience API queries the core tables over JDBC.
  await failsOn('cs-078', 'reached only through a System API', (d) => draw(d, 'exp -> core'))
  // No cache: every partner call hits the core.
  await failsOn('cs-078', 'served from a cache', (d) => unbox(d, 'cache'))
  // Sites still get the CSV email and never call the gateway.
  await failsOn('cs-078', 'Comparison sites call the API gateway', (d) => cut(d, 'cmp -> gw'))
  await failsOn('cs-078', 'synchronous call', (d) => swap(d, 'exp -> sys'))
  await failsOn('cs-078', 'reads rates through a System API', (d) => flip(d, 'sys -> core'))
  // A thin Process API between the Experience and System APIs.
  await passes('cs-078', (d) => {
    box(d, 'prc', 'process-api', 'prc-savings-products-api')
    cut(d, 'exp -> sys')
    draw(d, 'exp -> prc', 'prc -> sys')
  })
  // A refresh job that loads the cache from the System API.
  await passes('cs-078', (d) => {
    box(d, 'job', 'batch-job', 'Rates cache refresh (every 5 min)')
    draw(d, 'job -> sys', 'job -> cache')
  })
  await passes('cs-078', (d) => rename(d, 'core', 'IBM i core (rates tables)'))

  // CS-079
  await failsOn('cs-079', 'never calls System APIs directly', (d) => draw(d, 'exp -> sscr'))
  await failsOn('cs-079', 'Core banking is reached only', (d) => draw(d, 'prc -> core'))
  await failsOn('cs-079', 'vendor is reached only', (d) => draw(d, 'prc -> idv'))
  // The webhook result is pushed straight into the Process API, so it is lost if the Process API is down.
  await failsOn('cs-079', 'through a queue to the Process API', (d) => {
    unbox(d, 'qres')
    draw(d, 'sidv ~> prc')
  })
  // Referrals are sent straight to the workbench and lost overnight.
  await failsOn('cs-079', 'manual review queue', (d) => {
    unbox(d, 'qrev')
    draw(d, 'prc ~> ops')
  })
  await failsOn('cs-079', 'async message', (d) => swap(d, 'qrev ~> ops'))
  // CRM is not updated: only three System APIs are orchestrated.
  await failsOn('cs-079', 'orchestrates identity, screening', (d) => cut(d, 'prc -> scrm'))
  await failsOn('cs-079', 'calls the onboarding Experience API', (d) => flip(d, 'mob -> exp'))
  // A DLQ behind the vendor results queue.
  await passes('cs-079', (d) => {
    box(d, 'dlq', 'dlq', 'kyc.vendor-results.dlq')
    draw(d, 'qres ~> dlq')
  })
  // The analyst workbench records decisions through its own Experience API.
  await passes('cs-079', (d) => {
    box(d, 'exa', 'experience-api', 'exp-kyc-workbench-api')
    draw(d, 'ops -> exa', 'exa -> prc')
  })
  await passes('cs-079', (d) => {
    rename(d, 'qrev', 'kyc.referral')
    rename(d, 'crm', 'Dynamics 365')
  })

  // CS-080
  // The Process API sends the SMS itself and waits for it.
  await failsOn('cs-080', 'never calls the notification service synchronously', (d) => draw(d, 'prc -> sntf'))
  await failsOn('cs-080', 'card processor is reached only', (d) => draw(d, 'prc -> proc'))
  await failsOn('cs-080', 'Case management is reached only', (d) => draw(d, 'prc -> case'))
  await failsOn('cs-080', 'never calls System APIs directly', (d) => draw(d, 'exp -> sproc'))
  // The chat assistant calls the Process API directly.
  await failsOn('cs-080', 'chat assistant both use an Experience API', (d) => {
    cut(d, 'bot -> exp')
    draw(d, 'bot -> prc')
  })
  // No topic: status changes are not published at all.
  await failsOn('cs-080', 'published to a topic', (d) => unbox(d, 'evt'))
  await failsOn('cs-080', 'fans out to at least two consumers', (d) => swap(d, 'evt ~> sntf'))
  // Provisional credit is posted straight into the ledger.
  await failsOn('cs-080', 'Provisional credit', (d) => {
    cut(d, 'sled -> core')
    draw(d, 'prc -> core')
  })
  // A queue per consumer behind the topic.
  await passes('cs-080', (d) => {
    box(d, 'qn', 'queue', 'notify.dispute-status')
    cut(d, 'evt ~> sntf')
    draw(d, 'evt ~> qn', 'qn ~> sntf')
  })
  // The processor sends webhooks later, so the poll job is retired.
  await passes('cs-080', (d) => {
    unbox(d, 'job')
    draw(d, 'proc ~> sproc', 'sproc ~> evt')
  })

  // CS-081
  // The policy change waits for the document pack.
  await failsOn('cs-081', 'never waits for document generation', (d) => draw(d, 'prc -> sdoc'))
  // Broker platforms call their Experience API without the gateway.
  await failsOn('cs-081', 'both enter through the API gateway', (d) => {
    cut(d, 'brk -> gw')
    draw(d, 'brk -> eb')
  })
  await failsOn('cs-081', 'identity provider', (d) => cut(d, 'gw -> idp'))
  // Each channel gets its own copy of the change logic.
  await failsOn('cs-081', 'share one policy change Process API', (d) => {
    box(d, 'prc2', 'process-api', 'prc-broker-b2b-change-api')
    cut(d, 'eb -> prc')
    draw(d, 'eb -> prc2', 'prc2 -> spa')
  })
  await failsOn('cs-081', 'policy admin system is reached only', (d) => draw(d, 'prc -> pas'))
  await failsOn('cs-081', 'rating engine is reached only', (d) => draw(d, 'prc -> rate'))
  await failsOn('cs-081', 'never call System APIs directly', (d) => draw(d, 'ep -> srate'))
  await failsOn('cs-081', 'async message', (d) => swap(d, 'q ~> pdoc'))
  // A second gateway for the B2B channel.
  await passes('cs-081', (d) => {
    box(d, 'gw2', 'api-gateway', 'B2B gateway (mTLS)')
    cut(d, 'brk -> gw', 'gw -> eb')
    draw(d, 'brk -> gw2', 'gw2 -> eb', 'gw2 -> idp')
  })
  // A policy-changed exchange instead of a request queue.
  await passes('cs-081', (d) => {
    d.nodes.find((n) => n.id === 'q').type = 'topic'
    rename(d, 'q', 'policy-changed (exchange)')
  })

  // CS-082
  await failsOn('cs-082', 'idempotency key store', (d) => unbox(d, 'os'))
  await failsOn('cs-082', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  await failsOn('cs-082', 'bank payment gateway is reached only', (d) => draw(d, 'prc -> bank'))
  // Payments are sent without screening.
  await failsOn('cs-082', 'screened against sanctions', (d) => unbox(d, 'ssan'))
  // ClaimCenter calls the payment Process API directly, so its 5 second wait covers the bank call.
  await failsOn('cs-082', 'handed over through a queue', (d) => {
    unbox(d, 'q')
    draw(d, 'scc -> prc')
  })
  await failsOn('cs-082', 'async message', (d) => swap(d, 'q ~> prc'))
  await failsOn('cs-082', 'ClaimCenter is called only by its System API', (d) => draw(d, 'prc -> cc'))
  await failsOn('cs-082', 'ClaimCenter learns the outcome', (d) => cut(d, 'prc -> scc'))
  await failsOn('cs-082', 'posted to the general ledger', (d) => cut(d, 'sgl -> erp'))
  // Azure Service Bus as the hand-over queue.
  await passes('cs-082', (d) => {
    d.nodes.find((n) => n.id === 'q').type = 'cloud-queue'
    rename(d, 'q', 'Azure Service Bus: claims-payment-approved')
  })
  // Status goes back to ClaimCenter through its own queue.
  await passes('cs-082', (d) => {
    box(d, 'qs', 'queue', 'claims.payment-status')
    cut(d, 'prc -> scc')
    draw(d, 'prc ~> qs', 'qs ~> scc')
  })

  // CS-084
  await failsOn('cs-084', 'archived unchanged', (d) => unbox(d, 'arch'))
  // The job queries PostgreSQL directly.
  await failsOn('cs-084', 'ledger database is reached only', (d) => draw(d, 'job -> led'))
  // Exceptions are created in the workbench inside the batch run.
  await failsOn('cs-084', 'through an exceptions queue', (d) => {
    unbox(d, 'q')
    draw(d, 'job -> sbl')
  })
  await failsOn('cs-084', 'workbench is reached only', (d) => draw(d, 'q ~> bl'))
  await failsOn('cs-084', 'async message', (d) => swap(d, 'job ~> q'))
  await failsOn('cs-084', 'finance data warehouse', (d) => unbox(d, 'dw'))
  await failsOn('cs-084', 'collects statement files', (d) => cut(d, 'job -> bank'))
  // The job matches without reading the ledger at all.
  await failsOn('cs-084', 'reads ledger entries through the System API', (d) => cut(d, 'job -> sled'))
  // The SFTP server drawn as the source the job reads from.
  await passes('cs-084', (d) => flip(d, 'job -> bank'))
  // Raw files kept in Azure Blob Storage.
  await passes('cs-084', (d) => {
    d.nodes.find((n) => n.id === 'arch').type = 'azure-blob'
    rename(d, 'arch', 'Statement archive (immutable blob)')
  })
  // A DLQ behind the exceptions queue.
  await passes('cs-084', (d) => {
    box(d, 'dlq', 'dlq', 'recon.exceptions.dlq')
    draw(d, 'q ~> dlq')
  })

  // CS-085
  // SWIFT payments are sent synchronously, so a slow gateway blocks intake.
  await failsOn('cs-085', 'SWIFT and Bacs payments are handed over through queues', (d) => {
    unbox(d, 'qsw')
    draw(d, 'hub -> sswift')
  })
  // Instant payments are parked on a queue.
  await failsOn('cs-085', 'Instant payments are sent by a synchronous call', (d) => {
    box(d, 'qi', 'queue', 'route.instant')
    cut(d, 'hub -> sinst')
    draw(d, 'hub ~> qi', 'qi ~> sinst')
  })
  await failsOn('cs-085', 'Screening engines are reached only', (d) => draw(d, 'hub -> san'))
  await failsOn('cs-085', 'never calls the hub directly', (d) => draw(d, 'olb -> hub'))
  // Fraud scoring is left out.
  await failsOn('cs-085', 'sanctions and fraud', (d) => unbox(d, 'sfr'))
  await failsOn('cs-085', 'Payment schemes are reached only', (d) => draw(d, 'hub -> swift'))
  await failsOn('cs-085', 'fan out', (d) => cut(d, 'st ~> snot'))
  await failsOn('cs-085', 'Core banking is reached only', (d) => draw(d, 'hub -> core'))
  // Corporate files go to their own engine, not the hub.
  await failsOn('cs-085', 'feed the same hub', (d) => cut(d, 'qin ~> hub'))
  // Dead-letter queues behind the route queues.
  await passes('cs-085', (d) => {
    box(d, 'dlq', 'dlq', 'route DLQ')
    draw(d, 'qsw ~> dlq', 'qbacs ~> dlq')
  })
  // A gateway in front of the online banking Experience API.
  await passes('cs-085', (d) => {
    box(d, 'gw', 'api-gateway', 'API gateway (OAuth)')
    cut(d, 'olb -> exp')
    draw(d, 'olb -> gw', 'gw -> exp')
  })
  // Bacs reached through the bureau SFTP.
  await passes('cs-085', (d) => {
    d.nodes.find((n) => n.id === 'bacs').type = 'sftp-server'
    rename(d, 'bacs', 'Bacstel-IP bureau SFTP')
  })

  // CS-086
  await failsOn('cs-086', 'never call a policy System API directly', (d) => draw(d, 'eb -> spc'))
  await failsOn('cs-086', 'migration register', (d) => unbox(d, 'reg'))
  // The router can only reach the mainframe.
  await failsOn('cs-086', 'reach both the mainframe and the SaaS', (d) => cut(d, 'route -> spc'))
  await failsOn('cs-086', 'mainframe is reached only', (d) => draw(d, 'route -> mf'))
  await failsOn('cs-086', 'SaaS policy platform is reached only', (d) => draw(d, 'mig -> pc'))
  // PolicyCenter feeds finance point to point instead of publishing events.
  await failsOn('cs-086', 'publish the same canonical policy events', (d) => {
    cut(d, 'spc ~> tp')
    draw(d, 'spc -> sfin')
  })
  await failsOn('cs-086', 'publish the same canonical policy events', (d) => swap(d, 'smf ~> tp'))
  // The contact centre calls the router directly.
  await failsOn('cs-086', 'all use Experience APIs', (d) => {
    cut(d, 'agent -> ex')
    draw(d, 'agent -> route')
  })
  await failsOn('cs-086', 'fed from the events', (d) => cut(d, 'tp ~> sri', 'tp ~> dw'))
  await failsOn('cs-086', 'moves books through the System APIs', (d) => cut(d, 'mig -> spc'))
  // The register kept in a cache.
  await passes('cs-086', (d) => {
    d.nodes.find((n) => n.id === 'reg').type = 'cache'
  })
  // Kafka as the policy event backbone.
  await passes('cs-086', (d) => {
    d.nodes.find((n) => n.id === 'tp').type = 'event-stream'
  })
  // Brokers use the same Experience API as customers.
  await passes('cs-086', (d) => {
    unbox(d, 'eb')
    draw(d, 'brk -> ex')
  })

  // CS-087
  await failsOn('cs-087', 'passes the gateway', (d) => draw(d, 'p -> exp'))
  await failsOn('cs-087', 'never calls System APIs directly', (d) => draw(d, 'exp -> sled'))
  await failsOn('cs-087', 'payment rails are reached only', (d) => draw(d, 'ppay -> rails'))
  // The payment API calls the partner webhook before answering.
  await failsOn('cs-087', 'No partner API call waits', (d) => draw(d, 'ppay -> hook'))
  // One dispatcher sends webhooks straight, so one slow partner blocks all.
  await failsOn('cs-087', 'wait on a queue', (d) => {
    unbox(d, 'pq')
    draw(d, 'wh ~> snd')
  })
  await failsOn('cs-087', 'dead-letter queue', (d) => cut(d, 'pq ~> dlq'))
  await failsOn('cs-087', 'authorisation server', (d) => cut(d, 'gw -> idp'))
  await failsOn('cs-087', 'published once as events', (d) => swap(d, 'sled ~> ev'))
  await failsOn('cs-087', 'core ledger is reached only', (d) => draw(d, 'pacc -> led'))
  // A second queue for the gold tier partners.
  await passes('cs-087', (d) => {
    box(d, 'pq2', 'queue', 'webhooks.tier-gold')
    draw(d, 'wh ~> pq2', 'pq2 ~> snd', 'pq2 ~> dlq')
  })
  // An Anypoint MQ exchange instead of Kafka.
  await passes('cs-087', (d) => {
    d.nodes.find((n) => n.id === 'ev').type = 'topic'
    rename(d, 'ev', 'ledger-events exchange')
  })

  // CS-089
  // The rules API calls the push System API directly.
  await failsOn('cs-089', 'never calls a provider synchronously', (d) => draw(d, 'rules -> spush'))
  // SMS has no queue of its own.
  await failsOn('cs-089', 'each have their own queue', (d) => {
    unbox(d, 'qsms')
    draw(d, 'rules ~> ssms')
  })
  await failsOn('cs-089', 'reached only through System APIs', (d) => draw(d, 'qpush ~> push'))
  await failsOn('cs-089', 'read from a cache', (d) => unbox(d, 'cache'))
  // The rules ask the core for the balance.
  await failsOn('cs-089', 'never calls the core banking system', (d) => {
    box(d, 'score', 'system-api', 'sys-core-balance-api')
    draw(d, 'rules -> score', 'score -> core')
  })
  await failsOn('cs-089', 'dead-letter queue', (d) => cut(d, 'qpush ~> dlq', 'qsms ~> dlq', 'qmail ~> dlq'))
  await failsOn('cs-089', 'published to the event stream', (d) => swap(d, 'cdc ~> ks'))
  await failsOn('cs-089', 'consumes the postings', (d) => cut(d, 'ks ~> rules'))
  // The app writes preferences into the database directly.
  await failsOn('cs-089', 'change preferences', (d) => {
    cut(d, 'exp -> pset')
    draw(d, 'exp -> prefdb')
  })
  // Postings published to a topic.
  await passes('cs-089', (d) => {
    d.nodes.find((n) => n.id === 'ks').type = 'topic'
  })
  // Only SMS has a DLQ, the others retry until they succeed.
  await passes('cs-089', (d) => cut(d, 'qpush ~> dlq', 'qmail ~> dlq'))
  await passes('cs-089', (d) => rename(d, 'rules', 'prc-alert-rules-engine'))

  // CS-090
  // Today's shortcut: the investment bank reads the retail core System API.
  await failsOn('cs-090', 'only through the retail bank gateway', (d) => draw(d, 'ibp -> rsys'))
  await failsOn('cs-090', 'never publishes to a retail queue', (d) => draw(d, 'ibp ~> rq'))
  // The liquidity report job reads retail payments.
  await failsOn('cs-090', 'never consumes from a retail queue', (d) => {
    box(d, 'ibjob', 'batch-job', 'Investment bank liquidity report')
    draw(d, 'rq ~> ibjob')
  })
  await failsOn('cs-090', 'no route into investment bank systems', (d) => draw(d, 'rprc -> ibsys'))
  // The gateway forwards to the Process API, exposing everything.
  await failsOn('cs-090', 'never forwards straight', (d) => {
    cut(d, 'gwr -> rexp')
    draw(d, 'gwr -> rprc')
  })
  await failsOn('cs-090', 'exposes only the group services', (d) => draw(d, 'ibp -> rexp'))
  await failsOn('cs-090', 'Retail core banking is reached only', (d) => draw(d, 'rprc -> rcore'))
  // The investment bank keeps its own screening connection.
  await failsOn('cs-090', 'one group System API', (d) => cut(d, 'ibp -> sscr'))
  await failsOn('cs-090', 'async message', (d) => swap(d, 'rq ~> rpay'))
  await failsOn('cs-090', 'through its own Experience API', (d) => {
    cut(d, 'rmob -> rexp2')
    draw(d, 'rmob -> rprc')
  })
  // A separate gateway in front of the retail app.
  await passes('cs-090', (d) => {
    box(d, 'gwm', 'api-gateway', 'Retail mobile gateway')
    cut(d, 'rmob -> rexp2')
    draw(d, 'rmob -> gwm', 'gwm -> rexp2')
  })
  // The investment bank desk gets its own Experience API.
  await passes('cs-090', (d) => {
    box(d, 'ibexp', 'experience-api', 'exp-investment-desk-api')
    cut(d, 'ibapp -> ibp')
    draw(d, 'ibapp -> ibexp', 'ibexp -> ibp')
  })
  // The liquidity report gets its data through the contracted API.
  await passes('cs-090', (d) => {
    box(d, 'ibjob', 'batch-job', 'Investment bank liquidity report')
    draw(d, 'ibjob -> gwr')
  })
}
