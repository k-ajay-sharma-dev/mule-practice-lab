// Wrong and other correct designs for batch N (fl-223 to fl-246): Oracle and email. See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, flowOf, step, scope, handler }) => {
  // Replace a router with the steps of one of its branches, in whatever list holds it.
  const flatten = (list, node, steps) => list.splice(list.indexOf(node), 1, ...steps)

  // FL-223
  // No duplicate check: a resent notification is recorded and ACKed again.
  await failsOn('fl-223', 'Run: The same notification again', (d) => {
    const c = one(d, 'choice')
    flatten(d.flows[0].steps, c, c.otherwise)
  })
  // The ACK goes out before the row is written.
  await failsOn('fl-223', 'after the row is written', (d) => {
    const o = one(d, 'choice').otherwise
    const insert = o.shift()
    o.push(insert)
  })
  // The lookup also reads the status.
  await passes('fl-223', (d) => {
    one(d, 'db-select').config.sql = 'SELECT message_id, status FROM inbound_messages WHERE message_id = :messageId'
  })

  // FL-224
  // MAX plus one instead of the sequence.
  await failsOn('fl-224', 'RETURN_SEQ.NEXTVAL', (d) => {
    one(d, 'db-select').config.sql = 'SELECT NVL(MAX(return_id), 0) + 1 AS return_id FROM store_returns'
  })
  // No quantity check: a return of 0 is stored.
  await failsOn('fl-224', 'Run: A return with no quantity', (d) => {
    const c = one(d, 'choice')
    flatten(d.flows[0].steps, c, c.otherwise)
  })
  // Another alias for the ID (Oracle gives it back as ID).
  await passes('fl-224', (d) => {
    one(d, 'db-select').config.sql = 'SELECT RETURN_SEQ.NEXTVAL AS id FROM dual'
    one(d, 'set-variable', (s) => s.config.variableName === 'returnId').config.value = '#[vars.seq[0].ID]'
  })

  // FL-225
  // No handler: a failed purge leaves the job STARTED for ever.
  await failsOn('fl-225', 'Run: The delete fails', (d) => {
    d.flows[0].errorHandlers = []
  })
  // Every row deleted, new ones too.
  await failsOn('fl-225', 'Only rows older than the cut off', (d) => {
    const del = one(d, 'db-delete')
    del.config.sql = 'DELETE FROM stg_supplier_items'
    del.config.inputParameters = ''
  })
  // On Error Propagate: the job is still marked FAILED.
  await passes('fl-225', (d) => {
    d.flows[0].errorHandlers[0].type = 'on-error-propagate'
  })

  // FL-226
  // A plain bulk insert: a resent item fails on the key.
  await failsOn('fl-226', 'MERGE on supplier and item', (d) => {
    one(d, 'db-bulk-update').config.sql = 'INSERT INTO stg_supplier_item (supplier_id, item_id, case_qty, description, message_id) VALUES (:supplier_id, :item_id, :case_qty, :description, :message_id)'
  })
  // The MERGE run through the Bulk Insert operation instead.
  await passes('fl-226', (d) => {
    one(d, 'db-bulk-update').type = 'db-bulk-insert'
  })

  // FL-227
  // A code map hard coded in DataWeave: a new code needs a release.
  await failsOn('fl-227', 'Run: The data team adds BX to the map', (d) => {
    const s = d.flows[0].steps
    s.splice(s.findIndex((n) => n.type === 'db-select'), 1)
    const t = one(d, 'transform')
    t.config.script = t.config.script.replace('var codes = { (vars.uomMap map ((m) -> { (m.ext_code): m.int_code })) }', 'var codes = { CS: "CASE", EA: "EACH", PL: "PALLET" }')
  })
  // Unknown codes are dropped instead of rejected.
  await failsOn('fl-227', 'Lines with an unknown code', (d) => {
    const s = d.flows[0].steps
    s.splice(s.indexOf(all(d, 'choice')[1]), 1)
  })
  // The map read in code order.
  await passes('fl-227', (d) => {
    one(d, 'db-select').config.sql = "SELECT ext_code, int_code FROM code_map WHERE map_name = 'UOM' ORDER BY ext_code"
  })

  // FL-228
  // The store ID joined into the SQL text.
  await failsOn('fl-228', 'bound parameter', (d) => {
    const p = one(d, 'db-stored-procedure')
    p.config.sql = '#["{ call ORDERS_PKG.GET_OPEN_ORDERS(\'" ++ vars.storeId ++ "\', :p_status, :p_orders) }"]'
    p.config.inputParameters = ''
  })
  // No 404: an unknown store looks like a store with no orders.
  await failsOn('fl-228', 'Run: A store that does not exist', (d) => {
    const c = one(d, 'choice')
    flatten(d.flows[0].steps, c, c.otherwise)
  })
  // Any status other than OK is a 404.
  await passes('fl-228', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[vars.result.p_status != "OK"]'
  })

  // FL-229
  // No transaction: a failed credit loses the debited stock.
  await failsOn('fl-229', 'one transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // The debit does not check the shelf.
  await failsOn('fl-229', 'Run: More than the shelf holds', (d) => {
    const u = one(d, 'db-update')
    u.config.sql = u.config.sql.replace(' AND qty >= :qty', '')
  })
  // On Error Propagate with the 409.
  await passes('fl-229', (d) => {
    d.flows[0].errorHandlers[0].type = 'on-error-propagate'
  })

  // FL-230
  // The bulk insert without its own transaction: a failed group leaves rows behind.
  await failsOn('fl-230', 'own transaction', (d) => {
    one(d, 'try', (t) => t.config.transactionalAction === 'ALWAYS_BEGIN').config.transactionalAction = 'INDIFFERENT'
  })
  // The fallback handler on the transactional Try: On Error Continue commits the half group first.
  await failsOn('fl-230', 'Run: One item has no case quantity', (d) => {
    const agg = one(d, 'batch-aggregator')
    const outer = agg.steps[0]
    const inner = outer.steps[0]
    inner.errorHandlers = outer.errorHandlers
    agg.steps = [inner]
  })
  // On Complete does not close the job row.
  await failsOn('fl-230', 'On Complete closes the job row', (d) => {
    one(d, 'batch-job').onComplete = []
  })
  // Groups of 2.
  await passes('fl-230', (d) => {
    one(d, 'batch-aggregator').config.size = 2
  })

  // FL-231
  // FOR UPDATE without SKIP LOCKED: the second worker waits.
  await failsOn('fl-231', 'FOR UPDATE SKIP LOCKED', (d) => {
    const sel = one(d, 'db-select')
    sel.config.sql = sel.config.sql.replace(' SKIP LOCKED', '')
  })
  // The store calls made inside the transaction, holding the locks.
  await failsOn('fl-231', 'never inside the transaction', (d) => {
    const s = d.flows[0].steps
    const loop = s.pop()
    one(d, 'try').steps.push(loop)
  })
  // A failed call leaves the row in SENDING for ever.
  await failsOn('fl-231', 'Run: Store 0415 does not answer', (d) => {
    const h = one(d, 'on-error-continue')
    h.steps = h.steps.filter((n) => n.type !== 'db-update')
  })
  // Every 20 seconds.
  await passes('fl-231', (d) => {
    d.flows[0].source.config.frequency = 20
  })

  // FL-232
  // No transaction: a failed apply leaves staging rows behind.
  await failsOn('fl-232', 'one transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // The ACK published before the load.
  await failsOn('fl-232', 'after the transaction', (d) => {
    const s = d.flows[0].steps
    const publish = s.pop()
    s.splice(s.findIndex((n) => n.type === 'try'), 0, publish)
  })
  // On Error Propagate that logs: the message still goes back.
  await passes('fl-232', (d) => {
    d.flows[0].errorHandlers = [handler('on-error-propagate', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#["Sales load failed: " ++ error.description]' })])]
  })

  // FL-233
  // No sender document check: a resent document loads again.
  await failsOn('fl-233', 'Run: A new message ID for a document already loaded', (d) => {
    const f = flowOf(d, 'inv-process')
    f.steps = f.steps.filter((n) => !(n.type === 'choice' && n.routes[0].steps[0]?.type === 'raise-error'))
  })
  // The rejects written outside the transaction.
  await failsOn('fl-233', 'one transaction', (d) => {
    const f = flowOf(d, 'inv-process')
    const t = f.steps.find((n) => n.type === 'try')
    const rejects = t.steps.shift()
    f.steps.splice(f.steps.indexOf(t), 0, rejects)
  })
  // The email sent in line: a mail outage fails the load.
  await failsOn('fl-233', 'Async scope', (d) => {
    const f = flowOf(d, 'inv-process')
    const a = f.steps.find((n) => n.type === 'async')
    flatten(f.steps, a, a.steps)
  })
  // The code map read in code order.
  await passes('fl-233', (d) => {
    one(d, 'db-select', (s) => s.config.sql.includes('code_map')).config.sql = "SELECT ext_code, int_code FROM code_map WHERE map_name = 'LOCATION' ORDER BY ext_code"
  })

  // FL-234
  // A local JMS transaction: Oracle is not rolled back when the publish fails.
  await failsOn('fl-234', 'Run: The WMS queue refuses the publish', (d) => {
    d.flows[0].source.config.transactionType = 'LOCAL'
  })
  // A Try of its own around the insert: a separate transaction.
  await failsOn('fl-234', 'No Try starts a transaction', (d) => {
    const o = all(d, 'choice')[1].otherwise
    o[0] = scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [o[0]])
  })
  // No poison route: a bad order goes round for ever.
  await failsOn('fl-234', 'Run: The sixth delivery', (d) => {
    const c = all(d, 'choice')[0]
    flatten(d.flows[0].steps, c, c.otherwise)
  })
  // Six or more deliveries written another way.
  await passes('fl-234', (d) => {
    all(d, 'choice')[0].routes[0].config.expression = '#[(attributes.properties.jmsxProperties.JMSXDeliveryCount default 1) >= 6]'
  })

  // FL-235
  // The report sent in line: a mail outage fails the job.
  await failsOn('fl-235', 'Run: The mail server is down', (d) => {
    const a = one(d, 'async')
    flatten(d.flows[0].steps, a, a.steps)
  })
  // The report sent before the run is recorded.
  await failsOn('fl-235', 'after the run is recorded', (d) => {
    const s = d.flows[0].steps
    const a = s.pop()
    s.splice(1, 0, a)
  })
  // A failure email to support as well, in its own Async scope.
  await passes('fl-235', (d) => {
    d.flows[0].errorHandlers[0].steps.push(scope('async', {}, [step('email-send', { toAddresses: 'integration-support@larkfield.example', subject: 'Store export FAILED', content: '#[error.errorType.identifier]' })]))
  })

  // FL-236
  // The whole order in the alert.
  await failsOn('fl-236', 'Run: Oracle refuses the order', (d) => {
    one(d, 'email-send').config.content = '#[write(payload, "application/json")]'
  })
  // The failed order is not kept anywhere.
  await failsOn('fl-236', 'WEB.ORDERS.FAILED', (d) => {
    const h = one(d, 'on-error-continue')
    h.steps = h.steps.filter((n) => n.type !== 'jms-publish')
  })
  // The alert sent in line, in the handler.
  await passes('fl-236', (d) => {
    const h = one(d, 'on-error-continue')
    const a = h.steps.find((n) => n.type === 'async')
    flatten(h.steps, a, a.steps)
  })

  // FL-237
  // A plain text body: the table shows as tags.
  await failsOn('fl-237', 'The email is HTML', (d) => {
    one(d, 'email-send').config.contentType = 'text/plain'
  })
  // An email every week, rejects or not.
  await failsOn('fl-237', 'Run: A clean week', (d) => {
    const c = one(d, 'choice')
    flatten(d.flows[0].steps, c, c.otherwise)
  })
  // Another subject.
  await passes('fl-237', (d) => {
    one(d, 'email-send').config.subject = '#["Weekly item rejects since " ++ vars.since]'
  })

  // FL-238
  // Every reject row attached.
  await failsOn('fl-238', 'attaches nothing', (d) => {
    one(d, 'email-send').config.attachments = '#[{ "rejects.csv": write(vars.byReason, "application/csv") }]'
  })
  // A clean job still emails.
  await failsOn('fl-238', 'Run: A clean job', (d) => {
    one(d, 'choice').routes.splice(1, 1)
  })
  // The report sent in an Async scope.
  await passes('fl-238', (d) => {
    const o = one(d, 'choice').otherwise
    const send = o.pop()
    o.push(scope('async', {}, [send]))
  })

  // FL-239
  // No Try per email: one bad email stops the run.
  await failsOn('fl-239', 'own Try', (d) => {
    const loop = one(d, 'foreach')
    const t = loop.steps.find((n) => n.type === 'try')
    flatten(loop.steps, t, t.steps)
  })
  // Moved to Processed before the insert.
  await failsOn('fl-239', 'Processed after the insert', (d) => {
    const t = one(d, 'try')
    const move = t.steps.pop()
    t.steps.splice(t.steps.findIndex((n) => n.type === 'db-bulk-insert'), 0, move)
  })
  // One catch-all handler: an Oracle outage parks good emails in Error.
  await failsOn('fl-239', 'Run: Oracle is down', (d) => {
    const t = one(d, 'try')
    t.errorHandlers = t.errorHandlers.filter((h) => h.config.type === 'ANY')
  })
  // A bigger page of emails.
  await passes('fl-239', (d) => {
    one(d, 'email-list-imap').config.limit = 50
  })

  // FL-240
  // No backoff: the next try time never moves.
  await failsOn('fl-240', 'sets a later next try time', (d) => {
    const u = one(d, 'db-update', (n) => n.config.sql.includes('next_try_at'))
    u.config.sql = 'UPDATE email_outbox SET attempts = attempts + 1 WHERE id = :id'
    u.config.inputParameters = '#[{ id: vars.mail.id }]'
  })
  // Never gives up.
  await failsOn('fl-240', 'Run: The relay refuses mail', (d) => {
    const c = one(d, 'choice')
    const h = one(d, 'on-error-continue')
    flatten(h.steps, c, c.otherwise)
  })
  // Fifty emails a run.
  await passes('fl-240', (d) => {
    const sel = one(d, 'db-select')
    sel.config.sql = sel.config.sql.replace('FETCH FIRST 20', 'FETCH FIRST 50')
  })

  // FL-241
  // The API sends the confirmation itself.
  await failsOn('fl-241', 'never sends mail itself', (d) => {
    flowOf(d, 'click-collect-orders-api').steps.push(step('email-send', { toAddresses: '#[vars.o.email]', subject: 'Order placed', content: 'Thanks' }))
  })
  // No transaction: an order without its email row.
  await failsOn('fl-241', 'Run: The outbox insert fails', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // The relay every 15 seconds.
  await passes('fl-241', (d) => {
    flowOf(d, 'confirmation-relay').source.config.frequency = 15
  })

  // FL-242
  // No cap: every pending notice in one run.
  await failsOn('fl-242', 'Run: Monday morning, 35 notices waiting', (d) => {
    const sel = one(d, 'db-select')
    sel.config.sql = sel.config.sql.replace(' FETCH FIRST 30 ROWS ONLY', '')
  })
  // A Try per notice: the run keeps pushing a relay that said no.
  await failsOn('fl-242', 'A refused send ends the run', (d) => {
    const loop = one(d, 'foreach')
    loop.steps = [scope('try', {}, loop.steps, { errorHandlers: [handler('on-error-continue', { type: 'ANY' }, [step('logger', { level: 'WARN', message: 'not sent' })])] })]
  })
  // The cap set with Max rows instead.
  await passes('fl-242', (d) => {
    const sel = one(d, 'db-select')
    sel.config.sql = sel.config.sql.replace(' FETCH FIRST 30 ROWS ONLY', '')
    sel.config.maxRows = 30
  })

  // FL-243
  // The reply goes to the From address.
  await failsOn('fl-243', 'registered contact', (d) => {
    one(d, 'email-send').config.toAddresses = '#[vars.mail.from]'
  })
  // No sender check: anyone's invoice loads.
  await failsOn('fl-243', 'Run: A sender nobody knows', (d) => {
    one(d, 'choice').routes.splice(0, 1)
  })
  // No Message-ID check: a restored email loads twice.
  await failsOn('fl-243', 'Run: The same email again', (d) => {
    one(d, 'choice').routes.splice(1, 1)
  })
  // The reply sent in line inside the handler.
  await passes('fl-243', (d) => {
    const h = one(d, 'on-error-continue')
    const a = h.steps.find((n) => n.type === 'async')
    flatten(h.steps, a, a.steps)
  })

  // FL-244
  // No Try per type: one bad report stops the rest.
  await failsOn('fl-244', 'Run: One type has no recipients', (d) => {
    const loop = one(d, 'foreach')
    const t = loop.steps.find((n) => n.type === 'try')
    flatten(loop.steps, t, t.steps)
  })
  // No rerun check: a rerun sends the Item report again.
  await failsOn('fl-244', 'Run: Support reruns the job at 09:00', (d) => {
    const t = one(d, 'try')
    const c = t.steps.find((n) => n.type === 'choice')
    flatten(t.steps, c, c.routes[0].steps)
  })
  // Report types in any order.
  await passes('fl-244', (d) => {
    one(d, 'db-select').config.sql = 'SELECT report_type, recipients FROM report_config WHERE active = 1'
  })

  // FL-245
  // No transaction on the listener.
  await failsOn('fl-245', 'in a transaction', (d) => {
    d.flows[0].source.config.transactionalAction = 'NONE'
  })
  // No suppression check: an unsubscribed customer gets mail.
  await failsOn('fl-245', 'Run: An unsubscribed address', (d) => {
    all(d, 'choice')[1].routes.splice(1, 1)
  })
  // No handler for a bad address: it is retried for ever.
  await failsOn('fl-245', 'Run: An address that is not an address', (d) => {
    d.flows[0].errorHandlers = d.flows[0].errorHandlers.filter((h) => h.type !== 'on-error-continue')
  })
  // Four consumers.
  await passes('fl-245', (d) => {
    d.flows[0].source.config.numberOfConsumers = 4
  })

  // FL-246
  // No lock: two consumers can both decide to send.
  await failsOn('fl-246', 'read and locked', (d) => {
    const sel = one(d, 'db-select')
    sel.config.sql = sel.config.sql.replace(' FOR UPDATE', '')
  })
  // The email sent in line after the decision: a mail outage fails the message.
  await failsOn('fl-246', 'Run: The mail server is down', (d) => {
    const r = all(d, 'choice')[1].routes[0]
    r.steps = r.steps[0].steps
  })
  // CRITICAL held back like any other alert.
  await failsOn('fl-246', 'Run: A CRITICAL alert inside the hour', (d) => {
    all(d, 'choice')[0].routes[1].config.expression = '#[vars.st[0].last_sent_at < vars.hourAgo]'
  })
  // The hour written as 60 minutes.
  await passes('fl-246', (d) => {
    const v = one(d, 'set-variable', (s) => s.config.variableName === 'hourAgo')
    v.config.value = v.config.value.replace('|PT1H|', '|PT60M|')
  })
}
