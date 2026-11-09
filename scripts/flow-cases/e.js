// Wrong and other correct designs for batch E (fl-114 to fl-120). See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, handlerFor, flowOf, remove, step, scope, handler, subFlow, createNode }) => {
  const move = (list, type, to) => {
    const node = remove(list, type)
    list.splice(to < 0 ? list.length + to + 1 : to, 0, node)
    return node
  }

  // FL-114
  // The old design: the email is sent inside the API flow.
  await failsOn('fl-114', 'not in the API flow', (d) => {
    flowOf(d, 'signup').steps.splice(2, 0, step('email-send', { toAddresses: '#[payload.email]', subject: 'Welcome' }))
  })
  // The listener reads a different queue name, so nothing is ever picked up.
  await failsOn('fl-114', 'reads the same queue', (d) => {
    flowOf(d, 'welcome').source.config.queueName = 'welcome-email'
  })
  // Publish before the insert: an email can go out for a customer that was never saved.
  await failsOn('fl-114', 'before the VM Publish', (d) => {
    move(flowOf(d, 'signup').steps, 'vm-publish', 0)
  })
  // The response is built before the publish.
  await failsOn('fl-114', 'after the VM Publish', (d) => {
    move(flowOf(d, 'signup').steps, 'transform', 0)
  })
  // Everything in one flow with an Async scope instead of a VM queue.
  await failsOn('fl-114', 'two flows', (d) => {
    d.flows = [d.flows[0]]
    d.flows[0].steps.splice(1, 1, scope('async', {}, [step('email-send', { toAddresses: '#[payload.email]', subject: 'Welcome' })]))
  })
  // The queue is named after something else.
  await failsOn('fl-114', 'welcome-emails', (d) => {
    one(d, 'vm-publish').config.queueName = 'emails'
    flowOf(d, 'welcome').source.config.queueName = 'emails'
  })
  // The email flow first loads a template.
  await passes('fl-114', (d) => {
    flowOf(d, 'welcome').steps.splice(1, 0, step('parse-template', { location: 'templates/welcome.html' }))
    one(d, 'email-send').config.contentType = 'text/html'
  })
  // The insert names a schema, and a Logger sits between the publish and the response.
  await passes('fl-114', (d) => {
    one(d, 'db-insert').config.sql = 'INSERT INTO crm.customers (email, first_name) VALUES (:email, :firstName)'
    flowOf(d, 'signup').steps.splice(2, 0, step('logger', { message: 'Signup queued' }))
  })

  // FL-115
  // The call sits before the Cache scope, so it runs on every request.
  await failsOn('fl-115', 'inside the Cache scope', (d) => {
    const cache = one(d, 'cache')
    const call = remove(cache.steps, 'http-request')
    d.flows[0].steps.unshift(call)
  })
  // The default caching strategy, with no expiry chosen.
  await failsOn('fl-115', 'own caching strategy', (d) => {
    one(d, 'cache').config.cachingStrategy = 'default'
  })
  // A blank caching strategy.
  await failsOn('fl-115', 'own caching strategy', (d) => {
    one(d, 'cache').config.cachingStrategy = ''
  })
  // The reshaping happens after the scope, so the 300 KB response is cached.
  await failsOn('fl-115', 'small result is what gets cached', (d) => {
    const cache = one(d, 'cache')
    d.flows[0].steps.push(remove(cache.steps, 'transform'))
  })
  // The cache-miss log is outside the scope, so it runs on every request and proves nothing.
  await failsOn('fl-115', 'records each cache miss', (d) => {
    const cache = one(d, 'cache')
    d.flows[0].steps.unshift(remove(cache.steps, 'logger'))
  })
  // A POST endpoint.
  await failsOn('fl-115', 'accepts GET', (d) => {
    d.flows[0].source.config.allowedMethods = 'POST'
  })
  // The log line reads differently, and a request log sits before the scope too.
  await passes('fl-115', (d) => {
    one(d, 'logger').config.message = '#["Cache MISS for currency list"]'
    d.flows[0].steps.unshift(step('logger', { level: 'DEBUG', message: 'GET /currencies' }))
  })
  // The listener allows GET and HEAD, and the strategy has another name.
  await passes('fl-115', (d) => {
    d.flows[0].source.config.allowedMethods = 'GET, HEAD'
    one(d, 'cache').config.cachingStrategy = 'referenceDataOneHour'
  })

  // FL-116
  // The first version: a sequential For Each.
  await failsOn('fl-116', 'not a sequential For Each', (d) => {
    one(d, 'parallel-foreach').type = 'foreach'
  })
  // No limit worth the name: 50 at once breaks the gateway.
  await failsOn('fl-116', 'between 6 and 8', (d) => {
    one(d, 'parallel-foreach').config.maxConcurrency = 50
  })
  // The palette default of 4 misses the 90 second window.
  await failsOn('fl-116', 'between 6 and 8', (d) => {
    one(d, 'parallel-foreach').config.maxConcurrency = 4
  })
  // No timeout on the store call.
  await failsOn('fl-116', 'response timeout', (d) => {
    one(d, 'http-request').config.responseTimeout = 0
  })
  // No Try inside the loop: one failure fails the run with MULE:COMPOSITE_ROUTING.
  await failsOn('fl-116', 'caught inside the loop', (d) => {
    const loop = one(d, 'parallel-foreach')
    const tryScope = loop.steps.find((n) => n.type === 'try')
    loop.steps.splice(loop.steps.indexOf(tryScope), 1, ...tryScope.steps)
    d.flows[0].errorHandlers = [handler('on-error-continue', { type: 'MULE:COMPOSITE_ROUTING' }, [step('logger', { message: 'Some stores failed' })])]
  })
  // Each row is marked one by one inside the loop.
  await failsOn('fl-116', 'after the loop', (d) => {
    const steps = d.flows[0].steps
    d.flows[0].steps = steps.filter((n) => !['db-bulk-update', 'transform'].includes(n.type))
    one(d, 'try').steps.push(step('db-bulk-update', { sql: "UPDATE slot_updates SET status = 'SENT' WHERE update_id = :updateId" }))
  })
  // 6 at a time leaves room for other apps on the same gateway.
  await passes('fl-116', (d) => {
    one(d, 'parallel-foreach').config.maxConcurrency = 6
  })
  // The handler names the HTTP errors one by one, and the timeout is the full 5 seconds.
  await passes('fl-116', (d) => {
    handlerFor(d, 'ANY').config.type = 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE, HTTP:BAD_REQUEST'
    one(d, 'http-request').config.responseTimeout = 5000
  })

  // FL-117
  // The current flow: one long Until Successful and nothing else.
  await failsOn('fl-117', 'Quick retries stay short', (d) => {
    Object.assign(one(d, 'until-successful').config, { maxRetries: 20, millisBetweenRetries: 60000 })
  })
  // The handler catches the HTTP error by name, which never reaches it: Until Successful raises RETRY_EXHAUSTED.
  await failsOn('fl-117', 'MULE:RETRY_EXHAUSTED', (d) => {
    handlerFor(d, 'RETRY_EXHAUSTED').config.type = 'HTTP:SERVICE_UNAVAILABLE'
  })
  // The slow retry goes back to the main queue, so there is no delay at all.
  await failsOn('fl-117', 'delayed queue for a slow retry', (d) => {
    one(d, 'mq-publish', (n) => n.config.destination.includes('delayed')).config.destination = 'label-requests'
  })
  // Nobody reads the delayed queue.
  await failsOn('fl-117', 'reads the delayed queue', (d) => {
    d.flows.splice(1, 1)
  })
  // No limit on slow retries: the DLQ is never used.
  await failsOn('fl-117', 'sends the request to the DLQ', (d) => {
    const choice = one(d, 'choice')
    const handlerNode = handlerFor(d, 'RETRY_EXHAUSTED')
    handlerNode.steps = choice.routes[0].steps
  })
  // The delayed subscriber copies the steps instead of sharing them.
  await failsOn('fl-117', 'one sub-flow', (d) => {
    const shared = d.flows.find((f) => f.kind === 'sub-flow')
    d.flows[0].steps = structuredClone(shared.steps)
    d.flows[1].steps = structuredClone(shared.steps)
    d.flows = d.flows.filter((f) => f !== shared)
  })
  // The listener reads the wrong queue.
  await failsOn('fl-117', 'reads the label-requests queue', (d) => {
    d.flows[0].source.config.destination = 'labels'
  })
  // Retries 2 seconds apart, 3 times, and the route reads the attempt straight from the payload.
  await passes('fl-117', (d) => {
    Object.assign(one(d, 'until-successful').config, { maxRetries: 3, millisBetweenRetries: 2000 })
    one(d, 'choice').routes[0].config.expression = '#[(payload.retryAttempt default 0) < 4]'
  })
  // The DLQ publish sits on the route and the delayed publish in the otherwise branch.
  await passes('fl-117', (d) => {
    const choice = one(d, 'choice')
    const delayed = choice.routes[0].steps
    choice.routes[0].steps = choice.otherwise
    choice.otherwise = delayed
    choice.routes[0].config.expression = '#[vars.attempt >= 4]'
  })

  // FL-118
  // The old design: no 404 handling inside the routes.
  await failsOn('fl-118', 'does not fall through to the backup', (d) => {
    for (const t of all(d, 'try')) t.errorHandlers = []
  })
  // A catch-all inside the routes: the backup is never used.
  await failsOn('fl-118', 'outages still move on', (d) => {
    for (const h of all(d, 'on-error-continue')) h.config.type = 'ANY'
  })
  // The backup is tried first.
  await failsOn('fl-118', 'the primary provider first', (d) => {
    one(d, 'first-successful').routes.reverse()
  })
  // The primary waits 10 seconds, using up the budget.
  await failsOn('fl-118', 'within 2 seconds', (d) => {
    one(d, 'http-request', (n) => n.config.path.includes('primary')).config.responseTimeout = 10000
  })
  // Both failing returns 500.
  await failsOn('fl-118', 'returns 503', (d) => {
    handlerFor(d, 'ANY').steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  // An unknown address returns 200 with found: false.
  await failsOn('fl-118', 'returns 404', (d) => {
    one(d, 'choice').routes[0].steps.shift()
  })
  // Scatter-Gather in place of First Successful.
  await failsOn('fl-118', 'First Successful has two routes', (d) => {
    one(d, 'first-successful').type = 'scatter-gather'
  })
  // The 404 handlers also catch HTTP:BAD_REQUEST, and the status is a number.
  await passes('fl-118', (d) => {
    for (const h of all(d, 'on-error-continue')) h.config.type = 'HTTP:NOT_FOUND, HTTP:BAD_REQUEST'
    handlerFor(d, 'ANY').steps.find((n) => n.type === 'set-variable').config.value = '#[503]'
  })
  // The flow handler has no type, which also catches everything, and the primary timeout is 1 second.
  await passes('fl-118', (d) => {
    handlerFor(d, 'ANY').config.type = ''
    one(d, 'http-request', (n) => n.config.path.includes('primary')).config.responseTimeout = 1000
  })

  // FL-119
  // The first version: the clock as the watermark.
  await failsOn('fl-119', 'not the clock', (d) => {
    one(d, 'os-store').config.value = '#[now() as String]'
    remove(one(d, 'choice').routes[0].steps, 'set-variable')
  })
  // A plain insert fails on a repeat.
  await failsOn('fl-119', 'upsert', (d) => {
    one(d, 'db-bulk-insert').config.sql = 'INSERT INTO tickets (id, subject, status, priority, updated_at) VALUES (:id, :subject, :status, :priority, :updatedAt)'
  })
  // The watermark is stored before the write.
  await failsOn('fl-119', 'only after the database write', (d) => {
    const steps = one(d, 'choice').routes[0].steps
    move(steps, 'os-store', 1)
  })
  // The watermark is moved in the error handler too.
  await failsOn('fl-119', 'never moved from an error handler', (d) => {
    handlerFor(d, 'ANY').steps.push(step('os-store', { key: 'helpdesk-tickets-watermark', value: '#[vars.newWatermark default vars.since]', objectStore: 'ticketSyncStore' }))
  })
  // No Choice: an empty run stores max([]), which is null.
  await failsOn('fl-119', 'no tickets come back', (d) => {
    const choice = one(d, 'choice')
    d.flows[0].steps.splice(d.flows[0].steps.indexOf(choice), 1, ...choice.routes[0].steps)
  })
  // The watermark is stored in the otherwise branch as well.
  await failsOn('fl-119', 'no tickets come back', (d) => {
    one(d, 'choice').otherwise.push(step('os-store', { key: 'helpdesk-tickets-watermark', value: '#[vars.since]', objectStore: 'ticketSyncStore' }))
  })
  // The watermark is read after the call.
  await failsOn('fl-119', 'read from the Object Store before', (d) => {
    const steps = d.flows[0].steps
    const call = remove(steps, 'http-request')
    steps.unshift(call)
  })
  // One insert per ticket in a For Each, with the max computed in the store itself.
  await passes('fl-119', (d) => {
    const route = one(d, 'choice').routes[0]
    route.steps = [
      step('set-variable', { variableName: 'tickets', value: '#[payload.tickets]' }),
      scope('foreach', { collection: '#[vars.tickets]' }, [
        step('db-insert', { sql: 'INSERT INTO tickets (id, status, updated_at) VALUES (:id, :status, :updatedAt) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at' }),
      ]),
      step('os-store', { key: 'helpdesk-tickets-watermark', value: '#[max(vars.tickets.updated_at)]', objectStore: 'ticketSyncStore' }),
    ]
  })
  // Tickets come oldest first, so the last ticket's updated_at is the new watermark.
  await passes('fl-119', (d) => {
    one(d, 'set-variable', (n) => n.config.variableName === 'newWatermark').config.value = '#[payload.tickets[-1].updated_at]'
  })
  // The route tests for an empty list the other way round.
  await passes('fl-119', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[not isEmpty(payload.tickets default [])]'
  })

  // FL-120
  // The developer's version: no Try inside the Async scope, no limit.
  await failsOn('fl-120', 'caught inside the Async scope', (d) => {
    const asyncScope = one(d, 'async')
    const tryScope = asyncScope.steps.find((n) => n.type === 'try')
    asyncScope.steps.splice(asyncScope.steps.indexOf(tryScope), 1, ...tryScope.steps)
    asyncScope.config.maxConcurrency = 0
  })
  await failsOn('fl-120', 'max concurrency of 30 to 64', (d) => {
    one(d, 'async').config.maxConcurrency = 0
  })
  // A tiny limit: the cap is hit in normal running.
  await failsOn('fl-120', 'max concurrency of 30 to 64', (d) => {
    one(d, 'async').config.maxConcurrency = 4
  })
  // The fraud call is on the main path, so the caller waits.
  await failsOn('fl-120', 'inside an Async scope', (d) => {
    const steps = flowOf(d, 'authorise').steps
    const asyncScope = steps.find((n) => n.type === 'async')
    steps.splice(steps.indexOf(asyncScope), 1, ...asyncScope.steps)
  })
  // The signal is sent before the payment is authorised.
  await failsOn('fl-120', 'after the payment is authorised', (d) => {
    move(flowOf(d, 'authorise').steps, 'async', 0)
  })
  // No timeout on the fraud call.
  await failsOn('fl-120', 'times out within 3 seconds', (d) => {
    one(d, 'http-request', (n) => n.config.path.includes('fraud')).config.responseTimeout = 30000
  })
  // The retry flow listens on another queue.
  await failsOn('fl-120', 'reads the same VM queue', (d) => {
    flowOf(d, 'retry').source.config.queueName = 'fraud-retry'
  })
  // Failed retries are only logged.
  await failsOn('fl-120', 'parked in a database table', (d) => {
    remove(handlerFor(d, 'RETRY_EXHAUSTED').steps, 'db-insert')
  })
  // Retries 1 second apart do not ride out a blip.
  await failsOn('fl-120', 'at least 5 seconds apart', (d) => {
    one(d, 'until-successful').config.millisBetweenRetries = 1000
  })
  // A larger cap and HTTP errors named one by one.
  await passes('fl-120', (d) => {
    one(d, 'async').config.maxConcurrency = 48
    handlerFor(d, 'ANY').config.type = 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE, HTTP:INTERNAL_SERVER_ERROR'
  })
  // A Logger after the response, and slow retries a minute apart.
  await passes('fl-120', (d) => {
    flowOf(d, 'authorise').steps.push(step('logger', { message: '#["Payment " ++ vars.authorisation.paymentId ++ " answered"]' }))
    Object.assign(one(d, 'until-successful').config, { maxRetries: 10, millisBetweenRetries: 60000 })
  })
}
