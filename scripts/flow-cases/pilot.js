// Wrong and other correct designs for the pilot problems. See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, handlerFor, flowOf, remove, step, scope, handler, subFlow, createNode }) => {
  // FL-107
  await failsOn('fl-107', 'never On Error Continue', (d) => {
    handlerFor(d, 'HTTP:CONNECTIVITY').type = 'on-error-continue'
  })
  await failsOn('fl-107', 'never On Error Continue', (d) => {
    handlerFor(d, 'HTTP:CONNECTIVITY').config.type = 'HTTP:CONNECTIVITY'
  })
  await failsOn('fl-107', 'logs the error', (d) => {
    remove(handlerFor(d, 'HTTP:').steps, 'logger')
  })
  await failsOn('fl-107', 'sets vars.httpStatus to 503', (d) => {
    const h = handlerFor(d, 'HTTP:')
    const status = remove(h.steps, 'set-variable')
    d.flows[0].errorHandlers.push(handler('on-error-propagate', { type: 'APP:OTHER' }, [status]))
  })
  await passes('fl-107', (d) => {
    handlerFor(d, 'HTTP:').config.type = 'ANY'
  })
  await passes('fl-107', (d) => {
    const h = handlerFor(d, 'HTTP:')
    h.config.type = 'HTTP:CONNECTIVITY'
    d.flows[0].errorHandlers.push({ ...structuredClone(h), config: { type: 'HTTP:TIMEOUT' } })
  })
  // The handler's work moved to a shared sub-flow behind a Flow Reference.
  await passes('fl-107', (d) => {
    const h = handlerFor(d, 'HTTP:')
    d.flows.push(subFlow('error-response', h.steps))
    h.steps = [step('flow-ref', { name: 'error-response' })]
  })

  // FL-112
  await failsOn('fl-112', 'Both checks run before', (d) => {
    const steps = d.flows[0].steps
    const insert = remove(steps, 'db-insert')
    steps.splice(1, 0, insert)
  })
  await failsOn('fl-112', 'uses the Validate message', (d) => {
    one(d, 'set-payload', (n) => n.config.value.includes('BAD_REQUEST')).config.value = '#[{ code: "BAD_REQUEST" }]'
  })
  await failsOn('fl-112', 'email format', (d) => {
    one(d, 'validation', (n) => n.config.check === 'is-email').config.expression = '#[payload.name]'
  })
  await passes('fl-112', (d) => {
    one(d, 'validation', (n) => n.config.check === 'is-not-null').config.check = 'is-not-blank-string'
  })

  // FL-047
  await failsOn('fl-047', 'mapped to 404', (d) => {
    handlerFor(d, 'NOT_FOUND').steps.find((n) => n.type === 'set-variable').config.value = '200'
  })
  await failsOn('fl-047', 'mapped to 503', (d) => {
    for (const f of d.flows) for (const h of f.errorHandlers) if (h.config.type.includes('DB:')) h.steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  await passes('fl-047', (d) => {
    for (const f of d.flows) for (const h of f.errorHandlers) for (const n of h.steps) if (n.type === 'set-variable') Object.assign(n.config, { variableName: 'statusCode', value: `#[${n.config.value}]` })
  })

  // FL-004
  await failsOn('fl-004', 'id removed from the store', (d) => {
    remove(handlerFor(d, 'ANY').steps, 'os-remove')
  })
  await failsOn('fl-004', 'no catch-all swallows', (d) => {
    handlerFor(d, 'ANY').type = 'on-error-continue'
  })
  await failsOn('fl-004', 'before any NetSuite update', (d) => {
    const steps = d.flows[0].steps
    const check = remove(steps, 'idempotent')
    steps.splice(steps.findIndex((n) => n.type === 'http-request') + 1, 0, check)
  })

  // FL-010
  await failsOn('fl-010', 'about a second apart', (d) => {
    one(d, 'until-successful').config.millisBetweenRetries = 60000
  })
  await failsOn('fl-010', 'so other failures still retry', (d) => {
    one(d, 'on-error-continue').config.type = 'ANY'
  })
  await failsOn('fl-010', 'behind a condition', (d) => {
    const steps = d.flows[0].steps
    steps.splice(steps.findIndex((n) => n.type === 'choice'), 1, step('raise-error', { type: 'APP:INVALID_SKU' }))
  })
  await failsOn('fl-010', 'mapped to a 5xx', (d) => {
    handlerFor(d, 'RETRY_EXHAUSTED').steps.find((n) => n.type === 'set-variable').config.value = '200'
  })
  await passes('fl-010', (d) => {
    one(d, 'until-successful').config.maxRetries = 2
    handlerFor(d, 'RETRY_EXHAUSTED').steps.find((n) => n.type === 'set-variable').config.value = '504'
  })
  // A flow-level catch-all outside the retry scope is a fair fallback.
  await passes('fl-010', (d) => {
    d.flows[0].errorHandlers.push(handler('on-error-continue', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '500' })]))
  })

  // FL-005
  await failsOn('fl-005', 'after the gather', (d) => {
    remove(d.flows[0].steps, 'transform')
  })
  await failsOn('fl-005', 'Both optional routes', (d) => {
    const gather = one(d, 'scatter-gather')
    const route = gather.routes.find((r) => r.steps[0].type === 'try')
    route.steps = route.steps[0].steps
  })
  await failsOn('fl-005', 'returns 502', (d) => {
    handlerFor(d, 'COMPOSITE_ROUTING').steps.find((n) => n.type === 'set-variable').config.value = '500'
  })

  // FL-065
  await failsOn('fl-065', 'Oracle is updated before', (d) => {
    const steps = d.flows[0].steps
    const publish = remove(steps, 'jms-publish')
    steps.splice(1, 0, publish)
  })
  await failsOn('fl-065', 'parked at once', (d) => {
    handlerFor(d, 'VALIDATION').config.type = 'ANY'
  })
  await failsOn('fl-065', 'not applied twice', (d) => {
    const list = d.flows[0].errorHandlers
    list.splice(list.findIndex((h) => h.config.type.includes('QUERY_EXECUTION')), 1)
  })
  // A parking publish before Oracle in the main flow does not break the event order.
  await passes('fl-065', (d) => {
    d.flows[0].steps.splice(1, 0, step('jms-publish', { destination: 'WMS.SHIP.AUDIT' }))
  })
  await passes('fl-065', (d) => {
    const list = d.flows[0].errorHandlers
    list.splice(list.findIndex((h) => h.config.type.includes('QUERY_EXECUTION')), 1)
    d.flows[0].steps.splice(1, 0, step('idempotent', { idExpression: '#[payload.shipmentId]', objectStore: 'shipments' }))
  })

  // FL-006
  await failsOn('fl-006', 'after both SAP and WMS', (d) => {
    const steps = flowOf(d, 'consumer').steps
    const ack = remove(steps, 'mq-ack')
    steps.splice(steps.length - 1, 0, ack)
  })
  await failsOn('fl-006', 'never calls SAP itself', (d) => {
    flowOf(d, 'front-door').steps.splice(1, 0, step('http-request', { method: 'POST', path: '/sap/orders' }))
  })
  await failsOn('fl-006', 'and ack it', (d) => {
    remove(handlerFor(d, 'BAD_REQUEST').steps, 'mq-ack')
  })
  await failsOn('fl-006', 'cannot create a duplicate', (d) => {
    const steps = flowOf(d, 'consumer').steps
    remove(steps, 'http-request')
    const choice = remove(steps, 'choice')
    steps.splice(2, 0, ...choice.routes[0].steps)
  })
  await passes('fl-006', (d) => {
    const steps = flowOf(d, 'consumer').steps
    remove(steps, 'http-request')
    const choice = remove(steps, 'choice')
    steps.splice(2, 0, step('idempotent', { idExpression: '#[vars.orderId]', objectStore: 'sapOrders' }), ...choice.routes[0].steps)
  })

  // FL-025
  await failsOn('fl-025', 'Only a duplicate-key error', (d) => {
    one(d, 'on-error-continue').config.when = ''
  })
  await failsOn('fl-025', 'All trade and leg inserts', (d) => {
    const steps = d.flows[0].steps
    const legs = remove(steps, 'db-bulk-insert')
    steps.push(legs)
  })
  await failsOn('fl-025', 'to TRADES.RISK', (d) => {
    one(d, 'jms-publish').config.destination = 'TRADES.OUT'
  })
  await passes('fl-025', (d) => {
    const h = one(d, 'on-error-continue')
    h.config.when = ''
    h.steps = [createNode('choice')]
    h.steps[0].routes.forEach((r, i) => (r.config.expression = `#[error.description contains "ORA-0000${i}"]`))
  })

  // FL-049
  await failsOn('fl-049', 'Only the System API speaks SOAP', (d) => {
    flowOf(d, 'prc-').steps.push(step('wsc-consume', { operation: 'GetPolicyDetails' }))
  })
  await failsOn('fl-049', 'turned into real Mule errors', (d) => {
    const steps = flowOf(d, 'sys-').steps
    steps[steps.length - 1] = step('raise-error', { type: 'APP:BACKEND' })
    steps.push(step('transform'))
  })
  await failsOn('fl-049', 'mapped to 502/503', (d) => {
    for (const f of d.flows) for (const h of f.errorHandlers) if (h.config.type.includes('WSC:')) h.steps.find((n) => n.type === 'set-variable').config.value = '500'
  })
  await failsOn('fl-049', 'session token is reused', (d) => {
    const f = flowOf(d, 'sys-')
    f.steps = f.steps.filter((n) => n.type !== 'os-retrieve')
  })
  await passes('fl-049', (d) => {
    const steps = flowOf(d, 'sys-').steps
    steps[steps.length - 1] = {
      ...steps[steps.length - 1],
      routes: steps[steps.length - 1].routes.map((r) => ({ ...r, config: { expression: '#[payload.body.GetPolicyDetailsResponse.resultCode != "0000"]' } })),
    }
  })
  await passes('fl-049', (d) => {
    const f = flowOf(d, 'sys-')
    const steps = f.steps
    const call = steps.findIndex((n) => n.type === 'wsc-consume')
    steps.splice(call, 1, scope('cache', {}, [steps[call]]))
    f.steps = steps.filter((n) => n.type !== 'os-retrieve')
    for (const c of all(d, 'os-store')) Object.assign(c, { type: 'logger', config: { level: 'INFO', message: 'session cached' } })
  })
}
