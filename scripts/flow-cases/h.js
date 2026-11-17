// Wrong and other correct designs for batch H (fl-131 to fl-135). See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, handlerFor, flowOf, remove, step, scope }) => {
  // FL-131
  // The balance is updated before the Choice: a refused payment still takes the money.
  await failsOn('fl-131', 'only in the otherwise branch', (d) => {
    const choice = one(d, 'choice')
    const update = choice.otherwise.shift()
    d.flows[0].steps.splice(1, 0, update)
  })
  // <= instead of <: paying the exact balance is refused.
  await failsOn('fl-131', 'Run: The exact balance', (d) => {
    one(d, 'choice').routes[1].config.expression = '#[vars.wallet[0].balance <= payload.amount]'
  })
  // A low balance answers 400.
  await failsOn('fl-131', 'answers 422', (d) => {
    one(d, 'set-variable', (n) => n.config.value === '422').config.value = '400'
  })
  // One handler for every error: an unknown staff number is told the balance is too low.
  await failsOn('fl-131', 'Run: A staff number with no wallet', (d) => {
    d.flows[0].errorHandlers.splice(1, 1)
    d.flows[0].errorHandlers[0].config.type = 'ANY'
  })
  // The balance rule sets a 422 body in the route instead of raising an error: the flow carries on and answers 200.
  await failsOn('fl-131', 'Raise Error with a type for a low balance', (d) => {
    one(d, 'choice').routes[1].steps = [step('set-variable', { variableName: 'httpStatus', value: '422' })]
  })
  // The routes in the other order: a missing wallet is checked after its balance is read.
  await failsOn('fl-131', 'Run: A staff number with no wallet', (d) => {
    one(d, 'choice').routes.reverse()
  })
  // Its own namespace for both errors, and On Error Continue.
  await passes('fl-131', (d) => {
    for (const r of all(d, 'raise-error')) r.config.type = r.config.type.replace('APP:', 'WALLET:')
    for (const h of d.flows[0].errorHandlers) {
      h.type = 'on-error-continue'
      h.config.type = h.config.type.replace('APP:', 'WALLET:')
    }
  })
  // The status written as a number.
  await passes('fl-131', (d) => {
    one(d, 'set-variable', (n) => n.config.value === '422').config.value = '#[422]'
  })

  // FL-132
  // No variable: the answer is built from the payload after the loop, which is the basket again.
  await failsOn('fl-132', 'Run: One line is short', (d) => {
    one(d, 'set-payload').config.value = '#[output application/json --- { basketId: payload.basketId, ready: true, shortLines: [] }]'
  })
  // The list is never started: adding to a missing variable fails.
  await failsOn('fl-132', 'starts empty before the For Each', (d) => {
    d.flows[0].steps.shift()
  })
  // Parallel For Each: the variable changes do not come out of it.
  await failsOn('fl-132', 'inside a For Each', (d) => {
    one(d, 'foreach').type = 'parallel-foreach'
  })
  // <= instead of <: taking the last items counts as short.
  await failsOn('fl-132', 'Run: A line takes the last of the stock', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[payload.available <= vars.line.qty]'
  })
  // The variable is replaced on each short line instead of added to.
  await failsOn('fl-132', 'added to the list inside the loop', (d) => {
    one(d, 'set-variable', (n) => n.config.variableName === 'shortLines' && n.config.value.includes('++')).config.value =
      '#[[{ sku: vars.line.sku, wanted: vars.line.qty, available: payload.available }]]'
  })
  // One if and else expression instead of the Choice.
  await passes('fl-132', (d) => {
    const loop = one(d, 'foreach')
    const add = one(d, 'choice').routes[0].steps[0]
    add.config.value = '#[if (payload.available < vars.line.qty) vars.shortLines ++ [{ sku: vars.line.sku, wanted: vars.line.qty, available: payload.available }] else vars.shortLines]'
    loop.steps.splice(loop.steps.findIndex((n) => n.type === 'choice'), 1, add)
  })
  // ready written with sizeOf.
  await passes('fl-132', (d) => {
    one(d, 'set-payload').config.value = '#[output application/json --- { basketId: payload.basketId, ready: sizeOf(vars.shortLines) == 0, shortLines: vars.shortLines }]'
  })

  // FL-133
  // No timeout: the default lets the shopper wait 8 seconds.
  await failsOn('fl-133', 'gives up after at most 3 seconds', (d) => {
    one(d, 'http-request').config.responseTimeout = ''
  })
  // A 10 second timeout.
  await failsOn('fl-133', 'Run: The carrier takes 8 seconds', (d) => {
    one(d, 'http-request').config.responseTimeout = 10000
  })
  // One handler for every error: the unknown postcode becomes a 502.
  await failsOn('fl-133', 'answers 404, not 502', (d) => {
    d.flows[0].errorHandlers.splice(1, 1)
    handlerFor(d, 'CONNECTIVITY').config.type = 'ANY'
  })
  // A carrier 500 is not mapped, so the API answers 500.
  await failsOn('fl-133', 'Run: The carrier answers 500', (d) => {
    handlerFor(d, 'CONNECTIVITY').config.type = 'HTTP:CONNECTIVITY'
  })
  // A timeout answers 503.
  await failsOn('fl-133', 'answers 504', (d) => {
    one(d, 'set-variable', (n) => n.config.value === '504').config.value = '503'
  })
  // A 2 second timeout, and the 5xx errors caught with MULE:CONNECTIVITY plus each status.
  await passes('fl-133', (d) => {
    one(d, 'http-request').config.responseTimeout = 2000
    handlerFor(d, 'CONNECTIVITY').config.type = 'MULE:CONNECTIVITY, HTTP:INTERNAL_SERVER_ERROR, HTTP:SERVICE_UNAVAILABLE'
  })
  // On Error Continue for each handler.
  await passes('fl-133', (d) => {
    for (const h of d.flows[0].errorHandlers) h.type = 'on-error-continue'
  })

  // FL-134
  // Inserts with no transaction: rows 1 and 2 stay when row 3 is refused.
  await failsOn('fl-134', 'Run: Row three is already in the table', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // The rows are saved before they are checked.
  await failsOn('fl-134', 'only in the otherwise branch', (d) => {
    const choice = one(d, 'choice')
    const attempt = choice.otherwise.shift()
    d.flows[0].steps.splice(1, 0, attempt)
  })
  // Only the first bad row is reported.
  await failsOn('fl-134', 'Run: Two bad rows', (d) => {
    const bad = one(d, 'set-variable', (n) => n.config.variableName === 'badRows')
    bad.config.value = bad.config.value.replace(/\]$/, ' then [$[0]]]')
  })
  // A duplicate answers 500: there is no handler.
  await failsOn('fl-134', 'answers 409', (d) => {
    d.flows[0].errorHandlers = []
  })
  // An On Error Continue inside the Try: the error never leaves it, so the transaction commits rows 1 and 2.
  await failsOn('fl-134', 'Run: Row three is already in the table', (d) => {
    one(d, 'try').errorHandlers = [d.flows[0].errorHandlers[0]]
    one(d, 'try').errorHandlers[0].type = 'on-error-continue'
  })
  // A Bulk Insert in the transactional Try instead of the For Each.
  await passes('fl-134', (d) => {
    const attempt = one(d, 'try')
    attempt.steps = [step('db-bulk-insert', { database: 'PostgreSQL', sql: 'INSERT INTO timesheet_entries (employee_id, work_date, hours, project_code) VALUES (:employeeId, :workDate, :hours, :projectCode)' })]
    const otherwise = one(d, 'choice').otherwise
    otherwise.unshift(step('set-variable', { variableName: 'upload', value: '#[payload]' }))
    attempt.steps.unshift(step('set-payload', { value: '#[payload.entries]' }))
    one(d, 'set-payload', (n) => n.config.value.includes('saved')).config.value = '#[output application/json --- { saved: sizeOf(vars.upload.entries), weekStart: vars.upload.weekStart }]'
  })
  // BEGIN_OR_JOIN, and the duplicate handler with no When condition.
  await passes('fl-134', (d) => {
    one(d, 'try').config.transactionalAction = 'BEGIN_OR_JOIN'
    handlerFor(d, 'QUERY_EXECUTION').config.when = ''
  })

  // FL-135
  // The update has no version check: a late event takes the van back in time.
  await failsOn('fl-135', 'only when the event is newer', (d) => {
    for (const u of all(d, 'db-update')) u.config.sql = 'UPDATE vehicle_status SET status = :status, odometer_km = :odometerKm, event_seq = :seq WHERE vehicle_id = :vehicleId'
  })
  // The same, seen in a run.
  await failsOn('fl-135', 'Run: An old event arrives late', (d) => {
    for (const u of all(d, 'db-update')) u.config.sql = 'UPDATE vehicle_status SET status = :status, odometer_km = :odometerKm, event_seq = :seq WHERE vehicle_id = :vehicleId'
  })
  // No Try around the insert: a stale event fails the flow and is never acknowledged.
  await failsOn('fl-135', 'Run: An old event arrives late', (d) => {
    const route = one(d, 'choice').routes[0]
    route.steps = one(d, 'try').steps
  })
  // The ack sits in the error handler as well: an outage acknowledges the message and it is lost.
  await failsOn('fl-135', 'Run: The database is down', (d) => {
    const h = handlerFor(d, 'CONNECTIVITY')
    h.type = 'on-error-continue'
    remove(h.steps, 'mq-nack')
  })
  // Automatic acknowledgement.
  await failsOn('fl-135', 'with manual acknowledgement', (d) => {
    d.flows[0].source.config.acknowledgementMode = 'AUTO'
  })
  // The duplicate is only logged: a newer event that loses the insert race is dropped.
  await failsOn('fl-135', 'runs once more', (d) => {
    remove(handlerFor(d, 'QUERY_EXECUTION').steps, 'db-update')
  })
  // The version check written the other way round, and On Error Continue with a Nack for the outage.
  await passes('fl-135', (d) => {
    for (const u of all(d, 'db-update')) u.config.sql = 'UPDATE vehicle_status SET status = :status, odometer_km = :odometerKm, event_seq = :seq WHERE vehicle_id = :vehicleId AND :seq > event_seq'
    handlerFor(d, 'CONNECTIVITY').type = 'on-error-continue'
  })
  // The ack token read from the attributes in the Ack, since nothing before it replaces them.
  await passes('fl-135', (d) => {
    one(d, 'mq-ack').config.ackToken = '#[attributes.ackToken]'
  })
}
