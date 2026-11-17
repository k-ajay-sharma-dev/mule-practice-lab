// Wrong and other correct diagrams for batch P (ar-145 to ar-149). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, swap, draw, box, unbox, rename, set }) => {
  // AR-145
  // The new Experience API fetches timetables from the old system.
  await failsOn('ar-145', 'never calls the old booking system', (d) => {
    cut(d, 'exp -> sys')
    draw(d, 'exp -> old')
  })
  // The app still calls the old system for bookings.
  await failsOn('ar-145', 'never calls the old booking system directly', (d) => draw(d, 'app -> old'))
  // Everything moved at once: the gateway no longer reaches the old system.
  await failsOn('ar-145', 'features not yet moved', (d) => cut(d, 'gw -> old'))
  // The timetable read drawn as a message.
  await failsOn('ar-145', 'Every line is a sync call', (d) => swap(d, 'exp -> sys'))
  // The new APIs on the smallest size cannot carry 150 searches a second.
  await failsOn('ar-145', 'Run: Friday evening', (d) => set(d, 'exp', { vCores: undefined }))
  // A cache in front of the timetable database, and other names.
  await passes('ar-145', (d) => {
    box(d, 'c', 'cache', 'Timetable cache')
    draw(d, 'sys -> c')
    rename(d, 'old', 'Booking monolith (old)')
    rename(d, 'exp', 'exp-ferry-timetables')
  })
  // A monitoring box beside the gateway.
  await passes('ar-145', (d) => {
    box(d, 'mon', 'monitoring', 'Route traffic dashboard')
    draw(d, 'gw -> mon')
  })

  // AR-146
  // The reporting System API still reads the primary database.
  await failsOn('ar-146', 'No report request reaches the primary database', (d) => {
    cut(d, 'sysR -> rep')
    draw(d, 'sysR -> db')
  })
  // Reports go through the checkout System API.
  await failsOn('ar-146', 'each have their own System API', (d) => {
    cut(d, 'prc -> sysR')
    draw(d, 'prc -> sysO')
  })
  // Nothing feeds the replica.
  await failsOn('ar-146', 'fed from the primary database', (d) => cut(d, 'db ~> rep'))
  // Reports reach the primary through the checkout API: checkout slows at month end.
  await failsOn('ar-146', 'Run: Month-end close', (d) => {
    unbox(d, 'sysR')
    draw(d, 'prc -> sysO')
  })
  // The reporting path on the smallest size.
  await failsOn('ar-146', 'Run: Month-end close', (d) => set(d, 'sysR', { vCores: undefined }))
  // The replica named differently, and a monitoring box.
  await passes('ar-146', (d) => {
    rename(d, 'rep', 'Orders replica (read only)')
    box(d, 'mon', 'monitoring', 'Replica lag alert')
    draw(d, 'rep -> mon')
  })

  // AR-147
  // One System API calls both cores.
  await failsOn('ar-147', 'No System API calls both cores', (d) => {
    unbox(d, 'sysC')
    draw(d, 'sysN -> coreC')
  })
  // Each app has its own Experience API.
  await failsOn('ar-147', 'One Experience API serves both brands', (d) => {
    box(d, 'exp2', 'experience-api', 'exp-crestwell-accounts', { replicas: 2, vCores: '1' })
    cut(d, 'appC -> exp')
    draw(d, 'appC -> exp2', 'exp2 -> prc')
  })
  // The Process API calls the Crestwell core itself.
  await failsOn('ar-147', 'reached only through their System APIs', (d) => draw(d, 'prc -> coreC'))
  // No customer directory.
  await failsOn('ar-147', 'reads the customer directory', (d) => unbox(d, 'dir'))
  // No timeout on the Crestwell System API: 8 second calls use up the shared APIs' threads.
  await failsOn('ar-147', 'Run: The Crestwell core is slow for 20 minutes', (d) => set(d, 'sysC', { timeoutMs: undefined }))
  // One replica of each shared API cannot hold enough threads during a slow spell.
  await failsOn('ar-147', 'Run: The Crestwell core is slow for 20 minutes', (d) => {
    set(d, 'exp', { replicas: undefined })
    set(d, 'prc', { replicas: undefined })
  })
  // A shorter timeout, and a circuit breaker as well.
  await passes('ar-147', (d) => set(d, 'sysC', { timeoutMs: 1500, circuitBreaker: 'on' }))
  // The joint website joins the same Experience API.
  await passes('ar-147', (d) => {
    box(d, 'web', 'web-app', 'Joint website')
    draw(d, 'web -> exp')
  })

  // AR-148
  // The command API also writes the status view.
  await failsOn('ar-148', 'never writes a view itself', (d) => draw(d, 'cmd -> dbS'))
  // The query API reads the events to answer lookups.
  await failsOn('ar-148', 'Only the command Process API writes events', (d) => draw(d, 'qry ~> es'))
  // Both projectors share one view.
  await failsOn('ar-148', 'Each projector keeps exactly one view', (d) => draw(d, 'prjF -> dbS'))
  // Only one projector.
  await failsOn('ar-148', 'At least two projectors', (d) => unbox(d, 'prjF'))
  // The stream does not keep its events: a restart loses what the finance projector has not read.
  await failsOn('ar-148', 'Run: The finance projector is down and the stream restarts', (d) => set(d, 'es', { persistent: 'no' }))
  // The query API on the smallest size.
  await failsOn('ar-148', 'Run: Sunday evening', (d) => set(d, 'qry', { vCores: undefined }))
  // A third projector for packing lists.
  await passes('ar-148', (d) => {
    box(d, 'prjP', 'process-api', 'prc-packing-projector', { vCores: '0.5' })
    box(d, 'dbP', 'database', 'Packing list view')
    draw(d, 'es ~> prjP', 'prjP -> dbP')
  })
  // Other names, and the status projector on a larger size.
  await passes('ar-148', (d) => {
    rename(d, 'es', 'order-events (append only)')
    rename(d, 'prjS', 'prc-status-view-projector')
    set(d, 'prjS', { vCores: '1' })
  })

  // AR-149
  // Balances read from the core.
  await failsOn('ar-149', 'Balance checks never reach the core', (d) => draw(d, 'bal -> sys'))
  // Payments posted while the app waits.
  await failsOn('ar-149', 'No chain of sync calls', (d) => draw(d, 'pay -> sys'))
  // No DLQ.
  await failsOn('ar-149', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // The poster never updates the copy.
  await failsOn('ar-149', 'updates the balance copy', (d) => cut(d, 'post -> copy'))
  // A redelivery limit of 10 sends good payments to the DLQ every night.
  await failsOn('ar-149', 'Run: The nightly batch window', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // A queue that is not persistent loses the waiting payments when the broker restarts.
  await failsOn('ar-149', 'Run: The nightly batch window', (d) => set(d, 'q', { persistent: 'no' }))
  // No redelivery limit: refused payments are tried for ever and never reach the DLQ.
  await failsOn('ar-149', 'Run: Some payments are to closed accounts', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The queue named differently, and alerts on the DLQ.
  await passes('ar-149', (d) => {
    rename(d, 'q', 'payment-postings')
    box(d, 'mon', 'monitoring', 'DLQ alerts')
    draw(d, 'post -> mon')
  })
  // No refresh job drawn.
  await passes('ar-149', (d) => unbox(d, 'sync'))
}
