// Wrong and other correct diagrams for batch R (ar-155 to ar-159). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, swap, draw, box, unbox, rename, set }) => {
  // AR-155
  // Persistent delivery turned off: a broker restart loses the refunds waiting during the outage.
  await failsOn('ar-155', 'Run: The broker restarts while the provider is down', (d) => set(d, 'q', { persistent: 'no' }))
  // No redelivery limit: a refund to a closed card is tried for ever.
  await failsOn('ar-155', 'Run: A card that was closed', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The returns desk calls the provider through its own System API.
  await failsOn('ar-155', 'No returns channel waits on the payment provider', (d) => draw(d, 'desk -> sys'))
  // The worker calls the provider directly.
  await failsOn('ar-155', 'only through a System API', (d) => draw(d, 'wrk -> pay'))
  // No DLQ.
  await failsOn('ar-155', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // The refunds Process API on the smallest size cannot take the January peak.
  await failsOn('ar-155', 'Run: The January returns peak', (d) => set(d, 'prc', { vCores: undefined }))
  // The default persistence left as it is, and other names.
  await passes('ar-155', (d) => {
    set(d, 'q', { persistent: undefined })
    rename(d, 'q', 'refunds.pending')
    rename(d, 'wrk', 'prc-refund-sender')
  })

  // AR-156
  // Spread mode: the standby serves quotes all day, which breaks the licence.
  await failsOn('ar-156', 'Run: A normal day', (d) => set(d, 'lb', { mode: 'spread' }))
  // The System API calls the primary by its host name: a failover means a redeploy.
  await failsOn('ar-156', 'only through the load balancer', (d) => draw(d, 'sys -> te1'))
  // Only the primary behind the load balancer.
  await failsOn('ar-156', 'a line to each tax engine server', (d) => cut(d, 'lb -> te2'))
  // No load balancer: the primary failing stops the checkout.
  await failsOn('ar-156', 'Run: The primary fails', (d) => {
    unbox(d, 'lb')
    draw(d, 'sys -> te1')
  })
  // The Mule APIs on the smallest size.
  await failsOn('ar-156', 'Run: A normal day', (d) => {
    for (const id of ['exp', 'prc', 'sys']) set(d, id, { vCores: undefined })
  })
  // Two replicas of each Mule API, and another name for the load balancer.
  await passes('ar-156', (d) => {
    for (const id of ['exp', 'prc', 'sys']) set(d, id, { replicas: 2, vCores: '0.2' })
    rename(d, 'lb', 'F5 virtual server for the tax engine')
  })

  // AR-157
  // The import writes straight to the CRM System API: the sales team gets errors.
  await failsOn('ar-157', 'Run: An import at 10:00', (d) => {
    unbox(d, 'q')
    unbox(d, 'dlq')
    draw(d, 'job -> sys')
  })
  // The same, seen in the drawing.
  await failsOn('ar-157', 'never calls the CRM while it reads the file', (d) => draw(d, 'job -> sys'))
  // The import has its own CRM System API: two places call the CRM with no shared view of its limit.
  await failsOn('ar-157', 'One CRM System API serves both', (d) => {
    cut(d, 'prc -> sys')
    box(d, 'sys2', 'system-api', 'sys-crm-import', { vCores: '0.5' })
    draw(d, 'prc -> sys2', 'sys2 -> crm')
  })
  // No redelivery limit: refused rows are tried for ever.
  await failsOn('ar-157', 'Run: Rows the CRM refuses', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // A redelivery limit of 5: good contacts go to the DLQ during the 10 minute outage.
  await failsOn('ar-157', 'Run: The CRM has a 10 minute outage', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // The shared System API on the smallest size.
  await failsOn('ar-157', 'Run: An import at 10:00', (d) => set(d, 'sys', { vCores: undefined }))
  // A monitoring box on the DLQ, and a larger consumer.
  await passes('ar-157', (d) => {
    box(d, 'mon', 'monitoring', 'Import alerts')
    draw(d, 'prc -> mon')
    set(d, 'prc', { vCores: '1' })
  })

  // AR-158
  // As before the review: 4 replicas of 1 vCore for each API.
  await failsOn('ar-158', 'Run: Monday 09:00', (d) => {
    for (const id of ['expW', 'expM', 'prc', 'sys']) set(d, id, { replicas: 4, vCores: '1' })
  })
  // One replica of 1 vCore each: the same cost, but a zone failure takes the APIs down.
  await failsOn('ar-158', 'Run: One availability zone goes down', (d) => {
    for (const id of ['expW', 'expM', 'prc', 'sys']) set(d, id, { replicas: 1, vCores: '1' })
  })
  // The mobile Experience API on 2 x 0.2: one replica alone cannot carry 140 requests a second.
  await failsOn('ar-158', 'Run: One availability zone goes down', (d) => set(d, 'expM', { vCores: '0.2' }))
  // One Experience API for both channels.
  await failsOn('ar-158', 'Each channel has its own Experience API', (d) => {
    unbox(d, 'expW')
    draw(d, 'web -> expM')
  })
  // The portal API calls core banking around the layers.
  await failsOn('ar-158', 'only through a System API', (d) => draw(d, 'expW -> core'))
  // The portal API on 2 x 0.5 too: 4 vCores exactly.
  await passes('ar-158', (d) => set(d, 'expW', { vCores: '0.5' }))
  // Three replicas of 0.2 for the portal API and other names.
  await passes('ar-158', (d) => {
    set(d, 'expW', { replicas: 3 })
    rename(d, 'sys', 'sys-core-accounts')
  })

  // AR-159
  // One consumer scores and loads: a warehouse window stops fraud scoring.
  await failsOn('ar-159', 'Run: The warehouse is down for an hour', (d) => {
    unbox(d, 'ldr')
    draw(d, 'frd -> dw')
  })
  // The same, seen in the drawing.
  await failsOn('ar-159', 'The fraud path never waits on the warehouse', (d) => draw(d, 'frd -> dw'))
  // The Experience API scores each transaction while the terminal waits.
  await failsOn('ar-159', 'Run: Lunchtime peak', (d) => draw(d, 'exp -> sys'))
  // The loader on the smallest size cannot keep up with 300 a second.
  await failsOn('ar-159', 'Run: Lunchtime peak', (d) => set(d, 'ldr', { vCores: undefined }))
  // The fraud consumer calls the scoring service directly.
  await failsOn('ar-159', 'only through a System API', (d) => draw(d, 'frd -> svc'))
  // A line into the stream drawn as a sync call.
  await failsOn('ar-159', 'Every line to or from the stream is an async message', (d) => swap(d, 'exp ~> es'))
  // A third consumer for loyalty points, and a circuit breaker on the fraud consumer.
  await passes('ar-159', (d) => {
    box(d, 'loy', 'process-api', 'prc-loyalty-points')
    box(d, 'crm', 'crm', 'Loyalty CRM')
    draw(d, 'es ~> loy', 'loy -> crm')
    set(d, 'frd', { circuitBreaker: 'on' })
  })
}
