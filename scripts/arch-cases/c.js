// Wrong and other correct diagrams for batch C (ar-118 to ar-135). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename, set }) => {
  // AR-118
  await failsOn('ar-118', 'There is no broker for async work', (d) => swap(d, 'brk -> ret'))
  await failsOn('ar-118', 'There is no broker for async work', (d) => swap(d, 'mcp -> api'))
  await failsOn('ar-118', 'reached only through the ingress gateway', (d) => draw(d, 'chat -> brk'))
  await failsOn('ar-118', 'never calls the MCP server directly', (d) => draw(d, 'chat -> mcp'))
  await failsOn('ar-118', 'Order API is reached only through the MCP server', (d) => draw(d, 'brk -> api'))
  await failsOn('ar-118', 'Run: A busy evening', (d) => set(d, 'brk', { vCores: undefined }))
  await failsOn('ar-118', 'Run: A busy evening', (d) => set(d, 'brk', { vCores: '1', replicas: 2 }))
  await failsOn('ar-118', 'Run: Callers without a client id', (d) => set(d, 'ing', { auth: undefined }))
  // The agents call the MCP server for their tools.
  await passes('ar-118', (d) => {
    cut(d, 'brk -> mcp')
    draw(d, 'ret -> mcp', 'dlv -> mcp')
  })

  // AR-119
  await failsOn('ar-119', 'only from the Policies gateway', (d) => draw(d, 'hr -> proxy'))
  await failsOn('ar-119', 'Token requests and model calls are sync calls', (d) => swap(d, 'proxy -> oai'))
  await failsOn('ar-119', 'Token requests and model calls are sync calls', (d) => swap(d, 'hr -> idp'))
  await failsOn('ar-119', 'Providers are reached only through the Model Proxy', (d) => draw(d, 'inv -> ant'))
  await failsOn('ar-119', 'Run: A caller without a token', (d) => set(d, 'pol', { auth: undefined }))
  // Introspection asks the identity provider about every token.
  await failsOn('ar-119', 'Run: The identity provider is down', (d) => set(d, 'pol', { auth: 'oauth2' }))
  // Usage can reach Budget Management as an async message.
  await passes('ar-119', (d) => swap(d, 'proxy -> bud'))
  // The Policies gateway checks each token with the identity provider.
  await passes('ar-119', (d) => draw(d, 'pol -> idp'))

  // AR-120
  await failsOn('ar-120', 'Runtime calls are sync calls', (d) => swap(d, 'egr -> brg'))
  await failsOn('ar-120', 'Runtime calls are sync calls', (d) => swap(d, 'brg -> af'))
  await failsOn('ar-120', 'Registration lines into the Agents catalog', (d) => draw(d, 'af -> reg'))
  await failsOn('ar-120', 'reached only through the ingress gateway', (d) => draw(d, 'app -> brk'))
  await failsOn('ar-120', 'No bridge sits in front', (d) => draw(d, 'brg -> vx'))
  await failsOn('ar-120', 'Run: Calls without a staff token', (d) => set(d, 'ing', { auth: undefined }))
  await failsOn('ar-120', 'Run: Agentforce stops answering', (d) => set(d, 'brk', { timeoutMs: undefined, circuitBreaker: undefined }))
  // The egress gateway is a role, not a required box.
  await passes('ar-120', (d) => {
    unbox(d, 'egr')
    draw(d, 'brk -> brg', 'brk -> vx')
  })
  // One gateway does both the ingress and egress jobs.
  await passes('ar-120', (d) => {
    unbox(d, 'egr')
    rename(d, 'ing', 'Ingress and egress Omni Gateway')
    draw(d, 'brk -> ing', 'ing -> brg', 'ing -> vx')
  })

  // AR-121
  await failsOn('ar-121', 'call the System API with sync calls', (d) => swap(d, 'ord -> sys'))
  await failsOn('ar-121', 'never connect to the database directly', (d) => draw(d, 'ret -> db'))
  await failsOn('ar-121', 'One System API is shared', (d) => {
    box(d, 'sys2', 'system-api', 'sys-returns-customers-api')
    cut(d, 'ret -> sys')
    draw(d, 'ret -> sys2', 'sys2 -> db')
  })
  await failsOn('ar-121', 'Run: Both teams at peak', (d) => set(d, 'sys', { replicas: undefined, vCores: undefined }))
  await failsOn('ar-121', 'Run: Both teams at peak', (d) => set(d, 'sys', { vCores: '1' }))
  await failsOn('ar-121', 'Run: A zone goes down', (d) => set(d, 'sys', { replicas: undefined, vCores: '0.5' }))
  await failsOn('ar-121', 'Run: A zone goes down', (d) => set(d, 'sys', { vCores: undefined }))
  await passes('ar-121', (d) => rename(d, 'sys', 'sys-customer-db-api'))

  // AR-122
  await failsOn('ar-122', 'read from the ERP with sync calls', (d) => swap(d, 'so -> erp'))
  await failsOn('ar-122', 'read from the TMS with sync calls', (d) => swap(d, 'prc -> ss'))
  await failsOn('ar-122', 'never connects to a backend directly', (d) => draw(d, 'prc -> erp'))
  await failsOn('ar-122', 'do not call each other', (d) => draw(d, 'so -> ss'))
  await failsOn('ar-122', 'Run: Order status in time', (d) => set(d, 'prc', { calls: undefined }))
  await failsOn('ar-122', 'Run: The TMS is down', (d) => set(d, 'prc', { onFailure: undefined }))
  await failsOn('ar-122', 'Run: The TMS stops answering', (d) => set(d, 'ss', { timeoutMs: undefined, circuitBreaker: undefined }))
  // A timeout longer than the answer may take.
  await failsOn('ar-122', 'Run: The TMS stops answering', (d) => set(d, 'ss', { timeoutMs: 5000, circuitBreaker: undefined }))

  // AR-123
  await failsOn('ar-123', 'sync call at every step', (d) => swap(d, 'exp -> prc'))
  await failsOn('ar-123', 'sync call at every step', (d) => swap(d, 'sys -> core'))
  await failsOn('ar-123', 'calls only the Experience API', (d) => draw(d, 'mob -> prc'))
  await failsOn('ar-123', 'reached only through the System API', (d) => draw(d, 'prc -> core'))
  // A limit below the normal load turns away everyday requests.
  await failsOn('ar-123', 'Run: A normal day', (d) => set(d, 'sys', { rateLimit: 10 }))
  await failsOn('ar-123', 'Run: Payday morning', (d) => set(d, 'sys', { rateLimit: undefined }))
  // A limit at the mainframe maximum leaves no margin.
  await failsOn('ar-123', 'Run: Payday morning', (d) => set(d, 'sys', { rateLimit: 40 }))
  // The limit can also sit where the app comes in.
  await passes('ar-123', (d) => {
    set(d, 'sys', { rateLimit: undefined })
    set(d, 'exp', { rateLimit: 28 })
  })

  // AR-124
  await failsOn('ar-124', 'sync call at every step', (d) => swap(d, 'prc -> sys'))
  await failsOn('ar-124', 'never calls the System API directly', (d) => draw(d, 'mob -> sys'))
  await failsOn('ar-124', 'Only the Process API calls', (d) => draw(d, 'exp -> sys'))
  await failsOn('ar-124', 'Run: Monday morning', (d) => set(d, 'sys', { rateLimit: undefined }))
  await failsOn('ar-124', 'Run: Calls without a staff token', (d) => set(d, 'exp', { auth: undefined }))

  // AR-125
  await failsOn('ar-125', 'every call in the path is a sync call', (d) => swap(d, 'gw -> exp'))
  await failsOn('ar-125', 'every call in the path is a sync call', (d) => swap(d, 'exp -> prc'))
  await failsOn('ar-125', 'never calls the Experience API directly', (d) => draw(d, 'web -> exp'))
  await failsOn('ar-125', 'gateway passes requests', (d) => flip(d, 'gw -> exp'))
  await failsOn('ar-125', 'Run: The sale opens', (d) => set(d, 'gw', { rateLimit: undefined }))
  // Buying capacity for the whole spike goes over the budget.
  await failsOn('ar-125', 'Run: The sale opens', (d) => {
    set(d, 'gw', { rateLimit: undefined })
    set(d, 'exp', { vCores: '1' })
    set(d, 'prc', { vCores: '1' })
  })
  await failsOn('ar-125', 'Run: Scrapers without a client id', (d) => set(d, 'gw', { auth: undefined }))

  // AR-126
  await failsOn('ar-126', 'are sync calls', (d) => swap(d, 'gw -> idp'))
  await failsOn('ar-126', 'are sync calls', (d) => swap(d, 'app -> gw'))
  await failsOn('ar-126', 'checks the token', (d) => flip(d, 'gw -> idp'))
  await failsOn('ar-126', 'never calls the Experience API directly', (d) => draw(d, 'app -> exp'))
  await failsOn('ar-126', 'Run: A request without a token', (d) => set(d, 'gw', { auth: undefined }))
  // Introspection asks the identity provider about every token.
  await failsOn('ar-126', 'Run: The identity provider is down', (d) => set(d, 'gw', { auth: 'oauth2' }))

  // AR-127
  // The shared Process API sized for one channel only.
  await failsOn('ar-127', 'Run: Both channels at peak', (d) => set(d, 'prc', { replicas: undefined, vCores: '0.2' }))
  await failsOn('ar-127', 'Run: Both channels at peak', (d) => set(d, 'em', { vCores: '1', replicas: 3 }))
  await failsOn('ar-127', 'Run: One zone goes down', (d) => set(d, 'em', { replicas: undefined }))
  await failsOn('ar-127', 'Run: One zone goes down', (d) => set(d, 'sys', { replicas: undefined, vCores: '1' }))
  await failsOn('ar-127', 'own Experience API', (d) => {
    cut(d, 'mob -> em')
    draw(d, 'mob -> ew')
  })
  // The web store also calls the mobile Experience API.
  await failsOn('ar-127', 'called by one channel', (d) => draw(d, 'web -> em'))
  await failsOn('ar-127', 'never skip their Experience API', (d) => draw(d, 'mob -> prc'))
  await failsOn('ar-127', 'sync calls at every layer', (d) => swap(d, 'em -> prc'))
  await failsOn('ar-127', 'One Process API is shared', (d) => {
    box(d, 'prc2', 'process-api', 'prc-mobile-stock-api')
    cut(d, 'em -> prc')
    draw(d, 'em -> prc2', 'prc2 -> sys')
  })
  await passes('ar-127', (d) => {
    rename(d, 'ew', 'exp-web-store-api')
    rename(d, 'em', 'exp-app-api')
  })

  // AR-128
  await failsOn('ar-128', 'Run: A caller without a client ID', (d) => set(d, 'gw', { auth: undefined }))
  await failsOn('ar-128', 'Run: The courier sends a burst', (d) => set(d, 'gw', { rateLimit: undefined }))
  // A limit far above what the APIs can carry.
  await failsOn('ar-128', 'Run: The courier sends a burst', (d) => set(d, 'gw', { rateLimit: 500 }))
  await failsOn('ar-128', 'every call in the path is a sync call', (d) => swap(d, 'par -> gw'))
  await failsOn('ar-128', 'every call in the path is a sync call', (d) => swap(d, 'prc -> sys'))
  await failsOn('ar-128', 'reaches no API directly', (d) => draw(d, 'par -> exp'))
  await failsOn('ar-128', 'Process API calls the System API', (d) => flip(d, 'prc -> sys'))

  // AR-129
  await failsOn('ar-129', 'Run: Peak bookings', (d) => set(d, 'prc', { vCores: undefined }))
  await failsOn('ar-129', 'Run: Peak bookings', (d) => set(d, 'exp', { vCores: undefined }))
  // The consumer keeps up on a normal day but cannot clear the backlog after an outage.
  await failsOn('ar-129', 'Run: The Label API is down for ten minutes', (d) => set(d, 'prc', { vCores: '0.2' }))
  // The Booking API calls the Label API directly instead of using the queue.
  await failsOn('ar-129', 'Run: The Label API is down for ten minutes', (d) => {
    unbox(d, 'q')
    draw(d, 'exp -> prc')
  })
  await failsOn('ar-129', 'with a sync call', (d) => swap(d, 'web -> exp'))
  await failsOn('ar-129', 'never calls the consumer directly', (d) => draw(d, 'exp -> prc'))
  await failsOn('ar-129', 'consumer takes bookings', (d) => flip(d, 'q ~> prc'))

  // AR-130
  await failsOn('ar-130', 'Run: Every subscriber gets each price', (d) => cut(d, 'top ~> pos'))
  await failsOn('ar-130', 'Run: The weekly price update', (d) => set(d, 'pos', { vCores: undefined }))
  await failsOn('ar-130', 'Run: The weekly price update', (d) => set(d, 'sys', { vCores: undefined }))
  await failsOn('ar-130', 'Run: The tills are offline when the broker restarts', (d) => set(d, 'top', { persistent: 'no' }))
  await failsOn('ar-130', 'with a sync call', (d) => swap(d, 'erp -> sys'))
  await failsOn('ar-130', 'Every subscriber gets', (d) => cut(d, 'top ~> pos'))
  await failsOn('ar-130', 'publisher never calls', (d) => draw(d, 'sys -> web'))
  // A third subscriber is one more line from the topic.
  // It must keep up with the weekly update like the others, so it gets 0.5 vCore too.
  await passes('ar-130', (d) => {
    box(d, 'app', 'process-api', 'Mobile app prices (subscriber)', { vCores: '0.5' })
    draw(d, 'top ~> app')
  })

  // AR-131
  await failsOn('ar-131', 'Run: A batch of poison messages', (d) => set(d, 'q', { maxRedelivery: undefined }))
  await failsOn('ar-131', 'Run: A batch of poison messages', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // A delivery limit with no DLQ drops the poison messages.
  await failsOn('ar-131', 'Run: A batch of poison messages', (d) => cut(d, 'q ~> dlq'))
  // The API calls the consumer directly, so changes fail while it is down.
  await failsOn('ar-131', 'Run: The Address update API is down', (d) => {
    unbox(d, 'q')
    draw(d, 'exp -> prc')
  })
  await failsOn('ar-131', 'never calls the consumer directly', (d) => draw(d, 'exp -> prc'))
  await failsOn('ar-131', 'main queue is an async message', (d) => draw(d, 'q -> mon'))
  await failsOn('ar-131', 'Only the queue feeds', (d) => draw(d, 'prc ~> dlq'))
  await failsOn('ar-131', 'Someone is told', (d) => flip(d, 'dlq -> mon'))
  // The statement leaves the kind of the alert line open.
  await passes('ar-131', (d) => swap(d, 'dlq -> mon'))

  // AR-132
  await failsOn('ar-132', 'Run: The nightly run', (d) => set(d, 'job', { vCores: undefined }))
  await failsOn('ar-132', 'Run: The nightly run', (d) => set(d, 'sys', { vCores: '2', replicas: 2 }))
  await failsOn('ar-132', 'Run: The ERP drops some calls', (d) => set(d, 'sys', { retries: undefined }))
  await failsOn('ar-132', 'reads and writes with sync calls', (d) => swap(d, 'job -> dwh'))
  await failsOn('ar-132', 'reads and writes with sync calls', (d) => swap(d, 'sys -> erp'))
  await failsOn('ar-132', 'never calls the ERP directly', (d) => draw(d, 'job -> erp'))
  await failsOn('ar-132', 'not wired straight', (d) => draw(d, 'erp -> dwh'))
  await failsOn('ar-132', 'System API to read sales', (d) => flip(d, 'job -> sys'))

  // AR-133
  // The reader is sized for the normal rate only, so it cannot catch up in time.
  await failsOn('ar-133', 'Run: Shipping is down for twenty minutes', (d) => set(d, 'shp', { vCores: undefined }))
  // The order API calls shipping directly instead of publishing to Kafka.
  await failsOn('ar-133', 'Run: Shipping is down for twenty minutes', (d) => {
    unbox(d, 'ks')
    draw(d, 'ord -> shp')
  })
  await failsOn('ar-133', 'Run: Kafka restarts during an outage', (d) => set(d, 'ks', { persistent: 'no' }))
  await failsOn('ar-133', 'books the transport with a sync call', (d) => swap(d, 'shp -> tms'))
  await failsOn('ar-133', 'never calls the shipping API directly', (d) => draw(d, 'ord -> shp'))
  await failsOn('ar-133', 'Reads and writes to a data store', (d) => swap(d, 'ord -> db'))

  // AR-134
  await failsOn('ar-134', 'calls the Process API with a sync call', (d) => swap(d, 'c1 -> prc'))
  await failsOn('ar-134', 'reached only through the load balancer', (d) => draw(d, 'web -> c2'))
  await failsOn('ar-134', 'same Process API', (d) => cut(d, 'c2 -> prc'))
  await passes('ar-134', (d) => {
    box(d, 'c3', 'experience-api', 'Checkout API copy 3')
    draw(d, 'lb -> c3', 'c3 -> prc')
  })

  // AR-135
  await failsOn('ar-135', 'Run: A stock count file', (d) => set(d, 'job', { vCores: '0.2' }))
  await failsOn('ar-135', 'Run: A stock count file', (d) => set(d, 'sys', { vCores: '1', replicas: 2 }))
  await failsOn('ar-135', 'Run: The WMS has lock errors', (d) => set(d, 'sys', { retries: undefined }))
  await failsOn('ar-135', 'its lines are sync calls', (d) => swap(d, 'job -> sftp'))
  await failsOn('ar-135', 'its lines are sync calls', (d) => swap(d, 'job -> sys'))
  await failsOn('ar-135', 'writes to the WMS with a sync call', (d) => swap(d, 'sys -> wms'))
  await failsOn('ar-135', 'never talks to the job', (d) => draw(d, 'ptr -> job'))
  await failsOn('ar-135', 'reached only through the System API', (d) => draw(d, 'job -> wms'))
  // A file drop at the partner edge can be drawn either way.
  await passes('ar-135', (d) => swap(d, 'ptr -> sftp'))
}
