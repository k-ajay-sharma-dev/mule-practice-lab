// Run cases for the problems whose simulations came after the load balancer, loop and poison message rules.
// See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, cut, draw, set }) => {
  // AR-134
  // Copies left at 0.1 vCore: together 100 a second, less than the sale.
  await failsOn('ar-134', 'Run: Sale peak', (d) => {
    set(d, 'c1', { vCores: undefined })
    set(d, 'c2', { vCores: undefined })
  })
  // Copy 2 left small: it cannot carry a normal day alone.
  await failsOn('ar-134', 'Run: One copy stops', (d) => set(d, 'c2', { vCores: undefined }))

  // AR-021
  // The parser calls the order API directly: at the peak SAP refuses what is over its 5 a second.
  await failsOn('ar-021', 'Run: Holiday peak', (d) => {
    cut(d, 'edi ~> pq')
    draw(d, 'edi -> po')
  })
  // A short redelivery limit sends good POs to the DLQ while SAP is down.
  await failsOn('ar-021', 'Run: SAP is down for 20 minutes', (d) => set(d, 'pq', { maxRedelivery: 5 }))
  // No redelivery limit: broken POs are retried for ever and never reach a person.
  await failsOn('ar-021', 'Run: A retailer sends broken POs', (d) => set(d, 'pq', { maxRedelivery: undefined }))

  // AR-072
  // Documents processed inside the supplier's call: the WMS refuses what is over 25 a second.
  await failsOn('ar-072', 'Run: Monday morning ASN burst', (d) => {
    cut(d, 'pin ~> inq')
    draw(d, 'pin -> pdoc')
  })
  // The inbound API left at 0.1 vCore cannot take 80 a second.
  await failsOn('ar-072', 'Run: Monday morning ASN burst', (d) => set(d, 'pin', { vCores: undefined }))
  // A redelivery limit with no DLQ behind the queue drops invoices while Oracle is down.
  await failsOn('ar-072', 'Run: Oracle EBS is down for 30 minutes', (d) => set(d, 'inq', { maxRedelivery: 5 }))
}
