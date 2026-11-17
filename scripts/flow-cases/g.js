// Wrong and other correct designs for batch G (fl-126 to fl-130). See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, handlerFor, flowOf, remove, step, scope }) => {
  // FL-126
  // Read the slot first, then insert: two requests can both see it free.
  await failsOn('fl-126', 'No SELECT checks the slot first', (d) => {
    d.flows[0].steps.unshift(step('db-select', { database: 'PostgreSQL', sql: 'SELECT room_id FROM room_bookings WHERE room_id = :roomId AND slot_start = :slotStart', target: 'existing' }))
  })
  // One handler for every error: a database outage tells people the room is taken.
  await failsOn('fl-126', 'Run: The database is down', (d) => {
    const h = handlerFor(d, 'QUERY_EXECUTION')
    h.config.type = 'ANY'
    h.config.when = ''
  })
  // A taken slot answers 400.
  await failsOn('fl-126', 'answers 409', (d) => {
    one(d, 'set-variable', (n) => n.config.value === '409').config.value = '400'
  })
  // The new booking answers 200.
  await failsOn('fl-126', 'answers 201', (d) => {
    remove(d.flows[0].steps, 'set-variable')
  })
  // The listener takes any method.
  await failsOn('fl-126', 'is a POST', (d) => {
    d.flows[0].source.config.allowedMethods = ''
  })
  // No handler for the outage.
  await failsOn('fl-126', 'answers 503', (d) => {
    d.flows[0].errorHandlers.splice(1, 1)
  })
  // On Error Continue for the conflict, with no When condition.
  await passes('fl-126', (d) => {
    const h = handlerFor(d, 'QUERY_EXECUTION')
    h.type = 'on-error-continue'
    h.config.when = ''
  })
  // The status written as a number, and MULE:CONNECTIVITY for the outage.
  await passes('fl-126', (d) => {
    one(d, 'set-variable', (n) => n.config.value === '201').config.value = '#[201]'
    handlerFor(d, 'DB:CONNECTIVITY').config.type = 'MULE:CONNECTIVITY'
  })

  // FL-127
  // No Try: the landline ends the loop and the owners after it get nothing.
  await failsOn('fl-127', 'wrapped in a Try', (d) => {
    const loop = one(d, 'foreach')
    const attempt = one(d, 'try')
    loop.steps.splice(loop.steps.indexOf(attempt), 1, ...attempt.steps)
    d.flows[0].errorHandlers = attempt.errorHandlers
  })
  // On Error Propagate in the Try: the first refused number ends the run.
  await failsOn('fl-127', 'Run: Tomorrow has four appointments', (d) => {
    for (const h of one(d, 'try').errorHandlers) h.type = 'on-error-propagate'
  })
  // Marked SENT before the text is sent.
  await failsOn('fl-127', 'only after its text was accepted', (d) => {
    const steps = one(d, 'try').steps
    const mark = steps.splice(steps.findIndex((n) => n.type === 'db-update'), 1)[0]
    steps.unshift(mark)
  })
  // Every appointment tomorrow is read, reminded or not: owners get a second text each hour.
  await failsOn('fl-127', 'still need a reminder', (d) => {
    one(d, 'db-select').config.sql = 'SELECT appointment_id, pet_name, owner_phone, starts_at FROM appointments WHERE appointment_date = :tomorrow'
  })
  // A refused number is only logged, so it is tried every hour.
  await failsOn('fl-127', 'marked BAD_NUMBER', (d) => {
    remove(handlerFor(d, 'BAD_REQUEST').steps, 'db-update')
  })
  // A fixed frequency of one hour.
  await passes('fl-127', (d) => {
    Object.assign(d.flows[0].source.config, { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'HOURS', expression: '' })
  })
  // The other errors named one by one.
  await passes('fl-127', (d) => {
    handlerFor(d, 'ANY').config.type = 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE'
  })

  // FL-128
  // The change flow removes another key, so the old list stays.
  await failsOn('fl-128', 'removes the same key', (d) => {
    one(d, 'os-remove').config.key = 'branch-list'
  })
  // No Choice: every request calls the branch master.
  await failsOn('fl-128', 'only when nothing is cached', (d) => {
    const choice = one(d, 'choice')
    d.flows[0].steps.splice(d.flows[0].steps.indexOf(choice), 1, ...choice.routes[0].steps)
  })
  // No Try around Remove: an empty cache sends the change event back again and again.
  await failsOn('fl-128', 'Run: A change arrives when nothing is cached', (d) => {
    const flowB = flowOf(d, 'clear-branch-cache')
    flowB.steps.splice(0, 1, ...one(d, 'try').steps)
  })
  // The list is stored under another key than the one read.
  await failsOn('fl-128', 'under the key the lookup reads', (d) => {
    one(d, 'os-store').config.key = 'branch_list'
  })
  // The listener answers every method.
  await failsOn('fl-128', 'is a GET', (d) => {
    d.flows[0].source.config.allowedMethods = ''
  })
  // The key written as a DataWeave string, and a handler for any error.
  await passes('fl-128', (d) => {
    for (const type of ['os-retrieve', 'os-store', 'os-remove']) one(d, type).config.key = "#['branches']"
    one(d, 'on-error-continue').config.type = 'ANY'
  })

  // FL-129
  // Only an explicit version 1 counts: every event from an old till is parked.
  await failsOn('fl-129', 'Run: A v1 event from an old till', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[payload.schemaVersion == 1]'
  })
  // Unknown versions raise an error, so they are delivered again and again.
  await failsOn('fl-129', 'parking queue', (d) => {
    one(d, 'choice').otherwise = [step('raise-error', { type: 'APP:UNKNOWN_VERSION', description: 'Unknown schemaVersion' })]
  })
  // One handler for every database error: an outage acknowledges the event and it is lost.
  await failsOn('fl-129', 'Run: The ledger database is down', (d) => {
    const h = handlerFor(d, 'QUERY_EXECUTION')
    h.config.type = 'ANY'
    h.config.when = ''
  })
  // On Error Propagate for the duplicate: a repeat goes back to the queue for ever.
  await failsOn('fl-129', 'Run: The same event delivered twice', (d) => {
    handlerFor(d, 'QUERY_EXECUTION').type = 'on-error-propagate'
  })
  // The parked event is also saved.
  await failsOn('fl-129', 'only on the routes for known versions', (d) => {
    one(d, 'choice').otherwise.push(step('flow-ref', { name: 'save-points' }))
  })
  // The insert written in each route, with no sub-flow.
  await passes('fl-129', (d) => {
    const insert = one(d, 'db-insert')
    for (const r of one(d, 'choice').routes) r.steps[1] = { ...structuredClone(insert), id: `${insert.id}-${r.id}` }
    d.flows.splice(1, 1)
  })
  // The handler without a When condition.
  await passes('fl-129', (d) => {
    handlerFor(d, 'QUERY_EXECUTION').config.when = ''
  })

  // FL-130
  // Until Successful around the POST: a slow bank gets the payment twice.
  await failsOn('fl-130', 'never sends a payment twice', (d) => {
    const steps = d.flows[0].steps
    const post = one(d, 'http-request', (n) => n.config.method === 'POST')
    steps.splice(steps.indexOf(post), 1, scope('until-successful', { maxRetries: 2, millisBetweenRetries: 2000 }, [post]))
  })
  // A timeout marks the payment FAILED, which invites the ERP to send it again.
  await failsOn('fl-130', 'marked UNKNOWN', (d) => {
    const h = handlerFor(d, 'TIMEOUT')
    h.steps.find((n) => n.type === 'db-update').config.sql ="UPDATE payments SET status = 'FAILED' WHERE payment_id = :paymentId"
  })
  // A timeout answers 500.
  await failsOn('fl-130', 'the ERP gets 202', (d) => {
    const h = handlerFor(d, 'TIMEOUT')
    h.type = 'on-error-propagate'
    remove(h.steps, 'set-variable')
  })
  // The job sends every UNKNOWN payment again without asking the bank.
  await failsOn('fl-130', 'asks the bank about a payment before', (d) => {
    const attempt = one(d, 'try')
    attempt.steps = one(d, 'choice').otherwise
  })
  // The 404 is not accepted, so a payment the bank never got stays UNKNOWN for ever.
  await failsOn('fl-130', 'Run: The job settles two unknown payments', (d) => {
    one(d, 'http-request', (n) => n.config.method === 'GET').config.successStatusCodes = ''
  })
  // No Try in the job: one status call that fails stops the run.
  await failsOn('fl-130', 'Run: The bank status service is down during the job', (d) => {
    const loop = one(d, 'foreach')
    const attempt = one(d, 'try')
    loop.steps.splice(loop.steps.indexOf(attempt), 1, ...attempt.steps)
  })
  // The 404 case on its own route, the found case in the otherwise branch.
  await passes('fl-130', (d) => {
    const choice = one(d, 'choice')
    const found = choice.routes[0].steps
    choice.routes[0].config.expression = '#[attributes.statusCode == 404]'
    choice.routes[0].steps = choice.otherwise
    choice.otherwise = found
  })
  // A cron schedule, and a timeout handler that answers through On Error Propagate.
  await passes('fl-130', (d) => {
    Object.assign(flowOf(d, 'settle').source.config, { strategy: 'cron', expression: '0 0/5 * * * ?' })
    handlerFor(d, 'TIMEOUT').type = 'on-error-propagate'
  })
}
