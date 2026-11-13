// Wrong and other correct designs for batch D (fl-089 to fl-113). See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, handlerFor, flowOf, remove, step, scope, handler, subFlow, createNode }) => {
  const statusIn = (h) => h.steps.find((n) => n.type === 'set-variable' && /\d{3}/.test(n.config.value))
  const move = (list, type, to) => {
    const node = remove(list, type)
    list.splice(to < 0 ? list.length + to + 1 : to, 0, node)
    return node
  }

  // FL-089
  await failsOn('fl-089', 'separate flow', (d) => {
    flowOf(d, 'submit').steps.push(step('sf-get-job-state-v2', { jobId: '#[payload.id]' }))
  })
  await failsOn('fl-089', 'keyed on PIM_Product_Id__c', (d) => {
    one(d, 'sf-create-job-v2').config.externalIdFieldName = 'ProductCode'
  })
  await failsOn('fl-089', 'No single-record', (d) => {
    flowOf(d, 'submit').steps.splice(2, 1, scope('foreach', { collection: '#[payload]' }, [step('sf-upsert')]))
  })
  await failsOn('fl-089', 'alert email', (d) => {
    for (const c of all(d, 'choice')) for (const r of c.routes) r.steps = r.steps.filter((n) => n.type !== 'email-send')
  })
  await failsOn('fl-089', '/pim/rejected/', (d) => {
    for (const w of all(d, 'sftp-write')) w.config.path = '/pim/outbound/rejected.csv'
  })
  // Unprocessed rows only logged leave out the rejected file the scenario lists.
  await failsOn('fl-089', 'every call, read and write', (d) => {
    const done = one(d, 'choice', (c) => c.routes.some((r) => r.config.expression.includes('JobComplete'))).routes[0]
    done.steps.splice(5, 1, step('logger', { level: 'WARN', message: '#["Unprocessed rows: " ++ write(payload, "application/csv")]' }))
  })

  // FL-090
  await failsOn('fl-090', 'keyed on the IDoc number', (d) => {
    one(d, 'idempotent').config.idExpression = '#[vars.idoc..MATNR[0]]'
  })
  await failsOn('fl-090', 'No catch-all On Error Continue', (d) => {
    handlerFor(d, 'ANY').type = 'on-error-continue'
  })
  await failsOn('fl-090', 'comes before any catch-all', (d) => {
    d.flows[0].errorHandlers.reverse()
  })
  await failsOn('fl-090', 'logged with the IDoc number', (d) => {
    handlerFor(d, 'ANY').steps[0].config.message = '#[error.description]'
  })
  // An On Error Continue with no type catches everything, the same as ANY.
  await failsOn('fl-090', 'No catch-all On Error Continue', (d) => {
    d.flows[0].errorHandlers.push(handler('on-error-continue', { type: '' }, [step('logger', { level: 'ERROR', message: '#["IDoc " ++ vars.docnum ++ " failed"]' })]))
  })
  // The untyped catch-all propagate sits first, so the duplicate handler is never reached.
  await failsOn('fl-090', 'comes before any catch-all', (d) => {
    handlerFor(d, 'ANY').config.type = ''
    d.flows[0].errorHandlers.reverse()
  })
  await passes('fl-090', (d) => {
    one(d, 'idempotent').config.idExpression = '#[vars.idoc..DOCNUM[0]]'
  })
  // An untyped propagate after the duplicate handler is a fair catch-all.
  await passes('fl-090', (d) => {
    handlerFor(d, 'ANY').config.type = ''
  })
  // With no catch-all, the order of the handlers does not matter.
  await passes('fl-090', (d) => {
    handlerFor(d, 'ANY').config.type = 'ANYPOINT-MQ:CONNECTIVITY, MULE:EXPRESSION'
    d.flows[0].errorHandlers.reverse()
  })

  // FL-091
  await failsOn('fl-091', 'No On Error Continue sits on the Try', (d) => {
    one(d, 'try').errorHandlers = [
      handler('on-error-continue', { type: 'APP:SAP-ORDER-REJECTED' }, [step('set-variable', { variableName: 'httpStatus', value: '#[422]' })]),
    ]
  })
  await failsOn('fl-091', 'gets a 422', (d) => {
    statusIn(handlerFor(d, 'SAP-ORDER-REJECTED')).config.value = '#[400]'
  })
  await failsOn('fl-091', 'mapped to a 503', (d) => {
    statusIn(handlerFor(d, 'SAP:CONNECTIVITY')).config.value = '#[500]'
  })
  await failsOn('fl-091', 'timing out or being busy', (d) => {
    handlerFor(d, 'SAP:CONNECTIVITY').config.type = 'SAP:CONNECTIVITY'
  })
  await failsOn('fl-091', 'returns 201', (d) => {
    one(d, 'set-variable', (n) => n.config.value === '#[201]').config.value = '#[200]'
  })
  await failsOn('fl-091', 'after the BAPI call', (d) => {
    move(one(d, 'try').steps, 'choice', 0)
  })
  // Separate 503 handlers per error type, and a flow-level On Error Continue for the rejection.
  await passes('fl-091', (d) => {
    const h = handlerFor(d, 'SAP:CONNECTIVITY')
    h.config.type = 'SAP:CONNECTIVITY, SAP:TIMEOUT'
    d.flows[0].errorHandlers.push({ ...structuredClone(h), config: { type: 'SAP:SYSTEM_BUSY' } })
    handlerFor(d, 'SAP-ORDER-REJECTED').type = 'on-error-continue'
  })

  // FL-092
  await failsOn('fl-092', 'stored only after all pages', (d) => {
    const steps = d.flows[0].steps
    move(steps, 'os-store', steps.findIndex((n) => n.type === 'foreach'))
  })
  await failsOn('fl-092', 'not in an error handler', (d) => {
    handlerFor(d, 'ANY').steps.push(step('os-store', { key: 'worker-sync-from', value: '#[vars.syncTo]', objectStore: 'workerSyncStore' }))
  })
  await failsOn('fl-092', 'PUT /identities', (d) => {
    one(d, 'http-request').config.method = 'POST'
  })
  await failsOn('fl-092', 'alerts the HRIS support mailbox', (d) => {
    remove(handlerFor(d, 'VALIDATION_ERROR').steps, 'email-send')
  })
  await passes('fl-092', (d) => {
    flowOf(d, 'process-worker-page').steps.find((n) => n.type === 'foreach').type = 'parallel-foreach'
  })

  // FL-093
  await failsOn('fl-093', 'Both checks run before the replay', (d) => {
    const steps = d.flows[0].steps
    move(steps, 'idempotent', steps.findIndex((n) => n.type === 'validation') + 1)
  })
  await failsOn('fl-093', 'sets the status to 401', (d) => {
    statusIn(handlerFor(d, 'INVALID_BOOLEAN')).config.value = '#[403]'
  })
  await failsOn('fl-093', 'sets the status to 200', (d) => {
    statusIn(handlerFor(d, 'DUPLICATE_MESSAGE')).config.value = '#[409]'
  })
  await failsOn('fl-093', 'shipment.callbacks queue', (d) => {
    one(d, 'mq-publish').config.destination = 'callbacks'
  })
  await failsOn('fl-093', 'answered with 202', (d) => {
    one(d, 'set-variable', (n) => n.config.value === '#[202]').config.value = '#[200]'
  })
  // Setting 202 before the publish is fine: a failed publish still ends in the 500 handler.
  await passes('fl-093', (d) => {
    const steps = d.flows[0].steps
    const status = steps.splice(steps.findIndex((n) => n.config.value === '#[202]'), 1)[0]
    steps.splice(2, 0, status)
  })

  // FL-094
  await failsOn('fl-094', 'checked before the broker lookup', (d) => {
    const steps = d.flows[0].steps
    move(steps, 'validation', steps.findIndex((n) => n.type === 'db-select'))
  })
  await failsOn('fl-094', 'saved in variables before', (d) => {
    const steps = d.flows[0].steps
    const serial = steps.splice(steps.findIndex((n) => n.config.variableName === 'clientSerial'), 1)[0]
    steps.splice(steps.findIndex((n) => n.type === 'db-select') + 1, 0, serial)
  })
  await failsOn('fl-094', 'both the DN and the serial', (d) => {
    one(d, 'db-select').config.sql = "SELECT broker_id FROM authorised_brokers WHERE cert_serial = :serial AND status = 'ACTIVE'"
  })
  await failsOn('fl-094', 'empty result check', (d) => {
    const steps = d.flows[0].steps
    steps.splice(steps.findIndex((n) => n.config.check === 'is-not-empty-collection'), 1)
  })
  await failsOn('fl-094', 'returns 401', (d) => {
    statusIn(handlerFor(d, 'INVALID_BOOLEAN')).config.value = '#[403]'
  })
  await failsOn('fl-094', 'returns 403', (d) => {
    statusIn(handlerFor(d, 'EMPTY_COLLECTION')).config.value = '#[401]'
  })
  await failsOn('fl-094', 'logs the serial', (d) => {
    handlerFor(d, 'EMPTY_COLLECTION').steps.find((n) => n.type === 'logger').config.message = 'Certificate not authorised'
  })
  // All headers kept in one variable before the lookup.
  await passes('fl-094', (d) => {
    const steps = d.flows[0].steps
    d.flows[0].steps = steps.filter((n) => !['clientDn', 'clientSerial'].includes(n.config.variableName))
    d.flows[0].steps.splice(1, 0, step('set-variable', { variableName: 'certHeaders', value: '#[attributes.headers]' }))
    handlerFor(d, 'EMPTY_COLLECTION').steps.find((n) => n.type === 'logger').config.message =
      '#["Certificate not authorised: DN " ++ vars.certHeaders."x-ssl-client-dn" ++ " serial " ++ vars.certHeaders."x-ssl-client-serial"]'
  })

  // FL-095
  await failsOn('fl-095', 'not read from headers', (d) => {
    one(d, 'set-variable', (n) => n.config.variableName === 'tenantId').config.value = '#[attributes.headers."x-tenant-id" default ""]'
  })
  await failsOn('fl-095', 'compares the tenant', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[isEmpty(payload)]'
  })
  await failsOn('fl-095', 'ownership is checked before statements', (d) => {
    const steps = d.flows[0].steps
    const statements = steps.splice(steps.findLastIndex((n) => n.type === 'db-select'), 1)[0]
    steps.splice(steps.findIndex((n) => n.type === 'choice'), 0, statements)
  })
  await failsOn('fl-095', 'Not found returns 404', (d) => {
    statusIn(handlerFor(d, 'ACCOUNT_NOT_FOUND')).config.value = '#[403]'
  })
  await failsOn('fl-095', 'refused attempt is logged', (d) => {
    remove(handlerFor(d, 'ACCOUNT_NOT_FOUND').steps, 'logger')
  })
  await failsOn('fl-095', 'Both checks run before any account data', (d) => {
    const steps = d.flows[0].steps
    const scopeCheck = steps.splice(steps.findIndex((n) => n.config.check === 'is-true'), 1)[0]
    steps.splice(steps.findIndex((n) => n.type === 'db-select') + 1, 0, scopeCheck)
  })
  // The scope is read from the claims inside the validation, with no variable.
  await passes('fl-095', (d) => {
    const steps = d.flows[0].steps
    steps.splice(steps.findIndex((n) => n.config.variableName === 'scopes'), 1)
    one(d, 'validation', (n) => n.config.check === 'is-true').config.expression =
      '#[((authentication.properties.claims.scope default "") splitBy " ") contains "statements:read"]'
  })

  // FL-096
  await failsOn('fl-096', 'Try sits inside the For Each', (d) => {
    const steps = d.flows[0].steps
    const i = steps.findIndex((n) => n.type === 'foreach')
    const loop = steps[i]
    const tryScope = loop.steps[1]
    loop.steps.splice(1, 1, ...tryScope.steps)
    steps[i] = scope('try', {}, [loop], { errorHandlers: tryScope.errorHandlers })
  })
  await failsOn('fl-096', 'every Monday at 06:00', (d) => {
    d.flows[0].source.config.expression = '0 0 6 * * ?'
  })
  await failsOn('fl-096', 'sent by email after the loop', (d) => {
    const email = remove(d.flows[0].steps, 'email-send')
    one(d, 'foreach').steps.push(email)
  })
  await failsOn('fl-096', 'token is kept in a variable', (d) => {
    const steps = d.flows[0].steps
    steps.splice(steps.findIndex((n) => n.config.variableName === 'token'), 1)
  })
  await failsOn('fl-096', 'adds the environment to the report', (d) => {
    remove(handlerFor(d, 'EMPTY_COLLECTION').steps, 'set-variable')
  })
  await passes('fl-096', (d) => {
    d.flows[0].source.config.expression = '0 0 6 ? * 2'
  })

  // FL-097
  await failsOn('fl-097', 'not caught per row', (d) => {
    const tryScope = one(d, 'try')
    const loop = tryScope.steps[0]
    const routeSteps = one(d, 'choice').routes[0].steps
    routeSteps.splice(routeSteps.indexOf(tryScope), 1, loop)
    loop.steps = [scope('try', {}, loop.steps, { errorHandlers: tryScope.errorHandlers })]
  })
  await failsOn('fl-097', 'id order', (d) => {
    one(d, 'db-select').config.sql = 'SELECT id AS "id", vehicle_id AS "vehicle_id", reading AS "reading" FROM telemetry_outbox WHERE id > :lastId'
  })
  await failsOn('fl-097', 'after each successful call', (d) => {
    move(one(d, 'foreach').steps, 'os-store', 1)
  })
  await failsOn('fl-097', 'with a default', (d) => {
    handlerFor(d, 'TOO_MANY').steps[0].config.value = '#[error.errorMessage.attributes.headers["x-ratelimit-reset"] as Number]'
  })
  await failsOn('fl-097', 'stores the time to wait', (d) => {
    remove(handlerFor(d, 'TOO_MANY').steps, 'os-store')
  })
  await failsOn('fl-097', 'no row is read or sent', (d) => {
    const route = one(d, 'choice').routes[0].steps
    const select = remove(route, 'db-select')
    d.flows[0].steps.splice(0, 0, select)
  })
  // A second handler for other errors at row level does not hide a 429.
  await passes('fl-097', (d) => {
    const loop = one(d, 'foreach')
    loop.steps.splice(1, 1, scope('try', {}, [loop.steps[1]], {
      errorHandlers: [handler('on-error-propagate', { type: 'MULE:EXPRESSION' }, [step('logger', { level: 'ERROR', message: '#["Row not mapped: " ++ (vars.rowId as String)]' })])],
    }))
  })

  // FL-098
  await failsOn('fl-098', 'fixed hours', (d) => {
    one(d, 'set-payload').config.value = '#[output application/json --- { store: "Main Street", opens: "09:00", closes: "17:00" }]'
  })
  await failsOn('fl-098', 'The response is JSON', (d) => {
    one(d, 'set-payload').config.value = '{ "store": "Main Street", "opens": "09:00", "closes": "18:00" }'
  })
  await failsOn('fl-098', 'logged before the response', (d) => {
    move(d.flows[0].steps, 'logger', -1)
  })
  await passes('fl-098', (d) => {
    d.flows[0].steps[1] = step('transform', {
      script: '%dw 2.0\noutput application/json\n---\n{ store: "Main Street", opens: "09:00", closes: "18:00" }',
    })
  })

  // FL-099
  await failsOn('fl-099', 'order-sync', (d) => {
    one(d, 'set-variable').config.value = 'orders'
  })
  await failsOn('fl-099', 'status ALIVE', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\n{ service: vars.serviceName, status: "UP", time: now() }'
  })
  await failsOn('fl-099', 'what gets logged', (d) => {
    one(d, 'logger').config.message = 'Heartbeat'
  })
  await passes('fl-099', (d) => {
    d.flows[0].steps[1] = step('set-payload', { value: '#[output application/json --- { service: vars.serviceName, status: "ALIVE", time: now() }]' })
  })

  // FL-100
  await failsOn('fl-100', 'stored before the warehouse call', (d) => {
    move(d.flows[0].steps, 'set-variable', 1)
  })
  await failsOn('fl-100', 'POST /warehouse/reservations', (d) => {
    one(d, 'http-request').config.method = 'GET'
  })
  await failsOn('fl-100', 'adds the reservationId', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\n{ orderId: vars.orderId, status: "RESERVED" }'
  })
  await failsOn('fl-100', 'log line contains the order ID', (d) => {
    one(d, 'logger').config.message = 'Stock reserved'
  })
  await passes('fl-100', (d) => {
    move(d.flows[0].steps, 'logger', 1)
  })

  // FL-101
  await failsOn('fl-101', '2 kg test comes first', (d) => {
    one(d, 'choice').routes.reverse()
  })
  await failsOn('fl-101', 'selects the PARCEL service', (d) => {
    one(d, 'set-variable', (n) => n.config.value === 'PARCEL').config.value = 'BOX'
  })
  await failsOn('fl-101', 'built once, after the Choice', (d) => {
    const transform = remove(d.flows[0].steps, 'transform')
    one(d, 'choice').otherwise.push(transform)
  })
  await failsOn('fl-101', 'shipmentId and the service', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\n{ shipmentId: payload.shipmentId }'
  })
  // FREIGHT gets its own condition route and the default route is left empty, against the statement.
  await failsOn('fl-101', 'default route selects the FREIGHT', (d) => {
    const choice = one(d, 'choice')
    choice.routes.push({ ...choice.routes[1], id: 'freight-route', config: { expression: '#[payload.weightKg > 30]' }, steps: choice.otherwise })
    choice.otherwise = []
  })
  // A PARCEL range with its own lower bound may come first.
  await passes('fl-101', (d) => {
    const choice = one(d, 'choice')
    choice.routes.reverse()
    choice.routes[0].config.expression = '#[payload.weightKg > 2 and payload.weightKg <= 30]'
  })

  // FL-102
  await failsOn('fl-102', 'fullName from the first and last name', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\n{ employeeId: payload.employeeId, fullName: payload.name, department: payload.dept, startDate: payload.startDate }'
  })
  await failsOn('fl-102', 'renames dept', (d) => {
    one(d, 'transform').config.script =
      '%dw 2.0\noutput application/json\n---\n{ employeeId: payload.employeeId, fullName: payload.firstName ++ " " ++ payload.lastName, department: "FIN", startDate: payload.startDate }'
  })
  await failsOn('fl-102', 'full name is logged after', (d) => {
    d.flows[0].steps[2].config.message = '#["New hire reshaped: " ++ payload.firstName]'
  })
  await failsOn('fl-102', 'employee ID is logged when the request arrives', (d) => {
    d.flows[0].steps[0].config.message = 'New hire received'
  })
  await passes('fl-102', (d) => {
    one(d, 'transform').config.script =
      '%dw 2.0\noutput application/json\n---\n{ employeeId: payload.employeeId, fullName: "$(payload.firstName) $(payload.lastName)", department: payload.dept, startDate: payload.startDate }'
  })

  // FL-103
  await failsOn('fl-103', 'target variable manager', (d) => {
    one(d, 'flow-ref').config.target = ''
  })
  await failsOn('fl-103', 'lives in the sub-flow', (d) => {
    const call = remove(flowOf(d, 'get-manager').steps, 'http-request')
    d.flows[0].steps.splice(1, 0, call)
  })
  await failsOn('fl-103', 'approver', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\n{ employeeId: payload.employeeId, days: payload.days, manager: vars.manager.name }'
  })
  await passes('fl-103', (d) => {
    remove(flowOf(d, 'get-manager').steps, 'logger')
  })

  // FL-104
  await failsOn('fl-104', 'GET /exchange-rates/eur', (d) => {
    d.flows[0].source.config.path = '/rates'
  })
  await failsOn('fl-104', 'usdRate from the provider rate', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\n{ currency: payload.base, usdRate: payload.quote, asOf: payload.asOf }'
  })
  await failsOn('fl-104', 'logged before the provider is called', (d) => {
    move(d.flows[0].steps, 'logger', -1)
  })
  await passes('fl-104', (d) => {
    d.flows[0].steps.push(step('logger', { level: 'INFO', message: '#["EUR rate " ++ payload.usdRate]' }))
  })

  // FL-105
  await failsOn('fl-105', 'built once, after the For Each', (d) => {
    one(d, 'foreach').steps.push(remove(d.flows[0].steps, 'transform'))
  })
  await failsOn('fl-105', 'SKU of each line', (d) => {
    one(d, 'logger').config.message = 'Reserving stock'
  })
  await failsOn('fl-105', 'status RESERVED', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\n{ orderId: payload.orderId, status: "DONE", lineCount: sizeOf(payload.lines) }'
  })
  await failsOn('fl-105', 'POST /inventory/reservations', (d) => {
    one(d, 'http-request').config.path = '/inventory'
  })
  await passes('fl-105', (d) => {
    move(one(d, 'foreach').steps, 'logger', -1)
  })

  // FL-106
  await failsOn('fl-106', 'No catch-all', (d) => {
    handlerFor(d, 'HTTP:').config.type = 'ANY'
  })
  await failsOn('fl-106', 'logs a warning', (d) => {
    handlerFor(d, 'HTTP:').steps[0].config.level = 'INFO'
  })
  await failsOn('fl-106', 'source standard', (d) => {
    one(d, 'set-payload').config.value = '#[output application/json --- { days: 5 }]'
  })
  await failsOn('fl-106', 'carrier number', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\n{ days: 2, source: "carrier" }'
  })
  await passes('fl-106', (d) => {
    const h = handlerFor(d, 'HTTP:')
    h.config.type = 'HTTP:CONNECTIVITY'
    h.steps[1] = step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ days: 5, source: "standard" }' })
    d.flows[0].errorHandlers.push({ ...structuredClone(h), config: { type: 'HTTP:TIMEOUT' } })
  })

  // FL-108
  await failsOn('fl-108', 'at 06:00', (d) => {
    d.flows[0].source.config.expression = '0 0 18 * * ?'
  })
  await failsOn('fl-108', 'original file stays', (d) => {
    d.flows[0].steps.splice(2, 0, step('file-delete', { path: '/data/hr/in/employees.csv' }))
  })
  await failsOn('fl-108', 'replaces the old copy', (d) => {
    one(d, 'file-write').config.mode = 'CREATE_NEW'
  })
  await failsOn('fl-108', 'File Write writes /data/hr/backup/employees.csv', (d) => {
    one(d, 'file-write').config.path = '/data/hr/in/employees.csv'
  })
  await passes('fl-108', (d) => {
    d.flows[0].source.config.expression = '0 0 6 ? * *'
  })

  // FL-109
  await failsOn('fl-109', 'not joined text', (d) => {
    one(d, 'db-select').config.sql = "#['SELECT sku, product_name, unit_price FROM products WHERE category = :category OR category = \"' ++ vars.category ++ '\" ORDER BY product_name']"
  })
  await failsOn('fl-109', 'sorted by name', (d) => {
    one(d, 'db-select').config.sql = 'SELECT sku, product_name, unit_price\nFROM products\nWHERE category = :category'
  })
  await failsOn('fl-109', 'not the column names', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\npayload map {\n  sku: $.sku,\n  product_name: $.product_name,\n  unit_price: $.unit_price\n}'
  })
  await failsOn('fl-109', 'saved before the Select', (d) => {
    move(d.flows[0].steps, 'set-variable', 1)
  })
  // Renaming in the SQL with aliases is also fine.
  await passes('fl-109', (d) => {
    one(d, 'db-select').config.sql = 'SELECT sku, product_name AS name, unit_price AS price\nFROM products\nWHERE category = :category\nORDER BY product_name'
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\npayload map {\n  sku: $.sku,\n  name: $.name,\n  price: $.price\n}'
  })

  // FL-110
  await failsOn('fl-110', 'orderId and items is built', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\npayload'
  })
  await failsOn('fl-110', 'reply is set after the publish', (d) => {
    move(d.flows[0].steps, 'set-payload', 2)
  })
  await failsOn('fl-110', 'before the payload is replaced', (d) => {
    move(d.flows[0].steps, 'set-variable', 1)
  })
  await failsOn('fl-110', 'warehouse-orders queue', (d) => {
    one(d, 'mq-publish').config.destination = 'orders'
  })
  await passes('fl-110', (d) => {
    d.flows[0].steps[1] = step('set-payload', { value: '#[output application/json --- { orderId: payload.orderId, items: payload.items }]' })
  })

  // FL-111
  await failsOn('fl-111', 'insert stays outside the Try', (d) => {
    one(d, 'try').steps.unshift(remove(d.flows[0].steps, 'db-insert'))
  })
  await failsOn('fl-111', 'logs a warning', (d) => {
    one(d, 'logger').config.level = 'INFO'
  })
  await failsOn('fl-111', 'reply is set after the Try', (d) => {
    one(d, 'try').steps.push(remove(d.flows[0].steps, 'set-payload'))
  })
  await failsOn('fl-111', 'Try has its own On Error Continue', (d) => {
    const t = one(d, 'try')
    d.flows[0].errorHandlers = t.errorHandlers
    t.errorHandlers = []
  })
  await failsOn('fl-111', 'customerId and amount', (d) => {
    one(d, 'transform').config.script = '%dw 2.0\noutput application/json\n---\n{ customerId: vars.order.customerId }'
  })
  // The loyalty request may be built inside the Try, and the handler may name the HTTP errors.
  await passes('fl-111', (d) => {
    const t = one(d, 'try')
    t.steps.unshift(remove(d.flows[0].steps, 'transform'))
    t.errorHandlers[0].config.type = 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:INTERNAL_SERVER_ERROR, HTTP:SERVICE_UNAVAILABLE'
  })

  // FL-113
  await failsOn('fl-113', 'insert stays outside the Async', (d) => {
    one(d, 'async').steps.unshift(remove(d.flows[0].steps, 'db-insert'))
  })
  await failsOn('fl-113', 'reply is not built inside the Async', (d) => {
    one(d, 'async').steps.push(remove(d.flows[0].steps, 'set-payload'))
  })
  await failsOn('fl-113', 'email to the customer', (d) => {
    one(d, 'email-send').config.toAddresses = 'returns@example.com'
  })
  await failsOn('fl-113', 'whole request is saved', (d) => {
    one(d, 'set-variable').config.value = '#[payload.returnId]'
  })
  // The reply may be set before the Async scope, because the email reads the variable.
  await passes('fl-113', (d) => {
    move(d.flows[0].steps, 'set-payload', 2)
  })
}
