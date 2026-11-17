// Wrong and other correct diagrams for integration scenarios uc-121 to uc-125. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, draw, box, unbox, rename, set }) => {
  // UC-121
  // The Experience API still calls the provider itself.
  await failsOn('uc-121', 'never calls the provider itself', (d) => draw(d, 'exp -> sms'))
  // No queue: the Experience API calls the Process API over HTTP.
  await failsOn('uc-121', 'puts each hold on a queue', (d) => {
    cut(d, 'exp ~> q')
    draw(d, 'exp -> prc')
  })
  // No dead-letter queue.
  await failsOn('uc-121', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // Every member gets a text, whatever they chose.
  await failsOn('uc-121', 'how each member wants to be told', (d) => cut(d, 'prc -> mem'))
  // A redelivery limit of 5 sends good holds to the DLQ during an outage.
  await failsOn('uc-121', 'Run: The provider is down for 20 minutes', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // No redelivery limit: wrong numbers are tried for ever and never reach the DLQ.
  await failsOn('uc-121', 'Run: Some members have a wrong phone number', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // Other names and a monitoring box.
  await passes('uc-121', (d) => {
    rename(d, 'q', 'hold-ready-notifications')
    box(d, 'mon', 'monitoring', 'DLQ alerts')
    draw(d, 'prc -> mon')
  })
  // Texts and emails through two providers.
  await passes('uc-121', (d) => {
    rename(d, 'sms', 'SMS provider')
    box(d, 'mail', 'notification', 'Email provider')
    draw(d, 'prc -> mail')
  })

  // UC-122
  // The Experience API captures the payment while the CPMS waits.
  await failsOn('uc-122', 'never waits for the payment provider', (d) => draw(d, 'exp -> sysPay'))
  // No tariff cache.
  await failsOn('uc-122', 'reads the tariffs from a cache', (d) => unbox(d, 'tar'))
  // The billing API calls the provider directly.
  await failsOn('uc-122', 'payment provider is reached only through a System API', (d) => draw(d, 'bill -> psp'))
  // One consumer does both steps, so an ERP outage stops the captures.
  await failsOn('uc-122', 'billing Process API never calls the ERP', (d) => {
    unbox(d, 'q2')
    unbox(d, 'dlq2')
    unbox(d, 'inv')
    draw(d, 'bill -> sysErp')
  })
  // No DLQ for charged sessions.
  await failsOn('uc-122', 'Every queue has a dead-letter queue', (d) => unbox(d, 'dlq2'))
  // A short redelivery limit on the ERP queue sends good postings to the DLQ during the maintenance hour.
  await failsOn('uc-122', 'Run: The ERP is down for an hour', (d) => set(d, 'q2', { maxRedelivery: 10 }))
  // No redelivery limit on the sessions queue: declined cards are tried for ever.
  await failsOn('uc-122', 'Run: Some payments are declined', (d) => set(d, 'q1', { maxRedelivery: undefined }))
  // Other names, and a monitoring box.
  await passes('uc-122', (d) => {
    rename(d, 'q2', 'sessions-billed')
    rename(d, 'tar', 'Tariff cache (Object Store v2)')
    box(d, 'mon', 'monitoring', 'Queue depth alerts')
    draw(d, 'inv -> mon')
  })

  // UC-123
  // The availability API asks the vendor on a cache miss.
  await failsOn('uc-123', 'No app or partner request reaches the IoT platform', (d) => draw(d, 'avl -> iot'))
  // Partners call their Experience API directly.
  await failsOn('uc-123', 'Partners come in through the API gateway', (d) => {
    cut(d, 'nav -> gw')
    draw(d, 'nav -> expP')
  })
  // The city app shares the partners' gateway and its rate limit.
  await failsOn('uc-123', 'No gateway is shared', (d) => {
    cut(d, 'app -> expA')
    draw(d, 'app -> gw', 'gw -> expA')
  })
  // No cache.
  await failsOn('uc-123', 'reads through a cache', (d) => unbox(d, 'cache'))
  // Bay events are counted while the vendor waits.
  await failsOn('uc-123', 'Bay events are queued', (d) => {
    cut(d, 'expS ~> q')
    draw(d, 'expS -> occ')
  })
  // No rate limit: the partner flood reaches the APIs.
  await failsOn('uc-123', 'Run: A partner app floods the API', (d) => set(d, 'gw', { rateLimit: undefined }))
  // The availability API on the smallest size.
  await failsOn('uc-123', 'Run: Saturday afternoon', (d) => set(d, 'avl', { vCores: undefined }))
  // The city app has a gateway of its own.
  await passes('uc-123', (d) => {
    box(d, 'gwA', 'api-gateway', 'City app gateway (JWT)')
    cut(d, 'app -> expA')
    draw(d, 'app -> gwA', 'gwA -> expA')
  })
  // No DLQ drawn, and the cache named differently.
  await passes('uc-123', (d) => {
    unbox(d, 'dlq')
    rename(d, 'cache', 'Free spaces cache, 30 s')
  })

  // UC-124
  // The Process API asks the SIS for results it has not got.
  await failsOn('uc-124', 'No student request reaches the SIS', (d) => draw(d, 'prc -> sys'))
  // The loader never fills the read store.
  await failsOn('uc-124', 'The loader writes the results read store', (d) => cut(d, 'load -> store'))
  // The notifier calls the provider for each student.
  await failsOn('uc-124', 'No job calls the email and SMS provider directly', (d) => draw(d, 'note -> msg'))
  // The gateway does not know the identity provider.
  await failsOn('uc-124', 'validates tokens', (d) => cut(d, 'gw -> idp'))
  // The loader reads the SIS database directly.
  await failsOn('uc-124', 'only through the System API', (d) => draw(d, 'load -> sis'))
  // One replica each: the 09:00 peak gets 503.
  await failsOn('uc-124', 'Run: Results go live at 09:00', (d) => set(d, 'exp', { replicas: undefined }))
  // The notifier on the smallest size cannot queue 250 messages a second.
  await failsOn('uc-124', 'Run: Every student is told', (d) => set(d, 'note', { vCores: undefined }))
  // A cache for released results and another name for the store.
  await passes('uc-124', (d) => {
    rename(d, 'store', 'Published results database')
    box(d, 'c', 'cache', 'Released results cache')
    draw(d, 'prc -> c')
  })

  // UC-125
  // The clearance API emails the customer itself, around the topic.
  await failsOn('uc-125', 'Every route to the customer passes the cleared invoices topic', (d) => draw(d, 'clr -> cust'))
  // The clearance API calls the platform directly.
  await failsOn('uc-125', 'tax authority is reached only through a System API', (d) => draw(d, 'clr -> tax'))
  // Nobody records the status.
  await failsOn('uc-125', 'records each invoice\'s status', (d) => unbox(d, 'st'))
  // One subscriber does delivery and the ERP update.
  await failsOn('uc-125', 'Two subscribers', (d) => {
    unbox(d, 'upd')
    draw(d, 'dlv -> sysE')
  })
  // No DLQ.
  await failsOn('uc-125', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // A short redelivery limit gives up good invoices during an outage.
  await failsOn('uc-125', 'Run: The clearance platform is down for an hour', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No redelivery limit: refused invoices are tried for ever.
  await failsOn('uc-125', 'Run: Invoices with bad master data', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // A third subscriber feeds tax reporting.
  await passes('uc-125', (d) => {
    box(d, 'rep', 'process-api', 'prc-tax-reporting')
    box(d, 'dwh', 'data-warehouse', 'Finance warehouse')
    draw(d, 'topic ~> rep', 'rep -> dwh')
  })
  // The status store named differently.
  await passes('uc-125', (d) => rename(d, 'st', 'Clearance tracking database'))
}
