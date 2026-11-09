// Stricter flow checks: each pilot problem must fail designs that look right but are wrong, and must still pass
// other correct designs. A model answer passing proves little on its own, so this tests both directions.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { designChecks, missingHint, runChecks } from '../src/flow/checks.js'
import { compareDesigns } from '../src/flow/compare.js'
import { design, flow, handler, route, router, scope, step, subFlow } from '../src/flow/dsl.js'
import { createNode, emptyDesign, insertNode, walk } from '../src/flow/model.js'

const load = async (id) => (await import(pathToFileURL(join(resolve('src/content/flows'), `${id}.js`)).href)).default

// Finders over a copied model answer.
const all = (d, type) => {
  const out = []
  walk(d, (item, ctx) => {
    if (!ctx.isFlow && !ctx.isRoute && item.type === type) out.push(item)
  })
  return out
}
const one = (d, type, test = () => true) => all(d, type).find(test)
const handlerFor = (d, text) => [...all(d, 'on-error-propagate'), ...all(d, 'on-error-continue')].find((h) => h.config.type.includes(text))
const flowOf = (d, name) => d.flows.find((f) => f.name.includes(name))
const remove = (list, type) => list.splice(list.findIndex((n) => n.type === type), 1)[0]

let wrong = 0
let right = 0

async function results(id, change) {
  const p = await load(id)
  const design = structuredClone(p.referenceFlow)
  change(design)
  const checks = designChecks(p)
  return { design, checks, out: runChecks(design, checks) }
}

