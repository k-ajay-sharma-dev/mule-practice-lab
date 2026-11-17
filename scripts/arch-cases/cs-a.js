// Run cases for the case studies cs-002 to cs-037 that have a diagram.
// See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, cut, draw, set }) => {
  // CS-002
  // One replica of the catalogue API carries 500 reads a second, not 2,000.
  await failsOn('cs-002', 'Run: Black Friday browsing', (d) => set(d, 'pexp', { replicas: undefined }))
  // Orders posted to the consumer directly: at the peak the ERP gets 200 a second.
  await failsOn('cs-002', 'Run: Black Friday order peak', (d) => {
    cut(d, 'oprc ~> q')
    draw(d, 'oprc -> worker')
  })

  // CS-003
  // A short redelivery limit sends good claims to the DLQ while the claims system is offline.
  await failsOn('cs-003', 'Run: The claims system is offline for its batch', (d) => set(d, 'q', { maxRedelivery: 3 }))
  // No redelivery limit: rejected claims are retried for ever and never reach the DLQ.
  await failsOn('cs-003', 'Run: Some claims are always rejected', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // CS-004
  // A redelivery limit of 10 sends plant orders to the DLQ during a 3 hour WAN outage.
  await failsOn('cs-004', 'Run: The WAN to plant A is down for 3 hours', (d) => set(d, 'qa', { maxRedelivery: 10 }))
  // No redelivery limit: rejected confirmations are retried for ever and pile up.
  await failsOn('cs-004', 'Run: Some confirmations are always rejected', (d) => set(d, 'ca', { maxRedelivery: undefined }))

  // CS-005
  // No token policy on the gateway: anyone can read lab results.
  await failsOn('cs-005', 'Run: A caller without a token', (d) => set(d, 'gw', { auth: undefined }))
  // A redelivery limit of 5 sends results to the DLQ while the EHR is down.
  await failsOn('cs-005', 'Run: The EHR is down for 30 minutes', (d) => set(d, 'q', { maxRedelivery: 5 }))

  // CS-006
  // No mTLS policy on the gateway: a client without a certificate gets in.
  await failsOn('cs-006', 'Run: A caller without a TPP certificate', (d) => set(d, 'gw', { auth: undefined }))
  // No rate limit on the gateway: the burst reaches the mainframe.
  await failsOn('cs-006', 'Run: A TPP floods the accounts API', (d) => set(d, 'gw', { rateLimit: undefined }))

  // CS-007
  // A redelivery limit of 10 sends library changes to the DLQ during an hour-long outage.
  await failsOn('cs-007', 'Run: The library system is down for an hour', (d) => set(d, 'qlib', { maxRedelivery: 10 }))
  // No redelivery limit on the LMS queue: rejected records are retried for ever and nobody is alerted.
  await failsOn('cs-007', 'Run: Some records are always rejected by the LMS', (d) => set(d, 'qlms', { maxRedelivery: undefined }))

  // CS-008
  // Checkout calls the routing flow directly: while vendor A is down the checkout fails.
  await failsOn('cs-008', 'Run: POS vendor A is down at dinner', (d) => {
    cut(d, 'eord ~> q')
    draw(d, 'eord -> route')
  })
  // No redelivery limit: rejected orders are retried for ever and never reach the DLQ.
  await failsOn('cs-008', 'Run: Some orders are always rejected', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // CS-009
  // No client ID policy on the gateway: anyone can read dealer stock.
  await failsOn('cs-009', 'Run: A caller without a client ID', (d) => set(d, 'gw', { auth: undefined }))
  // No rate limit on the gateway: the burst reaches the logistics system.
  await failsOn('cs-009', 'Run: One DMS floods the stock API', (d) => set(d, 'gw', { rateLimit: undefined }))

  // CS-011
  // The default 10 second timeout and no breaker: hung credit calls use up the threads.
  await failsOn('cs-011', 'Run: The credit bureau stops answering', (d) => set(d, 'sc', { timeoutMs: undefined, circuitBreaker: undefined }))
  // The orchestrator left at 0.1 vCore cannot take 150 orders a second.
  await failsOn('cs-011', 'Run: A partner sends a batch of orders', (d) => set(d, 'orc', { vCores: undefined }))

  // CS-012
  // The usage System API left at 0.1 vCore cannot take 300 reads a second.
  await failsOn('cs-012', 'Run: Evening portal peak', (d) => set(d, 'susage', { vCores: undefined }))
  // Alarms sent straight to the events API: the storm reaches the outage system at 150 a second.
  await failsOn('cs-012', 'Run: A storm of outage alarms', (d) => {
    cut(d, 'hes ~> alarms', 'alarms ~> pev')
    draw(d, 'hes -> pev')
  })

  // CS-013
  // No partial answer: a closed mainframe fails the whole dashboard.
  await failsOn('cs-013', 'Run: The mainframe is closed for the night', (d) => set(d, 'pcs', { onFailure: undefined }))
  // No JWT policy on the gateway: a script without a login reads citizen data.
  await failsOn('cs-013', 'Run: A caller without a token', (d) => set(d, 'gw', { auth: undefined }))

  // CS-014
  // Three replicas of 0.1 vCore carry 150 checks a second, not 1,200.
  await failsOn('cs-014', 'Run: Kick-off of a big match', (d) => set(d, 'sent', { vCores: undefined }))
  // One big replica: when its zone goes down, playback checks fail.
  await failsOn('cs-014', 'Run: A zone goes down at kick-off', (d) => set(d, 'sent', { replicas: 1, vCores: '4' }))

  // CS-017
  // No rate limit on the gateway: the seller's burst reaches the order system.
  await failsOn('cs-017', 'Run: A large seller floods the API', (d) => set(d, 'gw', { rateLimit: undefined }))
  // Uploads sent straight to the loader: the catalogue system gets 50 items a second.
  await failsOn('cs-017', 'Run: A big catalogue upload', (d) => {
    cut(d, 'pcat ~> qup')
    draw(d, 'pcat -> job')
  })

  // CS-018
  // Work items sent straight to the worker: the storm reaches the rebooking engine at 100 a second.
  await failsOn('cs-018', 'Run: A storm cancels 200 flights', (d) => {
    cut(d, 'dis ~> qhi', 'dis ~> qn')
    draw(d, 'dis -> wrk')
  })
  // No rate limit on the PSS System API: the PSS gets 100 writes a second.
  await failsOn('cs-018', 'Run: Passengers accept offers at once', (d) => set(d, 'spss', { rateLimit: undefined }))

  // CS-019
  // A short redelivery limit sends good documents to the exception queue while the repository is down.
  await failsOn('cs-019', 'Run: The repository is down for 30 minutes', (d) => set(d, 'q', { maxRedelivery: 3 }))
  // No redelivery limit: rejected documents are retried for ever and nobody sees them.
  await failsOn('cs-019', 'Run: Some documents are always rejected', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // CS-020
  // The default 10 second timeout and no breaker: every applicant waits for the slow bureau.
  await failsOn('cs-020', 'Run: A credit bureau takes 25 seconds', (d) => set(d, 'sbur', { timeoutMs: undefined, circuitBreaker: undefined }))
  // No OAuth policy on the gateway: an unknown site runs up pay-per-call vendor costs.
  await failsOn('cs-020', 'Run: A broker without credentials', (d) => set(d, 'gw', { auth: undefined }))

  // CS-021
  // No partial answer: one regional HR outage fails every worker lookup.
  await failsOn('cs-021', 'Run: An on-prem HR system is down', (d) => set(d, 'pw', { onFailure: undefined }))
  // A redelivery limit of 3 with no DLQ: leaver events are dropped while the IdP is down.
  await failsOn('cs-021', 'Run: Leavers while the IdP is down', (d) => set(d, 'qlv', { maxRedelivery: 3 }))

  // CS-026
  // A redelivery limit of 5 on the stream: reporting copies are parked while the service is down.
  await failsOn('cs-026', 'Run: The reporting service is down for an hour', (d) => set(d, 'ks', { maxRedelivery: 5 }))
  // The ingestion API left at 0.1 vCore cannot take 300 trades a second.
  await failsOn('cs-026', 'Run: Auction results arrive at once', (d) => set(d, 'ingest', { vCores: undefined }))

  // CS-027
  // The webhook API calls the donations API directly: while Salesforce is down the gifts fail.
  await failsOn('cs-027', 'Run: Salesforce is down during an appeal', (d) => {
    cut(d, 'sdp ~> q')
    draw(d, 'sdp -> prc')
  })
  // No redelivery limit: rejected gifts are retried for ever and never reach the DLQ.
  await failsOn('cs-027', 'Run: Some gifts are always rejected', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // CS-028
  // Three replicas of 1 vCore carry 1,500 requests a second, not 3,000.
  await failsOn('cs-028', 'Run: Rush hour', (d) => set(d, 'eapi', { vCores: '1' }))
  // Two replicas carry the peak, but one alone cannot when its partner's zone goes down.
  await failsOn('cs-028', 'Run: A zone goes down at rush hour', (d) => set(d, 'eapi', { replicas: 2 }))

  // CS-029
  // A short redelivery limit sends good approvals to the DLQ during the patch window.
  await failsOn('cs-029', 'Run: The ERP is down for its patch window', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // No redelivery limit: rejected approvals are retried for ever and nobody sees them.
  await failsOn('cs-029', 'Run: Some approvals are always rejected', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // CS-030
  // A redelivery limit of 5 sends partner A's articles to the DLQ during the outage.
  await failsOn('cs-030', "Run: Partner A's webhook is down for an hour", (d) => set(d, 'qa', { maxRedelivery: 5 }))
  // No rate limit on the gateway: the aggregator's burst reaches the feed store.
  await failsOn('cs-030', 'Run: An aggregator floods the feed API', (d) => set(d, 'gw', { rateLimit: undefined }))

  // CS-031
  // The PMS System API calls the member API directly: checkouts fail while loyalty is down.
  await failsOn('cs-031', 'Run: The loyalty platform is down for 30 minutes', (d) => {
    cut(d, 'spms ~> q')
    draw(d, 'spms -> mem')
  })
  // The member API left at 0.1 vCore cannot take 300 reads a second.
  await failsOn('cs-031', 'Run: Members open the app during a sale', (d) => set(d, 'mem', { vCores: undefined }))

  // CS-032
  // One replica of the live API carries 1,000 polls a second, not 1,500.
  await failsOn('cs-032', 'Run: Final match day polling', (d) => set(d, 'live', { replicas: undefined }))
  // The push consumer at 0.1 vCore has no room to catch up after the outage.
  await failsOn('cs-032', 'Run: A licensee webhook is down', (d) => set(d, 'push', { vCores: undefined }))

  // CS-033
  // One replica of the exam API carries 1,000 autosaves a second, not 2,000.
  await failsOn('cs-033', 'Run: Answer autosaves at the exam peak', (d) => set(d, 'eapi', { replicas: undefined }))
  // Submissions written to the LMS inside the request: the LMS gets 300 a second.
  await failsOn('cs-033', 'Run: Final submissions at the end of an exam', (d) => {
    cut(d, 'prc ~> q')
    draw(d, 'prc -> writer')
  })

  // CS-034
  // Carriers asked one after another: the times add up past 15 seconds.
  await failsOn('cs-034', 'Run: A normal quote request', (d) => set(d, 'prc', { calls: undefined }))
  // No partial answer: one slow carrier fails the whole quote.
  await failsOn('cs-034', 'Run: A carrier takes 40 seconds', (d) => set(d, 'prc', { onFailure: undefined }))

  // CS-035
  // The EDI API calls the shipments API directly: shipments fail while the broker application is down.
  await failsOn('cs-035', 'Run: The broker application is down for 30 minutes', (d) => {
    cut(d, 'sedi ~> q')
    draw(d, 'sedi -> ship')
  })
  // The customs gateway keeps the default 10 second timeout and gives up on every declaration.
  await failsOn('cs-035', 'Run: The customs gateway answers slowly', (d) => set(d, 'scg', { timeoutMs: undefined }))

  // CS-036
  // A redelivery limit of 10 with no DLQ: FMS A's forecasts are dropped during the outage.
  await failsOn('cs-036', 'Run: FMS A is down for 2 hours', (d) => set(d, 'qa', { maxRedelivery: 10 }))
  // No client ID policy on API Manager: anyone can read farm forecasts.
  await failsOn('cs-036', 'Run: A buyer without a client ID', (d) => set(d, 'gw', { auth: undefined }))

  // CS-037
  // The web orders API left at 0.1 vCore cannot take 100 orders a second.
  await failsOn('cs-037', 'Run: Orders at a sale peak', (d) => set(d, 'eweb', { vCores: undefined }))
  // Store agents call the inventory API directly: stock movements fail while the OMS is down.
  await failsOn('cs-037', 'Run: The OMS is down for 30 minutes', (d) => {
    cut(d, 'agent ~> sq')
    draw(d, 'agent -> inv')
  })
}
