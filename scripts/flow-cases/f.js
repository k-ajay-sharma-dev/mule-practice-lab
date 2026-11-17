// Wrong and other correct designs for batch F (fl-121 to fl-125). See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, handlerFor, remove, step, createNode }) => {

  // FL-121
  // Only the address ID in the WHERE clause: any customer can delete any address.
  await failsOn('fl-121', 'matching both the address ID and the customer ID', (d) => {
    one(d, 'db-delete').config.sql = 'DELETE FROM customer_addresses WHERE address_id = :addressId'
  })
  // No Choice: every call answers 204, even when nothing was deleted.
  await failsOn('fl-121', 'A Choice reads affectedRows', (d) => {
    const choice = one(d, 'choice')
    d.flows[0].steps.splice(d.flows[0].steps.indexOf(choice), 1, ...choice.otherwise)
  })
  // A missing address answers 400.
  await failsOn('fl-121', 'set to 404', (d) => {
    one(d, 'set-variable', (n) => n.config.value === '404').config.value = '400'
  })
  // The condition is the wrong way round: a deleted address answers 404.
  await failsOn('fl-121', 'Run: A customer deletes one of their addresses', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[payload.affectedRows == 1]'
  })
  // The listener takes any method.
  await failsOn('fl-121', 'is a DELETE', (d) => {
    d.flows[0].source.config.allowedMethods = ''
  })
  // The deleted case on the route and 404 in the otherwise branch, with the IDs the other way round.
  await passes('fl-121', (d) => {
    const choice = one(d, 'choice')
    const notFound = choice.routes[0].steps
    choice.routes[0].config.expression = '#[payload.affectedRows > 0]'
    choice.routes[0].steps = choice.otherwise
    choice.otherwise = notFound
    one(d, 'db-delete').config.sql = 'DELETE FROM customer_addresses WHERE customer_id = :customerId AND address_id = :addressId'
  })
  // The status written as a number.
  await passes('fl-121', (d) => {
    one(d, 'set-variable', (n) => n.config.value === '204').config.value = '#[204]'
    one(d, 'choice').routes[0].config.expression = '#[payload.affectedRows < 1]'
  })

  // FL-122
  // The old update: last write wins.
  await failsOn('fl-122', 'only matches the row when its version', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE work_orders SET status = :status, assigned_to = :assignedTo, notes = :notes, version = version + 1 WHERE work_order_id = :workOrderId'
  })
  // The version is checked but never raised, so the next client with the same version still wins.
  await failsOn('fl-122', 'raises the version by one', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE work_orders SET status = :status, assigned_to = :assignedTo, notes = :notes WHERE work_order_id = :workOrderId AND version = :expectedVersion'
  })
  // No check for the header: a request without If-Match fails later with a 500.
  await failsOn('fl-122', 'stopped before the UPDATE', (d) => {
    remove(d.flows[0].steps, 'validation')
  })
  // Every miss is a conflict: an unknown ID answers 412.
  await failsOn('fl-122', 'Only after an UPDATE that changed nothing', (d) => {
    const choice = one(d, 'choice')
    choice.otherwise = [step('set-variable', { variableName: 'httpStatus', value: '412' }), step('set-payload', { value: '#[output application/json --- { code: "VERSION_CONFLICT" }]' })]
  })
  // Read, compare in Mule, then write: the row is read before the UPDATE.
  await failsOn('fl-122', 'Only after an UPDATE that changed nothing', (d) => {
    const steps = d.flows[0].steps
    steps.splice(steps.indexOf(one(d, 'db-update')), 0, step('db-select', { database: 'PostgreSQL', sql: 'SELECT version FROM work_orders WHERE work_order_id = :workOrderId', target: 'current' }))
  })
  // A conflict answers 409.
  await failsOn('fl-122', 'sets status 412', (d) => {
    one(d, 'set-variable', (n) => n.config.value === '412').config.value = '409'
  })
  // The version in the WHERE clause first, and the route tests for more than zero rows.
  await passes('fl-122', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE work_orders SET status = :status, assigned_to = :assignedTo, notes = :notes, version = version + 1 WHERE version = :expectedVersion AND work_order_id = :workOrderId'
    one(d, 'choice').routes[0].config.expression = '#[vars.updated.affectedRows > 0]'
  })
  // The missing header handled by a second error type as well.
  await passes('fl-122', (d) => {
    handlerFor(d, 'VALIDATION').config.type = 'VALIDATION:BLANK_STRING, VALIDATION:NULL'
  })

  // FL-123
  // No marker: a retry during the charge call charges again.
  await failsOn('fl-123', 'PROCESSING marker', (d) => {
    const steps = one(d, 'choice').routes[0].steps
    steps.splice(steps.findIndex((n) => n.type === 'os-store'), 1)
  })
  // Only "seen" is stored, never the answer: a retry cannot get the same answer.
  await failsOn('fl-123', 'the answer itself is stored', (d) => {
    const steps = one(d, 'choice').routes[0].steps
    steps.splice(steps.findLastIndex((n) => n.type === 'os-store'), 1)
  })
  // The charge does not carry the key, so a timeout followed by a retry can charge twice.
  await failsOn('fl-123', 'carries the key as its requestId', (d) => {
    one(d, 'transform', (n) => n.config.script.includes('requestId')).config.script = '%dw 2.0\noutput application/json\n---\n{ cardId: vars.request.cardId, amount: vars.request.amount, currency: vars.request.currency }'
  })
  // The marker stays after a timeout: every retry gets 409 for 24 hours.
  await failsOn('fl-123', 'the marker is removed', (d) => {
    remove(handlerFor(d, 'TIMEOUT').steps, 'os-remove')
  })
  // No 409 route: a retry during the call is answered from a marker that has no response yet.
  await failsOn('fl-123', 'gets 409', (d) => {
    one(d, 'choice').routes.splice(2, 1)
  })
  // The key is checked after the charge.
  await failsOn('fl-123', 'looked up in the Object Store before', (d) => {
    const steps = d.flows[0].steps
    const lookup = remove(steps, 'os-retrieve')
    steps.push(lookup)
  })
  // One handler for every other error removes the marker.
  await passes('fl-123', (d) => {
    handlerFor(d, 'TIMEOUT').config.type = 'ANY'
  })
  // The PROCESSING route comes before the comparison of the bodies.
  await passes('fl-123', (d) => {
    const choice = one(d, 'choice')
    ;[choice.routes[1], choice.routes[2]] = [choice.routes[2], choice.routes[1]]
  })

  // FL-124
  // Every scan becomes an event.
  await failsOn('fl-124', 'Only DELIVERED scans', (d) => {
    one(d, 'foreach').config.collection = '#[payload.events]'
  })
  // The old Case update is kept beside the event.
  await failsOn('fl-124', 'no longer queries or updates Cases', (d) => {
    one(d, 'foreach').steps.push(step('sf-update', { objectType: 'Case' }))
  })
  // On Error Continue: the carrier gets 200 and drops the batch.
  await failsOn('fl-124', 'gets 503', (d) => {
    const h = handlerFor(d, 'SALESFORCE')
    h.type = 'on-error-continue'
    remove(h.steps, 'set-variable')
  })
  // The event fields without the __c suffix.
  await failsOn('fl-124', 'custom field names', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/java\n---\n{ Tracking_Number: payload.trackingNumber, Order_Number: payload.orderNumber, Delivered_At: payload.scannedAt }'
  })
  // The event named like a custom object.
  await failsOn('fl-124', 'Parcel_Delivered__e', (d) => {
    one(d, 'sf-publish-platform-event').config.platformEventName = 'Parcel_Delivered__c'
  })
  // A Choice inside the loop picks the deliveries.
  await passes('fl-124', (d) => {
    const loop = one(d, 'foreach')
    loop.config.collection = '#[payload.events]'
    const choice = createNode('choice')
    choice.routes[0].config.expression = '#[payload.scanType == "DELIVERED"]'
    choice.routes[0].steps = loop.steps
    choice.otherwise = [step('logger', { level: 'DEBUG', message: '#["Skipped " ++ payload.scanType]' })]
    loop.steps = [choice]
  })
  // One handler for every error.
  await passes('fl-124', (d) => {
    handlerFor(d, 'SALESFORCE').config.type = 'ANY'
  })

  // FL-125
  // Any server takes the lease, expired or not.
  await failsOn('fl-125', 'only matches an expired lease', (d) => {
    one(d, 'db-update', (n) => n.config.target === 'lease').config.sql = "UPDATE job_lock SET owner = :node, lease_until = CURRENT_TIMESTAMP + INTERVAL '30' MINUTE WHERE job_name = 'interest-export' AND last_completed_date < TO_DATE(:businessDate, 'YYYY-MM-DD')"
  })
  // The lease times come from each server's own clock.
  await failsOn('fl-125', 'database clock', (d) => {
    one(d, 'db-update', (n) => n.config.target === 'lease').config.sql = "UPDATE job_lock SET owner = :node, lease_until = :leaseUntil WHERE job_name = 'interest-export' AND lease_until < :now AND last_completed_date < TO_DATE(:businessDate, 'YYYY-MM-DD')"
  })
  // No check for a finished day: the 01:10 run exports again.
  await failsOn('fl-125', 'skips a day that is already done', (d) => {
    one(d, 'db-update', (n) => n.config.target === 'lease').config.sql = "UPDATE job_lock SET owner = :node, lease_until = CURRENT_TIMESTAMP + INTERVAL '30' MINUTE WHERE job_name = 'interest-export' AND lease_until < CURRENT_TIMESTAMP"
  })
  // The day is marked done before the file is written.
  await failsOn('fl-125', 'only after the file is written', (d) => {
    const steps = one(d, 'choice').routes[0].steps
    const done = steps.splice(steps.findLastIndex((n) => n.type === 'db-update'), 1)[0]
    steps.splice(1, 0, done)
  })
  // The handler marks the day done as well.
  await failsOn('fl-125', 'the day is not marked done', (d) => {
    handlerFor(d, 'ANY').steps[0].config.sql = "UPDATE job_lock SET last_completed_date = TO_DATE(:businessDate, 'YYYY-MM-DD'), owner = NULL, lease_until = CURRENT_TIMESTAMP WHERE job_name = 'interest-export' AND owner = :node"
  })
  // The handler frees the lease whoever holds it.
  await failsOn('fl-125', 'only by its owner', (d) => {
    handlerFor(d, 'ANY').steps[0].config.sql = "UPDATE job_lock SET owner = NULL, lease_until = CURRENT_TIMESTAMP WHERE job_name = 'interest-export'"
  })
  // No handler: a failed run blocks every server until the lease runs out.
  await failsOn('fl-125', 'Run: The ledger SFTP server is down', (d) => {
    d.flows[0].errorHandlers = []
  })
  // A fixed frequency of 24 hours: no takeover the same night.
  await failsOn('fl-125', 'cron expression', (d) => {
    Object.assign(d.flows[0].source.config, { strategy: 'fixed-frequency', frequency: 24, timeUnit: 'HOURS', expression: '' })
  })
  // SYSTIMESTAMP and a 20 minute lease.
  await passes('fl-125', (d) => {
    for (const n of all(d, 'db-update')) n.config.sql = n.config.sql.replaceAll('CURRENT_TIMESTAMP', 'SYSTIMESTAMP').replace("INTERVAL '30' MINUTE", "INTERVAL '20' MINUTE")
  })
  // The handler names the errors it expects.
  await passes('fl-125', (d) => {
    handlerFor(d, 'ANY').config.type = 'SFTP:CONNECTIVITY, DB:CONNECTIVITY, DB:QUERY_EXECUTION'
  })
}
