// Wrong and other correct designs for batch B (fl-032 to fl-046, fl-048, fl-050 to fl-060). See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, handlerFor, flowOf, remove, step, scope, handler, subFlow, createNode }) => {
  // FL-032
  await failsOn('fl-032', 'before the Payment API call', (d) => {
    const steps = flowOf(d, 'checkout-api').steps
    const entry = steps.splice(1, 1)[0]
    steps.splice(steps.findIndex((n) => n.type === 'http-request') + 1, 0, entry)
  })
  await failsOn('fl-032', 'published to order-confirmed', (d) => {
    one(d, 'mq-publish').config.destination = 'orders'
  })
  await failsOn('fl-032', 'published to order-confirmed', (d) => {
    const steps = flowOf(d, 'checkout-api').steps
    const publish = remove(steps, 'mq-publish')
    steps.splice(1, 0, publish)
  })
  await failsOn('fl-032', 'notification flow logs', (d) => {
    for (const n of flowOf(d, 'consumer').steps) if (n.type === 'logger') n.config.message = 'Confirmation step'
  })
  await failsOn('fl-032', 'return the correlation ID', (d) => {
    handlerFor(d, 'ANY').steps.find((n) => n.type === 'transform').config.script = '%dw 2.0\noutput application/json\n---\n{ code: "CHECKOUT_FAILED" }'
  })
  // The ID in the error body set with Set Payload instead of Transform, and a VM hand-off instead of Anypoint MQ.
  await passes('fl-032', (d) => {
    const h = handlerFor(d, 'ANY')
    h.steps[h.steps.length - 1] = step('set-payload', { value: '#[output application/json --- { code: "CHECKOUT_FAILED", correlationId: correlationId }]' })
    Object.assign(one(d, 'mq-publish'), { type: 'vm-publish', config: { queueName: 'order-confirmed' } })
    Object.assign(flowOf(d, 'consumer').source, { type: 'vm-listener', config: { queueName: 'order-confirmed', transactionalAction: 'NONE', transactionType: 'LOCAL' } })
  })

  // FL-033
  await failsOn('fl-033', 'iterated in chunks', (d) => {
    for (const n of all(d, 'foreach')) n.config.batchSize = 1
  })
  await failsOn('fl-033', 'no team sees a partial file', (d) => {
    const loop = d.flows[0].steps.find((n) => n.type === 'foreach' && n.config.collection.includes('regions'))
    remove(loop.steps, 'file-move')
    loop.steps.find((n) => n.type === 'file-write').config.path = '#["/data/sales/out/" ++ vars.region ++ "/" ++ vars.fileName]'
  })
  await failsOn('fl-033', 'archived only after all region files', (d) => {
    const steps = d.flows[0].steps
    const archive = steps.splice(steps.findIndex((n) => n.type === 'file-move'), 1)[0]
    steps.unshift(archive)
  })
  await failsOn('fl-033', 'moved to an error folder', (d) => {
    handlerFor(d, 'ANY').steps.find((n) => n.type === 'file-move').config.targetPath = '/data/sales/archive'
  })
  await failsOn('fl-033', 'appended to per-region part files', (d) => {
    for (const n of all(d, 'file-write')) n.config.mode = 'OVERWRITE'
  })
  // Each region file is finished in the work folder and then moved into out, and the handler continues.
  await passes('fl-033', (d) => {
    const loop = d.flows[0].steps.find((n) => n.type === 'foreach' && n.config.collection.includes('regions'))
    loop.steps.find((n) => n.type === 'file-write').config.path = '#[vars.runDir ++ "/" ++ vars.region ++ ".xml"]'
    Object.assign(loop.steps.find((n) => n.type === 'file-move').config, {
      sourcePath: '#[vars.runDir ++ "/" ++ vars.region ++ ".xml"]',
      targetPath: '#["/data/sales/out/" ++ vars.region]',
      renameTo: '#[vars.fileName]',
    })
    handlerFor(d, 'ANY').type = 'on-error-continue'
  })

  // FL-034
  await failsOn('fl-034', 'not inline in the API flow', (d) => {
    const main = flowOf(d, 'post-order')
    main.steps.splice(0, 1, ...flowOf(d, 'validate-order').steps)
    d.flows = d.flows.filter((f) => f.name !== 'validate-order')
    d.flows.push(subFlow('audit-order', [step('logger', { level: 'INFO', message: 'order received' })]))
  })
  await failsOn('fl-034', 'from the country Choice', (d) => {
    const choice = flowOf(d, 'post-order').steps.find((n) => n.type === 'choice')
    choice.otherwise = [step('set-variable', { variableName: 'httpStatus', value: '422' })]
  })
  await failsOn('fl-034', 'fits the 2 s SLA', (d) => {
    one(d, 'http-request', (n) => n.config.path.includes('na-fulfilment')).config.responseTimeout = 30000
  })
  await failsOn('fl-034', 'answered with 422', (d) => {
    handlerFor(d, 'APP:').steps.find((n) => n.type === 'set-variable').config.value = '#[500]'
  })
  await failsOn('fl-034', 'answered with 503', (d) => {
    handlerFor(d, 'HTTP:').steps.find((n) => n.type === 'set-variable').config.value = '#[500]'
  })
  // Customer lookup and pricing run in parallel, as the solution suggests when latency is tight.
  await passes('fl-034', (d) => {
    const steps = flowOf(d, 'post-order').steps
    const gather = createNode('scatter-gather')
    gather.routes[0].steps = [steps[1]]
    gather.routes[1].steps = [steps[2]]
    steps.splice(1, 2, gather)
  })

  // FL-035
  await failsOn('fl-035', 'answers without waiting', (d) => {
    const steps = flowOf(d, 'intake').steps
    steps.splice(steps.findIndex((n) => n.type === 'vm-publish'), 0, step('sf-upsert', { objectType: 'Order', externalIdField: 'Order_Number__c' }))
  })
  await failsOn('fl-035', 'runs in a transaction', (d) => {
    flowOf(d, 'apply').source.config.transactionalAction = 'NONE'
  })
  await failsOn('fl-035', 'commits a failed status update', (d) => {
    flowOf(d, 'apply').errorHandlers[0].type = 'on-error-continue'
  })
  await failsOn('fl-035', 'not in the status update flow', (d) => {
    const route = flowOf(d, 'apply').steps.find((n) => n.type === 'choice').routes[0]
    route.steps.splice(1, 0, flowOf(d, 'notify').steps.find((n) => n.type === 'sf-upsert'))
    remove(flowOf(d, 'notify').steps, 'sf-upsert')
  })
  await failsOn('fl-035', 'only when the status is SHIPPED', (d) => {
    const steps = flowOf(d, 'notify').steps
    const choice = remove(steps, 'choice')
    steps.push(...choice.routes[0].steps)
  })
  // A duplicate-key On Error Continue in the transacted flow is fine: only a catch-all would lose updates.
  await passes('fl-035', (d) => {
    flowOf(d, 'apply').errorHandlers.unshift(handler('on-error-continue', { type: 'APP:DUPLICATE_UPDATE' }, [step('logger', { level: 'INFO', message: 'duplicate ignored' })]))
  })

  // FL-036
  const otherwise036 = (d) => flowOf(d, 'worker').steps.find((n) => n.type === 'choice').otherwise
  await failsOn('fl-036', 'instead of calling the merchant in-line', (d) => {
    const steps = flowOf(d, 'intake').steps
    steps.splice(steps.length - 1, 0, step('http-request', { method: 'POST', path: '/merchant-webhook', responseTimeout: 900 }))
  })
  await failsOn('fl-036', 'closes the circuit again', (d) => {
    remove(otherwise036(d), 'os-store')
  })
  await failsOn('fl-036', 'not by holding a thread', (d) => {
    const steps = otherwise036(d)
    const i = steps.findIndex((n) => n.type === 'http-request')
    steps[i] = scope('until-successful', { maxRetries: 12, millisBetweenRetries: 300000 }, [steps[i]])
  })
  await failsOn('fl-036', 'go straight to the DLQ', (d) => {
    handlerFor(d, 'BAD_REQUEST').steps.find((n) => n.type === 'mq-publish').config.destination = 'webhook-relay'
  })
  await failsOn('fl-036', 'updates the failure count', (d) => {
    remove(handlerFor(d, 'CONNECTIVITY').steps, 'os-store')
  })
  // The failure bookkeeping lives in a sub-flow behind a Flow Reference.
  await passes('fl-036', (d) => {
    const h = handlerFor(d, 'CONNECTIVITY')
    const work = h.steps.splice(0, 2)
    d.flows.push(subFlow('record-merchant-failure', work))
    h.steps.unshift(step('flow-ref', { name: 'record-merchant-failure' }))
  })

  // FL-037
  await failsOn('fl-037', 'no other API calls the ERP directly', (d) => {
    const gather = one(d, 'scatter-gather')
    gather.routes[0].steps = [step('wsc-consume', { operation: 'GetSalesOrder' })]
  })
  await failsOn('fl-037', 'within the 3 s mobile budget', (d) => {
    one(d, 'http-request', (n) => n.config.path.includes('/process/')).config.responseTimeout = 10000
  })
  // The ERP System API caches its SOAP answer.
  await passes('fl-037', (d) => {
    const steps = flowOf(d, 'sys-erp').steps
    steps[0] = scope('cache', { cachingStrategy: 'erp-orders' }, [steps[0]])
  })

  // FL-038
  await failsOn('fl-038', 'every night at 01:30', (d) => {
    Object.assign(d.flows[0].source.config, { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'DAYS' })
  })
  await failsOn('fl-038', 'Approved payments', (d) => {
    one(d, 'db-select').config.sql = 'SELECT payment_id, beneficiary_iban, amount, currency FROM payments ORDER BY payment_id'
  })
  await failsOn('fl-038', 'then moved or renamed into the pickup folder', (d) => {
    remove(d.flows[0].steps, 'sftp-move')
    one(d, 'sftp-write').config.path = '#["/outbound/payments/" ++ vars.fileName]'
  })
  await failsOn('fl-038', 'only after the file is published', (d) => {
    const steps = d.flows[0].steps
    const update = remove(steps, 'db-bulk-update')
    steps.splice(steps.findIndex((n) => n.type === 'sftp-write'), 0, update)
  })
  // A .tmp file in the pickup folder renamed when complete, and rows locked as IN_PROGRESS first.
  await passes('fl-038', (d) => {
    const steps = d.flows[0].steps
    one(d, 'sftp-write').config.path = '#["/outbound/payments/" ++ vars.fileName ++ ".tmp"]'
    steps[steps.findIndex((n) => n.type === 'sftp-move')] = step('sftp-rename', { path: '#["/outbound/payments/" ++ vars.fileName ++ ".tmp"]', to: '#[vars.fileName]' })
    steps.splice(2, 0, step('db-update', { sql: "UPDATE payments SET status = 'IN_PROGRESS' WHERE status = 'APPROVED'" }))
  })

  // FL-039
  const step039 = (d, name) => one(d, 'batch-job').routes.find((r) => r.config.name === name)
  await failsOn('fl-039', 'upserted on Legacy_Customer_No__c', (d) => {
    one(d, 'sf-upsert').config.externalIdField = 'Id'
  })
  await failsOn('fl-039', 'not stop on bad records', (d) => {
    one(d, 'batch-job').config.maxFailedRecords = 0
  })
  await failsOn('fl-039', 'emailed once from On Complete', (d) => {
    const job = one(d, 'batch-job')
    const email = remove(job.onComplete, 'email-send')
    step039(d, 'record-failures').steps.push(email)
  })
  await failsOn('fl-039', 'emailed once from On Complete', (d) => {
    const email = remove(one(d, 'batch-job').onComplete, 'email-send')
    d.flows[0].steps.push(email)
  })
  await failsOn('fl-039', 'accepts only good records', (d) => {
    step039(d, 'load-salesforce').config.acceptPolicy = 'ALL'
  })
  await failsOn('fl-039', 'step that accepts ONLY_FAILURES', (d) => {
    step039(d, 'record-failures').config.acceptPolicy = 'ALL'
  })
  // Failures kept in a file leave out the migration tables the scenario lists.
  await failsOn('fl-039', 'every call, read and write', (d) => {
    const job = one(d, 'batch-job')
    job.routes = job.routes.filter((r) => r.config.name !== 'mark-migrated')
    step039(d, 'record-failures').steps = [step('file-write', { path: '#["/migration/errors/" ++ vars.waveId ++ ".csv"]', mode: 'APPEND' })]
  })

  // FL-040
  await failsOn('fl-040', 'catches its own failure', (d) => {
    const gather = one(d, 'scatter-gather')
    gather.routes[1].steps = gather.routes[1].steps[0].steps
  })
  await failsOn('fl-040', 'cannot create duplicate accounts', (d) => {
    remove(d.flows[0].steps, 'idempotent')
  })
  await failsOn('fl-040', 'identity account is created first', (d) => {
    const steps = d.flows[0].steps
    const okta = remove(steps, 'http-request')
    const gather = one(d, 'scatter-gather')
    gather.routes.unshift({ ...gather.routes[0], id: 'okta-route', steps: [okta] })
  })
  // Look the user up in Okta before creating it, instead of an Idempotent Message Validator.
  await passes('fl-040', (d) => {
    const steps = d.flows[0].steps
    remove(steps, 'idempotent')
    steps.splice(steps.findIndex((n) => n.type === 'http-request'), 0, step('http-request', { method: 'GET', path: '/okta/api/v1/users?search=employeeNumber', responseTimeout: 5000 }))
  })

  // FL-041
  await failsOn('fl-041', 'never acknowledged', (d) => {
    handlerFor(d, 'ANY').steps = [step('mq-ack', { ackToken: '#[vars.ackToken]' })]
  })
  await failsOn('fl-041', 'runs in the background', (d) => {
    const steps = flowOf(d, 'replay-api').steps
    const i = steps.findIndex((n) => n.type === 'async')
    steps.splice(i, 1, ...steps[i].steps)
  })
  await failsOn('fl-041', 'carry a replay marker', (d) => {
    one(d, 'foreach').steps[0].config.script = '%dw 2.0\noutput application/json\n---\nread(payload.body, "application/json")'
  })
  await failsOn('fl-041', 'recorded for audit by the replay API', (d) => {
    const steps = flowOf(d, 'replay-api').steps
    remove(steps, 'db-insert')
    remove(one(d, 'async').steps, 'db-update')
    flowOf(d, 'archiver').steps.splice(2, 0, step('db-update', { sql: 'UPDATE event_stats SET archived = archived + 1' }))
  })
  await failsOn('fl-041', 'before the replay starts', (d) => {
    const steps = flowOf(d, 'replay-api').steps
    const checks = steps.splice(0, 2)
    steps.push(...checks)
  })
  // The replay goes to the exchange, so every consumer gets the events again.
  await failsOn('fl-041', 'never to the order-events exchange', (d) => {
    one(d, 'mq-publish').config.destination = 'order-events'
  })
  await failsOn('fl-041', 'never to the order-events exchange', (d) => {
    one(d, 'mq-publish').config.destination = '#["order-events"]'
  })
  // The queue name is built from the chosen consumer.
  await passes('fl-041', (d) => {
    one(d, 'mq-publish').config.destination = '#["order-events." ++ vars.request.consumer]'
  })
  // The replay is handed to a VM queue and a worker flow publishes the events.
  await passes('fl-041', (d) => {
    const steps = flowOf(d, 'replay-api').steps
    const i = steps.findIndex((n) => n.type === 'async')
    const work = steps[i].steps
    steps[i] = step('vm-publish', { queueName: 'replay-jobs' })
    d.flows.push({ ...d.flows[0], id: 'replay-worker', name: 'replay-worker', source: step('vm-listener', { queueName: 'replay-jobs' }), steps: work, errorHandlers: [] })
  })

  // FL-042
  await failsOn('fl-042', 'never back to the system it listens to', (d) => {
    flowOf(d, 'sf-to-erp').steps.push(step('sf-upsert', { objectType: 'Account', externalIdField: 'ERP_Customer_No__c' }))
  })
  await failsOn('fl-042', 'stamps last_modified_by', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE customers SET name = :name, phone = :phone, updated_at = CURRENT_TIMESTAMP WHERE customer_no = :customerNo'
  })
  await failsOn('fl-042', 'ERP_Customer_No__c external ID', (d) => {
    one(d, 'sf-upsert').config.externalIdField = 'Id'
  })
  const choice042 = (d, name) => flowOf(d, name).steps.find((n) => n.type === 'choice').routes[0].config
  // The Salesforce side compares timestamps instead of asking who made the change.
  await failsOn('fl-042', 'tests whether the integration user', (d) => {
    choice042(d, 'sf-to-erp').expression = '#[payload.LastModifiedDate <= vars.lastSyncedAt]'
  })
  // The ERP side tests a field that does not tell who wrote the row.
  await failsOn('fl-042', 'tests last_modified_by', (d) => {
    choice042(d, 'erp-to-sf').expression = '#[payload.updated_at == payload.created_at]'
  })
  // The integration user is recognised by user name.
  await passes('fl-042', (d) => {
    choice042(d, 'sf-to-erp').expression = '#[payload.LastModifiedBy.Username == p("sf.username")]'
    choice042(d, 'erp-to-sf').expression = "#[upper(payload.last_modified_by default '') == 'MULE_SYNC']"
  })
  // The ERP side is polled by a Scheduler with a watermark query instead of a table listener.
  await passes('fl-042', (d) => {
    const f = flowOf(d, 'erp-to-sf')
    f.source = step('scheduler', { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'MINUTES' })
    f.steps = [step('db-select', { sql: 'SELECT * FROM customers WHERE updated_at > :watermark' }), scope('foreach', { collection: '#[payload]' }, f.steps)]
  })

  // FL-043
  await failsOn('fl-043', 'max 10,000 records', (d) => {
    one(d, 'validation').config.expression = '#[not isEmpty(payload.items default [])]'
  })
  await failsOn('fl-043', 'never calls the PIM core itself', (d) => {
    const loop = flowOf(d, 'submit').steps.find((n) => n.type === 'foreach')
    loop.steps = [step('http-request', { method: 'POST', path: '/pim-core/products/batch', responseTimeout: 30000 })]
  })
  await failsOn('fl-043', 'job record is created before', (d) => {
    const steps = flowOf(d, 'submit').steps
    const insert = remove(steps, 'db-insert')
    steps.splice(steps.findIndex((n) => n.type === 'foreach') + 1, 0, insert)
  })
  await failsOn('fl-043', 'poll job progress', (d) => {
    remove(flowOf(d, 'status').steps, 'db-select')
  })
  await failsOn('fl-043', 'recorded in the job status', (d) => {
    handlerFor(d, 'ANY').steps = [step('mq-ack', { ackToken: '#[vars.ackToken]' })]
  })
  // A VM queue between submit and worker.
  await passes('fl-043', (d) => {
    Object.assign(one(d, 'mq-publish'), { type: 'vm-publish', config: { queueName: 'pim-bulk-chunks' } })
    const worker = flowOf(d, 'worker')
    worker.source = step('vm-listener', { queueName: 'pim-bulk-chunks', transactionalAction: 'ALWAYS_BEGIN' })
    worker.steps = worker.steps.filter((n) => n.type !== 'mq-ack' && n.config.variableName !== 'ackToken')
    for (const h of worker.errorHandlers) h.steps = h.steps.filter((n) => n.type !== 'mq-ack')
  })

  // FL-044
  await failsOn('fl-044', 'acknowledged only after successful processing', (d) => {
    const steps = flowOf(d, 'worker').steps
    const ack = remove(steps, 'mq-ack')
    steps.splice(2, 0, ack)
  })
  await failsOn('fl-044', 'never calls the slow claims system', (d) => {
    const steps = flowOf(d, 'intake').steps
    steps.splice(steps.findIndex((n) => n.type === 'mq-publish'), 0, step('wsc-consume', { operation: 'SubmitClaim' }))
  })
  await failsOn('fl-044', 'verifies the checksum', (d) => {
    remove(flowOf(d, 'worker').steps, 'validation')
  })
  await failsOn('fl-044', 'returned to the queue (Nack)', (d) => {
    const h = flowOf(d, 'worker').errorHandlers[0]
    h.steps = h.steps.map((n) => (n.type === 'mq-nack' ? step('mq-ack', { ackToken: '#[vars.ackToken]' }) : n))
  })
  // A System API over HTTP leaves out the SubmitClaim operation the scenario lists.
  await failsOn('fl-044', 'every call, read and write', (d) => {
    Object.assign(one(d, 'wsc-consume'), { type: 'http-request', config: { method: 'POST', path: '/sys-claims/v1/claims', responseTimeout: 60000 } })
  })

  // FL-045
  await failsOn('fl-045', 'outside the retry scope', (d) => {
    const loop = flowOf(d, 'create-hold').steps.find((n) => n.type === 'foreach')
    const choice = remove(loop.steps, 'choice')
    loop.steps[0].steps.push(choice)
  })
  await failsOn('fl-045', 'lines already reserved are released', (d) => {
    remove(flowOf(d, 'create-hold').errorHandlers[0].steps, 'flow-ref')
  })
  await failsOn('fl-045', 'answered with 409', (d) => {
    flowOf(d, 'create-hold').errorHandlers[0].steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  await failsOn('fl-045', 'within 2 minutes', (d) => {
    Object.assign(flowOf(d, 'sweeper').source.config, { frequency: 15, timeUnit: 'MINUTES' })
  })
  await failsOn('fl-045', 'only if it has not expired', (d) => {
    one(d, 'db-update', (n) => n.config.sql.includes("SET status = 'COMMITTED'")).config.sql = "UPDATE inventory_hold SET status = 'COMMITTED' WHERE hold_id = :holdId"
  })
  // Expiry is checked by one update and the commit is a second update with no expiry check, so a hold can
  // expire between the two and still be committed.
  await failsOn('fl-045', 'only if it has not expired', (d) => {
    const steps = flowOf(d, 'commit-hold').steps
    const i = steps.findIndex((n) => n.type === 'db-update')
    steps.splice(i, 1,
      step('db-update', { sql: 'UPDATE inventory_hold SET checked_at = CURRENT_TIMESTAMP WHERE hold_id = :holdId AND expires_at > CURRENT_TIMESTAMP' }),
      step('db-update', { sql: "UPDATE inventory_hold SET status = 'COMMITTED' WHERE hold_id = :holdId" }))
  })
  await passes('fl-045', (d) => {
    one(d, 'db-update', (n) => n.config.sql.includes("SET status = 'COMMITTED'")).config.sql =
      "UPDATE inventory_hold SET status = 'COMMITTED', committed_at = NOW() WHERE hold_id = :holdId AND NOW() < expires_at"
  })
  // The sweeper runs every 30 seconds, and the hold expiry lives in an Object Store entry TTL.
  await passes('fl-045', (d) => {
    Object.assign(flowOf(d, 'sweeper').source.config, { frequency: 30, timeUnit: 'SECONDS' })
    const steps = flowOf(d, 'create-hold').steps
    steps.splice(steps.findIndex((n) => n.type === 'db-insert'), 0, step('os-store', { key: '#[vars.holdId]', value: '#[vars.cart]', objectStore: 'holds-15min' }))
  })

  // FL-046
  const bureauHandler = (d) => one(d, 'try').errorHandlers[0]
  await failsOn('fl-046', 'Only connectivity/timeout-type HTTP errors', (d) => {
    bureauHandler(d).config.type = 'ANY'
  })
  await failsOn('fl-046', 'Only connectivity/timeout-type HTTP errors', (d) => {
    bureauHandler(d).config.type += ', HTTP:BAD_REQUEST'
  })
  await failsOn('fl-046', 'the handler writes the breaker state', (d) => {
    bureauHandler(d).steps = bureauHandler(d).steps.filter((n) => n.config.name !== 'cb-record-failure')
  })
  // The open circuit answers with an error instead of the fallback.
  await failsOn('fl-046', 'open-circuit route and from the Try handler', (d) => {
    flowOf(d, 'credit-check-api').steps.find((n) => n.type === 'choice').routes[0].steps = [step('raise-error', { type: 'APP:CIRCUIT_OPEN', description: 'Bureau unavailable' })]
  })
  // A bureau outage is recorded, but the caller gets no fallback answer.
  await failsOn('fl-046', 'open-circuit route and from the Try handler', (d) => {
    bureauHandler(d).steps = bureauHandler(d).steps.filter((n) => n.config.name !== 'credit-fallback')
  })
  await failsOn('fl-046', 'within the 2 s SLA', (d) => {
    one(d, 'http-request').config.responseTimeout = 30000
  })
  // The handler names each outage type on its own, and the open-circuit fallback is built inline.
  await passes('fl-046', (d) => {
    bureauHandler(d).config.type = 'HTTP:TIMEOUT, HTTP:CONNECTIVITY'
    const route = flowOf(d, 'credit-check-api').steps.find((n) => n.type === 'choice').routes[0]
    route.steps = [step('set-payload', { value: '#[output application/json --- { customerId: vars.customerId, decision: "MANUAL_REVIEW", source: "FALLBACK" }]' })]
  })
  // The open route tests a flag, and the handler builds the fallback inline after recording the failure.
  await passes('fl-046', (d) => {
    flowOf(d, 'credit-check-api').steps.find((n) => n.type === 'choice').routes[0].config.expression = '#[vars.cb.isOpen]'
    bureauHandler(d).steps = [
      step('flow-ref', { name: 'cb-record-failure' }),
      step('set-payload', { value: '#[output application/json --- { customerId: vars.customerId, decision: "MANUAL_REVIEW", source: "FALLBACK" }]' }),
    ]
  })

  // FL-048
  await failsOn('fl-048', 'never a System API', (d) => {
    const steps = flowOf(d, 'exp-partner').steps
    steps.unshift(step('http-request', { method: 'GET', path: '/sys-oms/v1/orders?customerId={customerId}', responseTimeout: 3000 }))
  })
  await failsOn('fl-048', 'only through a System API', (d) => {
    flowOf(d, 'prc-').steps[0] = step('db-select', { sql: 'SELECT * FROM oms_order WHERE customer_id = :customerId' })
  })
  await failsOn('fl-048', 'answers in XML', (d) => {
    flowOf(d, 'exp-partner').steps.find((n) => n.type === 'transform').config.script = '%dw 2.0\noutput application/json\n---\npayload'
  })
  // The mobile API turns a missing customer into an empty list with On Error Continue.
  await passes('fl-048', (d) => {
    handlerFor(d, 'NOT_FOUND').type = 'on-error-continue'
  })

  // FL-050
  const choice050 = (d) => flowOf(d, 'prc-').steps.find((n) => n.type === 'choice')
  await failsOn('fl-050', 'the Experience API never calls them', (d) => {
    flowOf(d, 'exp-').steps.unshift(step('http-request', { method: 'GET', path: '/sys-crm/v1/customers/{customerId}', responseTimeout: 1500 }))
  })
  await failsOn('fl-050', 'one per customer type', (d) => {
    const steps = flowOf(d, 'prc-').steps
    const erp = choice050(d).routes[0].steps.pop()
    choice050(d).routes[0].steps = [step('logger', { level: 'INFO', message: 'B2B customer' })]
    steps.splice(steps.indexOf(choice050(d)), 0, erp)
  })
  await failsOn('fl-050', 'Availability is checked after pricing', (d) => {
    const steps = flowOf(d, 'prc-').steps
    const stock = steps.splice(steps.findIndex((n) => n.type === 'http-request' && n.config.path.includes('inventory')), 1)[0]
    steps.splice(steps.indexOf(choice050(d)), 0, stock)
  })
  await failsOn('fl-050', 'not a 500', (d) => {
    handlerFor(d, 'NOT_FOUND').steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  // The Choice names the B2C case and leaves B2B to the default route.
  await passes('fl-050', (d) => {
    const c = choice050(d)
    const erp = c.routes[0].steps
    c.routes[0].config.expression = '#[vars.customer.segment == "B2C"]'
    c.routes[0].steps = c.otherwise
    c.otherwise = erp
  })

  // FL-051
  const routes051 = (d) => one(d, 'scatter-gather').routes
  await failsOn('fl-051', 'inside the 2.5 s SLA', (d) => {
    one(d, 'scatter-gather').config.timeout = 10000
  })
  await failsOn('fl-051', 'Cards and loans fail softly', (d) => {
    const r = routes051(d)[2]
    r.steps = r.steps[0].steps
  })
  await failsOn('fl-051', 'Core banking is not soft-failed', (d) => {
    const r = routes051(d)[0]
    r.steps = [scope('try', {}, r.steps, { errorHandlers: [handler('on-error-continue', { type: 'ANY' }, [step('set-payload', { value: '#[{ source: "core", unavailable: true }]' })])] })]
  })
  await failsOn('fl-051', 'mapped to 503', (d) => {
    handlerFor(d, 'COMPOSITE_ROUTING').steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  await failsOn('fl-051', 'timeout below the scope timeout', (d) => {
    routes051(d)[0].steps[0].config.responseTimeout = 5000
  })
  // The optional routes log nothing and the 503 body is built with a Transform.
  await passes('fl-051', (d) => {
    for (const h of all(d, 'on-error-continue')) h.steps = h.steps.filter((n) => n.type !== 'logger')
    const h = handlerFor(d, 'COMPOSITE_ROUTING')
    h.steps[h.steps.length - 1] = step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "CORE_UNAVAILABLE" }' })
  })

  // FL-052
  await failsOn('fl-052', 'Cache scope in the Experience API', (d) => {
    const exp = flowOf(d, 'exp-').steps
    const i = exp.findIndex((n) => n.type === 'cache')
    const cache = exp[i]
    exp[i] = cache.steps[0]
    const prc = flowOf(d, 'prc-').steps
    prc[0] = scope('cache', cache.config, [prc[0]])
  })
  await failsOn('fl-052', 'category and the locale', (d) => {
    one(d, 'set-variable').config.value = '#[attributes.uriParams.categoryId ++ ":" ++ attributes.headers.authorization]'
    one(d, 'cache').config.cachingStrategy = 'catalog-10min (key = vars.cacheKey, TTL 600 s)'
  })
  await failsOn('fl-052', 'mapped to a clear status (504)', (d) => {
    handlerFor(d, 'TIMEOUT').steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  // The web model is shaped inside the cache, so the final shape is cached.
  await passes('fl-052', (d) => {
    const exp = flowOf(d, 'exp-').steps
    const transform = remove(exp, 'transform')
    one(d, 'cache').steps.push(transform)
    exp.push(step('transform', { script: '%dw 2.0\noutput application/json\n---\npayload' }))
  })

  // FL-053
  await failsOn('fl-053', 'after the CRM System API call', (d) => {
    const steps = flowOf(d, 'prc-customer-onboarding').steps
    const tryScope = steps.splice(steps.findIndex((n) => n.type === 'try'), 1)[0]
    steps.splice(1, 0, tryScope)
  })
  await failsOn('fl-053', 'not called on the signup path', (d) => {
    const steps = flowOf(d, 'prc-customer-onboarding').steps
    steps.splice(3, 0, step('http-request', { method: 'POST', path: '/sys-marketing/v1/contacts', responseTimeout: 2000 }))
  })
  await failsOn('fl-053', 'marks them sent only after the publish', (d) => {
    const loop = flowOf(d, 'outbox-relay').steps.find((n) => n.type === 'foreach')
    const update = remove(loop.steps, 'db-update')
    loop.steps.splice(1, 0, update)
  })
  await failsOn('fl-053', 'copes with duplicate events', (d) => {
    remove(flowOf(d, 'welcome').steps, 'idempotent')
  })
  // The subscriber checks a processed-events table, and the relay deletes rows it has sent.
  await passes('fl-053', (d) => {
    const welcome = flowOf(d, 'welcome').steps
    welcome[welcome.findIndex((n) => n.type === 'idempotent')] = step('db-select', { sql: 'SELECT 1 FROM processed_events WHERE event_id = :eventId' })
    const loop = flowOf(d, 'outbox-relay').steps.find((n) => n.type === 'foreach')
    loop.steps[loop.steps.findIndex((n) => n.type === 'db-update')] = step('db-delete', { sql: 'DELETE FROM event_outbox WHERE event_id = :eventId' })
  })

  // FL-054
  const fs054 = (d) => one(d, 'first-successful')
  await failsOn('fl-054', 'and in no other layer', (d) => {
    const r = fs054(d).routes[0]
    r.steps[0] = scope('until-successful', { maxRetries: 2, millisBetweenRetries: 500 }, [r.steps[0]])
  })
  await failsOn('fl-054', 'tried only after both providers', (d) => {
    const routes = fs054(d).routes
    routes.unshift(routes.pop())
  })
  await failsOn('fl-054', 'refresh the last-known-good copy', (d) => {
    remove(flowOf(d, 'prc-').steps, 'choice')
  })
  await failsOn('fl-054', 'the Process API returns a clear 503', (d) => {
    flowOf(d, 'prc-').errorHandlers[0].steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  await failsOn('fl-054', 'small enough to fit the caller timeout', (d) => {
    one(d, 'until-successful').config.millisBetweenRetries = 60000
  })
  // The Process API catches the routing error by its own type, and the secondary System API retries too.
  await passes('fl-054', (d) => {
    flowOf(d, 'prc-').errorHandlers[0].config.type = 'MULE:ROUTING'
    const steps = flowOf(d, 'sys-fx-secondary').steps
    steps[0] = scope('until-successful', { maxRetries: 1, millisBetweenRetries: 500 }, [steps[0]])
  })

  // FL-055
  const handlers055 = (d, flow, type) => flowOf(d, flow).errorHandlers.find((h) => h.config.type.includes(type))
  await failsOn('fl-055', 'validated at the edge', (d) => {
    const steps = flowOf(d, 'exp-web').steps
    steps.splice(1, 0, steps.shift())
  })
  await failsOn('fl-055', 'typed error in the payment System API', (d) => {
    const steps = flowOf(d, 'sys-payment').steps
    steps[1] = steps[1].otherwise[0]
  })
  await failsOn('fl-055', 'a slow downstream is answered with 504', (d) => {
    handlers055(d, 'exp-web', 'HTTP:TIMEOUT').steps[0].config.value = '503'
  })
  await failsOn('fl-055', 'Database errors in the order System API are mapped', (d) => {
    for (const h of flowOf(d, 'sys-oms').errorHandlers) h.steps[0].config.value = '500'
  })
  await failsOn('fl-055', 'carries the correlation ID', (d) => {
    handlers055(d, 'exp-web', 'ANY').steps[2] = step('set-payload', { value: '#[output application/json --- { code: "INTERNAL", message: error.detailedDescription }]' })
  })
  // A duplicate key maps to 422 in sys-oms, and the 500 body is built with a Transform.
  await passes('fl-055', (d) => {
    handlers055(d, 'sys-oms', 'QUERY_EXECUTION').steps[0].config.value = '422'
    handlers055(d, 'exp-web', 'ANY').steps[2] = step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "INTERNAL", correlationId: correlationId }' })
  })

  // FL-056
  const order056 = (d) => flowOf(d, 'prc-order').steps
  const erpTry056 = (d) => order056(d).find((n) => n.type === 'try')
  await failsOn('fl-056', 'Neither channel calls a System API directly', (d) => {
    flowOf(d, 'exp-web').steps.splice(1, 0, step('http-request', { method: 'GET', path: '/sys-crm/v1/accounts/{customerId}', responseTimeout: 1500 }))
  })
  await failsOn('fl-056', 'credit hold is rejected with 422', (d) => {
    const steps = order056(d)
    steps.splice(steps.findIndex((n) => n.type === 'choice'), 1)
  })
  await failsOn('fl-056', 'authorised before the ERP sales order', (d) => {
    const steps = order056(d)
    const t = steps.splice(steps.indexOf(erpTry056(d)), 1)[0]
    steps.splice(steps.findIndex((n) => n.type === 'http-request') + 1, 0, t)
  })
  await failsOn('fl-056', 'the authorisation is voided', (d) => {
    erpTry056(d).errorHandlers[0].steps = [step('logger', { level: 'ERROR', message: 'ERP order failed' })]
  })
  await failsOn('fl-056', 'the authorisation is voided', (d) => {
    erpTry056(d).errorHandlers[0].type = 'on-error-continue'
  })
  await failsOn('fl-056', 'Duplicate submissions are caught', (d) => {
    remove(order056(d), 'idempotent')
  })
  await failsOn('fl-056', 'returned to the queue', (d) => {
    for (const h of flowOf(d, 'prc-fulfilment').errorHandlers) h.steps = h.steps.filter((n) => n.type !== 'mq-nack')
  })
  // Fulfilment failures nack from an On Error Continue, which is fine with manual acknowledgement.
  await passes('fl-056', (d) => {
    const h = flowOf(d, 'prc-fulfilment').errorHandlers.find((x) => x.type === 'on-error-propagate')
    h.type = 'on-error-continue'
  })

  // FL-057
  await failsOn('fl-057', 'commit together in one database transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  await failsOn('fl-057', 'commit together in one database transaction', (d) => {
    const t = one(d, 'try')
    const header = remove(t.steps, 'db-insert')
    const steps = d.flows[0].steps
    steps.splice(steps.indexOf(t), 0, header)
  })
  await failsOn('fl-057', 'archive folder only after the load', (d) => {
    const steps = d.flows[0].steps
    const move = remove(steps, 'sftp-move')
    steps.splice(1, 0, move)
  })
  await failsOn('fl-057', 'moved to the error folder', (d) => {
    handlerFor(d, 'ANY').steps.find((n) => n.type === 'sftp-move').config.targetPath = '/counts/archive'
  })
  // BEGIN_OR_JOIN also starts the transaction here, and the handler continues after moving the file.
  await passes('fl-057', (d) => {
    one(d, 'try').config.transactionalAction = 'BEGIN_OR_JOIN'
    handlerFor(d, 'ANY').type = 'on-error-continue'
  })

  // FL-058
  await failsOn('fl-058', 'retail.price.changed topic', (d) => {
    one(d, 'jms-publish').config.destinationType = 'QUEUE'
  })
  await failsOn('fl-058', 'the check comes before the publish', (d) => {
    const steps = d.flows[0].steps
    const publish = remove(steps, 'jms-publish')
    steps.splice(steps.findIndex((n) => n.type === 'db-update') + 1, 0, publish)
  })
  await failsOn('fl-058', 'answered with 404', (d) => {
    handlerFor(d, 'APP:').steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  await failsOn('fl-058', 'asks the tool to retry with 503', (d) => {
    handlerFor(d, 'JMS:').steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  // No Raise Error: the Choice answers 404 itself and only the default route publishes.
  await passes('fl-058', (d) => {
    const steps = d.flows[0].steps
    const choice = steps.find((n) => n.type === 'choice')
    const rest = steps.splice(steps.indexOf(choice) + 1)
    choice.routes[0].steps = [step('set-variable', { variableName: 'httpStatus', value: '404' }), step('set-payload', { value: '#[output application/json --- { error: "Unknown SKU or zone" }]' })]
    choice.otherwise = rest
  })

  // FL-059
  await failsOn('fl-059', 'at least every 5 minutes', (d) => {
    Object.assign(d.flows[0].source.config, { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'HOURS' })
  })
  await failsOn('fl-059', 'never a CONFIRMED one', (d) => {
    one(d, 'db-delete').config.sql = 'DELETE FROM STOCK_RESERVATION\nWHERE EXPIRES_AT < :cutoff'
  })
  await failsOn('fl-059', 'begins a transaction', (d) => {
    const t = one(d, 'try')
    const update = remove(t.steps, 'db-update')
    const steps = d.flows[0].steps
    steps.splice(steps.indexOf(t), 0, update)
  })
  await failsOn('fl-059', 'begins a transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // A fixed frequency of 2 minutes, and the error handler propagates (a scheduler has no caller).
  await passes('fl-059', (d) => {
    Object.assign(d.flows[0].source.config, { strategy: 'fixed-frequency', frequency: 2, timeUnit: 'MINUTES' })
    handlerFor(d, 'ANY').type = 'on-error-propagate'
  })

  // FL-060
  await failsOn('fl-060', 'not the topic itself', (d) => {
    d.flows[0].source.config.destination = 'VirtualTopic.POS.SALES'
  })
  await failsOn('fl-060', 'ack only after Oracle committed', (d) => {
    const steps = d.flows[0].steps
    const ack = remove(steps, 'jms-ack')
    steps.splice(1, 0, ack)
  })
  await failsOn('fl-060', 'commit together', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  await failsOn('fl-060', 'Only a duplicate-key error', (d) => {
    handlerFor(d, 'QUERY_EXECUTION').config.when = ''
  })
  await failsOn('fl-060', 'Other failures propagate', (d) => {
    handlerFor(d, 'ANY').type = 'on-error-continue'
  })
  await failsOn('fl-060', 'Other failures propagate', (d) => {
    handlerFor(d, 'ANY').steps = [step('jms-ack', { ackId: '#[vars.ackId]' })]
  })
  // The duplicate check is a Choice inside the handler instead of a when condition.
  await passes('fl-060', (d) => {
    const h = handlerFor(d, 'QUERY_EXECUTION')
    h.config.when = ''
    const c = createNode('choice')
    c.routes = [{ ...c.routes[0], config: { expression: '#[error.description contains "ORA-00001"]' }, steps: h.steps }]
    c.otherwise = [step('raise-error', { type: 'APP:STAGING_FAILED', description: '#[error.description]' })]
    h.steps = [c]
  })
}
