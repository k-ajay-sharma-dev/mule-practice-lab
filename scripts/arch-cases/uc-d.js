// Run cases for the use cases uc-054 to uc-074.
// See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, cut, draw, set }) => {
  // UC-054
  // The quote Process API left at 0.1 vCore cannot carry 120 aggregator quotes a second.
  await failsOn('uc-054', 'Run: Aggregator evening peak', (d) => set(d, 'pq', { vCores: undefined }))
  // No rate limit on the aggregator API: the flood takes the quote API from the brokers.
  await failsOn('uc-054', 'Run: An aggregator floods the quote API', (d) => set(d, 'ea', { rateLimit: undefined }))

  // UC-055
  // One small replica of the public API cannot carry 900 lookups a second.
  await failsOn('uc-055', 'Run: Public lookup peak', (d) => set(d, 'epub', { replicas: undefined, vCores: undefined }))
  // Only 3 deliveries: webhooks are dropped while the shipper endpoints are down.
  await failsOn('uc-055', 'Run: Shipper endpoints are down for 30 minutes', (d) => set(d, 'ms', { maxRedelivery: 3 }))

  // UC-056
  // No client ID policy on the partner API: anyone can check passengers in.
  await failsOn('uc-056', 'Run: A caller without partner credentials', (d) => set(d, 'ep', { auth: undefined }))
  // No rate limit on the partner API: a partner burst takes the DCS from the mobile app.
  await failsOn('uc-056', 'Run: A partner sends a burst', (d) => set(d, 'ep', { rateLimit: undefined }))

  // UC-057
  // The shared customer profile API left at one small replica cannot carry both brands.
  await failsOn('uc-057', 'Run: Both brands on a Saturday peak', (d) => set(d, 'pcust', { replicas: undefined, vCores: undefined }))
  // One replica of the shared customer profile API: a zone outage stops both brands.
  await failsOn('uc-057', 'Run: A zone goes down', (d) => set(d, 'pcust', { replicas: undefined }))

  // UC-058
  // No token check on the edge gateway: the bot reaches the internal zone.
  await failsOn('uc-058', 'Run: Calls without a token', (d) => set(d, 'gw', { auth: undefined }))
  // The eligibility API left at 0.1 vCore cannot carry the TV campaign peak.
  await failsOn('uc-058', 'Run: Eligibility peak after a TV campaign', (d) => set(d, 'pel', { vCores: undefined }))

  // UC-059
  // A short redelivery limit sends good documents to the DLQ while EBS is down.
  await failsOn('uc-059', 'Run: Oracle EBS is down for 30 minutes', (d) => set(d, 'qin', { maxRedelivery: 3 }))
  // No redelivery limit: rejected documents are retried for ever and never reach the DLQ.
  await failsOn('uc-059', 'Run: Documents EBS always rejects', (d) => set(d, 'qin', { maxRedelivery: undefined }))

  // UC-060
  // No redelivery limit: bad confirmations are retried for ever and never reach the DLQ.
  await failsOn('uc-060', 'Run: Bad confirmations', (d) => set(d, 'qin', { maxRedelivery: undefined }))
  // A non-persistent queue loses the waiting confirmations when the broker restarts.
  await failsOn('uc-060', 'Run: EBS fails and the broker restarts', (d) => set(d, 'qin', { persistent: 'no' }))

  // UC-061
  // The webhook API left at 0.1 vCore cannot take 80 webhooks a second.
  await failsOn('uc-061', 'Run: November promotion launch', (d) => set(d, 'hook', { vCores: undefined }))
  // Only 3 deliveries and no DLQ: shipments are dropped while NetSuite is down.
  await failsOn('uc-061', 'Run: NetSuite is down for 30 minutes', (d) => set(d, 'qshp', { maxRedelivery: 3 }))

  // UC-062
  // The webhook API left at 0.1 vCore cannot take the morning burst.
  await failsOn('uc-062', 'Run: Morning van loading burst', (d) => set(d, 'exph', { vCores: undefined }))
  // No authentication on the gateway: fake events reach the tracking store.
  await failsOn('uc-062', 'Run: A caller that is not a carrier', (d) => set(d, 'gw', { auth: undefined }))

  // UC-063
  // No token check on the gateway: an unknown caller gets supplier data.
  await failsOn('uc-063', 'Run: A caller without a token', (d) => set(d, 'gw', { auth: undefined }))
  // No rate limit on the gateway: the broken script overloads the inventory mart.
  await failsOn('uc-063', 'Run: A supplier script runs wild', (d) => set(d, 'gw', { rateLimit: undefined }))

  // UC-064
  // A short redelivery limit sends good orders to the DLQ while the VAN is down.
  await failsOn('uc-064', 'Run: The VAN is down for 30 minutes', (d) => set(d, 'qd', { maxRedelivery: 3 }))
  // No redelivery limit: rejected orders are retried for ever and never reach the DLQ.
  await failsOn('uc-064', 'Run: Orders the VAN always rejects', (d) => set(d, 'qd', { maxRedelivery: undefined }))

  // UC-065
  // Only 5 deliveries and no DLQ on the plan topic: plan changes are dropped while the WMS is down.
  await failsOn('uc-065', 'Run: The WMS is down for 30 minutes', (d) => set(d, 'tplan', { maxRedelivery: 5 }))
  // No redelivery limit: rejected ASNs are retried for ever and never reach the DLQ.
  await failsOn('uc-065', 'Run: ASNs the planner always rejects', (d) => set(d, 'qasn', { maxRedelivery: undefined }))

  // UC-066
  // The notification consumer left at 0.1 vCore cannot empty the queue in time.
  await failsOn('uc-066', 'Run: Notify 180,000 customers', (d) => set(d, 'prcc', { vCores: undefined }))
  // Only 5 deliveries and no DLQ on the recall topic: blocks for offline stores are dropped.
  await failsOn('uc-066', 'Run: Stores are offline for 30 minutes', (d) => set(d, 't', { maxRedelivery: 5 }))

  // UC-067
  // The sales consumer left at 0.1 vCore falls behind at 150 sales a second.
  await failsOn('uc-067', 'Run: Saturday afternoon peak', (d) => set(d, 'prc', { vCores: undefined }))
  // No redelivery limit: rejected sales are retried for ever and never reach the DLQ.
  await failsOn('uc-067', 'Run: Sales the staging tables reject', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // UC-068
  // The cycle-count API left at one small replica cannot carry the morning rush.
  await failsOn('uc-068', 'Run: Morning count rush', (d) => set(d, 'prc', { replicas: undefined, vCores: undefined }))
  // One replica of the store counts API: a zone outage stops the handhelds.
  await failsOn('uc-068', 'Run: A zone goes down during counting', (d) => set(d, 'exp', { replicas: undefined }))

  // UC-069
  // A 5 second cache answers too few lookups, so the stock database is overloaded.
  await failsOn('uc-069', 'Run: Product page peak', (d) => set(d, 'cache', { ttlSec: 5 }))
  // Pick tasks sent to the store app inside the order call: orders fail while its back end is down.
  await failsOn('uc-069', 'Run: The store app back end is down', (d) => {
    cut(d, 'prco ~> q')
    draw(d, 'prco -> expst')
  })

  // UC-070
  // No client ID policy on the gateway: an unknown device can issue refunds.
  await failsOn('uc-070', 'Run: A caller without a client ID', (d) => set(d, 'gw', { auth: undefined }))
  // Only 5 deliveries and no DLQ on the topic: finance entries are dropped while EBS is down.
  await failsOn('uc-070', 'Run: Oracle EBS is down for 45 minutes', (d) => set(d, 't', { maxRedelivery: 5 }))

  // UC-071
  // The gift card Process API left at one small replica cannot carry the December peak.
  await failsOn('uc-071', 'Run: December peak', (d) => set(d, 'prc', { replicas: undefined, vCores: undefined }))
  // No rate limit on the digital API: the bot pushes the processor over its limit.
  await failsOn('uc-071', 'Run: Brute force from the website', (d) => set(d, 'expd', { rateLimit: undefined }))

  // UC-072
  // The ATP API left at 0.1 vCore cannot publish the bulk adjustment.
  await failsOn('uc-072', 'Run: Busy day stock changes', (d) => set(d, 'sinv', { vCores: undefined }))
  // Only 10 deliveries and no DLQ: stock changes are dropped while the marketplace is down.
  await failsOn('uc-072', 'Run: Marketplace A is down for an hour', (d) => set(d, 'tstock', { maxRedelivery: 10 }))

  // UC-073
  // A short redelivery limit sends good lines to the DLQ while store stock is down.
  await failsOn('uc-073', 'Run: Store stock is down for 20 minutes', (d) => set(d, 'qrel', { maxRedelivery: 3 }))
  // No redelivery limit: lines that cannot be sourced are retried for ever and never reach the DLQ.
  await failsOn('uc-073', 'Run: Lines that cannot be sourced', (d) => set(d, 'qrel', { maxRedelivery: undefined }))

  // UC-074
  // No rate limit on the gateway: the opening spike overloads the Oracle stock rows.
  await failsOn('uc-074', 'Run: The drop opens', (d) => set(d, 'gw', { rateLimit: undefined }))
  // Orders posted to the OMS inside checkout: the OMS refuses what is over its 50 a second.
  await failsOn('uc-074', 'Run: Paid orders pile up', (d) => {
    cut(d, 'prc ~> q')
    draw(d, 'prc -> prco')
  })
}
