// Run cases for the case studies cs-038 to cs-060.
// See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, cut, draw, set }) => {
  // CS-038
  // The telemetry loader left at 0.1 vCore: the backlog after a link outage is still there an hour later.
  await failsOn('cs-038', 'Run: The backlog after a link outage', (d) => set(d, 'loader', { vCores: undefined }))
  // A short redelivery limit on the alarm queue with no DLQ: alarms are dropped while the EHS platform is down.
  await failsOn('cs-038', 'Run: The EHS platform is down', (d) => set(d, 'pq', { maxRedelivery: 3 }))

  // CS-039
  // No OAuth policy on the gateway: the fraudster gets answers.
  await failsOn('cs-039', 'Run: A caller without a token', (d) => set(d, 'gw', { auth: undefined }))
  // No rate limit on the gateway: the flood reaches the core network.
  await failsOn('cs-039', 'Run: One partner floods the API', (d) => set(d, 'gw', { rateLimit: undefined }))

  // CS-040
  // The scoring API fails the payment when the engine is slow, instead of deciding by the risk policy.
  await failsOn('cs-040', 'Run: The scoring engine slows down', (d) => set(d, 'score', { onFailure: undefined }))
  // The events API left at one replica of 0.1 vCore: most events get 503.
  await failsOn('cs-040', 'Run: The online-banking event peak', (d) => set(d, 'olbs', { replicas: undefined, vCores: undefined }))

  // CS-041
  // The aggregator API keeps the default 10 second timeout and gives up on every change.
  await failsOn('cs-041', 'Run: The aggregator answers slowly at cut-off', (d) => set(d, 'sagg', { timeoutMs: undefined }))
  // A short redelivery limit with no DLQ: changes are dropped while the aggregator is down.
  await failsOn('cs-041', 'Run: The aggregator is down for an hour', (d) => set(d, 'qa', { maxRedelivery: 3 }))

  // CS-042
  // No OAuth policy on the gateway: the attacker can send commands.
  await failsOn('cs-042', 'Run: A remote unlock without a valid token', (d) => set(d, 'gw', { auth: undefined }))
  // A short redelivery limit with no DLQ: bookings are dropped while the DMS is down.
  await failsOn('cs-042', 'Run: The dealer DMS is down for an hour', (d) => set(d, 'q', { maxRedelivery: 3 }))

  // CS-044
  // The web API left at 0.1 vCore: the Monday peak gets 503.
  await failsOn('cs-044', 'Run: Monday morning balance checks', (d) => set(d, 'ew', { vCores: undefined }))
  // No partial answer: a new-core outage fails the whole account overview.
  await failsOn('cs-044', 'Run: The new core has an outage', (d) => set(d, 'acc', { onFailure: undefined }))

  // CS-047
  // No stock cache: every lookup goes to the WMS database.
  await failsOn('cs-047', 'Run: Web shop peak', (d) => cut(d, 'avail -> cache'))
  // No client ID policy on the gateway: anyone can read prices and stock.
  await failsOn('cs-047', 'Run: A caller without a client ID', (d) => set(d, 'gw', { auth: undefined }))

  // CS-050
  // The availability API left at the default 0.1 vCore: 400 checks a second are far over what it carries.
  await failsOn('cs-050', 'Run: Availability lookups at peak', (d) => set(d, 'avail', { vCores: undefined }))
  // A short redelivery limit with no DLQ: orders are dropped while the OMS is down.
  await failsOn('cs-050', 'Run: The OMS is down for 30 minutes', (d) => set(d, 'q', { maxRedelivery: 3 }))

  // CS-051
  // The portal API left at 0.1 vCore: most tracking pages get 503.
  await failsOn('cs-051', 'Run: Tracking lookups while the TMS is down', (d) => set(d, 'eportal', { vCores: undefined }))
  // No redelivery limit: failing webhooks are retried for ever and never reach the DLQ.
  await failsOn('cs-051', 'Run: Some shipper webhooks always fail', (d) => set(d, 'bb', { maxRedelivery: undefined }))

  // CS-053
  // Non-persistent stock movements: the broker restart loses what the queue holds.
  await failsOn('cs-053', 'Run: Promotional weekend and a broker restart', (d) => set(d, 'sq', { persistent: 'no' }))
  // No stock cache: every web check goes to Oracle.
  await failsOn('cs-053', 'Run: Web stock checks at peak', (d) => cut(d, 'ew -> cache'))

  // CS-054
  // The AS2 API calls the order process directly: EBS gets the whole burst.
  await failsOn('cs-054', 'Run: A Q4 burst of purchase orders', (d) => {
    cut(d, 'eas2 ~> inq')
    draw(d, 'eas2 -> prc')
  })
  // No redelivery limit: rejected orders are retried for ever and never reach the DLQ.
  await failsOn('cs-054', 'Run: Orders EBS always rejects', (d) => set(d, 'inq', { maxRedelivery: undefined }))

  // CS-055
  // The genealogy API left at 0.1 vCore: the shift-change backlog is still there an hour later.
  await failsOn('cs-055', 'Run: Lot events at shift change', (d) => set(d, 'gen', { vCores: undefined }))
  // A short redelivery limit with no DLQ: recall notices are dropped while the portal is down.
  await failsOn('cs-055', 'Run: A retailer portal is down during a recall', (d) => set(d, 'rt', { maxRedelivery: 3 }))

  // CS-056
  // A redelivery limit of 5: good sales go to the DLQ while SAP is down.
  await failsOn('cs-056', 'Run: SAP is down for 30 minutes', (d) => set(d, 'sq', { maxRedelivery: 5 }))
  // No redelivery limit: rejected sales are retried for ever and never reach the DLQ.
  await failsOn('cs-056', 'Run: Sales SAP always rejects', (d) => set(d, 'sq', { maxRedelivery: undefined }))

  // CS-057
  // No client ID policy on the gateway: unknown devices write to the compliance record.
  await failsOn('cs-057', 'Run: A device without a client ID', (d) => set(d, 'gw', { auth: undefined }))
  // A short redelivery limit with no DLQ: excursions are dropped while the QMS is down.
  await failsOn('cs-057', 'Run: The QMS is down for an hour', (d) => set(d, 'at', { maxRedelivery: 3 }))

  // CS-058
  // The store price API left at 0.1 vCore: the peak gets 503.
  await failsOn('cs-058', 'Run: Store price reads at peak', (d) => set(d, 'pi', { vCores: undefined }))
  // Non-persistent price topic: the broker restart loses the changes waiting for the stores.
  await failsOn('cs-058', 'Run: The POS estate is down and the broker restarts', (d) => set(d, 'tp', { persistent: 'no' }))

  // CS-059
  // The client orders API calls the order process directly: the WMS gets the whole peak.
  await failsOn('cs-059', 'Run: The November peak', (d) => {
    cut(d, 'eapi ~> oq')
    draw(d, 'eapi -> pwo')
  })
  // No redelivery limit: rejected orders are retried for ever and never reach the DLQ.
  await failsOn('cs-059', 'Run: Orders the WMS always rejects', (d) => set(d, 'oq', { maxRedelivery: undefined }))

  // CS-060
  // A redelivery limit of 3: good calls go to the DLQ while the MES is down.
  await failsOn('cs-060', 'Run: The MES is down for 20 minutes', (d) => set(d, 'cq', { maxRedelivery: 3 }))
  // No redelivery limit: rejected calls are retried for ever and the supervisor never hears.
  await failsOn('cs-060', 'Run: A call the MES always rejects', (d) => set(d, 'cq', { maxRedelivery: undefined }))
}
