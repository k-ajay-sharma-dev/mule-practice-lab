// Run cases for the use cases uc-034 to uc-053.
// See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, cut, draw, set }) => {
  // UC-034
  // A short redelivery limit sends good leads to the DLQ while Salesforce is down.
  await failsOn('uc-034', 'Run: Salesforce is down for 30 minutes', (d) => set(d, 'q', { maxRedelivery: 3 }))
  // No redelivery limit: rejected leads are retried for ever and never reach the DLQ.
  await failsOn('uc-034', 'Run: Some leads cannot be processed', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // UC-035
  // A short redelivery limit sends good conversations to the DLQ while Salesforce is down.
  await failsOn('uc-035', 'Run: Salesforce is down for 20 minutes', (d) => set(d, 'q', { maxRedelivery: 3 }))
  // No redelivery limit: rejected transcripts are retried for ever and never reach the DLQ.
  await failsOn('uc-035', 'Run: Some transcripts cannot be stored', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // UC-036
  // The job keeps the default 10 second timeout and gives up on every 15 second bulk import.
  await failsOn('uc-036', 'Run: A 50,000-row file', (d) => set(d, 'job', { timeoutMs: undefined }))
  // The job calls the image processor directly and waits for the DAM.
  await failsOn('uc-036', 'Run: Images are slow to process', (d) => {
    cut(d, 'job ~> q')
    draw(d, 'job -> img')
  })

  // UC-037
  // No rate limit on the listening System API: the platform gets 3 calls a second.
  await failsOn('uc-037', 'Run: Launch-day catch-up', (d) => set(d, 'ssoc', { rateLimit: undefined }))
  // A short redelivery limit with no DLQ drops complaints while Zendesk is down.
  await failsOn('uc-037', 'Run: Zendesk is down for 30 minutes', (d) => set(d, 'qs', { maxRedelivery: 3 }))

  // UC-038
  // The checkout API left at 0.1 vCore cannot carry 150 checks a second.
  await failsOn('uc-038', 'Run: Black Friday peak', (d) => set(d, 'prc', { vCores: undefined }))
  // The default 10 second timeout and no breaker: checkout waits on a vendor that does not answer.
  await failsOn('uc-038', 'Run: The fraud vendor stops answering', (d) => set(d, 'prc', { timeoutMs: undefined, circuitBreaker: undefined }))

  // UC-039
  // The default 5 minute cache keeps too few estimates: the engine gets more billed calls.
  await failsOn('uc-039', 'Run: Evening cart peak', (d) => set(d, 'cache', { ttlSec: undefined }))
  // No fallback answer: carts fail while the tax engine is down.
  await failsOn('uc-039', 'Run: The tax engine is down for 20 minutes', (d) => set(d, 'prc', { onFailure: undefined }))

  // UC-040
  // A short redelivery limit sends good confirmations to the error queue while SAP is down.
  await failsOn('uc-040', 'Run: SAP is down for 30 minutes', (d) => set(d, 'q', { maxRedelivery: 3 }))
  // No redelivery limit: rejected receipts are retried for ever and never reach a person.
  await failsOn('uc-040', 'Run: Some receipts cannot be posted', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // UC-041
  // The distribution API called inside the webhook at 0.1 vCore cannot take 100 change sets a second.
  await failsOn('uc-041', 'Run: The 18:00 markdown run', (d) => set(d, 'prc', { vCores: undefined }))
  // Giving up after one delivery drops the prices of offline stores.
  await failsOn('uc-041', 'Run: Some stores are offline', (d) => set(d, 'k', { maxRedelivery: 1 }))

  // UC-042
  // A short redelivery limit sends good reviews to the DLQ while text moderation is down.
  await failsOn('uc-042', 'Run: Text moderation is down for 20 minutes', (d) => set(d, 'q', { maxRedelivery: 3 }))
  // No redelivery limit: rejected reviews are retried for ever and never reach the DLQ.
  await failsOn('uc-042', 'Run: Some reviews cannot be moderated', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // UC-043
  // Object storage calls the document processor directly: at the storm peak the ECM refuses what is over 15 a second.
  await failsOn('uc-043', 'Run: Uploads during a storm', (d) => {
    cut(d, 'os ~> q')
    draw(d, 'os -> doc')
  })
  // One replica of the claims Process API: when its zone goes down, claims fail.
  await failsOn('uc-043', 'Run: A zone goes down during a storm', (d) => set(d, 'prc', { replicas: undefined }))

  // UC-044
  // No admission rate in the waiting room: the APIs are flooded and fans get errors.
  await failsOn('uc-044', 'Run: The on-sale opens', (d) => set(d, 'wr', { rateLimit: undefined }))
  // No token policy on the waiting room: bots reach the shop API.
  await failsOn('uc-044', 'Run: Bots without an admission token', (d) => set(d, 'wr', { auth: undefined }))

  // UC-045
  // Giving up after 3 deliveries drops the lab messages while the lab is down.
  await failsOn('uc-045', 'Run: The lab system is down for 3 hours', (d) => set(d, 'k', { maxRedelivery: 3 }))
  // The ingest API left at 0.1 vCore cannot take 80 messages a second.
  await failsOn('uc-045', 'Run: Morning admissions peak', (d) => set(d, 'ing', { vCores: undefined }))

  // UC-046
  // The mobile Experience API at 0.1 vCore per replica cannot carry 150 balances a second.
  await failsOn('uc-046', 'Run: Payday morning peak', (d) => set(d, 'em', { vCores: undefined }))
  // One replica of the mainframe System API: when its zone goes down, balances fail.
  await failsOn('uc-046', 'Run: A zone goes down', (d) => set(d, 'sold', { replicas: undefined }))

  // UC-047
  // The Process API at 0.1 vCore per replica cannot carry 650 requests a second.
  await failsOn('uc-047', 'Run: Payday morning peak', (d) => set(d, 'prc', { vCores: undefined }))
  // One replica of the core banking System API: when its zone goes down, balances fail.
  await failsOn('uc-047', 'Run: A zone goes down', (d) => set(d, 'score', { replicas: undefined }))

  // UC-048
  // The default 5 minute cache: too many lookups reach the carrier aggregator.
  await failsOn('uc-048', 'Run: Black Friday refresh peak', (d) => set(d, 'cache', { ttlSec: 120 }))
  // No partial answer: a carrier outage fails the whole order status.
  await failsOn('uc-048', 'Run: The carrier aggregator is down', (d) => set(d, 'prc', { onFailure: undefined }))

  // UC-049
  // No token policy on the voice Experience API: unlinked callers get answers.
  await failsOn('uc-049', 'Run: A caller without a linked account', (d) => set(d, 'ev', { auth: undefined }))
  // OAuth2 introspection asks Okta about every token, so an Okta outage stops the voice channel.
  await failsOn('uc-049', 'Run: Okta is down for 15 minutes', (d) => set(d, 'ev', { auth: 'oauth2' }))

  // UC-050
  // One replica of the plan-change Process API: when its zone goes down, plan changes fail.
  await failsOn('uc-050', 'Run: A zone goes down', (d) => set(d, 'pchg', { replicas: undefined }))
  // No client ID policy on the store API: any device can change plans.
  await failsOn('uc-050', 'Run: A tablet without a client ID', (d) => set(d, 'es', { auth: undefined }))

  // UC-051
  // The registration API calls the LMS fulfilment directly: students wait for Canvas.
  await failsOn('uc-051', 'Run: Registration opens at 09:00', (d) => {
    cut(d, 'preg ~> ex')
    draw(d, 'preg -> pful')
  })
  // No redelivery limit: failing enrolments are retried for ever and never reach the DLQ.
  await failsOn('uc-051', 'Run: Some enrolments always fail', (d) => set(d, 'ex', { maxRedelivery: undefined }))

  // UC-052
  // No partial answer: a clearing-house outage fails the kiosk check-in.
  await failsOn('uc-052', 'Run: The clearing house is down', (d) => set(d, 'pchk', { onFailure: undefined }))
  // No token policy on the partner FHIR API: any system can look up patients.
  await failsOn('uc-052', 'Run: A clinic system without a token', (d) => set(d, 'ep', { auth: undefined }))

  // UC-053
  // A 1 minute cache: most price checks wait for the SAP pricing simulation.
  await failsOn('uc-053', 'Run: Monday morning price checks', (d) => set(d, 'cache', { ttlSec: 60 }))
  // No client ID policy on the B2B API: any system gets dealer prices.
  await failsOn('uc-053', 'Run: A DMS without a client ID', (d) => set(d, 'eb', { auth: undefined }))
}
