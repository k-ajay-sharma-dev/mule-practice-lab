// Run cases for the use cases uc-001 to uc-013.
// See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, cut, draw, set }) => {
  // UC-001
  // The default 10 second timeout gives up on bulk calls that take 12 seconds.
  await failsOn('uc-001', 'Run: A normal night', (d) => set(d, 'job', { timeoutMs: undefined }))
  // No retries: every chunk the platform fails is missing until the next night.
  await failsOn('uc-001', 'Run: The platform fails some calls', (d) => set(d, 'job', { retries: undefined }))

  // UC-002
  // A short redelivery limit sends good events to the DLQ while the order DB is down.
  await failsOn('uc-002', 'Run: The order DB is down for 20 minutes', (d) => set(d, 'q', { maxRedelivery: 3 }))
  // No redelivery limit: bad events are retried for ever and never reach the DLQ.
  await failsOn('uc-002', 'Run: Some events cannot be processed', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // UC-003
  // No brokers: the WMS calls the inventory API, which calls Shopify at the speed changes arrive.
  await failsOn('uc-003', 'Run: Morning picking peak', (d) => {
    cut(d, 'wms ~> wq')
    draw(d, 'wms -> cap')
    cut(d, 'cap ~> ex')
    draw(d, 'cap -> ss')
  })
  // The kiosk API left at 0.1 vCore cannot carry 200 lookups a second.
  await failsOn('uc-003', 'Run: Saturday kiosk lookups', (d) => set(d, 'ek', { vCores: undefined }))

  // UC-004
  // The three backends called one after another: the times add up.
  await failsOn('uc-004', 'Run: Peak lookups', (d) => set(d, 'p', { calls: undefined }))
  // No partial answer: a Zendesk outage fails the whole screen.
  await failsOn('uc-004', 'Run: Zendesk is down', (d) => set(d, 'p', { onFailure: undefined }))

  // UC-005
  // The AS2 API calls validation directly: at the peak SAP refuses what is over its 10 a second.
  await failsOn('uc-005', 'Run: Month-end EDI peak', (d) => {
    cut(d, 'sedi ~> inq')
    draw(d, 'sedi -> pval')
  })
  // The poller keeps the default 10 second timeout and gives up on every scanned PDF.
  await failsOn('uc-005', 'Run: Scanned PDFs at month end', (d) => set(d, 'job', { timeoutMs: undefined }))

  // UC-006
  // Orders posted to SAP inside the SFCC call: at the peak SAP refuses what is over its 15 a second.
  await failsOn('uc-006', 'Run: Black Friday peak', (d) => {
    cut(d, 'eord ~> oq')
    draw(d, 'eord -> orch')
  })
  // One replica of the intake API: when its zone goes down, orders are refused.
  await failsOn('uc-006', 'Run: A zone goes down on Black Friday', (d) => set(d, 'eord', { replicas: undefined }))

  // UC-007
  // A rate limit far below the LMS allowance: a normal add/drop night gets 429s.
  await failsOn('uc-007', 'Run: A night in add/drop', (d) => set(d, 'slms', { rateLimit: 3 }))
  // No rate limit on the LMS System API: the LMS gets all 25 calls a second.
  await failsOn('uc-007', 'Run: Too many threads in the job', (d) => set(d, 'slms', { rateLimit: undefined }))

  // UC-008
  // The Workday System API keeps the default 10 second timeout and gives up on every report page.
  await failsOn('uc-008', 'Run: The Workday report is slow', (d) => set(d, 'swd', { timeoutMs: undefined }))
  // No retries on the time-tracking System API: 1 page of hours in 5 is missing.
  await failsOn('uc-008', 'Run: The time system drops some calls', (d) => set(d, 'stime', { retries: undefined }))

  // UC-009
  // A 1 second timeout on the job, shorter than a 2 second page read from the POS database.
  await failsOn('uc-009', 'Run: A normal night', (d) => set(d, 'job', { timeoutMs: 1000 }))
  // The job fails a page when the menu API fails, so no sales reach S3.
  await failsOn('uc-009', 'Run: The menu API is down', (d) => set(d, 'job', { onFailure: undefined }))

  // UC-010
  // No client ID policy on the gateway: anyone can get quotes.
  await failsOn('uc-010', 'Run: A caller without a client ID', (d) => set(d, 'gw', { auth: undefined }))
  // No rate limit on the gateway: the flood reaches the rating engine.
  await failsOn('uc-010', 'Run: One site floods the API', (d) => set(d, 'gw', { rateLimit: undefined }))

  // UC-011
  // The poller calls the consent API directly: while Salesforce is down the unsubscribes fail.
  await failsOn('uc-011', 'Run: Salesforce is down for 30 minutes', (d) => {
    cut(d, 'poll ~> q')
    draw(d, 'poll -> p')
  })
  // No retries on the SFMC System API: 1 poll in 5 fails.
  await failsOn('uc-011', 'Run: The SFMC API drops some calls', (d) => set(d, 'ssfmc', { retries: undefined }))

  // UC-012
  // No circuit breaker and the default 10 second timeout: hung DHL calls use up the threads.
  await failsOn('uc-012', 'Run: DHL stops answering at the peak', (d) => set(d, 'p', { timeoutMs: undefined, circuitBreaker: undefined }))
  // The tracking update is called inside the label request: an e-commerce outage stops packing.
  await failsOn('uc-012', 'Run: The e-commerce platform is down', (d) => {
    cut(d, 'p ~> q')
    draw(d, 'p -> trk')
  })

  // UC-013
  // A short redelivery limit sends good updates to the DLQ while ServiceNow is down.
  await failsOn('uc-013', 'Run: ServiceNow is down for 20 minutes', (d) => set(d, 'q', { maxRedelivery: 3 }))
  // No redelivery limit: rejected updates are retried for ever and never reach a person.
  await failsOn('uc-013', 'Run: Updates ServiceNow always rejects', (d) => set(d, 'q', { maxRedelivery: undefined }))
}
