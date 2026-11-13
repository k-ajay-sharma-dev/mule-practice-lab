// Wrong and other correct designs for batch A. See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, handlerFor, flowOf, remove, step, scope, handler, subFlow, createNode }) => {
  // FL-001
  await failsOn('fl-001', 'Max failed records', (d) => {
    one(d, 'batch-job').config.maxFailedRecords = 0
  })
  await failsOn('fl-001', 'after the batch job', (d) => {
    const steps = d.flows[0].steps
    steps.splice(1, 0, remove(steps, 'sftp-move'))
  })
  await failsOn('fl-001', 'moves a failed file to /error', (d) => {
    handlerFor(d, 'ANY').steps.find((n) => n.type === 'sftp-move').config.targetPath = '/archive'
  })
  await failsOn('fl-001', 'Contact and is keyed', (d) => {
    one(d, 'sf-upsert').config.objectType = 'Lead'
  })
  await failsOn('fl-001', 'validated before they are upserted', (d) => {
    const job = one(d, 'batch-job')
    job.routes.push(job.routes.shift())
  })
  const step001 = (d, name) => one(d, 'batch-job').routes.find((r) => r.config.name === name)
  await failsOn('fl-001', 'accepts only rows that passed', (d) => {
    step001(d, 'upsert-contacts').config.acceptPolicy = 'ALL'
  })
  await failsOn('fl-001', 'step that accepts ONLY_FAILURES', (d) => {
    step001(d, 'collect-failures').config.acceptPolicy = 'NO_FAILURES'
  })
  await failsOn('fl-001', 'On Complete phase', (d) => {
    const email = remove(one(d, 'batch-job').onComplete, 'email-send')
    step001(d, 'collect-failures').steps.push(email)
  })
  await passes('fl-001', (d) => {
    one(d, 'batch-job').config.maxFailedRecords = 100000
    handlerFor(d, 'ANY').type = 'on-error-continue'
  })
  // Failed rows are appended to a CSV file in chunks.
  await passes('fl-001', (d) => {
    step001(d, 'collect-failures').steps = [scope('batch-aggregator', { size: 100 }, [step('file-write', { path: '/tmp/failed-contacts.csv', mode: 'APPEND' })])]
  })

  // FL-002
  await failsOn('fl-002', 'GET /prices', (d) => {
    one(d, 'http-request').config.method = 'POST'
  })
  await failsOn('fl-002', 'sequential For Each', (d) => {
    const steps = d.flows[0].steps
    const loop = remove(steps, 'parallel-foreach')
    steps.unshift(scope('parallel-foreach', { collection: '#[payload.lines]', maxConcurrency: 20, timeout: 3000 }, [step('logger', { message: 'line' })]))
    steps.splice(1, 0, scope('foreach', { collection: '#[payload.lines]' }, loop.steps))
  })
  await failsOn('fl-002', 'handled per line', (d) => {
    const loop = one(d, 'parallel-foreach')
    const tryScope = loop.steps.find((n) => n.type === 'try')
    loop.steps.splice(loop.steps.indexOf(tryScope), 1, ...tryScope.steps)
    d.flows[0].errorHandlers.push(...tryScope.errorHandlers)
  })
  await failsOn('fl-002', 'not kept in a variable', (d) => {
    one(d, 'parallel-foreach').steps.push(step('set-variable', { variableName: 'total', value: '#[(vars.total default 0) + payload.price]' }))
  })
  await failsOn('fl-002', 'after the loop', (d) => {
    d.flows[0].steps.pop()
  })
  await passes('fl-002', (d) => {
    const loop = one(d, 'parallel-foreach')
    loop.config.maxConcurrency = 15
    handlerFor(d, 'HTTP:').config.type = 'ANY'
  })

  // FL-003
  const status = (h) => h.steps.find((n) => n.type === 'set-variable').config
  await failsOn('fl-003', 'mapped to 415', (d) => {
    status(handlerFor(d, 'UNSUPPORTED_MEDIA_TYPE')).value = '500'
  })
  await failsOn('fl-003', 'mapped to 405', (d) => {
    const list = d.flows[0].errorHandlers
    list.splice(list.indexOf(handlerFor(d, 'METHOD_NOT_ALLOWED')), 1)
  })
  await failsOn('fl-003', 'mapped to 404', (d) => {
    status(handlerFor(d, 'NOT_FOUND')).value = '200'
  })
  await failsOn('fl-003', 'mapped to 503', (d) => {
    status(handlerFor(d, 'DB:CONNECTIVITY')).value = '500'
  })
  await failsOn('fl-003', 'raises a "not found"', (d) => {
    one(d, 'choice').routes[0].steps = [step('set-payload', { value: '#[{}]' })]
  })
  await failsOn('fl-003', 'detailed description', (d) => {
    flowOf(d, 'build-error-body').steps[0].config.script = '%dw 2.0\noutput application/json\n---\n{ code: "ERR", message: error.detailedDescription, correlationId: correlationId }'
  })
  await failsOn('fl-003', 'with a correlationId', (d) => {
    flowOf(d, 'build-error-body').steps[0].config.script = '%dw 2.0\noutput application/json\n---\n{ code: error.errorType.identifier, message: error.description }'
  })
  const validateEmpty003 = (d) => {
    const f = flowOf(d, '(orderId)')
    f.steps.splice(1, 1, step('validation', { check: 'is-not-empty-collection', expression: '#[payload]', message: 'Order not found' }), step('transform', { script: '%dw 2.0\noutput application/json\n---\npayload[0]' }))
  }
  // A Validate step raises VALIDATION:EMPTY_COLLECTION, which needs its own 404 handler.
  await passes('fl-003', (d) => {
    validateEmpty003(d)
    d.flows[0].errorHandlers.unshift(handler('on-error-propagate', { type: 'VALIDATION:EMPTY_COLLECTION' }, [step('set-variable', { variableName: 'httpStatus', value: '404' }), step('flow-ref', { name: 'build-error-body' })]))
  })
  // Without that handler the empty result falls to the catch-all and returns 500.
  await failsOn('fl-003', 'catches the error the flow raises', validateEmpty003)
  // The raised type is not one the 404 handler names.
  await failsOn('fl-003', 'catches the error the flow raises', (d) => {
    one(d, 'raise-error').config.type = 'ORDER:NOT_FOUND'
  })
  await failsOn('fl-003', 'catches the error the flow raises', (d) => {
    handlerFor(d, 'APP:NOT_FOUND').config.type = 'APIKIT:NOT_FOUND, APP:MISSING'
  })
  // A more specific error type with a 404 handler of its own.
  await passes('fl-003', (d) => {
    one(d, 'raise-error').config.type = 'APP:ORDER_NOT_FOUND'
    d.flows[0].errorHandlers.unshift(handler('on-error-propagate', { type: 'APP:ORDER_NOT_FOUND' }, [step('set-variable', { variableName: 'httpStatus', value: '404' }), step('flow-ref', { name: 'build-error-body' })]))
  })

  // FL-007
  await failsOn('fl-007', 'condition on US orders', (d) => {
    one(d, 'choice').routes[0].config.expression = "#[payload.shipTo.region == 'NA']"
  })
  await failsOn('fl-007', 'every gather route', (d) => {
    const route = one(d, 'scatter-gather').routes[2]
    route.steps = route.steps[0].steps
  })
  await failsOn('fl-007', 'flattened into one list', (d) => {
    remove(flowOf(d, 'rate').steps, 'transform')
  })
  await failsOn('fl-007', 'flags the address', (d) => {
    const tryScope = flowOf(d, 'validate-address').steps.find((n) => n.type === 'try')
    tryScope.errorHandlers[0].type = 'on-error-propagate'
  })
  await failsOn('fl-007', 'capped at the UI wait', (d) => {
    one(d, 'scatter-gather').config.timeout = 10000
  })
  await passes('fl-007', (d) => {
    const tryScope = flowOf(d, 'validate-address').steps.find((n) => n.type === 'try')
    tryScope.errorHandlers[0].steps = [step('set-variable', { variableName: 'validated', value: '#[false]' }), step('set-payload', { value: '#[vars.address]' })]
  })

  // FL-008
  await failsOn('fl-008', 'correlation ID variable', (d) => {
    one(d, 'set-variable', (n) => n.config.variableName === 'correlationId').config.variableName = 'requestPath'
  })
  await failsOn('fl-008', 'is cached', (d) => {
    const f = flowOf(d, 'get-tenant-config')
    const i = f.steps.findIndex((n) => n.type === 'cache')
    f.steps.splice(i, 1, ...f.steps[i].steps)
  })
  await failsOn('fl-008', 'behind a Flow Reference', (d) => {
    const steps = flowOf(d, 'get-orders').steps
    steps.splice(2, 1, step('http-request', { method: 'POST', path: '/audit/events' }))
  })
  await failsOn('fl-008', 'never reach the endpoint flows', (d) => {
    flowOf(d, 'audit-call').errorHandlers[0].type = 'on-error-propagate'
  })
  // The Try alternative: the audit call is a sub-flow and each caller wraps the Flow Reference in a Try.
  await passes('fl-008', (d) => {
    const audit = flowOf(d, 'audit-call')
    const continueHandler = audit.errorHandlers[0]
    d.flows.splice(d.flows.indexOf(audit), 1, subFlow('audit-call', audit.steps))
    for (const f of d.flows.filter((x) => x.source)) {
      const i = f.steps.findIndex((n) => n.type === 'flow-ref' && n.config.name === 'audit-call')
      f.steps.splice(i, 1, scope('try', {}, [f.steps[i]], { errorHandlers: [structuredClone(continueHandler)] }))
    }
  })

  // FL-009
  await failsOn('fl-009', 'only after the payment succeeds', (d) => {
    const steps = d.flows[0].steps
    steps.splice(1, 0, remove(steps, 'vm-publish'))
  })
  await failsOn('fl-009', 'not inside an Async scope', (d) => {
    const steps = d.flows[0].steps
    one(d, 'async').steps.push(remove(steps, 'vm-publish'))
  })
  await failsOn('fl-009', 'runs in the VM Listener flow', (d) => {
    flowOf(d, 'audit-consumer').steps = [step('logger', { message: '#[payload]' })]
  })
  await failsOn('fl-009', 'begins a transaction', (d) => {
    flowOf(d, 'audit-consumer').source.config.transactionalAction = 'NONE'
  })
  await failsOn('fl-009', 'not swallowed', (d) => {
    flowOf(d, 'audit-consumer').errorHandlers[0].type = 'on-error-continue'
  })
  await failsOn('fl-009', 'reads the same queue', (d) => {
    one(d, 'vm-publish').config.queueName = 'auditQ'
  })
  // The queue name written as a DataWeave string still names the same queue.
  await passes('fl-009', (d) => {
    one(d, 'vm-publish').config.queueName = "#['auditQueue']"
  })
  // Poison messages parked after redelivery runs out are a fair use of On Error Continue.
  await passes('fl-009', (d) => {
    flowOf(d, 'audit-consumer').errorHandlers.push(handler('on-error-continue', { type: 'MULE:REDELIVERY_EXHAUSTED' }, [step('logger', { level: 'ERROR', message: '#[payload]' })]))
  })

  // FL-011
  await failsOn('fl-011', 'share a LAST_UPDATED value', (d) => {
    one(d, 'db-select').config.sql = 'SELECT * FROM CUSTOMERS WHERE LAST_UPDATED > :ts ORDER BY LAST_UPDATED'
  })
  await failsOn('fl-011', 'on LAST_UPDATED', (d) => {
    one(d, 'db-select').config.sql = 'SELECT * FROM CUSTOMERS WHERE CUST_ID > :id ORDER BY CUST_ID'
  })
  await failsOn('fl-011', 'advanced only after delivery', (d) => {
    const steps = one(d, 'choice').routes[0].steps
    steps.splice(1, 0, remove(steps, 'os-store'))
  })
  await failsOn('fl-011', 'watermark stays untouched', (d) => {
    d.flows[0].errorHandlers[0].steps.push(step('os-store', { key: 'customers.watermark', value: '#[vars.newWatermark]', objectStore: 'watermark-store' }))
  })
  await passes('fl-011', (d) => {
    one(d, 'db-select').config.sql = 'SELECT * FROM CUSTOMERS WHERE LAST_UPDATED >= :ts ORDER BY LAST_UPDATED'
  })

  // FL-012
  const tokenFlow = (d) => flowOf(d, 'get-carrier-token')
  await failsOn('fl-012', 'only called on a cache miss', (d) => {
    const steps = tokenFlow(d).steps
    steps.splice(steps.findIndex((n) => n.type === 'choice'), 1, step('flow-ref', { name: 'refresh-carrier-token' }))
  })
  await failsOn('fl-012', 'stored so other requests', (d) => {
    remove(flowOf(d, 'refresh-carrier-token').steps, 'os-store')
  })
  await failsOn('fl-012', 'retried once', (d) => {
    remove(one(d, 'on-error-continue').steps, 'http-request')
  })
  await failsOn('fl-012', 'fetches a fresh token', (d) => {
    remove(one(d, 'on-error-continue').steps, 'flow-ref')
  })
  // A cache miss detected by a Retrieve with no default, caught as OS:KEY_NOT_FOUND.
  await passes('fl-012', (d) => {
    const f = tokenFlow(d)
    f.steps = [
      scope('try', {}, [step('os-retrieve', { key: 'carrierToken', objectStore: 'carrier-token-store' })], {
        errorHandlers: [handler('on-error-continue', { type: 'OS:KEY_NOT_FOUND' }, [step('flow-ref', { name: 'refresh-carrier-token' })])],
      }),
    ]
  })

  // FL-013
  const faultStatus = (d) => handlerFor(d, 'SOAP_FAULT').steps[0].config
  await failsOn('fl-013', 'mapped to 404', (d) => {
    faultStatus(d).script = '%dw 2.0\noutput application/java\n---\nif (error.description contains "POLICY_LOCKED") 409 else 400'
  })
  await failsOn('fl-013', 'mapped to 409', (d) => {
    faultStatus(d).script = '%dw 2.0\noutput application/java\n---\nif (error.description contains "POLICY_NOT_FOUND") 404 else 502'
  })
  await failsOn('fl-013', 'mapped to a 5xx', (d) => {
    handlerFor(d, 'WSC:CONNECTIVITY').steps[0].config.value = '#[200]'
  })
  await passes('fl-013', (d) => {
    const h = handlerFor(d, 'SOAP_FAULT')
    const choice = createNode('choice')
    choice.routes.push(structuredClone(choice.routes[0]))
    choice.routes[0].config.expression = '#[error.description contains "POLICY_NOT_FOUND"]'
    choice.routes[0].steps = [step('set-variable', { variableName: 'httpStatus', value: '404' })]
    choice.routes[1].config.expression = '#[error.description contains "POLICY_LOCKED"]'
    choice.routes[1].steps = [step('set-variable', { variableName: 'httpStatus', value: '409' })]
    choice.otherwise = [step('set-variable', { variableName: 'httpStatus', value: '502' })]
    h.steps.splice(0, 1, choice)
  })

  // FL-014
  await failsOn('fl-014', 'never read twice', (d) => {
    d.flows[0].source.config.postAction = 'none'
  })
  await failsOn('fl-014', 'half-written file', (d) => {
    const steps = d.flows[0].steps
    remove(steps, 'file-rename')
    one(d, 'file-write').config.path = '#["/data/out/" ++ vars.baseName ++ ".csv"]'
  })
  await failsOn('fl-014', 'validated before any output', (d) => {
    const steps = d.flows[0].steps
    const choice = remove(steps, 'choice')
    steps.splice(steps.findIndex((n) => n.type === 'file-write') + 1, 0, choice)
  })
  await failsOn('fl-014', 'converted to CSV', (d) => {
    for (const t of all(d, 'transform')) t.config.script = t.config.script.replace('application/csv', 'application/json')
  })
  await failsOn('fl-014', 'reason column', (d) => {
    one(d, 'transform', (n) => n.config.variableName === 'partitioned').config.script =
      '%dw 2.0\noutput application/java\n---\n{ valid: payload.details filter ($.amount > 0), invalid: payload.details filter ($.amount <= 0) }'
  })
  // Write to a temporary folder, then move the finished file into /data/out.
  await passes('fl-014', (d) => {
    const steps = d.flows[0].steps
    one(d, 'file-write').config.path = '#["/data/tmp/" ++ vars.baseName ++ ".csv"]'
    const i = steps.findIndex((n) => n.type === 'file-rename')
    steps.splice(i, 1, step('file-move', { sourcePath: '#["/data/tmp/" ++ vars.baseName ++ ".csv"]', targetPath: '/data/out' }))
  })

  // FL-015
  await failsOn('fl-015', 'does not send email or SMS itself', (d) => {
    d.flows[0].steps.push(step('email-send', { toAddresses: '#[payload.email]', subject: 'Notice' }))
  })
  await failsOn('fl-015', 'as soon as it arrives', (d) => {
    flowOf(d, 'email-worker').source.config.acknowledgementMode = 'IMMEDIATE'
  })
  await failsOn('fl-015', 'or the email or SMS was sent', (d) => {
    const steps = flowOf(d, 'email-worker').steps
    steps.splice(1, 0, remove(steps, 'mq-ack'))
  })
  await failsOn('fl-015', 'return the message for redelivery', (d) => {
    for (const f of d.flows) for (const h of f.errorHandlers ?? []) h.steps = h.steps.filter((n) => n.type !== 'mq-nack')
  })
  await failsOn('fl-015', 'template is read at run time', (d) => {
    remove(flowOf(d, 'email-worker').steps, 'db-select')
  })
  // Every consumer listens on a name no flow publishes to.
  await failsOn('fl-015', 'same queue a flow publishes to', (d) => {
    for (const f of d.flows) if (f.source?.type === 'mq-subscriber') f.source.config.destination = f.source.config.destination.replace(/\./g, '-')
  })
  // Other channel queue names, used on both sides.
  await passes('fl-015', (d) => {
    for (const n of [...all(d, 'mq-publish'), ...d.flows.map((f) => f.source).filter((s) => s?.type === 'mq-subscriber')]) {
      n.config.destination = n.config.destination.replace('notifications.', 'notify-')
    }
  })
  // AUTO acknowledgement: the broker acks on success and redelivers when the error propagates.
  await passes('fl-015', (d) => {
    for (const f of d.flows) {
      if (f.source?.type === 'mq-subscriber') f.source.config.acknowledgementMode = 'AUTO'
      f.steps = f.steps.filter((n) => n.type !== 'mq-ack')
      for (const h of f.errorHandlers ?? []) {
        h.steps = h.steps.filter((n) => n.type !== 'mq-ack' && n.type !== 'mq-nack')
        if (h.config.type !== 'MULE:DUPLICATE_MESSAGE') h.type = 'on-error-propagate'
      }
    }
  })

  // FL-016
  const mailFlow = (d) => flowOf(d, 'invoice-mailbox-poller')
  const typeRouter = (d) => one(d, 'choice', (n) => n.routes.some((r) => r.config.expression.includes('xml')))
  await failsOn('fl-016', 'idempotency on Message-ID', (d) => {
    one(d, 'idempotent').config.idExpression = '#[correlationId]'
  })
  await failsOn('fl-016', 'before any attachment is routed', (d) => {
    const steps = one({ flows: [mailFlow(d)] }, 'try').steps
    steps.push(remove(steps, 'idempotent'))
  })
  await failsOn('fl-016', 'XML route posts', (d) => {
    remove(typeRouter(d).routes[0].steps, 'http-request')
  })
  await failsOn('fl-016', 'sends it to OCR', (d) => {
    typeRouter(d).routes[1].steps.pop()
  })
  await failsOn('fl-016', 'reported to the AP team', (d) => {
    for (const h of all(d, 'on-error-continue')) h.steps = h.steps.filter((n) => n.type !== 'mq-publish')
  })
  await passes('fl-016', (d) => {
    const pdf = typeRouter(d).routes[1].steps
    pdf.splice(1, 1, step('s3-put', { bucket: 'invoice-bucket', key: '#[vars.s3Key]' }))
  })

  // FL-017
  const worker = (d) => flowOf(d, 'statement-worker')
  await failsOn('fl-017', 'answers 202 Accepted', (d) => {
    one(d, 'set-variable', (n) => n.config.value === '#[202]').config.value = '#[200]'
  })
  await failsOn('fl-017', 'runs in the worker', (d) => {
    d.flows[0].steps.splice(1, 0, remove(worker(d).steps, 'db-select'))
  })
  await failsOn('fl-017', 'recorded as PENDING before it is queued', (d) => {
    const steps = one(d, 'choice').otherwise
    steps.splice(1, 0, remove(steps, 'vm-publish'))
  })
  await failsOn('fl-017', 'COMPLETED only after the PDF is uploaded', (d) => {
    const steps = worker(d).steps
    steps.splice(2, 0, steps.pop())
  })
  await failsOn('fl-017', 'mark the job FAILED', (d) => {
    worker(d).errorHandlers[0].steps = [step('logger', { level: 'ERROR', message: '#[error.description]' })]
  })
  await failsOn('fl-017', 'returns 404', (d) => {
    flowOf(d, 'statement-job-status').errorHandlers = []
  })
  await passes('fl-017', (d) => {
    one(d, 'vm-publish').type = 'mq-publish'
    one(d, 'mq-publish').config = { destination: 'statement-jobs' }
    worker(d).source = step('mq-subscriber', { destination: 'statement-jobs', acknowledgementMode: 'AUTO' })
  })

  // FL-018
  await failsOn('fl-018', 'run per chunk', (d) => {
    one(d, 'foreach').config.batchSize = 1
  })
  await failsOn('fl-018', 'bad quantity are skipped', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\ninput payload application/csv streaming=true\noutput application/java deferred=true\n---\npayload map ((row) -> { storeId: row.store_id, sku: row.sku, quantity: row.quantity as Number })'
  })
  await failsOn('fl-018', 'A failed swap rolls back', (d) => {
    one(d, 'try').errorHandlers[0].type = 'on-error-continue'
  })
  await failsOn('fl-018', 'only after the chunked load', (d) => {
    const steps = d.flows[0].steps
    steps.splice(1, 0, remove(steps, 'try'))
  })
  await passes('fl-018', (d) => {
    one(d, 'foreach').config.batchSize = 5000
    one(d, 'try').errorHandlers = []
  })

  // FL-019
  const subscribers = (d) => d.flows.filter((f) => f.source?.type === 'mq-subscriber')
  await failsOn('fl-019', 'one event to the exchange', (d) => {
    one(d, 'mq-publish').config.destination = 'order-events.warehouse'
  })
  await failsOn('fl-019', 'as soon as it arrives', (d) => {
    subscribers(d)[1].source.config.acknowledgementMode = 'IMMEDIATE'
  })
  await failsOn('fl-019', 'acknowledged after successful processing', (d) => {
    for (const f of subscribers(d)) f.steps.unshift(remove(f.steps, 'mq-ack'))
  })
  await failsOn('fl-019', 'forwards orders over 100', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[(attributes.properties.totalAmount as Number default 0) > 50]'
  })
  await failsOn('fl-019', 'deduplicates events on eventId', (d) => {
    for (const n of all(d, 'idempotent')) n.config.idExpression = '#[correlationId]'
  })
  await failsOn('fl-019', 'removed from the dedupe store', (d) => {
    for (const h of all(d, 'on-error-continue')) h.steps = h.steps.filter((n) => n.type !== 'os-remove')
  })
  await passes('fl-019', (d) => {
    const route = one(d, 'choice').routes[0]
    d.flows.push(subFlow('post-analytics', route.steps))
    route.steps = [step('flow-ref', { name: 'post-analytics' })]
  })

  // FL-020
  await failsOn('fl-020', 'waits for its own correlated reply', (d) => {
    const steps = d.flows[0].steps
    one(d, 'jms-publish-consume').type = 'jms-publish'
    d.flows.push({ ...d.flows[1], id: 'reply-listener', name: 'reply-listener', source: step('jms-listener', { destination: 'BAL.RPLY' }), steps: [steps.pop()] })
  })
  await failsOn('fl-020', 'No JMS listener competes', (d) => {
    flowOf(d, 'late-reply-drain').source = step('jms-listener', { destination: 'BAL.RPLY' })
  })
  await failsOn('fl-020', 'maps the timeout to 504', (d) => {
    handlerFor(d, 'JMS:TIMEOUT').steps[0].config.value = '500'
  })
  await failsOn('fl-020', 'builds an error body', (d) => {
    handlerFor(d, 'JMS:TIMEOUT').steps.pop()
  })
  await failsOn('fl-020', 'drained by a scheduled JMS Consume', (d) => {
    one(d, 'jms-consume').config.destination = 'BAL.REQ'
  })
  await failsOn('fl-020', 'never steals a live one', (d) => {
    one(d, 'jms-consume').config.selector = ''
  })
  const publishThenConsume020 = (selector) => (d) => {
    const steps = d.flows[0].steps
    const i = steps.findIndex((n) => n.type === 'jms-publish-consume')
    steps.splice(i, 1, step('jms-publish', { destination: 'BAL.REQ' }), step('jms-consume', { destination: 'BAL.RPLY', maximumWait: 1200, selector }))
  }
  // Publish, then Consume from the reply queue with a selector on the correlation id.
  await passes('fl-020', publishThenConsume020("#[\"JMSCorrelationID = '\" ++ vars.requestId ++ \"'\"]"))
  // With no selector the Consume takes whichever reply is first on the shared queue.
  await failsOn('fl-020', 'waits for its own correlated reply', publishThenConsume020(''))

  // FL-021
  const throttled = (d) => handlerFor(d, 'TOO_MANY_REQUESTS')
  // An ack in a handler does not count as an ack after the call.
  await failsOn('fl-021', 'acknowledged only after the partner call', (d) => {
    for (const c of all(d, 'choice')) {
      for (const r of c.routes) r.steps = r.steps.filter((n) => n.type !== 'mq-ack')
      c.otherwise = c.otherwise.filter((n) => n.type !== 'mq-ack')
    }
    const h = handlerFor(d, 'ANY')
    h.steps = [step('mq-ack', { ackToken: '#[vars.ackToken]' })]
  })
  // An extra ack before the call: the message is gone if the call then fails.
  await failsOn('fl-021', 'acknowledged only after the partner call', (d) => {
    one(d, 'choice', (n) => n.otherwise.some((s) => s.type === 'http-request')).otherwise.unshift(step('mq-ack', { ackToken: '#[vars.ackToken]' }))
  })
  // Acked at the top of the flow, before any route.
  await failsOn('fl-021', 'acknowledged only after the partner call', (d) => {
    d.flows[0].steps.splice(2, 0, step('mq-ack', { ackToken: '#[vars.ackToken]' }))
  })
  await failsOn('fl-021', 'stored only after the partner accepted it', (d) => {
    const steps = one(d, 'choice', (n) => n.otherwise.some((s) => s.type === 'http-request')).otherwise
    steps.unshift(remove(steps, 'os-store'))
  })
  await failsOn('fl-021', 'goes back to the queue', (d) => {
    const h = throttled(d)
    h.steps[h.steps.findIndex((n) => n.type === 'mq-nack')] = step('mq-ack', { ackToken: '#[vars.ackToken]' })
  })
  await failsOn('fl-021', 'not retried in place', (d) => {
    const steps = one(d, 'choice', (n) => n.otherwise.some((s) => s.type === 'http-request')).otherwise
    const call = remove(steps, 'http-request')
    steps.unshift(scope('until-successful', { maxRetries: 5, millisBetweenRetries: 1000 }, [call]))
  })
  await failsOn('fl-021', 'shared "pause until"', (d) => {
    remove(throttled(d).steps, 'os-store')
  })
  await passes('fl-021', (d) => {
    throttled(d).type = 'on-error-propagate'
  })
  // The version check written the other way round: the call is on a route and the stale skip is the default.
  await passes('fl-021', (d) => {
    const inner = one(d, 'choice', (n) => n.otherwise.some((s) => s.type === 'http-request'))
    const send = inner.otherwise
    inner.otherwise = inner.routes[0].steps
    inner.routes[0] = { ...inner.routes[0], config: { expression: '#[(vars.update.effectiveAt as DateTime) > (payload as DateTime)]' }, steps: send }
  })

  // FL-022
  const cdc = (d) => flowOf(d, 'account-cdc-listener')
  const changeRouter = (d) => one({ flows: [flowOf(d, 'account-change-worker')] }, 'choice')
  await failsOn('fl-022', 'loop prevention', (d) => {
    for (const f of d.flows.filter((x) => x.name.includes('cdc'))) f.steps.find((n) => n.type === 'choice').routes[0].config.expression = '#[payload.ChangeEventHeader.changeType == "DELETE"]'
  })
  await failsOn('fl-022', 'only after the hand-off', (d) => {
    const steps = cdc(d).steps
    steps.splice(1, 0, remove(steps, 'os-store'))
  })
  await failsOn('fl-022', 'only the changed fields', (d) => {
    changeRouter(d).routes[1].steps[0].config.script = '%dw 2.0\noutput application/json\n---\npayload'
  })
  await failsOn('fl-022', 're-query the full record', (d) => {
    remove(changeRouter(d).routes[3].steps, 'sf-query')
  })
  await failsOn('fl-022', 'only after ERP and Postgres are updated', (d) => {
    const steps = flowOf(d, 'account-change-worker').steps
    steps.splice(1, 0, remove(steps, 'mq-ack'))
  })
  // FL-023
  const capRouter = (d) => one(d, 'choice', (n) => n.routes[0].config.expression.includes('priceMismatch'))
  await failsOn('fl-023', 'fires at 02:00', (d) => {
    d.flows[0].source.config.expression = '0 0 6 * * ?'
  })
  await failsOn('fl-023', 'built as CSV', (d) => {
    for (const t of all(d, 'transform')) t.config.script = t.config.script.replace('application/csv', 'application/json')
  })
  await failsOn('fl-023', 'nightly cap of 500', (d) => {
    capRouter(d).routes[0].config.expression = '#[sizeOf(vars.recon.priceMismatch) <= 1000]'
  })
  await failsOn('fl-023', 'update the Shopify price', (d) => {
    capRouter(d).routes[0].steps[0].steps[0].config.path = '/sap/products/{sku}/price'
  })
  await failsOn('fl-023', 'aborts the run with an alert', (d) => {
    d.flows[0].errorHandlers[0].steps = [step('logger', { level: 'ERROR', message: '#[error.description]' })]
  })
  // The cap written as the alert route, with the fixes as the default.
  await passes('fl-023', (d) => {
    const c = capRouter(d)
    const fixes = c.routes[0].steps
    c.routes[0] = { ...c.routes[0], config: { expression: '#[sizeOf(vars.recon.priceMismatch) > 500]' }, steps: c.otherwise }
    c.otherwise = fixes
    d.flows[0].source.config.expression = '0 0 2 ? * *'
  })

  // FL-024
  const orchestrator = (d) => flowOf(d, 'checkout-orchestrator')
  await failsOn('fl-024', 'Stock is reserved before the card is authorised', (d) => {
    const steps = orchestrator(d).steps
    const i = steps.findIndex((n) => n.config.name === 'step-inventory')
    steps.splice(i, 2, steps[i + 1], steps[i])
  })
  await failsOn('fl-024', 'undone with POST /authorisations/{id}/void', (d) => {
    flowOf(d, 'undo-payment').steps[0].steps[0].config.path = '/authorisations/{id}'
    flowOf(d, 'undo-payment').steps[0].steps[0].config.method = 'DELETE'
  })
  await failsOn('fl-024', 'undone with DELETE /reservations', (d) => {
    flowOf(d, 'undo-inventory').steps[0].steps[0].config.method = 'POST'
  })
  await failsOn('fl-024', 'queued for retry', (d) => {
    for (const h of all(d, 'on-error-continue')) h.steps = h.steps.filter((n) => n.type !== 'mq-publish')
  })
  await failsOn('fl-024', 'recovers sagas stuck', (d) => {
    d.flows.splice(d.flows.indexOf(flowOf(d, 'saga-recovery')), 1)
  })
  await passes('fl-024', (d) => {
    for (const f of d.flows) if (f.name.startsWith('step-')) f.name = f.name.replace('step-', 'saga-')
    for (const n of all(d, 'flow-ref')) n.config.name = n.config.name.replace('step-', 'saga-')
  })

  // FL-026
  const intake = (d) => flowOf(d, 'erasure-intake-api')
  await failsOn('fl-026', 'only on the accepted branch', (d) => {
    const steps = intake(d).steps
    steps.splice(2, 0, step('mq-publish', { destination: 'gdpr.salesforce' }))
    const loop = one({ flows: [intake(d)] }, 'foreach')
    loop.steps = loop.steps.filter((n) => n.type !== 'mq-publish')
  })
  await failsOn('fl-026', 'inside a transaction', (d) => {
    one({ flows: [flowOf(d, 'policydb')] }, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  await failsOn('fl-026', 'never deleted', (d) => {
    one({ flows: [flowOf(d, 'policydb')] }, 'try').steps[0] = step('db-delete', { sql: 'DELETE FROM policy_holder WHERE customer_id = :customerId' })
  })
  await failsOn('fl-026', 'only after the erasure call', (d) => {
    for (const f of d.flows.filter((x) => x.source?.type === 'mq-subscriber')) f.steps.splice(1, 0, remove(f.steps, 'mq-ack'))
  })
  await failsOn('fl-026', 'No Logger writes personal data', (d) => {
    flowOf(d, 'marketing').errorHandlers[0].steps[0].config.message = '#[payload]'
  })
  await failsOn('fl-026', 'tracks asynchronous erasure jobs', (d) => {
    d.flows.splice(d.flows.indexOf(flowOf(d, 'poller')), 1)
  })
  await passes('fl-026', (d) => {
    one({ flows: [flowOf(d, 'policydb')] }, 'try').config.transactionalAction = 'BEGIN_OR_JOIN'
  })

  // FL-027
  const byId = (d) => flowOf(d, 'get-product-by-sku')
  await failsOn('fl-027', 'q parameter is validated', (d) => {
    flowOf(d, 'get-products').steps.shift()
  })
  await failsOn('fl-027', 'SKU URI parameter is validated', (d) => {
    byId(d).steps.shift()
  })
  await failsOn('fl-027', 'before the database is queried', (d) => {
    const steps = flowOf(d, 'get-products').steps
    steps.splice(steps.length - 1, 0, steps.shift())
  })
  await failsOn('fl-027', 'applies the limit', (d) => {
    one({ flows: [flowOf(d, 'get-products')] }, 'db-select').config.sql = 'SELECT sku, name, price FROM products WHERE LOWER(name) LIKE LOWER(:q)'
  })
  await failsOn('fl-027', 'unknown SKU returns 404', (d) => {
    one(d, 'choice').routes[0].steps[0].config.value = '#[200]'
  })
  await failsOn('fl-027', 'returns 400', (d) => {
    for (const f of d.flows) f.errorHandlers[0].steps[0].config.value = '#[500]'
  })
  // The Choice raises one type, and the 404 handler catches another.
  await failsOn('fl-027', 'unknown SKU returns 404', (d) => {
    one(d, 'choice').routes[0].steps = [step('raise-error', { type: 'APP:SKU_UNKNOWN', description: 'No product' })]
    byId(d).errorHandlers.push(handler('on-error-propagate', { type: 'APP:NOT_FOUND' }, [step('set-variable', { variableName: 'httpStatus', value: '404' })]))
  })
  // A not-found error raised in the Choice and mapped to 404 by a handler.
  await passes('fl-027', (d) => {
    one(d, 'choice').routes[0].steps = [step('raise-error', { type: 'APP:NOT_FOUND', description: 'No product' })]
    byId(d).errorHandlers.push(handler('on-error-propagate', { type: 'APP:NOT_FOUND' }, [step('set-variable', { variableName: 'httpStatus', value: '404' })]))
  })

  // FL-028
  const ready = (d) => flowOf(d, 'health-ready')
  await failsOn('fl-028', 'Liveness does not call', (d) => {
    flowOf(d, 'health-live').steps.unshift(step('db-select', { sql: 'SELECT 1 FROM dual' }))
  })
  await failsOn('fl-028', 'inside the 3 s budget', (d) => {
    one(d, 'http-request').config.responseTimeout = 5000
  })
  await failsOn('fl-028', 'Both dependency probes', (d) => {
    const route = one(d, 'scatter-gather').routes[0]
    route.steps = [route.steps[0].steps[0]]
  })
  await failsOn('fl-028', 'reports DOWN', (d) => {
    for (const h of all(d, 'on-error-continue')) h.steps = h.steps.filter((n) => n.type === 'logger')
  })
  await failsOn('fl-028', 'decided after all probes', (d) => {
    const steps = ready(d).steps
    steps.unshift(remove(steps, 'choice'))
  })
  // Probes run one after the other, each in its own Try, instead of in a Scatter-Gather.
  await passes('fl-028', (d) => {
    const steps = ready(d).steps
    const gather = remove(steps, 'scatter-gather')
    steps.unshift(...gather.routes.map((r) => r.steps[0]))
  })

  // FL-029
  await failsOn('fl-029', '02:00 to 05:00 window', (d) => {
    d.flows[0].source.config.expression = '0 0 22 * * ?'
  })
  await failsOn('fl-029', 'does not load every expired row', (d) => {
    one(d, 'db-select').config.fetchSize = ''
  })
  // A row limit alone still reads the whole slice into memory.
  await failsOn('fl-029', 'does not load every expired row', (d) => {
    Object.assign(one(d, 'db-select').config, { fetchSize: '', maxRows: 5000000 })
  })
  // A first catch-up run bounded to a slice, still streamed.
  await passes('fl-029', (d) => {
    const select = one(d, 'db-select').config
    select.fetchSize = 2000
    select.sql += ' FETCH FIRST 5000000 ROWS ONLY'
  })
  await failsOn('fl-029', 'does not stop the job', (d) => {
    one(d, 'batch-job').config.maxFailedRecords = 0
  })
  await failsOn('fl-029', 'archived to S3 before they are deleted', (d) => {
    const steps = one(d, 'batch-aggregator').steps
    const del = remove(steps, 'db-delete')
    steps.splice(1, 0, del)
  })
  await failsOn('fl-029', 'No delete runs from an error handler', (d) => {
    d.flows[0].errorHandlers[0].steps.push(step('db-delete', { sql: 'DELETE FROM audit_events WHERE created_at < :cutoff' }))
  })
  await failsOn('fl-029', 'sends its totals to the DBA team', (d) => {
    remove(one(d, 'batch-job').onComplete, 'email-send')
  })
  // An email per chunk from inside the step, not one report at the end.
  await failsOn('fl-029', 'sends its totals to the DBA team', (d) => {
    one(d, 'batch-aggregator').steps.push(remove(one(d, 'batch-job').onComplete, 'email-send'))
  })
  await passes('fl-029', (d) => {
    one(d, 'batch-job').config.maxFailedRecords = -1
    d.flows[0].source.config.expression = '0 30 3 * * ?'
  })
  // The totals are posted to the DBA team channel from On Complete instead of emailed.
  await passes('fl-029', (d) => {
    const done = one(d, 'batch-job').onComplete
    done[done.findIndex((n) => n.type === 'email-send')] = step('http-request', { method: 'POST', path: '/hooks/dba-team', responseTimeout: 10000 })
  })

  // FL-030
  await failsOn('fl-030', 'named caching strategy', (d) => {
    one(d, 'cache').config.cachingStrategy = 'default'
  })
  await failsOn('fl-030', 'merged with the cached data after the lookup', (d) => {
    const steps = d.flows[0].steps
    steps.splice(steps.findIndex((n) => n.type === 'transform'), 1)
  })
  await failsOn('fl-030', 'published to sales-enriched', (d) => {
    d.flows[0].steps.find((n) => n.type === 'mq-publish').config.destination = 'pos-sales'
  })
  await failsOn('fl-030', 'still published, marked as unenriched', (d) => {
    remove(handlerFor(d, 'NOT_FOUND').steps, 'mq-publish')
  })
  await failsOn('fl-030', 'redelivered, not lost', (d) => {
    handlerFor(d, 'CONNECTIVITY').type = 'on-error-continue'
  })
  await failsOn('fl-030', 'redelivered, not lost', (d) => {
    d.flows[0].source.config.acknowledgementMode = 'IMMEDIATE'
  })
  // Manual acknowledgement: a catch-all handler Nacks the message back to the queue.
  await passes('fl-030', (d) => {
    d.flows[0].source.config.acknowledgementMode = 'MANUAL'
    const h = handlerFor(d, 'CONNECTIVITY')
    Object.assign(h, { type: 'on-error-continue', config: { type: 'ANY' } })
    h.steps.push(step('mq-nack', { ackToken: '#[vars.ackToken]' }))
  })

  // FL-031
  const erpTry = (d) => one(d, 'try')
  const permanent = (d) => handlerFor(d, 'APP:UNKNOWN_SUPPLIER')
  const transient = (d) => handlerFor(d, 'HTTP:CONNECTIVITY')
  await failsOn('fl-031', 'in a Try around the ERP call', (d) => {
    const steps = d.flows[0].steps
    const t = erpTry(d)
    steps.splice(steps.indexOf(t), 1, ...t.steps)
    d.flows[0].errorHandlers.unshift(...t.errorHandlers)
  })
  await failsOn('fl-031', 'before the message is acknowledged', (d) => {
    const steps = d.flows[0].steps
    steps.splice(2, 0, remove(steps, 'mq-ack'))
  })
  await failsOn('fl-031', 'dead-lettered and acknowledged', (d) => {
    remove(permanent(d).steps, 'mq-ack')
  })
  await failsOn('fl-031', 'error type and description', (d) => {
    for (const h of d.flows[0].errorHandlers) for (const n of h.steps) if (n.type === 'transform') n.config.script = '%dw 2.0\noutput application/json\n---\n{ original: vars.invoice }'
  })
  await failsOn('fl-031', 'go back to the queue', (d) => {
    const h = transient(d)
    h.steps[h.steps.findIndex((n) => n.type === 'mq-nack')] = step('mq-ack', { ackToken: '#[vars.ackToken]' })
  })
  await failsOn('fl-031', 'never dead-lettered', (d) => {
    transient(d).steps.unshift(step('mq-publish', { destination: 'invoices-dlq' }))
  })
  // One handler per business error type instead of a shared one.
  await passes('fl-031', (d) => {
    const list = d.flows[0].errorHandlers
    const h = permanent(d)
    const types = h.config.type.split(', ')
    list.splice(list.indexOf(h), 1, ...types.map((t) => ({ ...structuredClone(h), config: { type: t } })))
  })

  await passes('fl-022', (d) => {
    for (const f of d.flows.filter((x) => x.name.includes('cdc'))) f.steps.find((n) => n.type === 'choice').routes[0].config.expression = "#[payload.ChangeEventHeader.LastModifiedById == p('sfdc.integrationUserId')]"
  })
}
