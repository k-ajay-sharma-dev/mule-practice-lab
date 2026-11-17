// Wrong and other correct diagrams for batch Q (ar-150 to ar-154). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, swap, draw, box, unbox, rename, set }) => {
  // AR-150
  // The shop calls the provider through its own System API, not the shared service.
  await failsOn('ar-150', 'No app waits on the provider', (d) => draw(d, 'web -> sys'))
  // The HR portal keeps its own way to the provider.
  await failsOn('ar-150', 'The HR portal calls the same notifications Process API', (d) => {
    cut(d, 'hr -> prc')
    box(d, 'hrSnd', 'process-api', 'prc-hr-messages')
    draw(d, 'hr -> hrSnd', 'hrSnd -> sys')
  })
  // No DLQ.
  await failsOn('ar-150', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // The sender calls the provider directly.
  await failsOn('ar-150', 'only through a System API', (d) => draw(d, 'snd -> prov'))
  // No redelivery limit: refused messages are tried for ever and never reach the DLQ.
  await failsOn('ar-150', 'Run: Some addresses are wrong', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The shared Process API on the smallest size cannot take 70 messages a second.
  await failsOn('ar-150', 'Run: A sale starts', (d) => set(d, 'prc', { vCores: undefined }))
  // A third app joins, and other names.
  await passes('ar-150', (d) => {
    box(d, 'mob', 'mobile-app', 'Delivery driver app')
    draw(d, 'mob -> prc')
    rename(d, 'q', 'outbound-messages')
  })

  // AR-151
  // The extract job loads the warehouse directly.
  await failsOn('ar-151', 'never writes to the warehouse itself', (d) => draw(d, 'ext -> dw'))
  // Analysts read the raw files.
  await failsOn('ar-151', 'never reach the raw landing zone', (d) => draw(d, 'bi -> raw'))
  // No curation job.
  await failsOn('ar-151', 'A curation job reads the raw zone', (d) => unbox(d, 'cur'))
  // The extract job on the smallest size cannot pull 200 records a second.
  await failsOn('ar-151', 'Run: The nightly load', (d) => set(d, 'ext', { vCores: undefined }))
  // One job that extracts and curates: the warehouse outage stops the extract too.
  await failsOn('ar-151', 'The extract job never writes to the warehouse itself', (d) => {
    unbox(d, 'cur')
    draw(d, 'ext -> dw')
  })
  // A CRM extract job beside the ERP one, and a monitoring box.
  await passes('ar-151', (d) => {
    box(d, 'crm', 'crm', 'CRM')
    box(d, 'ext2', 'batch-job', 'CRM extract job', { vCores: '0.2' })
    draw(d, 'ext2 -> crm', 'ext2 -> raw')
    box(d, 'mon', 'monitoring', 'Load job alerts')
    draw(d, 'cur -> mon')
  })

  // AR-152
  // No cache: every visitor reaches the incident tool.
  await failsOn('ar-152', 'reads a cache', (d) => unbox(d, 'c'))
  // The same, seen in a run.
  await failsOn('ar-152', 'Run: A national outage', (d) => unbox(d, 'c'))
  // The app calls the Experience API around the gateway.
  await failsOn('ar-152', 'reached only through the gateway', (d) => draw(d, 'app -> exp'))
  // The status page reads the incident tool itself.
  await failsOn('ar-152', 'No public channel calls the incident tool directly', (d) => draw(d, 'web -> tool'))
  // Sized for the evening, not the spike.
  await failsOn('ar-152', 'Run: A national outage', (d) => set(d, 'exp', { replicas: undefined, vCores: undefined }))
  // A cache with no time to live keeps nothing.
  await failsOn('ar-152', 'Run: The incident tool stops answering', (d) => set(d, 'c', { ttlSec: 0 }))
  // Eight replicas of one vCore, a 60 second time to live, and a rate limit per client at the gateway.
  await passes('ar-152', (d) => {
    set(d, 'exp', { replicas: 8, vCores: '1' })
    set(d, 'c', { ttlSec: 60 })
    rename(d, 'gw', 'Public API gateway')
  })

  // AR-153
  // The gateway asks the identity provider about every token: an outage stops signed-in customers.
  await failsOn('ar-153', 'Run: The identity provider is down for 15 minutes', (d) => set(d, 'gw', { auth: 'oauth2' }))
  // The same setting floods the identity provider on a Friday.
  await failsOn('ar-153', 'Run: Friday dinner time', (d) => set(d, 'gw', { auth: 'oauth2' }))
  // No token check at all.
  await failsOn('ar-153', 'Run: Calls with no token', (d) => set(d, 'gw', { auth: undefined }))
  // The app calls the Experience API around the gateway.
  await failsOn('ar-153', 'reached only through the gateway', (d) => draw(d, 'app -> exp'))
  // API calls routed through the identity provider.
  await failsOn('ar-153', 'do not go through the identity provider', (d) => draw(d, 'idp -> exp'))
  // The Experience API on the smallest size.
  await failsOn('ar-153', 'Run: Friday dinner time', (d) => set(d, 'exp', { replicas: undefined, vCores: undefined }))
  // The gateway fetches signing keys from the identity provider, and other names.
  await passes('ar-153', (d) => {
    draw(d, 'gw -> idp')
    rename(d, 'gw', 'Flex Gateway (JWT validation)')
  })
  // Four replicas of one vCore each.
  await passes('ar-153', (d) => {
    set(d, 'exp', { replicas: 4, vCores: '1' })
    set(d, 'sys', { replicas: 4, vCores: '1' })
  })

  // AR-154
  // Every call one after another.
  await failsOn('ar-154', 'Run: A normal afternoon', (d) => {
    for (const id of ['exp', 'core', 'ext']) set(d, id, { calls: undefined })
  })
  // The extras API fails when reviews fail.
  await failsOn('ar-154', 'Run: Reviews slow to 3 seconds', (d) => set(d, 'ext', { onFailure: undefined }))
  // No circuit breaker: every page waits the full timeout while reviews hang.
  await failsOn('ar-154', 'Run: Reviews stop answering', (d) => set(d, 'ext', { circuitBreaker: undefined }))
  // A partial answer on the core too: pages with no price are shown.
  await failsOn('ar-154', 'Run: The ERP is down', (d) => set(d, 'core', { onFailure: 'partial answer' }))
  // The core calls the reviews System API.
  await failsOn('ar-154', 'The core never waits on reviews', (d) => draw(d, 'core -> sRev'))
  // One Process API for everything.
  await failsOn('ar-154', 'The core never waits on reviews', (d) => {
    unbox(d, 'ext')
    draw(d, 'core -> sStk', 'core -> sRev')
  })
  // The extras API reads the warehouse system directly.
  await failsOn('ar-154', 'only through a System API', (d) => draw(d, 'ext -> wms'))
  // A cache for the catalogue, and a 200 ms timeout on the extras.
  await passes('ar-154', (d) => {
    box(d, 'cc', 'cache', 'Catalogue cache')
    draw(d, 'sCat -> cc')
    set(d, 'ext', { timeoutMs: 200 })
  })
}
