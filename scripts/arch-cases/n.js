// Wrong and other correct diagrams for batch N (ar-136, ar-138, ar-139). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }) => {
  // AR-136
  // The old setup: partners still call a service through its own public address.
  await failsOn('ar-136', 'reached only through Flex Gateway', (d) => draw(d, 'prt -> rat'))
  // The load balancer has a rule that skips the gateway for tracking.
  await failsOn('ar-136', 'nor the load balancer', (d) => draw(d, 'lb -> trk'))
  // The labels service is left out of the gateway.
  await failsOn('ar-136', 'routes to all three services', (d) => {
    cut(d, 'flex -> lab')
    box(d, 'lb2', 'load-balancer', 'labels public load balancer')
    draw(d, 'prt -> lb2', 'lb2 -> lab')
  })
  // Each service still checks tokens with the identity provider itself.
  await failsOn('ar-136', 'do not call the identity provider', (d) => draw(d, 'trk -> idp', 'rat -> idp'))
  // The gateway never gets the signing keys, so it cannot validate tokens.
  await failsOn('ar-136', 'fetches the signing keys', (d) => cut(d, 'flex -> idp'))
  // The mobile app gets no token.
  await failsOn('ar-136', 'gets its token', (d) => cut(d, 'mob -> idp'))
  // No analytics.
  await failsOn('ar-136', 'analytics', (d) => unbox(d, 'mon'))
  // The gateway is drawn as queueing requests.
  await failsOn('ar-136', 'sync calls', (d) => swap(d, 'flex -> rat'))
  // Arrow drawn the wrong way round.
  await failsOn('ar-136', 'sends traffic to Flex Gateway', (d) => flip(d, 'lb -> flex'))
  // Without the tracking database, and with an internal app that also goes through the load balancer.
  await passes('ar-136', (d) => {
    unbox(d, 'db')
    box(d, 'ops', 'internal-app', 'Operations console')
    draw(d, 'ops -> lb')
  })
  // Partners on a second gateway instance behind the same load balancer.
  await passes('ar-136', (d) => {
    box(d, 'flex2', 'api-gateway', 'Flex Gateway for partners')
    cut(d, 'flex -> rat', 'flex -> lab')
    draw(d, 'lb -> flex2', 'flex2 -> rat', 'flex2 -> lab', 'flex2 -> idp', 'flex2 -> mon')
  })

  // AR-138
  // Everything on Kafka: the command goes to the topic and the worker reads it from there.
  await failsOn('ar-138', 'commands never travel on the event topic', (d) => {
    unbox(d, 'cmd')
    unbox(d, 'dlq')
    draw(d, 'prc ~> topic', 'topic ~> wrk')
  })
  // Only notifications read the topic, so the analytics lake gets no events.
  await failsOn('ar-138', 'At least two consumers read the Kafka topic', (d) => {
    unbox(d, 'lake')
  })
  // No dead-letter queue for failing commands.
  await failsOn('ar-138', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // Two different services both take commands from one queue.
  await failsOn('ar-138', 'exactly one kind of worker', (d) => draw(d, 'cmd ~> ntf'))
  // The worker updates the WMS directly.
  await failsOn('ar-138', 'only through a System API', (d) => draw(d, 'wrk -> wms'))
  // The worker calls the notification service over HTTP after each update.
  await failsOn('ar-138', 'never calls the notification consumer directly', (d) => draw(d, 'wrk -> ntf'))
  // The checkout Experience API publishes the command itself.
  await failsOn('ar-138', 'does not write to a broker itself', (d) => draw(d, 'exp ~> cmd'))
  // The command is drawn as a sync call into the queue.
  await failsOn('ar-138', 'async message', (d) => swap(d, 'prc ~> cmd'))
  // The order API also publishes "OrderPlaced" to Kafka, so a second publisher writes to the topic.
  await failsOn('ar-138', 'Only the fulfilment worker publishes', (d) => draw(d, 'prc ~> topic'))
  // A returns service drawn as a third consumer.
  await passes('ar-138', (d) => {
    box(d, 'ret', 'process-api', 'prc-returns (next year)')
    draw(d, 'topic ~> ret')
  })
  // The lake loaded by a scheduled job instead of a sink connector, and the Kafka box named differently.
  await passes('ar-138', (d) => {
    unbox(d, 'lake')
    box(d, 'job', 'batch-job', 'Hourly lake loader')
    draw(d, 'topic ~> job')
    rename(d, 'topic', 'fulfilment events topic, partitioned by order')
  })

  // AR-139
  // One queue shared by both regions, as if Anypoint MQ were global.
  await failsOn('ar-139', 'Each region has its own queue', (d) => {
    unbox(d, 'qW')
    unbox(d, 'dlqW')
    unbox(d, 'drain')
    draw(d, 'expW ~> qE', 'qE ~> prcW')
  })
  // A replication line drawn between the queues.
  await failsOn('ar-139', 'No line between the two regional queues', (d) => draw(d, 'qE ~> qW'))
  // No drain job: the stranded orders are never recovered.
  await failsOn('ar-139', 'drain job reads the stranded messages', (d) => unbox(d, 'drain'))
  // Each region keeps its own idempotency store, like the current Object Store v2.
  await failsOn('ar-139', 'one idempotency store', (d) => {
    box(d, 'idemW', 'cache', 'Idempotency keys (Object Store v2, eu-west)')
    cut(d, 'prcW -> idem')
    draw(d, 'prcW -> idemW')
  })
  // The standby Process API checks no keys.
  await failsOn('ar-139', 'Both Process APIs check', (d) => cut(d, 'prcW -> idem'))
  // The Experience API calls the Process API directly in the passive region.
  await failsOn('ar-139', 'never call a Process API directly', (d) => draw(d, 'expW -> prcW'))
  // A Process API writes to SAP directly.
  await failsOn('ar-139', 'ERP is reached only through System APIs', (d) => draw(d, 'prcW -> erp'))
  // No dead-letter queue in the standby region.
  await failsOn('ar-139', 'Every queue has a dead-letter queue', (d) => unbox(d, 'dlqW'))
  // Only one ingress behind the global load balancer.
  await failsOn('ar-139', 'routes to the ingress in each region', (d) => {
    unbox(d, 'ingW')
    draw(d, 'glb -> expW')
  })
  // The drain job reads the queue synchronously.
  await failsOn('ar-139', 'async message', (d) => swap(d, 'qE ~> drain'))
  // The idempotency keys in a replicated cache, and a drain job that can run in either direction.
  await passes('ar-139', (d) => {
    d.nodes.find((n) => n.id === 'idem').type = 'cache'
    rename(d, 'idem', 'Dedup keys, replicated Redis')
    draw(d, 'qW ~> drain', 'drain ~> qE')
  })
  // Monitoring left out, and the standby System API named differently.
  await passes('ar-139', (d) => {
    unbox(d, 'mon')
    rename(d, 'sysW', 'sys-erp-orders (standby)')
  })
}
