// Checks the Anypoint console of the Platform Lab: its clock, schedules, gateway and alerts, and that every guided lab
// starts unsolved, gives no step away, and is solved by its own solution.
import assert from 'node:assert/strict'
import {
  addMonAlert, advance, at, callApi, cronError, cronMatches, deployApp, finishDeploys, mockCall, newApp, newPlatform, nextJob, nextRun, publish, createProject, saveProject, queryLogs, setBackend, stamp,
} from '../src/lab/platform.js'
import { GROUPS, labDone, openConsole, PLATFORM_LABS, stepDone } from '../src/lab/platform-labs.js'

// clock and cron
assert.equal(stamp(at(1, 9)), '2026-11-03 09:00:00')
assert.ok(cronMatches('0 0 2 * * ?', 'UTC', at(1, 2)))
assert.ok(!cronMatches('0 0 2 * * ?', 'UTC', at(1, 3)))
assert.ok(cronMatches('0 0 6 * * ?', 'Asia/Kolkata', at(1, 0, 30)))
assert.ok(cronMatches('0 0/15 * * * ?', 'UTC', at(1, 2, 45)))
assert.ok(cronMatches('0 0 2 ? * MON-FRI', 'UTC', at(0, 2)) && !cronMatches('0 0 2 ? * MON-FRI', 'UTC', at(5, 2)))
assert.ok(cronError('0 0 2 * *') && cronError('0 0 x * * ?') && !cronError('0 0 2 * * ?'))
assert.equal(nextRun({ type: 'cron', enabled: true, value: '0 0 2 * * ?', tz: 'UTC' }, at(1, 9)), at(2, 2))
assert.equal(nextRun({ type: 'cron', enabled: false, value: '0 0 2 * * ?', tz: 'UTC' }, at(1, 9)), null)
// 30 February never comes: the search ends
assert.equal(nextRun({ type: 'cron', enabled: true, value: '0 0 2 30 2 ?', tz: 'UTC' }, at(1, 9)), null)

// actions never change the state they were given
const before = openConsole()
const copy = structuredClone(before)
const later = advance(before, 60 * 60000)
assert.deepEqual(before, copy)
assert.ok(later.clock === before.clock + 60 * 60000 && nextJob(later) > later.clock)
assert.ok(JSON.stringify(advance(before, 5 * 24 * 3600000)).length < 400000, 'a week of the open console stays small')
assert.ok(queryLogs(before, 'log-level: ERROR AND appId: customer-export').every((l) => l.level === 'ERROR' && l.app === 'customer-export'))
assert.ok(queryLogs(before, 'log-level: ERROR').length > 0)

// a steady week: a failing nightly job gives one mail per failed night, not one per minute
{
  let s = newPlatform({ clock: at(0, 12), apps: [newApp('customer-export', { props: { 'blob.account': 'a', 'blob.container': 'wrong' } })] })
  const alert = { title: 'x', resource: 'Application', name_: 'customer-export', metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, recipients: 'a@b.example' }
  const one = advance(addMonAlert(s, { ...alert, minutes: 1 }), 3 * 24 * 3600000)
  assert.equal(one.mail.length, 3)
  assert.equal(one.monAlerts[0].state, 'OK')
  assert.equal(advance(addMonAlert(s, { ...alert, minutes: 5 }), 3 * 24 * 3600000).mail.length, 0)
}

// gateway: no autodiscovery means no policies; a wrong ID or wrong credentials block the API
{
  const s = openConsole()
  const get = (state, extra = {}) => callApi(state, { env: 'Sandbox', app: 'mobile-orders-eapi', method: 'GET', path: '/my-orders/O-1001', ...extra }).response.status
  assert.equal(get(s), 401)
  assert.equal(get(s, { clientId: 'mob-71c2', clientSecret: 'mob-secret-19' }), 200)
  assert.equal(get(s, { clientId: 'mob-71c2', clientSecret: 'mob-secret-19', path: '/nothing' }), 404)
  const open = structuredClone(s)
  delete open.apps[0].autodiscovery
  assert.equal(get(open), 200)
  const wrong = structuredClone(s)
  wrong.apps[0].props['api.id'] = '1'
  assert.equal(get(wrong), 503)
}

