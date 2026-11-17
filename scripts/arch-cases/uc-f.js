// Wrong and other correct diagrams for integration scenarios uc-126 to uc-130. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, swap, draw, box, unbox, rename, set }) => {
  // UC-126
  // The Experience API still calls the PMS while the tablet waits.
  await failsOn('uc-126', 'never waits on the property management system', (d) => draw(d, 'exp -> sys'))
  // No queue: the Experience API calls the Process API over HTTP.
  await failsOn('uc-126', 'puts each update on a queue', (d) => {
    cut(d, 'exp ~> q')
    draw(d, 'exp -> prc')
  })
  // The Process API calls the PMS without the System API.
  await failsOn('uc-126', 'only through a System API', (d) => draw(d, 'prc -> pms'))
  // No dead-letter queue.
  await failsOn('uc-126', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // A redelivery limit of 10 sends good updates to the DLQ during the night audit.
  await failsOn('uc-126', 'Run: The night audit', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No redelivery limit: refused updates are tried for ever.
  await failsOn('uc-126', 'Run: A room number the hotel system does not know', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // Other names and a monitoring box.
  await passes('uc-126', (d) => {
    rename(d, 'q', 'housekeeping-room-status')
    box(d, 'mon', 'monitoring', 'DLQ alerts')
    draw(d, 'prc -> mon')
  })

  // UC-127
  // One consumer makes all three calls.
  await failsOn('uc-127', 'at least three queues', (d) => {
    unbox(d, 'qH')
    unbox(d, 'qT')
    unbox(d, 'dH')
    unbox(d, 'dT')
    draw(d, 'prcN -> sysH', 'prcN -> car')
  })
  // The webhook books the hotel itself.
  await failsOn('uc-127', 'never waits on the crew app', (d) => draw(d, 'exp -> sysH'))
  // The hotel consumer calls the partner directly.
  await failsOn('uc-127', 'hotel partner is reached only through a System API', (d) => draw(d, 'prcH -> htl'))
  // Two consumers on the hotel queue.
  await failsOn('uc-127', 'exactly one consumer', (d) => draw(d, 'qH ~> prcT'))
  // No DLQ for the hotel queue.
  await failsOn('uc-127', 'Every queue has a dead-letter queue', (d) => unbox(d, 'dH'))
  // A redelivery limit of 30 empties the hotel queue into the DLQ during the outage.
  await failsOn('uc-127', 'Run: The hotel partner is down for two hours', (d) => set(d, 'qH', { maxRedelivery: 30 }))
  // No redelivery limits: broken changes are tried for ever.
  await failsOn('uc-127', 'Run: Changes with a broken crew record', (d) => {
    for (const id of ['qN', 'qH', 'qT']) set(d, id, { maxRedelivery: undefined })
  })
  // The transport company gets a System API too.
  await passes('uc-127', (d) => {
    box(d, 'sysT', 'system-api', 'sys-ground-transport')
    cut(d, 'prcT -> car')
    draw(d, 'prcT -> sysT', 'sysT -> car')
  })
  // Other queue names.
  await passes('uc-127', (d) => {
    rename(d, 'qH', 'crew-hotel-bookings')
    rename(d, 'ex', 'roster-events')
  })

  // UC-128
  // The picker's call waits for the push to be sent.
  await failsOn('uc-128', 'A picker never waits on the push service', (d) => draw(d, 'prc -> push'))
  // Pickers and customers share one Experience API.
  await failsOn('uc-128', 'their own Experience API', (d) => {
    unbox(d, 'expC')
    draw(d, 'app -> expP')
  })
  // No timeout job: silence never becomes the default.
  await failsOn('uc-128', 'A timeout job applies the default', (d) => unbox(d, 'job'))
  // The job calls the OMS directly.
  await failsOn('uc-128', 'only through a System API', (d) => draw(d, 'job -> oms'))
  // No substitution store.
  await failsOn('uc-128', 'kept in the substitution store', (d) => unbox(d, 'st'))
  // No timeout on the OMS System API: a slow OMS holds the threads pickers need.
  await failsOn('uc-128', 'Run: The order system is slow for 10 minutes', (d) => set(d, 'sys', { timeoutMs: undefined }))
  // A redelivery limit of 5 sends offers to the DLQ during the push outage.
  await failsOn('uc-128', 'Run: The push service is down for 15 minutes', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // A circuit breaker as well, and a monitoring box.
  await passes('uc-128', (d) => {
    set(d, 'sys', { circuitBreaker: 'on' })
    box(d, 'mon', 'monitoring', 'Offer age dashboard')
    draw(d, 'st -> mon')
  })
  // The store named differently.
  await passes('uc-128', (d) => rename(d, 'st', 'Substitution offers and decisions database'))

  // UC-129
  // The Experience API creates work orders itself.
  await failsOn('uc-129', 'No chain of sync calls joins a sensor', (d) => draw(d, 'exp -> sys'))
  // The detector calls the field service app with no queue.
  await failsOn('uc-129', 'reach the field service app through a queue', (d) => {
    unbox(d, 'q')
    unbox(d, 'dlq')
    draw(d, 'det -> sys')
  })
  // No archive consumer.
  await failsOn('uc-129', 'archives the readings', (d) => unbox(d, 'arc'))
  // Readings drawn as sync calls into the stream.
  await failsOn('uc-129', 'Every line to or from the stream', (d) => swap(d, 'exp ~> es'))
  // The detector has no store for candidates.
  await failsOn('uc-129', 'leak candidates in its own leak database', (d) => unbox(d, 'ldb'))
  // A redelivery limit of 50 sends confirmed leaks to the DLQ during a three-hour outage.
  await failsOn('uc-129', 'Run: The field service app is down for three hours', (d) => set(d, 'q', { maxRedelivery: 50 }))
  // The detector on the smallest size cannot keep up with 300 readings a second.
  await failsOn('uc-129', 'Run: An ordinary night', (d) => set(d, 'det', { vCores: undefined }))
  // The archive written to Azure Blob Storage instead.
  await passes('uc-129', (d) => {
    box(d, 'blob', 'azure-blob', 'Readings archive container')
    box(d, 's3b', 's3-bucket', 'Readings archive bucket (copy)')
    cut(d, 'arc -> s3')
    unbox(d, 's3')
    draw(d, 'arc -> blob', 'arc -> s3b')
  })
  // A monitoring box on the DLQ.
  await passes('uc-129', (d) => {
    box(d, 'mon', 'monitoring', 'Work order DLQ alerts')
    draw(d, 'wo -> mon')
  })

  // UC-130
  // The readers check each card with the payment provider at the tap.
  await failsOn('uc-130', 'No tap ever reaches the payment provider', (d) => draw(d, 'expT -> sysP'))
  // The rider app reads the stream.
  await failsOn('uc-130', 'no route to the event stream', (d) => draw(d, 'prcR ~> es'))
  // The job calls the provider directly.
  await failsOn('uc-130', 'only through a payments System API', (d) => draw(d, 'job -> psp'))
  // Taps written to the journeys database while the reader waits.
  await failsOn('uc-130', 'Taps go onto an event stream', (d) => {
    cut(d, 'expT ~> es')
    draw(d, 'expT -> jb')
  })
  // Failed cards never reach the denylist.
  await failsOn('uc-130', 'adds failed cards to the denylist', (d) => cut(d, 'job -> sysD'))
  // No retries in the payments System API: 2 cards in 100 are not charged.
  await failsOn('uc-130', 'Run: The payment provider drops 2 calls in 100', (d) => set(d, 'sysP', { retries: undefined }))
  // The journey builder sized only for the live rate cannot catch up after the outage.
  await failsOn('uc-130', 'Run: The journeys database is down for 20 minutes', (d) => set(d, 'jb', { vCores: '1' }))
  // A cache in front of the denylist, and other names.
  await passes('uc-130', (d) => {
    box(d, 'c', 'cache', 'Denylist cache')
    draw(d, 'sysD -> c')
    rename(d, 'es', 'taps (Kafka)')
  })
  // A load balancer in front of the taps API.
  await passes('uc-130', (d) => {
    box(d, 'lb', 'load-balancer', 'Reader ingress')
    cut(d, 'rdr -> expT')
    draw(d, 'rdr -> lb', 'lb -> expT')
  })
}
