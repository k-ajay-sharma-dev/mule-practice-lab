// Wrong and other correct diagrams for batch S (ar-160 to ar-169). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, swap, draw, box, unbox, rename, set }) => {
  // AR-160
  // The shop calls the order intake API and waits: the ERP window fails the checkout.
  await failsOn('ar-160', 'The shop never waits on the ERP', (d) => draw(d, 'shop -> prc'))
  // No redrive limit: an order the ERP refuses is read again for ever.
  await failsOn('ar-160', 'Run: An order the ERP refuses', (d) => set(d, 'sqs', { maxRedelivery: undefined }))
  // The consumer on the smallest size: the backlog after a patch window takes hours to clear.
  await failsOn('ar-160', 'Run: The ERP is down for 30 minutes', (d) => set(d, 'prc', { vCores: undefined }))
  // No DLQ.
  await failsOn('ar-160', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // The consumer calls the ERP directly.
  await failsOn('ar-160', 'only through a System API', (d) => draw(d, 'prc -> erp'))
  // A limit of 45 receives, and other names.
  await passes('ar-160', (d) => {
    set(d, 'sqs', { maxRedelivery: 45 })
    rename(d, 'sqs', 'garden-orders queue on SQS')
    rename(d, 'prc', 'prc-erp-order-loader')
  })

  // AR-161
  // No cache: every lookup is paid for.
  await failsOn('ar-161', 'Run: A Saturday afternoon', (d) => unbox(d, 'c'))
  // A five minute cache keeps too little.
  await failsOn('ar-161', 'Run: A Saturday afternoon', (d) => set(d, 'c', { ttlSec: 300 }))
  // The call centre keeps its own route to the service.
  await failsOn('ar-161', 'only through the System API', (d) => draw(d, 'expC -> pc'))
  // Each channel with its own System API.
  await failsOn('ar-161', 'share one System API', (d) => {
    cut(d, 'expC -> sys')
    box(d, 'sys2', 'system-api', 'sys-address-call-centre', { vCores: '0.2' })
    draw(d, 'expC -> sys2', 'sys2 -> pc')
  })
  // A week-long cache and a bigger System API.
  await passes('ar-161', (d) => {
    set(d, 'c', { ttlSec: 604800 })
    set(d, 'sys', { replicas: 2 })
  })

  // AR-162
  // Spread mode: half of every day's texts go to the dearer provider.
  await failsOn('ar-162', 'Run: A normal day', (d) => set(d, 'lb', { mode: 'spread' }))
  // Only the main provider behind the load balancer: its outage stops every text.
  await failsOn('ar-162', 'Run: The main provider is down for 20 minutes', (d) => cut(d, 'lb -> sysB'))
  // The Process API calls the main provider's System API directly.
  await failsOn('ar-162', 'around the load balancer', (d) => draw(d, 'prc -> sysA'))
  // The backup reached straight from the load balancer, with no System API.
  await failsOn('ar-162', 'The backup provider is reached through a System API', (d) => draw(d, 'lb -> smsB'))
  // Two replicas of each System API, and other names.
  await passes('ar-162', (d) => {
    set(d, 'sysA', { replicas: 2 })
    set(d, 'sysB', { replicas: 2 })
    rename(d, 'lb', 'SMS provider failover')
  })

  // AR-163
  // No partial answer: a carrier outage fails the whole screen.
  await failsOn('ar-163', 'Run: The carrier hangs', (d) => set(d, 'prc', { onFailure: undefined }))
  // The default ten second timeout and no breaker: answers are far too slow during a hang.
  await failsOn('ar-163', 'Run: The carrier hangs', (d) => set(d, 'prc', { timeoutMs: undefined, circuitBreaker: undefined }))
  // The Process API calls the carrier itself.
  await failsOn('ar-163', 'only through a System API', (d) => draw(d, 'prc -> car'))
  // The APIs on the smallest size cannot take 60 screens a second.
  await failsOn('ar-163', 'Run: A normal evening', (d) => {
    for (const id of ['exp', 'prc', 'sysO', 'sysT']) set(d, id, { vCores: undefined })
  })
  // A 1.2 second timeout without a breaker still fits, and two replicas of the Experience API.
  await passes('ar-163', (d) => {
    set(d, 'prc', { timeoutMs: 1200, circuitBreaker: undefined })
    set(d, 'exp', { replicas: 2 })
  })

  // AR-164
  // No rate limit: the kiosk loop swamps the shared layers and the website.
  await failsOn('ar-164', 'Run: A kiosk release goes wrong', (d) => set(d, 'expK', { rateLimit: undefined }))
  // The limit on the shared Process API: the website is refused as well.
  await failsOn('ar-164', 'Run: A kiosk release goes wrong', (d) => {
    set(d, 'expK', { rateLimit: undefined })
    set(d, 'prc', { rateLimit: 110 })
  })
  // The kiosks call the website's Experience API.
  await failsOn('ar-164', 'Each channel has its own Experience API', (d) => {
    unbox(d, 'expK')
    draw(d, 'kiosk -> expW')
  })
  // The kiosk API calls the System API around the shared Process API.
  await failsOn('ar-164', 'share one stock Process API', (d) => {
    cut(d, 'expK -> prc')
    draw(d, 'expK -> sys')
  })
  // A limit of 40 and other names.
  await passes('ar-164', (d) => {
    set(d, 'expK', { rateLimit: 40 })
    rename(d, 'prc', 'prc-stock-availability')
  })

  // AR-165
  // A topic with two poster apps: every invoice is posted twice.
  await failsOn('ar-165', 'Run: The month-end run', (d) => {
    unbox(d, 'q')
    box(d, 't', 'topic', 'invoices')
    box(d, 'prc2', 'process-api', 'prc-invoice-poster-2', { replicas: 2, vCores: '0.5' })
    draw(d, 'bill ~> t', 't ~> prc', 't ~> prc2', 'prc2 -> sys')
  })
  // A second poster app on the same queue under another name.
  await failsOn('ar-165', 'One invoice poster app reads the queue', (d) => {
    box(d, 'prc2', 'process-api', 'prc-invoice-poster-2', { replicas: 2, vCores: '0.5' })
    draw(d, 'q ~> prc2', 'prc2 -> sys')
  })
  // One small replica: the run takes far too long.
  await failsOn('ar-165', 'Run: The month-end run', (d) => set(d, 'prc', { replicas: undefined, vCores: undefined }))
  // One big replica: fast enough, but a zone outage stops the run.
  await failsOn('ar-165', 'Run: An availability zone goes down', (d) => {
    set(d, 'prc', { replicas: 1, vCores: '1' })
    set(d, 'sys', { replicas: 1, vCores: '1' })
  })
  // Three replicas of the poster.
  await passes('ar-165', (d) => set(d, 'prc', { replicas: 3 }))

  // AR-166
  // The shop calls version 2 directly, around the gateway.
  await failsOn('ar-166', 'reached only through the gateway', (d) => draw(d, 'web -> p2'))
  // Only version 1 behind the gateway.
  await failsOn('ar-166', 'a line to both pricing versions', (d) => cut(d, 'gw -> p2'))
  // Version 1 on one replica: a zone outage stops pricing.
  await failsOn('ar-166', 'Run: An availability zone goes down', (d) => set(d, 'p1', { replicas: 1 }))
  // Version 2 sized like version 1 for a 5% share, and a big System API: over the budget.
  await failsOn('ar-166', 'Run: The first canary day', (d) => {
    set(d, 'p2', { replicas: 2, vCores: '0.2' })
    set(d, 'sys', { vCores: '0.5' })
  })
  // Version 2 given its own copy of the System API.
  await passes('ar-166', (d) => {
    cut(d, 'p2 -> sys')
    box(d, 'sys2', 'system-api', 'sys-products-v2')
    draw(d, 'p2 -> sys2', 'sys2 -> db')
  })

  // AR-167
  // One shared System API, as before.
  await failsOn('ar-167', 'No System API serves both', (d) => {
    unbox(d, 'sysR')
    draw(d, 'expF -> sysS', 'sysS -> erpR')
  })
  // The same, seen in a run.
  await failsOn('ar-167', 'Run: The report service slows to 20 seconds', (d) => {
    unbox(d, 'sysR')
    draw(d, 'expF -> sysS', 'sysS -> erpR')
    set(d, 'sysS', { vCores: '1' })
  })
  // The report APIs at half a vCore: too few threads for month end.
  await failsOn('ar-167', 'Run: A Monday morning', (d) => {
    set(d, 'expF', { vCores: '0.5' })
    set(d, 'sysR', { vCores: '0.5' })
  })
  // The staff app calls the report service's System API.
  await failsOn('ar-167', 'Stock lookups never pass through', (d) => draw(d, 'expS -> sysR'))
  // Two replicas of the report APIs at half a vCore, and a 12 second timeout.
  await passes('ar-167', (d) => {
    set(d, 'expF', { replicas: 2, vCores: '0.5' })
    set(d, 'sysR', { replicas: 2, vCores: '0.5', timeoutMs: 12000 })
  })

  // AR-168
  // The booking path in one region: a region outage stops bookings.
  await failsOn('ar-168', 'Run: A cloud region goes down', (d) => {
    for (const id of ['expB', 'prc', 'sysB']) set(d, id, { regions: undefined })
  })
  // Two regions at 0.2 vCore: one region alone cannot take the peak.
  await failsOn('ar-168', 'Run: A cloud region goes down', (d) => {
    for (const id of ['expB', 'prc', 'sysB']) set(d, id, { vCores: '0.2' })
  })
  // Everything in two regions: over the budget.
  await failsOn('ar-168', 'Run: Summer peak', (d) => {
    for (const id of ['expO', 'sysW']) set(d, id, { regions: '2' })
  })
  // The back office reads bookings through the booking Process API.
  await failsOn('ar-168', 'never shares a box with the booking path', (d) => draw(d, 'expO -> prc'))
  // Other names, and the back office API on the smallest size it can take.
  await passes('ar-168', (d) => {
    rename(d, 'expB', 'exp-ferry-bookings')
    set(d, 'sysW', { vCores: '0.2', replicas: 1 })
  })

  // AR-169
  // No queue: submissions fail during the failover.
  await failsOn('ar-169', 'Run: The database fails over', (d) => {
    unbox(d, 'q')
    unbox(d, 'dlq')
    draw(d, 'expS -> prc')
  })
  // No cache: the public reads swamp the database.
  await failsOn('ar-169', 'Run: Results night', (d) => unbox(d, 'c'))
  // No mutual TLS at the gateway.
  await failsOn('ar-169', 'Run: A submission without a certificate', (d) => set(d, 'gw', { auth: undefined }))
  // A redelivery limit of 5: good results go to the DLQ during the failover.
  await failsOn('ar-169', 'Run: The database fails over', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // The public API on one replica: a zone outage takes the site down.
  await failsOn('ar-169', 'Run: An availability zone goes down', (d) => set(d, 'expP', { replicas: 1 }))
  // The public site posts to the submissions API.
  await failsOn('ar-169', 'never reaches the submissions path', (d) => draw(d, 'web -> expS'))
  // Three replicas for the public API, and a 60 second cache.
  await passes('ar-169', (d) => {
    set(d, 'expP', { replicas: 3 })
    set(d, 'c', { ttlSec: 60 })
  })
}