// API-led: one correlation ID in five applications, a failure and a delay that go up, a private application
{
  const mobile = (state, extra = {}) => callApi(state, { env: 'Sandbox', app: 'mobile-orders-eapi', method: 'GET', path: '/my-orders/O-1001', client: 'Mobile App', clientId: 'mob-71c2', clientSecret: 'mob-secret-19', ...extra })
  const s = openConsole()
  const ok = mobile(s, { cid: 'check-1' })
  assert.deepEqual(JSON.parse(ok.response.body), { id: 'O-1001', status: 'PACKED', inStock: true })
  assert.equal(new Set(queryLogs(ok.state, 'check-1').map((l) => l.app)).size, 5)
  assert.equal(mobile(s, { path: '/my-orders/O-9001' }).response.status, 404)
  const order = mobile(s, { method: 'POST', path: '/my-orders' })
  assert.equal(order.response.status, 201)
  assert.equal(order.state.queues[0].messages.length, s.queues[0].messages.length + 1)
  assert.equal(advance(order.state, 60000).queues[0].messages.length, 0)
  assert.equal(mobile(setBackend(s, 'oracle', { up: false })).response.status, 502)
  assert.equal(mobile(setBackend(s, 'sftp', { ms: 8000 })).response.status, 504)
  const without = (name, patch) => {
    const n = structuredClone(s)
    Object.assign(n.apps.find((a) => a.name === name), patch)
    return mobile(n).response.status
  }
  assert.equal(without('customers-sapi', { status: 'Stopped' }), 503)
  assert.equal(without('order-fulfilment-papi', { status: 'Stopped' }), 503)
  const revoked = structuredClone(s)
  revoked.apis.find((a) => a.id === '19500302').contracts[0].status = 'revoked'
  assert.equal(mobile(revoked).response.status, 502)
  assert.equal(callApi(s, { env: 'Sandbox', app: 'customers-sapi', method: 'GET', path: '/customers/C-7' }).response.status, 0)
  assert.ok(Object.keys(s.links).includes('Sandbox|order-fulfilment-papi>customers-sapi'))
}

// deployments
{
  const s = newPlatform()
  assert.ok(deployApp(s, { name: 'x', pkg: 'shipments-eapi', replicas: 1, vCores: 0.1 }).errors.length)
  assert.ok(deployApp(s, { name: 'good-name', pkg: '', replicas: 1, vCores: 0.1 }).errors.length)
  const done = finishDeploys(deployApp(s, { name: 'good-name', pkg: 'shipments-eapi', replicas: 1, vCores: 0.1, props: {}, secrets: {} }).state)
  assert.equal(done.apps[0].status, 'Failed')
}

// publishing
{
  let s = saveProject(createProject(newPlatform(), 'A API'), 'p1', '#%RAML 1.0\ntitle: A\n/a:\n  get:\n')
  const form = { assetId: 'a-api', name: 'A API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }
  const first = publish(s, 'p1', form)
  assert.deepEqual(first.errors, [])
  assert.equal(publish(first.state, 'p1', form).errors.length, 1)
  assert.equal(publish(s, 'p1', { ...form, version: '1' }).errors.length, 1)
  assert.equal(publish(saveProject(s, 'p1', '#%RAML 1.0\ntitle: A\nwrong: 1\n'), 'p1', form).errors.length, 1)
  assert.equal(mockCall('#%RAML 1.0\ntitle: A\n/a:\n  get:\n', 'POST', '/a').status, 405)
  assert.equal(mockCall('#%RAML 1.0\ntitle: A\n/a:\n  get:\n', 'GET', '/b').status, 404)
}

// labs
const ids = new Set()
for (const lab of PLATFORM_LABS) {
  assert.ok(!ids.has(lab.id) && GROUPS.includes(lab.group), lab.id)
  ids.add(lab.id)
  const start = JSON.parse(JSON.stringify(lab.start())) // as it is after being saved
  const answers = lab.answers ?? {}
  const given = lab.steps.filter((step, i) => !step.ask && stepDone(step, i, start, {})).map((x) => x.title)
  // a lab may start with something worth keeping already true, but the first and the last step are the learner's
  assert.ok(!stepDone(lab.steps[0], 0, start, {}), `${lab.id}: the first step is done at the start`)
  assert.ok(!stepDone(lab.steps.at(-1), lab.steps.length - 1, start, {}), `${lab.id}: the last step is done at the start`)
  if (given.length) console.log(`  ${lab.id}: met from the start: ${given.join(', ')}`)
  const end = lab.solve(start)
  lab.steps.forEach((step, i) => assert.ok(stepDone(step, i, end, answers), `${lab.id}: step ${i + 1} "${step.title}" is not met by the solution`))
  assert.ok(labDone(lab, end, answers) && !labDone(lab, end, {}) === lab.steps.some((x) => x.ask))
  for (const step of lab.steps) {
    const text = [step.title, step.how, step.ask, step.reason, ...(step.options ?? []), lab.scenario, lab.why].filter(Boolean).join(' ')
    assert.ok(!/[—–]| - /.test(text) && !/\b(simply|just|easy|easily|easier|simpler)\b/i.test(text), `${lab.id}: style in "${step.title}"`)
  }
  const size = JSON.stringify(end).length
  assert.ok(size < 400000, `${lab.id} is ${size} characters when saved`)
}

console.log(`Platform console: ${PLATFORM_LABS.length} labs, ${PLATFORM_LABS.reduce((n, l) => n + l.steps.length, 0)} steps. All checks passed.`)
