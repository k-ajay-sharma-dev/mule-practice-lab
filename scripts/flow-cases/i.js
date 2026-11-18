// Wrong and other correct designs for batch I (fl-136 to fl-140). See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, handlerFor, remove, step, scope }) => {
  // FL-136
  // A fixed frequency: the report runs every 24 hours from whenever the app started, not at 06:00.
  await failsOn('fl-136', 'with a cron expression', (d) => {
    d.flows[0].source.config = { strategy: 'fixed-frequency', frequency: 24, timeUnit: 'HOURS', expression: '' }
  })
  // <= instead of <: a row exactly at its reorder level is reported.
  await failsOn('fl-136', 'Run: A row exactly at its reorder level', (d) => {
    one(d, 'db-select').config.sql = one(d, 'db-select').config.sql.replace('on_hand < reorder_level', 'on_hand <= reorder_level')
  })
  // No Choice: a quiet day writes a file with only a header.
  await failsOn('fl-136', 'Run: Nothing is low', (d) => {
    const choice = one(d, 'choice')
    d.flows[0].steps.splice(d.flows[0].steps.indexOf(choice), 1, ...choice.otherwise)
  })
  // The rows are written as JSON.
  await failsOn('fl-136', 'turns the rows into CSV', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\npayload'
  })
  // One fixed file name, overwritten each day.
  await failsOn('fl-136', 'with the date in its name', (d) => {
    one(d, 'file-write').config.path = '/reports/today.csv'
  })
  // The Choice written the other way round: a route for "there are rows", and the log in the otherwise branch.
  await passes('fl-136', (d) => {
    const choice = one(d, 'choice')
    const write = choice.otherwise
    choice.otherwise = choice.routes[0].steps
    choice.routes[0].steps = write
    choice.routes[0].config.expression = '#[sizeOf(payload) > 0]'
  })
  // The report at 06:30 instead.
  await passes('fl-136', (d) => {
    d.flows[0].source.config.expression = '0 30 6 * * ?'
  })

  // FL-137
  // Every item is updated, even when the price is the same: the audit trigger fires for nothing.
  await failsOn('fl-137', 'Run: A price that did not change is not written', (d) => {
    const choice = one(d, 'choice')
    choice.routes[1].config.expression = '#[true == true]'
  })
  // The routes in the other order: a new SKU goes to the update, which changes no row.
  await failsOn('fl-137', 'Run: One of each', (d) => {
    one(d, 'choice').routes.reverse()
  })
  // Every item is inserted with no read first: a known SKU breaks the primary key.
  await failsOn('fl-137', 'Run: One of each', (d) => {
    const loop = one(d, 'foreach')
    const insert = one(d, 'db-insert')
    loop.steps = [insert, step('set-variable', { variableName: 'inserted', value: '#[vars.inserted + 1]' })]
  })
  // The SKU alone in the WHERE clause: another supplier's price changes too.
  await failsOn('fl-137', 'Run: Another supplier sells the same SKU', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE supplier_prices SET price = :price, changed_on = :changedOn WHERE sku = :sku'
  })
  // The counts start inside the loop, so each item starts from 0 again.
  await failsOn('fl-137', 'The counts start before the loop', (d) => {
    const counts = d.flows[0].steps.filter((n) => n.type === 'set-variable' && ['inserted', 'updated', 'unchanged'].includes(n.config.variableName))
    d.flows[0].steps = d.flows[0].steps.filter((n) => !counts.includes(n))
    one(d, 'foreach').steps.unshift(...counts)
  })
  // sizeOf instead of isEmpty, and the new price compared the other way round.
  await passes('fl-137', (d) => {
    const choice = one(d, 'choice')
    choice.routes[0].config.expression = '#[sizeOf(vars.current) == 0]'
    choice.routes[1].config.expression = '#[payload.price != vars.current[0].price]'
  })
  // No Target on the insert and update: the payload is the result, so the item is kept in a variable first.
  await passes('fl-137', (d) => {
    const loop = one(d, 'foreach')
    loop.steps.unshift(step('set-variable', { variableName: 'item', value: '#[payload]' }))
    for (const t of ['db-insert', 'db-update']) {
      const n = one(d, t)
      n.config.target = ''
      n.config.inputParameters = n.config.inputParameters.replaceAll('payload.', 'vars.item.')
    }
    const choice = one(d, 'choice')
    choice.routes[1].config.expression = '#[vars.current[0].price != vars.item.price]'
  })

  // FL-138
  // The flag is read once into a property-like variable at the top of the admin flow only: the quote never reads it.
  await failsOn('fl-138', 'read from the Object Store on each request', (d) => {
    remove(d.flows[0].steps, 'os-retrieve')
    one(d, 'set-variable', (n) => n.config.variableName === 'provider').config.value = '#[p("tax.provider") default "legacy"]'
  })
  // No default value: before anyone sets the flag, the Retrieve fails.
  await failsOn('fl-138', 'Run: No flag has been set yet', (d) => {
    one(d, 'os-retrieve').config.defaultValue = ''
  })
  // The order is not kept: the provider is sent the flag instead of the order.
  await failsOn('fl-138', 'Run: The flag says new', (d) => {
    remove(d.flows[0].steps, 'set-payload')
  })
  // The admin endpoint stores under another key.
  await failsOn('fl-138', 'under the same key the quote reads', (d) => {
    one(d, 'os-store').config.key = 'taxProvider'
  })
  // Any value is stored: a typo sends every quote down the legacy route by luck, and the admin gets 200.
  await failsOn('fl-138', 'Run: A typo in the flag value', (d) => {
    const choice = one(d, 'choice', (n) => n.routes.some((r) => r.config.expression.includes('contains')))
    d.flows[1].steps = choice.routes[0].steps
  })
  // The legacy engine on its own route and TaxNow in the otherwise branch: a typo would reach TaxNow, but the admin
  // endpoint never stores one, so this is correct too.
  await passes('fl-138', (d) => {
    const choice = d.flows[0].steps.find((n) => n.type === 'choice')
    const legacy = choice.otherwise
    choice.otherwise = choice.routes[0].steps
    choice.routes[0].steps = legacy
    choice.routes[0].config.expression = '#[vars.provider != "new"]'
  })
  // The value checked with a match on two words.
  await passes('fl-138', (d) => {
    const choice = one(d, 'choice', (n) => n.routes.some((r) => r.config.expression.includes('contains')))
    choice.routes[0].config.expression = '#[payload.provider == "legacy" or payload.provider == "new"]'
  })

  // FL-139
  // No Try around the scan insert: a repeat scan fails the flow and goes back to the queue for ever.
  await failsOn('fl-139', 'Run: The same parcel is scanned twice', (d) => {
    const attempt = d.flows[0].steps.find((n) => n.type === 'try')
    d.flows[0].steps.splice(d.flows[0].steps.indexOf(attempt), 1, ...attempt.steps)
  })
  // No notice row: a redelivered last scan announces the order again.
  await failsOn('fl-139', 'Run: The last scan is delivered again', (d) => {
    const inner = one(d, 'try', (n) => n.config.transactionalAction === 'ALWAYS_BEGIN')
    remove(inner.steps, 'db-insert')
  })
  // The notice row and the publish with no transaction: a failed publish leaves the row, and the order is never announced.
  await failsOn('fl-139', 'Run: The event queue is down', (d) => {
    one(d, 'try', (n) => n.config.transactionalAction === 'ALWAYS_BEGIN').config.transactionalAction = 'INDIFFERENT'
  })
  // The count is read before the scan is saved: the last scan sees one too few and nothing is published.
  await failsOn('fl-139', 'counted after the scan is saved', (d) => {
    const steps = d.flows[0].steps
    const count = remove(steps, 'db-select')
    steps.splice(1, 0, count)
  })
  // On Error Continue for every error in the transactional Try: a failed publish commits nothing, but the scan is acknowledged and lost.
  await failsOn('fl-139', 'Run: The event queue is down', (d) => {
    one(d, 'try', (n) => n.config.transactionalAction === 'ALWAYS_BEGIN').errorHandlers[0].config.type = 'ANY'
  })
  // == for the count, and the payload built in a Transform.
  await passes('fl-139', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[vars.progress[0].delivered == vars.scan.parcelCount]'
    const build = one(d, 'set-payload')
    build.type = 'transform'
    build.config = { target: 'payload', variableName: '', script: '%dw 2.0\noutput application/json\n---\n{ orderId: vars.scan.orderId, parcels: vars.scan.parcelCount, deliveredAt: vars.scan.scannedAt }' }
  })

  // FL-140
  // No safety check: a short export closes most of the network.
  await failsOn('fl-140', 'Run: The export is cut short', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[false]'
  })
  // The sweep deletes the rows.
  await failsOn('fl-140', 'never deleted', (d) => {
    const sweep = one(d, 'db-update')
    sweep.type = 'db-delete'
    sweep.config = { database: 'PostgreSQL', sql: 'DELETE FROM stores WHERE last_seen <> :stamp', inputParameters: '#[{ stamp: vars.stamp }]', target: 'closed' }
  })
  // The upsert does not set active = 1: a store that reopens stays closed.
  await failsOn('fl-140', 'Run: A normal night', (d) => {
    one(d, 'db-insert').config.sql = one(d, 'db-insert').config.sql.replace(', active = 1, last_seen', ', last_seen')
  })
  // The sweep in the error handler as a clean-up: the failure it reacts to is the one that should stop it.
  await failsOn('fl-140', 'after the loop', (d) => {
    const sweep = one(d, 'db-update')
    const otherwise = one(d, 'choice').otherwise
    otherwise.splice(otherwise.indexOf(sweep), 1)
    d.flows[0].errorHandlers[0].steps.push(sweep)
  })
  // The sweep before the loop: the right end state on a good night, but it closes every store first.
  await failsOn('fl-140', 'after the loop', (d) => {
    const otherwise = one(d, 'choice').otherwise
    const sweep = remove(otherwise, 'db-update')
    otherwise.unshift(sweep)
  })
  // The stamp coerced to text, and the threshold written as a share.
  await passes('fl-140', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[sizeOf(payload.stores default []) / vars.current[0].active_count < 0.8]'
    one(d, 'set-variable', (n) => n.config.variableName === 'stamp').config.value = '#[payload.generatedAt as String]'
  })
}
