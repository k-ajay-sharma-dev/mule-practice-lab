// Wrong and other correct diagrams for batch C (ar-118 to ar-135). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }) => {
  // AR-118
  await failsOn('ar-118', 'There is no broker for async work', (d) => swap(d, 'brk -> ret'))
  await failsOn('ar-118', 'There is no broker for async work', (d) => swap(d, 'mcp -> api'))
  await failsOn('ar-118', 'reached only through the ingress gateway', (d) => draw(d, 'chat -> brk'))
  await failsOn('ar-118', 'never calls the MCP server directly', (d) => draw(d, 'chat -> mcp'))
  await failsOn('ar-118', 'Order API is reached only through the MCP server', (d) => draw(d, 'brk -> api'))
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
  await passes('ar-121', (d) => rename(d, 'sys', 'sys-customer-db-api'))

  // AR-122
  await failsOn('ar-122', 'read from the ERP with sync calls', (d) => swap(d, 'so -> erp'))
  await failsOn('ar-122', 'read from the TMS with sync calls', (d) => swap(d, 'prc -> ss'))
  await failsOn('ar-122', 'never connects to a backend directly', (d) => draw(d, 'prc -> erp'))
  await failsOn('ar-122', 'do not call each other', (d) => draw(d, 'so -> ss'))

  // AR-123
  await failsOn('ar-123', 'sync call at every step', (d) => swap(d, 'exp -> prc'))
  await failsOn('ar-123', 'sync call at every step', (d) => swap(d, 'sys -> core'))
  await failsOn('ar-123', 'calls only the Experience API', (d) => draw(d, 'mob -> prc'))
  await failsOn('ar-123', 'reached only through the System API', (d) => draw(d, 'prc -> core'))

  // AR-124
  await failsOn('ar-124', 'sync call at every step', (d) => swap(d, 'prc -> sys'))
  await failsOn('ar-124', 'never calls the System API directly', (d) => draw(d, 'mob -> sys'))
  await failsOn('ar-124', 'Only the Process API calls', (d) => draw(d, 'exp -> sys'))

  // AR-125
  await failsOn('ar-125', 'every call in the path is a sync call', (d) => swap(d, 'gw -> exp'))
  await failsOn('ar-125', 'every call in the path is a sync call', (d) => swap(d, 'exp -> prc'))
  await failsOn('ar-125', 'never calls the Experience API directly', (d) => draw(d, 'web -> exp'))
  await failsOn('ar-125', 'gateway passes requests', (d) => flip(d, 'gw -> exp'))

  // AR-126
  await failsOn('ar-126', 'are sync calls', (d) => swap(d, 'gw -> idp'))
  await failsOn('ar-126', 'are sync calls', (d) => swap(d, 'app -> gw'))
  await failsOn('ar-126', 'checks the token', (d) => flip(d, 'gw -> idp'))
  await failsOn('ar-126', 'never calls the Experience API directly', (d) => draw(d, 'app -> exp'))

  // AR-127
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
  await failsOn('ar-128', 'every call in the path is a sync call', (d) => swap(d, 'par -> gw'))
  await failsOn('ar-128', 'every call in the path is a sync call', (d) => swap(d, 'prc -> sys'))
  await failsOn('ar-128', 'reaches no API directly', (d) => draw(d, 'par -> exp'))
  await failsOn('ar-128', 'Process API calls the System API', (d) => flip(d, 'prc -> sys'))

  // AR-129
  await failsOn('ar-129', 'with a sync call', (d) => swap(d, 'web -> exp'))
  await failsOn('ar-129', 'never calls the consumer directly', (d) => draw(d, 'exp -> prc'))
  await failsOn('ar-129', 'consumer takes bookings', (d) => flip(d, 'q ~> prc'))

  // AR-130
  await failsOn('ar-130', 'with a sync call', (d) => swap(d, 'erp -> sys'))
  await failsOn('ar-130', 'Every subscriber gets', (d) => cut(d, 'top ~> pos'))
  await failsOn('ar-130', 'publisher never calls', (d) => draw(d, 'sys -> web'))
  // A third subscriber is one more line from the topic.
  await passes('ar-130', (d) => {
    box(d, 'app', 'process-api', 'Mobile app prices (subscriber)')
    draw(d, 'top ~> app')
  })

  // AR-131
  await failsOn('ar-131', 'never calls the consumer directly', (d) => draw(d, 'exp -> prc'))
  await failsOn('ar-131', 'main queue is an async message', (d) => draw(d, 'q -> mon'))
  await failsOn('ar-131', 'Only the queue feeds', (d) => draw(d, 'prc ~> dlq'))
  await failsOn('ar-131', 'Someone is told', (d) => flip(d, 'dlq -> mon'))
  // The statement leaves the kind of the alert line open.
  await passes('ar-131', (d) => swap(d, 'dlq -> mon'))

  // AR-132
  await failsOn('ar-132', 'reads and writes with sync calls', (d) => swap(d, 'job -> dwh'))
  await failsOn('ar-132', 'reads and writes with sync calls', (d) => swap(d, 'sys -> erp'))
  await failsOn('ar-132', 'never calls the ERP directly', (d) => draw(d, 'job -> erp'))
  await failsOn('ar-132', 'not wired straight', (d) => draw(d, 'erp -> dwh'))
  await failsOn('ar-132', 'System API to read sales', (d) => flip(d, 'job -> sys'))

  // AR-133
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
  await failsOn('ar-135', 'its lines are sync calls', (d) => swap(d, 'job -> sftp'))
  await failsOn('ar-135', 'its lines are sync calls', (d) => swap(d, 'job -> sys'))
  await failsOn('ar-135', 'writes to the WMS with a sync call', (d) => swap(d, 'sys -> wms'))
  await failsOn('ar-135', 'never talks to the job', (d) => draw(d, 'ptr -> job'))
  await failsOn('ar-135', 'reached only through the System API', (d) => draw(d, 'job -> wms'))
  // A file drop at the partner edge can be drawn either way.
  await passes('ar-135', (d) => swap(d, 'ptr -> sftp'))
}
