// Wrong and other correct designs for batch K (fl-151 to fl-174): queues and Azure Blob Storage. See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, flowOf, step, scope, handler }) => {
  // FL-151
  // AUTO acknowledgement: the broker removes the reading whatever happens.
  await failsOn('fl-151', 'MANUAL acknowledgement', (d) => {
    d.flows[0].source.config.acknowledgementMode = 'AUTO'
  })
  // The handler only logs: a failed reading is left unacknowledged instead of going back at once.
  await failsOn('fl-151', 'Run: The database is down', (d) => {
    const h = one(d, 'on-error-continue')
    h.steps = h.steps.filter((n) => n.type !== 'mq-nack')
  })
  // Ack before the insert.
  await failsOn('fl-151', 'acknowledged after the insert', (d) => {
    const steps = d.flows[0].steps
    const ack = steps.pop()
    steps.splice(1, 0, ack)
  })
  // On Error Propagate with the Nack in it.
  await passes('fl-151', (d) => {
    one(d, 'on-error-continue').type = 'on-error-propagate'
  })

  // FL-152
  // No upper(): a lower case channel goes to ORDERS.UNKNOWN.
  await failsOn('fl-152', 'Run: A channel in lower case', (d) => {
    one(d, 'set-variable').config.value = '#[payload.channel default ""]'
  })
  // Unknown channels dropped with a log only.
  await failsOn('fl-152', 'ORDERS.UNKNOWN', (d) => {
    const c = one(d, 'choice')
    c.otherwise = c.otherwise.filter((n) => n.type !== 'jms-publish')
  })
  // The routes test the payload directly with lower().
  await passes('fl-152', (d) => {
    const c = one(d, 'choice')
    c.routes[0].config.expression = '#[lower(payload.channel default "") == "b2b"]'
    c.routes[1].config.expression = '#[lower(payload.channel default "") == "web"]'
  })

  // FL-153
  // The store ID is not added: consumers cannot tell which shop sold it.
  await failsOn('fl-153', 'Run: A batch of three sales', (d) => {
    one(d, 'set-payload').config.value = '#[payload]'
  })
  // The whole batch published once instead of each sale.
  await failsOn('fl-153', 'inside the loop', (d) => {
    const loop = one(d, 'foreach')
    const pub = loop.steps.pop()
    d.flows[0].steps.push(pub)
  })
  // A Transform builds each message.
  await passes('fl-153', (d) => {
    const loop = one(d, 'foreach')
    loop.steps[0] = step('transform', { script: '%dw 2.0\noutput application/json\n---\npayload ++ { storeId: vars.storeId, businessDate: vars.businessDate }' })
  })

  // FL-154
  // No duplicate check: a resent message ID is recorded again and fails on the key.
  await failsOn('fl-154', 'Run: The same message ID again', (d) => {
    d.flows[0].steps = d.flows[0].steps.filter((n) => n.type !== 'choice')
  })
  // A catch-all handler: an Oracle outage gets a REJECTED ACK instead of a retry.
  await failsOn('fl-154', 'Run: Oracle is down', (d) => {
    one(d, 'on-error-continue').config.type = 'ANY'
  })
  // The schema check left out: an invalid notification is recorded.
  await failsOn('fl-154', 'JSON schema', (d) => {
    d.flows[0].steps = d.flows[0].steps.filter((n) => n.type !== 'validation')
  })
  // The hand-off before the RECEIVED ACK.
  await passes('fl-154', (d) => {
    const s = d.flows[0].steps
    const [ackPayload, ack, workPayload, work] = s.splice(s.length - 4, 4)
    s.push(workPayload, work, ackPayload, ack)
  })

  // FL-155
  // No check: a redelivered payment is credited twice.
  await failsOn('fl-155', 'Run: The same payment delivered again', (d) => {
    const c = one(d, 'choice')
    d.flows[0].steps.splice(d.flows[0].steps.indexOf(c), 1, ...c.routes[0].steps)
  })
  // Recorded before the billing call: a billing outage marks the payment done and it is never credited.
  await failsOn('fl-155', 'Run: Billing is down', (d) => {
    const r = one(d, 'choice').routes[0]
    const ins = r.steps.pop()
    r.steps.unshift(ins)
  })
  // The Choice the other way round.
  await passes('fl-155', (d) => {
    const c = one(d, 'choice')
    const work = c.routes[0].steps
    c.routes[0].steps = c.otherwise
    c.otherwise = work
    c.routes[0].config.expression = '#[sizeOf(vars.seen) > 0]'
  })

  // FL-156
  // One queue for everything: emergencies wait behind routine work.
  await failsOn('fl-156', 'repairs-emergency', (d) => {
    one(d, 'mq-publish', (n) => n.config.destination === 'repairs-emergency').config.destination = 'repairs-routine'
  })
  // A missing priority treated as an emergency.
  await failsOn('fl-156', 'Run: A repair with no priority', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[upper(payload.priority default "EMERGENCY") == "EMERGENCY"]'
  })
  // Lane chosen with an "is it routine" test.
  await passes('fl-156', (d) => {
    const c = one(d, 'choice')
    const em = c.routes[0].steps
    c.routes[0].steps = c.otherwise
    c.otherwise = em
    c.routes[0].config.expression = '#[upper(payload.priority default "") != "EMERGENCY"]'
  })

  // FL-157
  // Not durable: events published overnight are lost.
  await failsOn('fl-157', 'durable and has a fixed name', (d) => {
    d.flows[0].source.config.durable = 'false'
  })
  // Four consumers on the topic.
  await failsOn('fl-157', 'One consumer', (d) => {
    d.flows[0].source.config.numberOfConsumers = 4
  })
  // Every event stored.
  await failsOn('fl-157', 'Run: A door fault', (d) => {
    const c = one(d, 'choice')
    c.routes[0].config.expression = '#[true or payload.eventType == "ARRIVED"]'
  })
  // The test written with two equals.
  await passes('fl-157', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[payload.eventType == "DEPARTED" or payload.eventType == "ARRIVED"]'
  })

  // FL-158
  // No health checks: messages are replayed into an outage.
  await failsOn('fl-158', 'Run: Oracle is still down', (d) => {
    d.flows[0].steps = d.flows[0].steps.filter((n) => n.type !== 'db-select')
  })
  // No Try for the timeout: an empty queue fails the restart with 503.
  await failsOn('fl-158', 'Run: Nothing has failed', (d) => {
    const t = one(d, 'try')
    d.flows[0].steps.splice(d.flows[0].steps.indexOf(t), 1, ...t.steps)
  })
  // Blob storage checked first, then Oracle, and a smaller cap.
  await passes('fl-158', (d) => {
    const s = d.flows[0].steps
    ;[s[0], s[1]] = [s[1], s[0]]
    one(d, 'foreach').config.collection = '#[1 to 200]'
  })

  // FL-159
  // No transaction: a failed audit insert leaves the claim sent on.
  await failsOn('fl-159', 'Run: The audit insert fails after the publish', (d) => {
    d.flows[0].source.config.transactionalAction = 'NONE'
  })
  // A catch-all On Error Continue commits a claim whose policy lookup failed.
  await failsOn('fl-159', 'No catch-all', (d) => {
    one(d, 'on-error-continue').config.type = 'ANY'
  })
  // The handler also catches HTTP:BAD_REQUEST, which can never succeed either.
  await passes('fl-159', (d) => {
    one(d, 'on-error-continue').config.type = 'HTTP:NOT_FOUND, HTTP:BAD_REQUEST'
  })

  // FL-160
  // The reply updates any declaration: a repeat overwrites CLEARED with HOLD.
  await failsOn('fl-160', 'Run: The same reply twice', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE declarations SET status = :status, mrn = :mrn WHERE declaration_id = :correlationId AND status IS NOT NULL'
  })
  // Unknown replies dropped.
  await failsOn('fl-160', 'Run: A reply for a declaration nobody sent', (d) => {
    const inner = one(d, 'choice', (c) => c.routes[0].config.expression.includes('known'))
    inner.routes[0].steps = [step('logger', { level: 'INFO', message: 'unknown' })]
  })
  // Published before the row is saved.
  await failsOn('fl-160', 'saved as SUBMITTED before', (d) => {
    const s = flowOf(d, 'submit').steps
    const ins = s.splice(1, 1)[0]
    s.splice(3, 0, ins)
  })
  // The match checked with a Select first, then the update.
  await passes('fl-160', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[vars.updated.affectedRows < 1]'
  })

  // FL-161
  // No transaction: a failed staging load leaves the rejects behind.
  await failsOn('fl-161', 'Run: The staging load fails', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // The email outside Async: a mail outage fails the run.
  await failsOn('fl-161', 'Run: The mail server is down', (d) => {
    const s = d.flows[0].steps
    const a = s.find((n) => n.type === 'async')
    s.splice(s.indexOf(a), 1, ...a.steps)
  })
  // The handler propagates: the document comes back from the broker and is also parked.
  await failsOn('fl-161', 'Run: The staging load fails', (d) => {
    one(d, 'on-error-continue').type = 'on-error-propagate'
  })
  // Staging loaded before the rejects.
  await passes('fl-161', (d) => {
    const t = one(d, 'try')
    t.steps.reverse()
  })

  // FL-162
  // No running check: two runs of the same type.
  await failsOn('fl-162', 'Run: A SupplierItem run is already going', (d) => {
    const outer = one(d, 'choice')
    const inner = outer.otherwise.find((n) => n.type === 'choice')
    outer.otherwise = inner.otherwise
  })
  // The procedure called while the caller waits.
  await failsOn('fl-162', 'Async scope', (d) => {
    const outer = one(d, 'choice')
    const inner = outer.otherwise.find((n) => n.type === 'choice')
    const a = inner.otherwise.find((n) => n.type === 'async')
    inner.otherwise.splice(inner.otherwise.indexOf(a), 1, ...a.steps)
  })
  // A failed run left RUNNING for ever.
  await failsOn('fl-162', 'Run: Oracle fails to generate', (d) => {
    const h = one(d, 'on-error-continue')
    h.steps = h.steps.filter((n) => n.type !== 'db-update')
  })
  // A different nightly time and a longer allow list.
  await passes('fl-162', (d) => {
    d.flows[0].source.config.expression = '0 30 1 * * ?'
    one(d, 'choice').routes[0].config.expression = '#[not (["Item", "SupplierItem", "Barcode", "TransferOrder", "InventoryTransaction"] contains vars.messageType)]'
  })

  // FL-163
  // Named after the file name only: the second receipt replaces the first.
  await failsOn('fl-163', 'new for every upload', (d) => {
    one(d, 'set-variable', (n) => n.config.variableName === 'blobName').config.value = '#["receipts/" ++ payload.employeeId ++ "/" ++ payload.fileName]'
  })
  // No handler: the app gets 500.
  await failsOn('fl-163', 'Run: Blob storage cannot be reached', (d) => {
    d.flows[0].errorHandlers = []
  })
  // The UUID as a folder of its own, before the file name.
  await passes('fl-163', (d) => {
    one(d, 'set-variable', (n) => n.config.variableName === 'blobName').config.value = '#["receipts/" ++ payload.employeeId ++ "/" ++ uuid() ++ "/" ++ payload.fileName]'
  })

  // FL-164
  // Written to the wrong folder.
  await failsOn('fl-164', 'Run: The nightly transfer', (d) => {
    one(d, 'sftp-write').config.path = '/outbound/FENWICK-PAYROLL.csv'
  })
  // Every hour instead of nightly.
  await failsOn('fl-164', '01:30', (d) => {
    d.flows[0].source.config = { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'HOURS' }
  })
  // No logger at the end.
  await passes('fl-164', (d) => {
    d.flows[0].steps = d.flows[0].steps.filter((n) => n.type !== 'logger')
  })

  // FL-165
  // Everything deleted.
  await failsOn('fl-165', 'Run: Two old recordings and a new one', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[daysBetween((payload.lastModified as DateTime) as Date, now() as Date) >= 0]'
  })
  // 9 days instead of 90.
  await failsOn('fl-165', 'Run: Nothing is old enough', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[daysBetween((payload.lastModified as DateTime) as Date, now() as Date) > 2]'
  })
  // The cut-off worked out as a date first.
  await passes('fl-165', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[(payload.lastModified as DateTime) < (now() - |P90D|)]'
  })

  // FL-166
  // No sender document check: a resent document is routed again.
  await failsOn('fl-166', 'Run: A sender document sent twice', (d) => {
    d.flows[0].steps = d.flows[0].steps.filter((n) => !(n.type === 'choice' && n.routes.length === 1))
  })
  // Unknown types dropped silently.
  await failsOn('fl-166', 'Run: A message type the hub does not process', (d) => {
    const router = d.flows[0].steps.filter((n) => n.type === 'choice').pop()
    router.otherwise = [step('logger', { level: 'INFO', message: 'ignored' })]
  })
  // Catch-all: storage outages answered REJECTED.
  await failsOn('fl-166', 'Run: Blob storage is down', (d) => {
    one(d, 'on-error-continue').config.type = 'ANY'
  })
  // A route per type written with a lower case compare.
  await passes('fl-166', (d) => {
    const router = d.flows[0].steps.filter((n) => n.type === 'choice').pop()
    router.routes[0].config.expression = '#[lower(vars.document.messageType) == "item"]'
  })

  // FL-167
  // A fixed content type.
  await failsOn('fl-167', 'worked out from the file extension', (d) => {
    one(d, 'azure-upload-blob').config.contentType = 'application/octet-stream'
  })
  // Case sensitive lookup: REPORT.PDF is refused.
  await failsOn('fl-167', 'Run: A PDF in capitals', (d) => {
    const v = one(d, 'set-variable', (n) => n.config.variableName === 'contentType')
    v.config.value = v.config.value.replace('lower((vars.fileName splitBy ".")[-1])', '(vars.fileName splitBy ".")[-1]')
  })
  // A Choice per extension would also do; here the map is read in the upload itself.
  await passes('fl-167', (d) => {
    one(d, 'azure-upload-blob').config.contentType = '#[vars.contentType default "application/pdf"]'
  })

  // FL-168
  // Delete before the copy: a failed copy loses the document.
  await failsOn('fl-168', 'Run: The copy to pdh-processed fails', (d) => {
    const s = d.flows[0].steps
    const up = s.findIndex((n) => n.type === 'azure-upload-blob')
    ;[s[up], s[up + 1]] = [s[up + 1], s[up]]
  })
  // Moved before the load.
  await failsOn('fl-168', 'Run: The staging load fails', (d) => {
    const s = d.flows[0].steps
    const bulk = s.splice(1, 2)
    s.splice(s.findIndex((n) => n.type === 'db-update'), 0, ...bulk)
  })
  // The whole document uploaded without removing messageType, and no logger.
  await passes('fl-168', (d) => {
    one(d, 'set-payload', (n) => n.config.value.includes('messageType')).config.value = '#[output application/json --- vars.doc]'
    d.flows[0].steps = d.flows[0].steps.filter((n) => n.type !== 'logger')
  })

  // FL-169
  // The whole form uploaded.
  await failsOn('fl-169', 'photo part\'s content', (d) => {
    one(d, 'azure-upload-blob').config.fileStream = '#[payload]'
  })
  // The request's content type used.
  await failsOn('fl-169', 'part\'s own headers', (d) => {
    one(d, 'azure-upload-blob').config.contentType = 'multipart/form-data'
  })
  // The content type read from the variable.
  await passes('fl-169', (d) => {
    one(d, 'azure-upload-blob').config.contentType = '#[vars.contentType default payload.parts.photo.headers."Content-Type"]'
  })

  // FL-170
  // No row by row fallback: one bad row loses its group.
  await failsOn('fl-170', 'Run: One record has no GTIN', (d) => {
    const outer = one(d, 'try', (t) => t.errorHandlers?.length)
    outer.errorHandlers[0].steps = [step('logger', { level: 'WARN', message: 'group failed' })]
  })
  // No transaction around the bulk insert: the good rows before the bad one stay, and the fallback inserts them again.
  await failsOn('fl-170', 'own transaction', (d) => {
    one(d, 'try', (t) => t.config.transactionalAction === 'ALWAYS_BEGIN').config.transactionalAction = 'INDIFFERENT'
  })
  // A smaller aggregator.
  await passes('fl-170', (d) => {
    one(d, 'batch-aggregator').config.size = 200
  })

  // FL-171
  // Any customer's statement can be linked.
  await failsOn('fl-171', 'Run: Someone else\'s statement', (d) => {
    const sel = one(d, 'db-select')
    sel.config.sql = 'SELECT blob_name FROM statements WHERE statement_id = :statementId'
    sel.config.inputParameters = '#[{ statementId: attributes.uriParams.statementId, customerId: authentication.principal }]'
  })
  // A day long link.
  await failsOn('fl-171', 'Run: A customer opens October', (d) => {
    const sp = one(d, 'set-payload', (n) => n.config.value.includes('expiresInMinutes'))
    sp.config.value = sp.config.value.replace('expiresInMinutes: 15', 'expiresInMinutes: 1440')
  })
  // The Choice the other way round.
  await passes('fl-171', (d) => {
    const c = one(d, 'choice')
    const nf = c.routes[0].steps
    c.routes[0].steps = c.otherwise
    c.otherwise = nf
    c.routes[0].config.expression = '#[not isEmpty(vars.statement)]'
  })

  // FL-172
  // A refused file stays in claims-inbound and is sent for ever.
  await failsOn('fl-172', 'then leaves claims-inbound', (d) => {
    const h = one(d, 'on-error-continue', (x) => x.config.type.includes('BAD_REQUEST'))
    h.steps = h.steps.filter((n) => n.type !== 'azure-delete-blob')
  })
  // One catch-all handler that moves every failure to claims-errors.
  await failsOn('fl-172', 'Run: The claims API is down', (d) => {
    const t = one(d, 'try')
    t.errorHandlers = [t.errorHandlers[0]]
    t.errorHandlers[0].config.type = 'ANY'
  })
  // The outage handler also names HTTP:INTERNAL_SERVER_ERROR.
  await passes('fl-172', (d) => {
    one(d, 'on-error-continue', (x) => x.config.type.includes('SERVICE_UNAVAILABLE')).config.type += ', HTTP:INTERNAL_SERVER_ERROR'
  })

  // FL-173
  // Announced before the upload: recipients look for a blob that is not there.
  await failsOn('fl-173', 'only after the upload', (d) => {
    const t = one(d, 'try')
    const [p1, up, p2, pub] = t.steps.splice(0, 4)
    t.steps.unshift(p2, pub, p1, up)
  })
  // Failures never counted: a broken message is tried for ever.
  await failsOn('fl-173', 'Run: The fifth failure', (d) => {
    one(d, 'db-update', (n) => n.config.sql.includes('attempts')).config.sql = 'UPDATE pdh_outbound_messages SET attempts = attempts + 1 WHERE message_id = :messageId AND status <> \'FAILED\''
  })
  // A smaller page of 20 a run.
  await passes('fl-173', (d) => {
    const s = one(d, 'db-select')
    s.config.sql = s.config.sql.replace('FETCH FIRST 50 ROWS ONLY', 'FETCH FIRST 20 ROWS ONLY')
  })

  // FL-174
  // No handshake: the subscription can never be created.
  await failsOn('fl-174', 'Run: Event Grid checks the endpoint', (d) => {
    const c = one(d, 'choice')
    flowOf(d, 'receive').steps = c.otherwise
  })
  // No check for a repeat: the feed is imported twice.
  await failsOn('fl-174', 'Run: The same event delivered again', (d) => {
    const worker = flowOf(d, 'import')
    const ins = worker.steps.find((n) => n.type === 'db-insert')
    ins.config.sql = 'INSERT INTO processed_blob_events (event_id, blob_name) VALUES (:eventId, :blobName)'
    const c = worker.steps.find((n) => n.type === 'choice')
    worker.steps.splice(worker.steps.indexOf(c), 1, ...c.routes[0].steps)
    worker.steps.splice(worker.steps.indexOf(ins), 1)
  })
  // The work done while Event Grid waits.
  await failsOn('fl-174', 'handed to a VM queue', (d) => {
    one(d, 'vm-publish').config.queueName = 'blob-events'
  })
  // A repeat spotted with affectedRows > 0.
  await passes('fl-174', (d) => {
    flowOf(d, 'import').steps.find((n) => n.type === 'choice').routes[0].config.expression = '#[vars.recorded.affectedRows > 0]'
  })
}
