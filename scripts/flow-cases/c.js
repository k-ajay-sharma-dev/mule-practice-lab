// Wrong and other correct designs for batch C (fl-061 to fl-064, fl-066 to fl-088). See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, handlerFor, flowOf, remove, step, scope, handler, subFlow, createNode }) => {
  // FL-061
  await failsOn('fl-061', 'INSUFFICIENT status returns 409', (d) => {
    const choice = one(d, 'choice')
    choice.routes.find((r) => r.config.expression.includes('INSUFFICIENT')).steps[0].config.value = '200'
  })
  await failsOn('fl-061', 'map to 503', (d) => {
    handlerFor(d, 'DB:CONNECTIVITY').steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  await failsOn('fl-061', 'returns 400', (d) => {
    handlerFor(d, 'VALIDATION').steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  await failsOn('fl-061', 'validated before calling Oracle', (d) => {
    const steps = d.flows[0].steps
    const checks = steps.filter((n) => n.type === 'validation')
    d.flows[0].steps = steps.filter((n) => n.type !== 'validation')
    d.flows[0].steps.splice(d.flows[0].steps.findIndex((n) => n.type === 'db-stored-procedure') + 1, 0, ...checks)
  })
  // Statuses written as numbers, and routes in another order.
  await passes('fl-061', (d) => {
    for (const n of all(d, 'set-variable')) if (/^\d+$/.test(n.config.value)) n.config.value = `#[${n.config.value}]`
    one(d, 'choice').routes.reverse()
  })

  // FL-062
  await failsOn('fl-062', 'parked for replay', (d) => {
    handlerFor(d, 'ANY').config.type = 'DB:CONNECTIVITY'
  })
  await failsOn('fl-062', 'OMS_Order_Id__c', (d) => {
    one(d, 'sf-upsert').config.externalIdField = 'Id'
  })
  await failsOn('fl-062', 'mapped to the Salesforce model', (d) => {
    const steps = d.flows[0].steps
    steps.push(remove(steps, 'transform'))
  })
  // Parking on a JMS queue from a handler for the retry and Salesforce errors.
  await passes('fl-062', (d) => {
    const h = handlerFor(d, 'ANY')
    h.config.type = 'MULE:RETRY_EXHAUSTED, SALESFORCE:CONNECTIVITY'
    h.steps[0] = step('jms-publish', { destination: 'OMS.STATUS.PARKED' })
  })

  // FL-063
  await failsOn('fl-063', 'One response mapping after the Try', (d) => {
    const steps = d.flows[0].steps
    const mapping = steps.pop()
    one(d, 'try').steps.push(mapping)
  })
  await failsOn('fl-063', 'STORE_STOCK_SNAPSHOT', (d) => {
    one(d, 'db-select').config.sql = 'SELECT SKU, QTY FROM STORE_STOCK WHERE STORE_ID = :storeId'
  })
  await failsOn('fl-063', 'JMS:TIMEOUT', (d) => {
    handlerFor(d, 'JMS:TIMEOUT').config.type = 'JMS:CONNECTIVITY'
  })
  await failsOn('fl-063', 'STORE.STOCK.REQUEST', (d) => {
    one(d, 'jms-publish-consume').config.destination = 'STORE.STOCK.REPLY'
  })
  await passes('fl-063', (d) => {
    handlerFor(d, 'JMS:TIMEOUT').config.type = 'JMS:TIMEOUT'
  })
  // The default wait of 10 s is far past the 2.5 s the app allows.
  await failsOn('fl-063', 'capped inside the 2.5 second budget', (d) => {
    one(d, 'jms-publish-consume').config.maximumWait = 10000
  })
  await passes('fl-063', (d) => {
    one(d, 'jms-publish-consume').config.maximumWait = 2500
  })

  // FL-064
  await failsOn('fl-064', 'OMS.SHIPTOHOME.ORDERS', (d) => {
    one(d, 'choice').otherwise.find((n) => n.config.destination === 'OMS.SHIPTOHOME.ORDERS').config.destination = 'OMS.BOPIS.ORDERS'
  })
  await failsOn('fl-064', 'no catch-all On Error Continue', (d) => {
    handlerFor(d, 'ANY').type = 'on-error-continue'
  })
  await failsOn('fl-064', 'INV_PKG.RESERVE_ORDER', (d) => {
    for (const n of all(d, 'db-stored-procedure')) Object.assign(n, { type: 'db-update', config: { sql: 'UPDATE STORE_STOCK SET AVAILABLE_QTY = AVAILABLE_QTY - 1' } })
  })
  // A specific rollback handler for Oracle outages in front of the catch-all.
  await passes('fl-064', (d) => {
    d.flows[0].errorHandlers.unshift(handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [step('logger', { level: 'WARN', message: 'Oracle down, order will be redelivered' })]))
  })
  // The alternate store is told to pick before its stock is reserved.
  await failsOn('fl-064', 'told to pick, on each route', (d) => {
    const steps = one(d, 'choice').routes[1].steps
    const pick = steps.findIndex((n) => n.type === 'jms-publish' && n.config.destination.includes('PICKS'))
    steps.splice(1, 0, steps.splice(pick, 1)[0])
  })
  // The customer is told about the new store first; the pick still follows the reservation.
  await passes('fl-064', (d) => {
    const steps = one(d, 'choice').routes[1].steps
    steps.unshift(steps.pop())
  })
  await failsOn('fl-064', 'STORE.<id>.PICKS', (d) => {
    for (const n of all(d, 'jms-publish')) if (n.config.destination.includes('PICKS')) n.config.destination = '#["STORE." ++ vars.fulfilStore ++ ".ORDERS"]'
  })

  // FL-066
  await failsOn('fl-066', 'under about 1 MB', (d) => {
    one(d, 'batch-aggregator').config.size = 50000
  })
  await failsOn('fl-066', 'recorded as failed', (d) => {
    const job = one(d, 'batch-job')
    job.routes = job.routes.filter((r) => r.config.acceptPolicy !== 'ONLY_FAILURES')
  })
  // The FAILED update sits in a step that accepts every record, so good rows are marked FAILED too.
  await failsOn('fl-066', 'recorded as failed', (d) => {
    one(d, 'batch-job').routes.find((r) => r.config.acceptPolicy === 'ONLY_FAILURES').config.acceptPolicy = 'ALL'
  })
  await failsOn('fl-066', 'emailed from On Complete', (d) => {
    const job = one(d, 'batch-job')
    job.routes.find((r) => r.config.name === 'mark-sent').steps.push(remove(job.onComplete, 'email-send'))
  })
  await failsOn('fl-066', 'only after they were published', (d) => {
    one(d, 'batch-job').routes.reverse()
  })
  await failsOn('fl-066', 'a re-run does not re-send', (d) => {
    one(d, 'db-select').config.sql = 'SELECT spc.CHANGE_ID, spc.STORE_ID, pc.SKU, pc.NEW_PRICE FROM STORE_PRICE_CHANGE spc JOIN PRICE_CHANGE pc ON pc.CHANGE_ID = spc.CHANGE_ID'
  })
  await failsOn('fl-066', 'at 01:30', (d) => {
    d.flows[0].source.config.expression = '0 0 5 * * ?'
  })
  await passes('fl-066', (d) => {
    d.flows[0].source.config.expression = '0 30 01 * * ?'
    one(d, 'batch-aggregator').config.size = 2000
  })
  // Failures go to an error table instead of an update of the status column.
  await passes('fl-066', (d) => {
    one(d, 'batch-job').routes.find((r) => r.config.acceptPolicy === 'ONLY_FAILURES').steps = [
      step('db-insert', { sql: 'INSERT INTO PRICE_DIST_ERROR (CHANGE_ID, STORE_ID, ERROR_TEXT) VALUES (:CHANGE_ID, :STORE_ID, :errorText)' }),
    ]
  })

  // FL-067
  await failsOn('fl-067', 'marked SENT only after', (d) => {
    const steps = flowOf(d, 'po-to-supplier').steps
    const update = remove(steps, 'db-update')
    steps.splice(steps.findIndex((n) => n.type === 'sftp-write'), 0, update)
  })
  await failsOn('fl-067', 'behind a Choice', (d) => {
    const steps = flowOf(d, '855').steps
    const choice = remove(steps, 'choice')
    steps.push(...choice.routes[0].steps)
  })
  await failsOn('fl-067', 'monitor raises overdue POs', (d) => {
    one({ flows: [flowOf(d, 'monitor')] }, 'jms-publish').config.destination = 'PROC.PO.APPROVED'
  })
  await failsOn('fl-067', 'only APPROVED POs are read', (d) => {
    one(d, 'db-select').config.sql = 'SELECT * FROM PO_HEADER h JOIN PO_LINE l ON l.PO_NUMBER = h.PO_NUMBER WHERE h.PO_NUMBER = :poNumber'
  })
  // A SENDING state written first, then SENT after the file.
  await passes('fl-067', (d) => {
    const steps = flowOf(d, 'po-to-supplier').steps
    steps.splice(steps.findIndex((n) => n.type === 'sftp-write'), 0, step('db-update', { sql: "UPDATE PO_HEADER SET STATUS = 'SENDING', EDI_ICN = :icn WHERE PO_NUMBER = :poNumber" }))
  })

  // FL-068
  await failsOn('fl-068', 'still leave time to tell QA', (d) => {
    one(d, 'until-successful').config.millisBetweenRetries = 60000
  })
  await failsOn('fl-068', 'One alert per excursion', (d) => {
    const route = one(d, 'choice').routes[0]
    const inner = route.steps.find((n) => n.type === 'choice')
    route.steps.splice(route.steps.indexOf(inner), 1, ...inner.routes[0].steps)
  })
  await failsOn('fl-068', 'recorded in Oracle', (d) => {
    const route = one(d, 'choice').routes[0]
    route.steps.push(remove(route.steps, 'db-stored-procedure'))
  })
  await failsOn('fl-068', 'escalated to QA', (d) => {
    const h = handlerFor(d, 'RETRY_EXHAUSTED')
    h.steps = [step('logger', { level: 'ERROR', message: 'TMS down' })]
  })
  await passes('fl-068', (d) => {
    Object.assign(one(d, 'until-successful').config, { maxRetries: 3, millisBetweenRetries: 20000 })
  })

  // FL-069
  await failsOn('fl-069', 'only after the quarantine committed', (d) => {
    const steps = flowOf(d, 'recall-api').steps
    one(d, 'try').steps.push(remove(steps, 'jms-publish'))
  })
  await failsOn('fl-069', 'inside a DB transaction with the recall record', (d) => {
    const t = one(d, 'try')
    const steps = flowOf(d, 'recall-api').steps
    steps.splice(steps.indexOf(t), 0, remove(t.steps, 'db-insert'))
  })
  await failsOn('fl-069', 'do not run inside the QA request', (d) => {
    const steps = flowOf(d, 'recall-api').steps
    steps.splice(steps.length - 2, 0, step('http-request', { method: 'POST', path: '/notifications/v1/campaigns' }))
  })
  await failsOn('fl-069', 'submitted twice', (d) => {
    const list = flowOf(d, 'recall-api').errorHandlers
    list.splice(list.findIndex((h) => h.config.type.includes('QUERY_EXECUTION')), 1)
  })
  await failsOn('fl-069', 'customer notification call is retried', (d) => {
    const route = one(d, 'scatter-gather').routes[2]
    const retry = route.steps.find((n) => n.type === 'until-successful')
    route.steps.splice(route.steps.indexOf(retry), 1, ...retry.steps)
  })
  // A double submission stopped by an Idempotent Message Validator instead of the 409 handler.
  await passes('fl-069', (d) => {
    const api = flowOf(d, 'recall-api')
    api.errorHandlers.splice(api.errorHandlers.findIndex((h) => h.config.type.includes('QUERY_EXECUTION')), 1)
    api.steps.splice(1, 0, step('idempotent', { idExpression: '#[payload.recallId]', objectStore: 'recalls' }))
  })
  await failsOn('fl-069', 'reads the destination the recall API publishes to', (d) => {
    flowOf(d, 'recall-api').steps.find((n) => n.type === 'jms-publish').config.destination = 'RECALL.RAISED'
  })
  await passes('fl-069', (d) => {
    flowOf(d, 'recall-api').steps.find((n) => n.type === 'jms-publish').config.destination = 'QA.RECALL.EVENTS'
    flowOf(d, 'recall-fanout').source.config.destination = 'QA.RECALL.EVENTS'
  })
  await failsOn('fl-069', 'WMS.HOLD.COMMANDS', (d) => {
    one(d, 'scatter-gather').routes[1].steps.find((n) => n.type === 'jms-publish').config.destination = 'WMS.COMMANDS'
  })

  // FL-070
  await failsOn('fl-070', 'never calls SAP', (d) => {
    const steps = flowOf(d, 'dock-receipt-intake').steps
    steps.push(step('http-request', { method: 'POST', path: '/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentHeader' }))
  })
  await failsOn('fl-070', 'one Oracle transaction', (d) => {
    const t = one(d, 'try')
    const outbox = t.steps.pop()
    one(d, 'choice').otherwise.push(outbox)
  })
  await failsOn('fl-070', 'not swallowed', (d) => {
    flowOf(d, 'dock-receipt-intake').errorHandlers[0].type = 'on-error-continue'
  })
  await failsOn('fl-070', 'checked for an existing document', (d) => {
    const t = one({ flows: [flowOf(d, 'gr-outbox')] }, 'try')
    t.steps = t.steps.filter((n) => n.type !== 'http-request')
  })
  await failsOn('fl-070', 'marked POSTED only after', (d) => {
    const t = one({ flows: [flowOf(d, 'gr-outbox')] }, 'try')
    t.steps.unshift(t.steps.pop())
  })
  await passes('fl-070', (d) => {
    one(d, 'choice').routes[0].steps.find((n) => n.type === 'jms-publish').config.destination = 'DOCK.BLIND.RECEIPTS'
    Object.assign(flowOf(d, 'gr-outbox').source.config, { frequency: 1, timeUnit: 'MINUTES' })
  })
  await failsOn('fl-070', 'No XA', (d) => {
    Object.assign(d.flows[0].source.config, { transactionalAction: 'ALWAYS_BEGIN', transactionType: 'XA' })
  })

  // FL-071
  await failsOn('fl-071', 'moved from its saved path to /error, and the error propagates', (d) => {
    d.flows[0].errorHandlers[0].type = 'on-error-continue'
  })
  // The default runs the post action on failure too, so a broken file lands in /archive.
  await failsOn('fl-071', 'does not archive a file whose processing failed', (d) => {
    d.flows[0].source.config.applyPostActionWhenFailed = 'true'
  })
  await failsOn('fl-071', 'from its saved path', (d) => {
    one(d, 'ftp-move').config.sourcePath = '#[attributes.path]'
  })
  await failsOn('fl-071', 'all or nothing', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  await failsOn('fl-071', 'size to stop changing', (d) => {
    d.flows[0].source.config.timeBetweenSizeCheck = 0
  })
  await failsOn('fl-071', 'batch size of at least 100', (d) => {
    one(d, 'foreach').config.batchSize = 1
  })
  await passes('fl-071', (d) => {
    one(d, 'foreach').config.batchSize = 500
    d.flows[0].source.config.timeBetweenSizeCheck = 60000
  })

  // FL-072
  const processTry = (d) => one(d, 'choice').routes[0].steps.find((n) => n.type === 'try')
  await failsOn('fl-072', 'every 10 minutes, Monday to Friday', (d) => {
    d.flows[0].source.config.expression = '0 0/10 * * * ?'
  })
  await failsOn('fl-072', 'error folder', (d) => {
    remove(processTry(d).errorHandlers[0].steps, 'sftp-move')
  })
  await failsOn('fl-072', 'archived only after it was posted', (d) => {
    const steps = processTry(d).steps
    steps.unshift(remove(steps, 'sftp-move'))
  })
  await failsOn('fl-072', 'read only when this worker claimed it', (d) => {
    const read = remove(processTry(d).steps, 'sftp-read')
    const loop = one(d, 'foreach').steps
    loop.splice(loop.findIndex((n) => n.type === 'choice'), 0, read)
  })
  await passes('fl-072', (d) => {
    d.flows[0].source.config.expression = '0 */10 6-19 ? * MON-FRI'
  })
  // the weekdays as numbers: in a Quartz cron 1 is Sunday, so 2-6 is Monday to Friday
  await passes('fl-072', (d) => {
    d.flows[0].source.config.expression = '0 0/10 6-20 ? * 2-6'
  })

  // FL-073
  await failsOn('fl-073', 'returns 400', (d) => {
    handlerFor(d, 'SCHEMA').steps.find((n) => n.type === 'set-variable').config.value = '#[500]'
  })
  await failsOn('fl-073', 'lands on the same blob', (d) => {
    one(d, 'set-variable', (n) => n.config.variableName === 'blobName').config.value = '#[uuid() ++ ".json"]'
  })
  await failsOn('fl-073', 'retryable 503', (d) => {
    handlerFor(d, 'AZURE').steps.find((n) => n.type === 'set-variable').config.value = '#[500]'
  })
  await failsOn('fl-073', 'logged after a successful upload', (d) => {
    const steps = d.flows[0].steps
    steps.unshift(remove(steps, 'logger'))
  })
  await failsOn('fl-073', 'supplier-invoices container', (d) => {
    one(d, 'azure-upload-blob').config.container = 'invoices'
  })
  await passes('fl-073', (d) => {
    one(d, 'set-variable', (n) => n.config.variableName === 'blobName').config.value =
      '#[(now() >> "UTC") as String {format: "yyyy/MM/dd"} ++ "/" ++ payload.supplierId ++ "-" ++ payload.invoiceNumber ++ ".json"]'
  })

  // FL-074
  await failsOn('fl-074', 'marked exported only after', (d) => {
    const steps = d.flows[0].steps
    const update = remove(steps, 'db-update')
    steps.splice(steps.findIndex((n) => n.type === 'sftp-write'), 0, update)
  })
  await failsOn('fl-074', 'fires at 02:30', (d) => {
    d.flows[0].source.config.expression = '0 0 4 * * ?'
  })
  await failsOn('fl-074', 'temporary name', (d) => {
    remove(d.flows[0].steps, 'sftp-rename')
  })
  await failsOn('fl-074', 'PREPARE_DAILY', (d) => {
    one(d, 'db-stored-procedure').config.sql = '{ call PKG_SETTLEMENT.RUN_EXPORT(:p_business_date) }'
  })
  await passes('fl-074', (d) => {
    d.flows[0].source.config.expression = '0 30 02 * * ?'
  })

  // FL-075
  await failsOn('fl-075', 'INVALID_INPUT_XML', (d) => {
    handlerFor(d, 'SCHEMA').config.type = 'XML-MODULE:SCHEMA_NOT_HONOURED'
  })
  await failsOn('fl-075', 'breaks the XSD', (d) => {
    handlerFor(d, 'SCHEMA').steps.find((n) => n.type === 'set-variable').config.value = '#[500]'
  })
  await failsOn('fl-075', 'Validation happens before', (d) => {
    const steps = d.flows[0].steps
    steps.unshift(remove(steps, 'xml-xslt'))
  })
  await failsOn('fl-075', 'carries the partner order number', (d) => {
    d.flows[0].steps[d.flows[0].steps.length - 1].config.script = '%dw 2.0\noutput application/xml\n---\nOrderAck: { Status: "ACCEPTED" }'
  })
  // One handler per error type.
  await passes('fl-075', (d) => {
    const h = handlerFor(d, 'SCHEMA')
    h.config.type = 'XML-MODULE:SCHEMA_NOT_HONOURED'
    d.flows[0].errorHandlers.splice(1, 0, { ...structuredClone(h), config: { type: 'XML-MODULE:INVALID_INPUT_XML' } })
  })

  // FL-076
  await failsOn('fl-076', 'deleted only after a successful upload', (d) => {
    const steps = one(d, 'try').steps
    steps.splice(1, 0, remove(steps, 's3-delete'))
  })
  await failsOn('fl-076', 'upload result is checked', (d) => {
    remove(one(d, 'try').steps, 'validation')
  })
  await failsOn('fl-076', 'connectivity handler comes before', (d) => {
    one(d, 'try').errorHandlers.reverse()
  })
  await failsOn('fl-076', 'at least every 10 minutes', (d) => {
    d.flows[0].source.config.frequency = 30
  })
  await failsOn('fl-076', 'acme-claims-scans-export', (d) => {
    one(d, 's3-list').config.prefix = ''
  })
  await passes('fl-076', (d) => {
    Object.assign(d.flows[0].source.config, { strategy: 'cron', expression: '0 0/5 * * * ?' })
  })

  // FL-077
  await failsOn('fl-077', 'older version arriving late', (d) => {
    const insert = one(d, 'db-insert')
    insert.config.sql = insert.config.sql.replace('\nWHERE orders.event_version <= EXCLUDED.event_version', '')
  })
  await failsOn('fl-077', 'keyed by customer ID', (d) => {
    one(d, 'kafka-publish', (n) => n.config.topic.includes('enriched')).config.key = '#[vars.evt.orderId]'
  })
  await failsOn('fl-077', 'database outage handler comes before', (d) => {
    d.flows[0].errorHandlers.reverse()
  })
  await failsOn('fl-077', 'published only after the database write', (d) => {
    const route = one(d, 'choice').routes[0]
    d.flows[0].steps.unshift(remove(route.steps, 'kafka-publish'))
  })
  // Parking only data errors, with no catch-all at all.
  await passes('fl-077', (d) => {
    handlerFor(d, 'ANY').config.type = 'MULE:EXPRESSION, VALIDATION:INVALID_BOOLEAN'
  })

  // FL-078
  await failsOn('fl-078', 'stops the loop', (d) => {
    const loop = one(d, 'foreach')
    const send = remove(loop.steps, 'sqs-send')
    loop.steps.splice(1, 0, scope('try', {}, [send], { errorHandlers: [handler('on-error-continue', { type: 'ANY' }, [step('logger', { message: 'send failed' })])] }))
  })
  await failsOn('fl-078', 'marked as sent only after', (d) => {
    const loop = one(d, 'foreach').steps
    loop.splice(1, 0, remove(loop, 'db-update'))
  })
  await failsOn('fl-078', 'one message per poll', (d) => {
    flowOf(d, 'carrier').source.config.numberOfMessages = 10
  })
  await failsOn('fl-078', 'the message is consumed', (d) => {
    remove(handlerFor(d, 'BAD_REQUEST').steps, 'sqs-delete')
  })
  await failsOn('fl-078', '400 handler comes before', (d) => {
    flowOf(d, 'carrier').errorHandlers.reverse()
  })
  await failsOn('fl-078', 'FIFO group', (d) => {
    one(d, 'sqs-send').config.groupId = '#["shipments"]'
  })
  await passes('fl-078', (d) => {
    Object.assign(one(d, 'sqs-send').config, { groupId: '#[vars.row.ORDER_ID]', deduplicationId: '#[vars.row.OUTBOX_ID as String]' })
  })

  // FL-079
  const otherwise079 = (d) => one(d, 'choice').otherwise
  await failsOn('fl-079', 'after the loop, not inside it', (d) => {
    const steps = otherwise079(d)
    one(d, 'foreach').steps.push(remove(steps, 'email-move'))
  })
  await failsOn('fl-079', 'does not delete emails', (d) => {
    d.flows[0].source.config.deleteAfterRetrieve = 'true'
  })
  await failsOn('fl-079', 'saved before the loop', (d) => {
    otherwise079(d).find((n) => n.type === 'email-move').config.emailId = '#[attributes.id]'
  })
  await failsOn('fl-079', 'NeedsReview', (d) => {
    one(d, 'choice').routes[0].steps.find((n) => n.type === 'email-move').config.targetFolder = 'Processed'
  })
  await failsOn('fl-079', 'Only PDF attachments', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/java\n---\n(payload.attachments default {}) pluck ((content, name) -> { name: name as String, content: content })'
  })
  // The PDF filter is a Choice inside the loop instead of a filter in the mapping.
  await passes('fl-079', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/java\n---\n(payload.attachments default {}) pluck ((content, name) -> { name: name as String, content: content })'
    const loop = one(d, 'foreach')
    const pick = createNode('choice')
    pick.routes = [{ ...pick.routes[0], config: { expression: '#[lower(payload.name) endsWith ".pdf"]' }, steps: loop.steps }]
    loop.steps = [pick]
  })

  // FL-080
  await failsOn('fl-080', 'mailbox flow only lands', (d) => {
    flowOf(d, 'courier-mailbox').steps.push(step('http-request', { method: 'POST', path: '/tracking/events' }))
  })
  await failsOn('fl-080', 'does not auto delete', (d) => {
    flowOf(d, 'spool').source.config.postAction = 'delete'
  })
  await failsOn('fl-080', 'deleted only after its row is inserted', (d) => {
    const steps = flowOf(d, 'spool').steps
    steps.splice(1, 0, remove(steps, 'file-delete'))
  })
  await failsOn('fl-080', 'never from an error handler', (d) => {
    one({ flows: [flowOf(d, 'processor')] }, 'try').errorHandlers[0].steps[0].config.sql = "UPDATE mail_landing SET status = 'DONE' WHERE message_id = :messageId"
  })
  await failsOn('fl-080', 'One failing row', (d) => {
    one({ flows: [flowOf(d, 'processor')] }, 'try').errorHandlers = []
  })

  // FL-081
  await failsOn('fl-081', 'marked as reported only after', (d) => {
    const steps = one(d, 'choice').otherwise
    steps.splice(steps.findIndex((n) => n.type === 'email-send'), 0, remove(steps, 'db-update'))
  })
  await failsOn('fl-081', 'Only the rows that were sent', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE INTEGRATION_EXCEPTIONS SET REPORTED_AT = SYSTIMESTAMP WHERE REPORTED_AT IS NULL'
  })
  await failsOn('fl-081', 'named exceptions.csv', (d) => {
    one(d, 'email-send').config.attachments = '#[{ "digest.csv": vars.exceptionsCsv }]'
  })
  await failsOn('fl-081', 'leaves the rows unreported', (d) => {
    d.flows[0].errorHandlers[0].steps.push(step('db-update', { database: 'Oracle', sql: 'UPDATE INTEGRATION_EXCEPTIONS SET REPORTED_AT = SYSTIMESTAMP WHERE CREATED_AT < :cutoff' }))
  })
  await failsOn('fl-081', 'fires at 02:00', (d) => {
    d.flows[0].source.config.expression = '0 0 3 * * ?'
  })
  await passes('fl-081', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE INTEGRATION_EXCEPTIONS SET REPORTED_AT = SYSTIMESTAMP WHERE EXCEPTION_ID IN (:ids)'
  })
  // The branches swapped: the email goes out exactly when there is nothing to report.
  const swap081 = (d) => {
    const choice = one(d, 'choice')
    const send = choice.otherwise
    choice.otherwise = choice.routes[0].steps
    choice.routes[0].steps = send
    return choice
  }
  await failsOn('fl-081', 'Choice branch that has rows', (d) => {
    swap081(d)
  })
  // The route now tests for rows, but the email stayed on the otherwise branch.
  await failsOn('fl-081', 'Choice branch that has rows', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[not isEmpty(payload)]'
  })
  await failsOn('fl-081', 'Choice branch that has rows', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[sizeOf(payload) > 0]'
  })
  // The route tests for rows and holds the email; the otherwise branch logs.
  await passes('fl-081', (d) => {
    swap081(d).routes[0].config.expression = '#[not isEmpty(payload)]'
  })
  await passes('fl-081', (d) => {
    swap081(d).routes[0].config.expression = '#[sizeOf(payload) > 0]'
  })
  await passes('fl-081', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[sizeOf(payload) == 0]'
  })

  // FL-082
  const badBatch = (d) => d.flows[0].errorHandlers.find((h) => h.type === 'on-error-continue')
  await failsOn('fl-082', 'ignores repeats', (d) => {
    one(d, 'db-bulk-insert').config.sql = 'INSERT INTO meter_reading (meter_id, read_at, kwh)\nVALUES (:meterId, :readAt, :kwh)\nON CONFLICT (meter_id, read_at) DO UPDATE SET kwh = EXCLUDED.kwh'
  })
  await failsOn('fl-082', 'that path commits as well', (d) => {
    remove(badBatch(d).steps, 'kafka-commit')
  })
  await failsOn('fl-082', 'every commit uses it', (d) => {
    badBatch(d).steps.find((n) => n.type === 'kafka-commit').config.consumerCommitKey = '#[attributes.consumerCommitKey]'
  })
  await failsOn('fl-082', 'that path does not commit', (d) => {
    handlerFor(d, 'DB:CONNECTIVITY').steps.push(step('kafka-commit', { consumerCommitKey: '#[vars.commitKey]' }))
  })
  await failsOn('fl-082', 'No catch-all On Error Continue', (d) => {
    badBatch(d).config.type = 'ANY'
  })
  await passes('fl-082', (d) => {
    d.flows[0].errorHandlers.reverse()
  })

  // FL-083
  const rangeRoute = (d) => one(d, 'try').steps.find((n) => n.type === 'choice').routes[0]
  await failsOn('fl-083', 'No offsets are committed', (d) => {
    rangeRoute(d).steps.push(step('kafka-commit', { consumerCommitKey: '#[vars.commitKey]' }))
  })
  await failsOn('fl-083', 'changes nothing for a row already there', (d) => {
    one(d, 'db-insert').config.sql = 'INSERT INTO ledger_posting (posting_id, account, amount, posted_at)\nVALUES (:postingId, :account, :amount, :postedAt)\nON CONFLICT (posting_id) DO UPDATE SET amount = EXCLUDED.amount'
  })
  await failsOn('fl-083', 'only when the range check passes', (d) => {
    const t = one(d, 'try')
    const route = rangeRoute(d)
    t.steps.splice(3, 0, ...route.steps)
    route.steps = [step('logger', { message: 'in range' })]
  })
  await failsOn('fl-083', 'caps a call at 2,000', (d) => {
    one(d, 'validation').config.expression = '#[vars.req.toOffset >= vars.req.fromOffset]'
  })
  await failsOn('fl-083', 'requested start offset', (d) => {
    one(d, 'kafka-seek').config.offset = '#[0]'
  })
  await failsOn('fl-083', 'replayed count and the last offset', (d) => {
    d.flows[0].steps.pop()
  })
  await passes('fl-083', (d) => {
    d.flows[0].steps[d.flows[0].steps.length - 1] = step('set-payload', {
      value: '#[output application/json --- { replayed: vars.replayed, lastOffset: vars.lastOffset }]',
    })
  })

  // FL-084
  await failsOn('fl-084', 'acknowledged only after the EMR', (d) => {
    const steps = d.flows[0].steps
    steps.splice(2, 0, remove(steps, 'jms-ack'))
  })
  await failsOn('fl-084', 'transient failure recovers', (d) => {
    const recover = remove(handlerFor(d, 'ANY').steps, 'jms-recover-session')
    handlerFor(d, 'INVALID_RESULT').steps.push(recover)
  })
  await failsOn('fl-084', 'parking handler comes before', (d) => {
    d.flows[0].errorHandlers.reverse()
  })
  await failsOn('fl-084', 'acknowledged after the publish', (d) => {
    const steps = handlerFor(d, 'INVALID_RESULT').steps
    steps.unshift(remove(steps, 'jms-ack'))
  })
  await failsOn('fl-084', 'PUT by result ID', (d) => {
    one(d, 'http-request').config.method = 'POST'
  })
  // The catch-all asks for redelivery from On Error Propagate instead.
  await passes('fl-084', (d) => {
    handlerFor(d, 'ANY').type = 'on-error-propagate'
  })

  // FL-085
  const kindRoute = (d, kind) => one(d, 'choice').routes.find((r) => r.config.expression.includes(kind)).steps[0]
  await failsOn('fl-085', 'Safety notices', (d) => {
    kindRoute(d, 'SAFETY').config.persistentDelivery = 'false'
  })
  await failsOn('fl-085', 'Gate changes expire', (d) => {
    kindRoute(d, 'GATE_CHANGE').config.timeToLive = 0
  })
  await failsOn('fl-085', 'Position updates expire', (d) => {
    one(d, 'choice').otherwise[0].config.timeToLive = 0
  })
  await failsOn('fl-085', 'one consumer', (d) => {
    flowOf(d, 'gate-displays').source.config.numberOfConsumers = 4
  })
  await failsOn('fl-085', 'named durable subscription', (d) => {
    flowOf(d, 'duty-manager').source.config.durable = 'false'
  })
  await failsOn('fl-085', 'named durable subscription', (d) => {
    flowOf(d, 'duty-manager').source.config.subscriptionName = ''
  })
  // The gate displays keep their durable subscription too; time to live stops the stale backlog.
  await passes('fl-085', (d) => {
    Object.assign(flowOf(d, 'gate-displays').source.config, { durable: 'true', subscriptionName: 'gate-displays-fra' })
  })
  await passes('fl-085', (d) => {
    kindRoute(d, 'GATE_CHANGE').config.timeToLive = 1200000
    kindRoute(d, 'SAFETY').config.priority = 8
  })

  // FL-086
  const archive086 = (d) => flowOf(d, 'write-and-archive').steps
  await failsOn('fl-086', 'unique name', (d) => {
    archive086(d).find((n) => n.type === 'file-move').config.renameTo = ''
  })
  await failsOn('fl-086', 'not appended', (d) => {
    one(d, 'file-write').config.mode = 'APPEND'
  })
  await failsOn('fl-086', 'archived after the output', (d) => {
    archive086(d).reverse()
  })
  await failsOn('fl-086', 'semicolon separator', (d) => {
    const csv = one(d, 'transform', (n) => n.config.script.includes('application/csv'))
    csv.config.script = csv.config.script.replace(', {separator: ";"}', '')
  })
  await passes('fl-086', (d) => {
    archive086(d).find((n) => n.type === 'file-move').config.renameTo = '#[uuid() ++ "-" ++ vars.fileName]'
  })

  // FL-087
  await failsOn('fl-087', 'no APPEND', (d) => {
    one(d, 'file-write').config.mode = 'APPEND'
  })
  await failsOn('fl-087', 'does not clash in the archive', (d) => {
    one(d, 'file-move', (n) => n.config.targetPath.includes('archive')).config.renameTo = ''
  })
  await failsOn('fl-087', 'emailed when a file is rejected', (d) => {
    remove(d.flows[0].errorHandlers[0].steps, 'email-send')
  })
  await failsOn('fl-087', 'No region file is written before', (d) => {
    const steps = d.flows[0].steps
    const choice = remove(steps, 'choice')
    steps.splice(steps.findIndex((n) => n.type === 'foreach') + 1, 0, choice)
  })
  await failsOn('fl-087', 'trailer is split off', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/java\nvar rows = read(payload.^raw, "application/csv")\n---\n{ expected: -1, actual: sizeOf(rows), regions: (rows groupBy $.region) pluck ((r, k) -> { region: k as String, rows: r }) }'
  })
  await passes('fl-087', (d) => {
    one(d, 'file-move', (n) => n.config.targetPath.includes('archive')).config.renameTo = '#[uuid() ++ "-" ++ vars.fileName]'
  })

  // FL-088
  await failsOn('fl-088', 'refuse to replace an existing file', (d) => {
    one(d, 'file-write', (n) => n.config.path.includes('/json/')).config.mode = 'OVERWRITE'
  })
  await failsOn('fl-088', 'duplicates for review', (d) => {
    one(d, 'choice').routes[0].steps[0].config.targetPath = '/data/manifests/archive'
  })
  await failsOn('fl-088', 'rejects.csv', (d) => {
    one(d, 'file-write', (n) => n.config.path.includes('rejects')).config.path = '#["/data/manifests/out/bad/" ++ vars.baseName ++ ".csv"]'
  })
  await failsOn('fl-088', 'validated against carrier-manifest-v3.xsd', (d) => {
    const steps = d.flows[0].steps
    const validate = remove(steps, 'xml-validate')
    steps.splice(steps.findIndex((n) => n.type === 'try'), 0, validate)
  })
  await passes('fl-088', (d) => {
    one(d, 'xml-validate').config.schemas = 'xsd/carrier-manifest-v3.xsd'
  })
}
