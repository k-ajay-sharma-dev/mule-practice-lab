// Wrong and other correct designs for batch J (fl-141 to fl-150). See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, flowOf, remove, step, scope, handler }) => {
  // FL-141
  // The email joined into the SQL text: a value with quotes changes the query.
  await failsOn('fl-141', 'no text joined into the SQL', (d) => {
    const select = one(d, 'db-select')
    select.config.sql = '#["SELECT customer_id, name, email, tier FROM customers WHERE email = \'" ++ lower(attributes.queryParams.email) ++ "\'"]'
    select.config.inputParameters = ''
  })
  // No LOWER: an email typed with capitals is not found.
  await failsOn('fl-141', 'Run: An email typed with capitals', (d) => {
    one(d, 'db-select').config.sql = 'SELECT customer_id, name, email, tier FROM customers WHERE email = :email'
  })
  // No Choice: nobody matching answers 200 with nulls.
  await failsOn('fl-141', 'Run: Nobody has that email', (d) => {
    const choice = one(d, 'choice')
    d.flows[0].steps.splice(d.flows[0].steps.indexOf(choice), 1, ...choice.otherwise)
  })
  // LOWER on both sides.
  await passes('fl-141', (d) => {
    one(d, 'db-select').config.sql = 'SELECT customer_id, name, email, tier FROM customers WHERE LOWER(email) = LOWER(:email)'
  })
  // The Choice the other way round: a route for "found", and 404 in the otherwise branch.
  await passes('fl-141', (d) => {
    const choice = one(d, 'choice')
    const notFound = choice.routes[0].steps
    choice.routes[0].steps = choice.otherwise
    choice.otherwise = notFound
    choice.routes[0].config.expression = '#[sizeOf(payload) > 0]'
  })

  // FL-142
  // The holidays written into the script: every new year means editing the flow.
  await failsOn('fl-142', 'with readUrl', (d) => {
    one(d, 'transform').config.script =
      '%dw 2.0\noutput application/json\nvar holidays = { "2026-12-25": "Christmas Day", "2026-12-26": "Boxing Day", "2027-01-01": "New Year\'s Day" }\nvar day = attributes.queryParams.date\n---\n{ date: day, deliveryDay: holidays[day] == null, holiday: holidays[day] }'
  })
  // No check for a missing date.
  await failsOn('fl-142', 'Run: No date given', (d) => {
    const choice = one(d, 'choice')
    d.flows[0].steps.splice(d.flows[0].steps.indexOf(choice), 1, ...choice.otherwise)
  })
  // The test turned round: holidays become delivery days.
  await failsOn('fl-142', 'Run: Christmas Day', (d) => {
    const t = one(d, 'transform')
    t.config.script = t.config.script.replace('holidays[day] == null', 'holidays[day] != null')
  })
  // The calendar read into a variable first.
  await passes('fl-142', (d) => {
    const choice = one(d, 'choice')
    choice.otherwise = [
      step('set-variable', { variableName: 'holidays', value: '#[readUrl("classpath://holidays.json", "application/json")]' }),
      step('transform', { script: '%dw 2.0\noutput application/json\nvar day = attributes.queryParams.date\n---\n{ date: day, deliveryDay: vars.holidays[day] == null, holiday: vars.holidays[day] }' }),
    ]
  })
  // A Set Payload with the same DataWeave.
  await passes('fl-142', (d) => {
    const choice = one(d, 'choice')
    choice.otherwise = [
      step('set-payload', {
        value: '#[output application/json --- { date: attributes.queryParams.date, deliveryDay: readUrl("classpath://holidays.json", "application/json")[attributes.queryParams.date] == null, holiday: readUrl("classpath://holidays.json", "application/json")[attributes.queryParams.date] }]',
      }),
    ]
  })

  // FL-143
  // A plain SET: a field that is not sent is wiped.
  await failsOn('fl-143', 'Run: A new phone number only', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE members SET email = :email, phone = :phone, marketing_opt_in = :optIn WHERE member_id = :memberId'
  })
  // The empty check treats false as missing: an opt out gets 400.
  await failsOn('fl-143', 'Run: Opting out of marketing', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[isEmpty(payload.email) and isEmpty(payload.phone) and payload.marketingOptIn != true]'
  })
  // No check on the rows changed: an unknown member gets 200.
  await failsOn('fl-143', 'Run: An unknown member', (d) => {
    const outer = one(d, 'choice')
    const inner = outer.otherwise.find((n) => n.type === 'choice')
    outer.otherwise.splice(outer.otherwise.indexOf(inner), 1, ...inner.otherwise)
  })
  // No 400 route: an empty body runs an Update that changes nothing.
  await failsOn('fl-143', 'Run: An empty body', (d) => {
    const outer = one(d, 'choice')
    d.flows[0].steps = outer.otherwise
  })
  // A Transform for the answer, and < 1 for no rows.
  await passes('fl-143', (d) => {
    const outer = one(d, 'choice')
    const inner = outer.otherwise.find((n) => n.type === 'choice')
    inner.routes[0].config.expression = '#[vars.updated.affectedRows < 1]'
    const answer = inner.otherwise.find((n) => n.type === 'set-payload')
    answer.type = 'transform'
    answer.config = { target: 'payload', variableName: '', script: '%dw 2.0\noutput application/json\n---\n{ memberId: payload[0].member_id, email: payload[0].email, phone: payload[0].phone, marketingOptIn: payload[0].marketing_opt_in }' }
  })

  // FL-144
  // One fixed partner path: every order goes to Fellside.
  await failsOn('fl-144', 'not from a path written in the flow', (d) => {
    one(d, 'http-request').config.path = '/fellside/v1/orders'
  })
  // Inactive routes are used.
  await failsOn('fl-144', 'Run: A partner that was switched off', (d) => {
    one(d, 'db-select').config.sql = 'SELECT partner, endpoint_path FROM fulfilment_routes WHERE region = :region'
  })
  // No Choice: an order with no route fails instead of being parked.
  await failsOn('fl-144', 'Run: A region with no partner', (d) => {
    const choice = one(d, 'choice')
    d.flows[0].steps.splice(d.flows[0].steps.indexOf(choice), 1, ...choice.otherwise)
  })
  // The Select without a Target: the routing rows replace the order, and the partner is sent the rows.
  await failsOn('fl-144', 'Run: An order for the north', (d) => {
    const select = one(d, 'db-select')
    select.config.target = ''
    one(d, 'choice').routes[0].config.expression = '#[isEmpty(payload)]'
    one(d, 'http-request').config.path = '#[payload[0].endpoint_path]'
    one(d, 'logger', (n) => n.config.level === 'WARN').config.message = '#["No active fulfilment route, order parked"]'
    one(d, 'logger', (n) => n.config.level === 'INFO').config.message = '#["Order sent"]'
  })
  // The endpoint kept in its own variable first.
  await passes('fl-144', (d) => {
    const choice = one(d, 'choice')
    choice.otherwise.unshift(step('set-variable', { variableName: 'endpoint', value: '#[vars.route[0].endpoint_path]' }))
    one(d, 'http-request').config.path = '#[vars.endpoint]'
  })

  // FL-145
  // A deny list: a field added upstream goes straight through.
  await failsOn('fl-145', 'Run: A new field appears upstream', (d) => {
    one(d, 'transform').config.script =
      '%dw 2.0\noutput application/json\n---\n(payload - "customer" - "delivery" - "payment" - "giftMessage") ++ { customerId: payload.customer.customerId, postcodeArea: (payload.delivery.postcode splitBy " ")[0] }'
  })
  // The customer copied as it is.
  await failsOn('fl-145', 'Run: No personal data leaves', (d) => {
    const t = one(d, 'transform')
    t.config.script = t.config.script.replace('customerId: payload.customer.customerId,', 'customerId: payload.customer.customerId,\n  customer: payload.customer,')
  })
  // No filter: test orders reach analytics.
  await failsOn('fl-145', 'Run: A test order from staff', (d) => {
    const choice = one(d, 'choice')
    d.flows[0].steps.splice(d.flows[0].steps.indexOf(choice), 1, ...choice.otherwise)
  })
  // The full postcode sent.
  await failsOn('fl-145', 'Run: A normal order', (d) => {
    const t = one(d, 'transform')
    t.config.script = t.config.script.replace('(payload.delivery.postcode splitBy " ")[0]', 'payload.delivery.postcode')
  })
  // A Set Payload with the allow list, and the Choice the other way round.
  await passes('fl-145', (d) => {
    const choice = one(d, 'choice')
    const send = choice.otherwise
    const t = send.find((n) => n.type === 'transform')
    send.splice(send.indexOf(t), 1, step('set-payload', {
      value: '#[output application/json --- { orderId: payload.orderId, customerId: payload.customer.customerId, postcodeArea: (payload.delivery.postcode splitBy " ")[0], orderedAt: payload.orderedAt, total: payload.total, lines: payload.lines map { sku: $.sku, qty: $.qty, price: $.price } }]',
    }))
    choice.otherwise = choice.routes[0].steps
    choice.routes[0].steps = send
    choice.routes[0].config.expression = '#[payload.customer.testAccount != true]'
  })

  // FL-146
  // Read the count, then write: the race the problem is about.
  await failsOn('fl-146', 'No Select of the count comes before that Update', (d) => {
    d.flows[0].steps.splice(1, 0, step('db-select', { database: 'PostgreSQL', sql: 'SELECT seats_left FROM events WHERE event_id = :eventId', inputParameters: '#[{ eventId: attributes.uriParams.eventId }]', target: 'current' }))
  })
  // No guard in the Update: a request for more seats than are left drives the count below zero.
  await failsOn('fl-146', 'Run: More seats than are left', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE events SET seats_left = seats_left - :seats WHERE event_id = :eventId'
  })
  // No transaction: a failed insert leaves the seats taken.
  await failsOn('fl-146', 'Run: The reservation cannot be saved', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // Every 0-row Update answered 409: an unknown event looks sold out.
  await failsOn('fl-146', 'Run: An event that does not exist', (d) => {
    const outer = d.flows[0].steps.find((n) => n.type === 'choice')
    outer.otherwise = outer.otherwise.find((n) => n.type === 'choice').otherwise
  })
  // The 404 and 409 branches the other way round, and > 0 for the rows taken.
  await passes('fl-146', (d) => {
    const outer = d.flows[0].steps.find((n) => n.type === 'choice')
    outer.routes[0].config.expression = '#[vars.taken.affectedRows > 0]'
    one(d, 'try').steps.find((n) => n.type === 'choice').routes[0].config.expression = '#[vars.taken.affectedRows > 0]'
    const inner = outer.otherwise.find((n) => n.type === 'choice')
    const notFound = inner.routes[0].steps
    inner.routes[0].steps = inner.otherwise
    inner.otherwise = notFound
    inner.routes[0].config.expression = '#[sizeOf(vars.event) > 0]'
  })

  // FL-147
  // Files known by their name: a resend under a new name is loaded twice.
  await failsOn('fl-147', 'Run: The same file again under a new name', (d) => {
    one(d, 'set-variable', (n) => n.config.variableName === 'checksum').config.value = '#[attributes.fileName]'
  })
  // No transaction: a failed load leaves the file recorded, so it is never loaded.
  await failsOn('fl-147', 'Run: Saving the lines fails', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // No lookup: a repeat is caught by the primary key with On Error Continue, which also commits a half load.
  await failsOn('fl-147', 'looked up in received_files before any line is written', (d) => {
    const choice = one(d, 'choice')
    const attempt = choice.otherwise.find((n) => n.type === 'try')
    attempt.errorHandlers = [handler('on-error-continue', { type: 'DB:QUERY_EXECUTION' }, [step('logger', { level: 'WARN', message: '#["File " ++ vars.fileName ++ " was loaded before"]' })])]
    d.flows[0].steps = d.flows[0].steps.filter((n) => n.type === 'set-variable').concat([attempt])
  })
  // No WARN for a repeat: it is skipped in silence.
  await failsOn('fl-147', 'Run: The same file again under a new name', (d) => {
    one(d, 'logger', (n) => n.config.level === 'WARN').config.level = 'DEBUG'
  })
  // MD5 instead of SHA-1, and the Choice the other way round.
  await passes('fl-147', (d) => {
    one(d, 'set-variable', (n) => n.config.variableName === 'checksum').config.value = '#[dw::Crypto::MD5(payload.^raw)]'
    const choice = one(d, 'choice')
    const warn = choice.routes[0].steps
    choice.routes[0].steps = choice.otherwise
    choice.otherwise = warn
    choice.routes[0].config.expression = '#[isEmpty(vars.seen)]'
  })

  // FL-148
  // Every passing error goes straight to the dead letter topic: a busy minute loses the points.
  await failsOn('fl-148', 'Run: The loyalty API is busy once', (d) => {
    const main = flowOf(d, 'award-points')
    const h = main.steps.find((n) => n.type === 'try').errorHandlers[1]
    h.steps = [step('set-payload', { value: '#[output application/json --- { event: vars.event, attempts: 0, reason: "busy" }]' }), step('kafka-publish', { topic: 'orders.completed.dlt', key: '#[vars.event.customerId]' })]
  })
  // No handler for 400 on the main flow: the refused event fails the flow and is offered again.
  await failsOn('fl-148', 'Run: An event the API refuses', (d) => {
    flowOf(d, 'award-points').steps.find((n) => n.type === 'try').errorHandlers.shift()
  })
  // Gives up after one retry.
  await failsOn('fl-148', 'Run: The loyalty API stays down', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[vars.attempts >= 1]'
  })
  // The count is never raised: the event goes round the retry topic for ever.
  await failsOn('fl-148', 'Run: The loyalty API stays down', (d) => {
    const choice = one(d, 'choice')
    choice.otherwise.find((n) => n.type === 'set-payload').config.value = '#[output application/json --- { event: vars.event, attempts: vars.attempts }]'
  })
  // The Choice written as "retry while under 3", and a 500 counted as passing too.
  await passes('fl-148', (d) => {
    const choice = one(d, 'choice')
    const dlt = choice.routes[0].steps
    choice.routes[0].steps = choice.otherwise
    choice.otherwise = dlt
    choice.routes[0].config.expression = '#[vars.attempts < 3]'
    for (const h of all(d, 'on-error-continue').filter((x) => x.config.type.includes('SERVICE_UNAVAILABLE'))) h.config.type += ', HTTP:INTERNAL_SERVER_ERROR'
  })

  // FL-149
  // No guard on the upsert: a late, older change wins.
  await failsOn('fl-149', 'Run: An older change arrives late', (d) => {
    const ins = one(d, 'db-insert')
    ins.config.sql = ins.config.sql.replace(' WHERE EXCLUDED.changed_at > pending_prices.changed_at', '')
  })
  // A delete by SKU alone: a change that landed during the push is lost.
  await failsOn('fl-149', 'only if it has not changed since it was read', (d) => {
    const del = one(d, 'db-delete')
    del.config.sql = 'DELETE FROM pending_prices WHERE sku = :sku'
    del.config.inputParameters = '#[{ sku: vars.row.sku }]'
  })
  // The error handler around the whole loop: one refused SKU stops the rest.
  await failsOn('fl-149', 'Run: The marketplace refuses one SKU', (d) => {
    const push = flowOf(d, 'push-prices')
    const loop = push.steps.find((n) => n.type === 'foreach')
    const attempt = loop.steps.find((n) => n.type === 'try')
    const caught = attempt.errorHandlers
    loop.steps.splice(loop.steps.indexOf(attempt), 1, ...attempt.steps)
    push.steps.splice(push.steps.indexOf(loop), 1, scope('try', {}, [loop], { errorHandlers: caught }))
  })
  // Every change sent at once from the queue flow.
  await failsOn('fl-149', 'never calls the marketplace itself', (d) => {
    flowOf(d, 'collect-price-changes').steps.push(step('http-request', { method: 'PUT', path: '#["/marketplace/v2/listings/" ++ payload.sku ++ "/price"]' }))
  })
  // A cron Scheduler every minute, and the rows read in SKU order.
  await passes('fl-149', (d) => {
    flowOf(d, 'push-prices').source.config = { strategy: 'cron', frequency: 1000, timeUnit: 'MILLISECONDS', expression: '0 * * * * ?' }
    one(d, 'db-select').config.sql = 'SELECT sku, price, version FROM pending_prices ORDER BY sku'
  })

  // FL-150
  // The address from the request wins when there is one: the internal path is called.
  await failsOn('fl-150', 'Run: A callback address in the request', (d) => {
    const job = flowOf(d, 'request-export').steps[1].otherwise.find((n) => n.type === 'set-payload')
    job.config.value = job.config.value.replace('callbackPath: vars.client[0].callback_path', 'callbackPath: payload.callbackUrl default vars.client[0].callback_path')
  })
  // The VM queue names do not match: the export never runs.
  await failsOn('fl-150', 'handed over on a VM queue', (d) => {
    one(d, 'vm-publish').config.queueName = 'export-job'
  })
  // One try only.
  await failsOn('fl-150', 'Run: The client\'s endpoint is down', (d) => {
    const attempt = flowOf(d, 'run-export').steps.find((n) => n.type === 'try')
    const retry = attempt.steps.find((n) => n.type === 'until-successful')
    attempt.steps.splice(attempt.steps.indexOf(retry), 1, ...retry.steps)
    attempt.errorHandlers[0].config.type = 'ANY'
  })
  // No 403 route: an unregistered client starts an export with no address.
  await failsOn('fl-150', 'Run: A client with no registered callback', (d) => {
    const main = flowOf(d, 'request-export')
    const choice = main.steps.find((n) => n.type === 'choice')
    main.steps.splice(main.steps.indexOf(choice), 1, ...choice.otherwise)
  })
  // A longer pause between tries, and the handler also naming the HTTP errors.
  await passes('fl-150', (d) => {
    one(d, 'until-successful').config.millisBetweenRetries = 60000
    one(d, 'on-error-continue').config.type = 'MULE:RETRY_EXHAUSTED, HTTP:SERVICE_UNAVAILABLE'
  })
}