// This wrong design must fail the check whose label holds `label`, and only because of that change.
async function failsOn(id, label, change) {
  const { design, checks, out } = await results(id, change)
  const failed = out.filter((r) => !r.pass).map((r) => r.label)
  assert.ok(failed.some((l) => l.includes(label)), `${id}: expected "${label}" to fail, failed: ${failed.join(' | ') || 'nothing'}`)
  out.forEach((r, i) => {
    if (r.pass) return
    const hint = missingHint(design, checks[i].rule)
    assert.ok(hint.length > 8 && !/undefined|\[object/.test(hint), `${id}: bad hint: ${hint}`)
  })
  wrong++
}

// This different but correct design must pass everything.
async function passes(id, change) {
  const { out } = await results(id, change)
  assert.deepEqual(out.filter((r) => !r.pass).map((r) => r.label), [], id)
  right++
}

// Each file in scripts/flow-cases saves wrong and other correct designs for some problems.
// Usage: node scripts/check-strict.js [pilot a b ...] runs only those files.
const caseDir = resolve('scripts/flow-cases')
const only = process.argv.slice(2)
const tools = { failsOn, passes, one, all, handlerFor, flowOf, remove, step, scope, handler, subFlow, createNode }
for (const file of readdirSync(caseDir).filter((x) => x.endsWith('.js')).sort()) {
  if (only.length && !only.includes(file.replace(/\.js$/, ''))) continue
  await (await import(pathToFileURL(join(caseDir, file)).href)).default(tools)
}

// Shared completeness check, on a small design
const small = (change) => {
  const base = emptyDesign()
  const listener = createNode('http-listener')
  let d = insertNode(base, `${base.flows[0].id}:source`, 0, listener)
  const node = change()
  d = insertNode(d, `${d.flows[0].id}:steps`, 0, node)
  const rule = { type: 'complete' }
  return { pass: runChecks(d, [{ label: 'x', rule }])[0].pass, hint: missingHint(d, rule) }
}
const made = (type, config) => ({ ...createNode(type), config: { ...createNode(type).config, ...config } })
assert.match(small(() => made('logger', { message: '' })).hint, /Logger needs/)
assert.match(small(() => createNode('set-variable')).hint, /myVar/)
assert.match(small(() => createNode('choice')).hint, /Choice route/)
assert.match(small(() => made('flow-ref', { name: 'gone' })).hint, /“gone”/)
assert.equal(small(() => createNode('flow-ref')).pass, false)
assert.equal(small(() => made('logger', { message: 'done' })).pass, true)
assert.equal(small(() => made('on-error-propagate', { type: '' })).pass, true, 'a handler with no type is valid')

// Engine rules the batches needed
const check = (d, rule) => runChecks(d, [{ label: 'x', rule }])[0].pass
const hintOf = (d, rule) => missingHint(d, rule)
const listener = step('http-listener', { path: '/x' })
// ANY is a whole word, and a handler with no type also catches everything
const handlers = (...types) => design(flow('f', listener, [step('logger', { message: 'm' })], types.map((t) => handler('on-error-continue', { type: t }))))
const catchAll = { type: 'handler', component: 'on-error-continue', where: { type: 'ANY' } }
assert.equal(check(handlers('HTTP:TOO_MANY_REQUESTS'), catchAll), false)
assert.equal(check(handlers('ANYPOINT-MQ:CONNECTIVITY'), catchAll), false)
assert.ok(check(handlers(''), catchAll))
assert.ok(check(handlers('HTTP:TIMEOUT, ANY'), catchAll))
assert.equal(check(handlers('HTTP:TOO_MANY_REQUESTS'), { type: 'exists', component: 'on-error-continue', where: { type: { not: 'ANY' } } }), true)
// is and all
const queue = (name) => design(flow('f', listener, [step('jms-publish', { destination: name })]))
assert.ok(check(queue('order-events'), { type: 'exists', component: 'jms-publish', where: { destination: { is: 'ORDER-EVENTS' } } }))
assert.equal(check(queue('order-events.replay'), { type: 'exists', component: 'jms-publish', where: { destination: { is: 'order-events' } } }), false)
assert.ok(check(queue('order-events.replay'), { type: 'exists', component: 'jms-publish', where: { destination: { all: ['order-events', 'replay'] } } }))
assert.match(hintOf(queue('x'), { type: 'exists', component: 'jms-publish', where: { destination: { is: 'q1' } } }), /set to “q1”/)
// The otherwise branch reads after the routes
const branches = design(flow('f', listener, [router('choice', {}, [route({ expression: '#[a]' }, [step('logger', { message: 'route' })])], { otherwise: [step('set-payload', { value: 'other' })] })]))
assert.ok(check(branches, { type: 'before', first: 'logger', then: 'set-payload' }))
assert.equal(check(branches, { type: 'before', first: 'set-payload', then: 'logger' }), false)
assert.ok(check(branches, { type: 'inside', component: 'set-payload', within: 'choice', inSlot: 'otherwise' }))
assert.equal(check(branches, { type: 'inside', component: 'logger', within: 'choice', inSlot: 'otherwise' }), false)
assert.match(hintOf(branches, { type: 'inside', component: 'logger', within: 'choice', inSlot: 'otherwise' }), /otherwise branch/)
// A route's own condition, and a hint for a route field other than the condition
assert.ok(check(branches, { type: 'routes', component: 'choice', routeWhere: { expression: 'a' } }))
assert.equal(check(branches, { type: 'routes', component: 'choice', routeWhere: { expression: 'b' } }), false)
const batch = design(flow('f', listener, [router('batch-job', {}, [route({ name: 'load', acceptPolicy: 'NO_FAILURES' }, [step('logger', { message: 'row' })])], { onComplete: [step('email-send', { to: 'ops@x.com' })] })]))
const failuresHint = hintOf(batch, { type: 'inside', component: 'logger', within: 'batch-job', routeWhere: { acceptPolicy: 'ONLY_FAILURES' } })
assert.ok(!/undefined/.test(failuresHint) && /Accept policy/.test(failuresHint), failuresHint)
assert.ok(check(batch, { type: 'inside', component: 'email-send', within: 'batch-job', inSlot: 'onComplete' }))
assert.equal(check(batch, { type: 'inside', component: 'logger', within: 'batch-job', inSlot: 'onComplete' }), false)
assert.equal(check(batch, { type: 'absent', component: 'email-send', within: 'batch-job', inSlot: 'onComplete' }), false)
// A sub-flow called from two places sits in both, and one call site must hold the whole rule
const twice = design(
  flow('f', listener, [router('choice', {}, [route({ expression: '#[open]' }, [step('flow-ref', { name: 'fallback' })])], { otherwise: [scope('try', {}, [step('http-request', { path: '/x' })])] })], [
    handler('on-error-continue', { type: 'HTTP:TIMEOUT' }, [step('flow-ref', { name: 'fallback' })]),
  ]),
  subFlow('fallback', [step('set-payload', { value: 'cached' })]),
)
assert.ok(check(twice, { type: 'inside', component: 'set-payload', within: 'choice', routeWhere: { expression: 'open' } }))
assert.ok(check(twice, { type: 'inside', component: 'set-payload', within: 'on-error-continue' }))
assert.equal(check(twice, { type: 'inside', component: 'set-payload', within: 'on-error-continue', routeWhere: { expression: 'open' } }), false)

// samePath: an ack on another route does not stop "every ack after the call"
const paths = design(
  flow('f', step('jms-listener', { destination: 'q' }), [
    router('choice', {}, [route({ expression: '#[stale]' }, [step('jms-ack')])], { otherwise: [step('http-request', { path: '/p' }), step('jms-ack')] }),
  ]),
)
const ackAfter = { type: 'before', first: 'http-request', then: 'jms-ack', every: true }
assert.equal(check(paths, ackAfter), false)
assert.ok(check(paths, { ...ackAfter, samePath: true }))
const ackFirst = design(flow('f', step('jms-listener', { destination: 'q' }), [router('choice', {}, [route({ expression: '#[stale]' }, [step('jms-ack')])], { otherwise: [step('jms-ack'), step('http-request', { path: '/p' })] })]))
assert.equal(check(ackFirst, { ...ackAfter, samePath: true }), false)
assert.match(hintOf(ackFirst, { ...ackAfter, samePath: true }), /each path/)
// linked: a publish and the listener that reads it, a raised error and the handler that maps it
const relay = (to) => design(flow('a', listener, [step('jms-publish', { destination: '#["orders.v1"]' })]), flow('b', step('jms-listener', { destination: to }), [step('logger', { message: 'm' })]))
const sameQueue = { type: 'linked', from: { component: 'jms-publish', key: 'destination' }, to: { component: 'jms-listener', key: 'destination' } }
assert.ok(check(relay('orders.v1'), sameQueue))
assert.equal(check(relay('orders.v2'), sameQueue), false)
assert.ok(!/undefined/.test(hintOf(relay('orders.v2'), sameQueue)), hintOf(relay('orders.v2'), sameQueue))
const raised = (handlerType) =>
  design(flow('f', listener, [step('raise-error', { type: 'APP:NOT_FOUND' })], [handler('on-error-propagate', { type: handlerType }, [step('set-variable', { variableName: 'httpStatus', value: '404' })])]))
const mapped = { type: 'linked', as: 'errorType', from: { component: 'raise-error', key: 'type' }, to: { component: 'on-error-propagate', key: 'type', holding: { component: 'set-variable', where: { value: '404' } } } }
assert.ok(check(raised('APP:NOT_FOUND'), mapped))
assert.ok(check(raised('APIKIT:NOT_FOUND, APP:NOT_FOUND'), mapped))
assert.equal(check(raised('APIKIT:NOT_FOUND'), mapped), false)
assert.equal(check(raised('ANY'), mapped), false)

// Compare view
const model = (await load('fl-010')).referenceFlow
const same = compareDesigns(model, model)
assert.deepEqual([same.missing, same.extra, same.settings], [[], [], []])
const changed = structuredClone(model)
one(changed, 'until-successful').config.maxRetries = 9
remove(changed.flows[0].steps, 'choice')
const diff = compareDesigns(changed, model)
assert.ok(diff.missing.some((m) => m.label === 'Choice'))
assert.ok(diff.settings.some((s) => s.field === 'Max retries' && s.yours === '9'))
assert.equal(compareDesigns(emptyDesign(), model).settings.length, 0)

console.log(`All strict checks pass (${wrong} wrong designs fail, ${right} other correct designs pass).`)
