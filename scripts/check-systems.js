// Checks the "Systems you can call" list each flow scenario shows (src/flow/systems.js).
import { readdirSync } from 'node:fs'
import { landscapeOf } from '../src/arch/landscape.js'
import { missingSystems, systemsIn, systemUsesIn, useText } from '../src/flow/systems.js'

const failures = []
const fail = (msg) => failures.push(msg)
const dir = new URL('../src/content/flows/', import.meta.url)
const KEYWORDS = /^(select|set|values|dual|and|or|skip|nowait|of|only|lateral|where|from|into|update|join|call)$/i

let listed = 0
for (const file of readdirSync(dir).filter((f) => /^fl-\d+\.js$/.test(f)).sort()) {
  const problem = (await import(new URL(file, dir))).default
  const systems = systemsIn(problem.referenceFlow)
  if (systems.length) listed++
  for (const s of systems) {
    if (!s.kind || !s.name) fail(`${problem.id}: empty system ${JSON.stringify(s)}`)
    if (KEYWORDS.test(s.name)) fail(`${problem.id}: SQL keyword taken for a name: ${s.kind} ${s.name}`)
    if (/#\[|\$\{/.test(s.name)) fail(`${problem.id}: run-time expression shown as a name: ${s.name}`)
  }
  const keys = systems.map((s) => `${s.kind} ${s.name}`)
  if (new Set(keys).size !== keys.length) fail(`${problem.id}: a system is listed twice`)
}

// Diagram problems: a check that asks for a box by its label (such as a System API named "orders") must use a word
// the learner can read, in the scenario, the task or the "Users and systems in this landscape" list.
const labelMatchers = (rule, found = []) => {
  if (!rule || typeof rule !== 'object') return found
  if (!Array.isArray(rule) && (typeof rule.label === 'string' || Array.isArray(rule.label))) found.push(rule)
  for (const v of Object.values(rule)) if (v && typeof v === 'object') labelMatchers(v, found)
  return found
}
let labelRules = 0
let diagrams = 0
for (const category of ['architecture', 'use-cases', 'case-studies']) {
  const folder = new URL(`../src/content/${category}/`, import.meta.url)
  for (const file of readdirSync(folder).filter((f) => f.endsWith('.js'))) {
    const problem = (await import(new URL(file, folder))).default
    if (!problem?.diagram) continue
    diagrams++
    const readable = [problem.description, problem.diagram.task ?? '', ...landscapeOf(problem.diagram.reference).flatMap((g) => g.items.map((i) => i.label))]
      .join('\n')
      .toLowerCase()
    for (const check of problem.diagram.checks)
      for (const m of labelMatchers(check.rule)) {
        labelRules++
        const words = (Array.isArray(m.label) ? m.label : [m.label]).map((w) => String(w).toLowerCase())
        if (!words.some((w) => readable.includes(w))) fail(`${problem.id}: check "${check.label}" needs a box labelled ${words.join(' or ')}, which the scenario never says`)
      }
  }
}

// known cases
const sql = (s) => ({ flows: [{ steps: [{ type: 'db-select', config: { sql: s } }] }] })
const names = (d) => systemsIn(d).map((s) => s.name).join(',')
if (names(sql('SELECT a FROM t1 JOIN t2 ON x WHERE d >= :from AND d < :to')) !== 't1,t2') fail('named parameter :from read as FROM')
if (names(sql("UPDATE RECALL SET s = 'x'")) !== 'RECALL') fail('table RECALL read as a procedure call')
if (names(sql('{call PKG.RUN(:a)}')) !== 'PKG.RUN') fail('stored procedure not found')
if (names(sql('SELECT * FROM q FOR UPDATE SKIP LOCKED')) !== 'q') fail('SKIP after FOR UPDATE read as a table')
const http = { flows: [{ steps: [{ type: 'http-request', config: { method: 'POST', path: '/fedex/shipments' } }, { type: 'http-request', config: { method: 'GET', path: '#[vars.url]' } }] }] }
if (names(http) !== 'POST /fedex/shipments') fail('HTTP endpoints wrong, or a run-time path shown')

// the shared check: a design must use every listed system, and may reach a path in its own way
const given = systemsIn({
  flows: [
    { source: { type: 'http-listener', config: { path: '/api/orders', allowedMethods: 'GET' } }, steps: [{ type: 'http-request', config: { method: 'GET', path: '/crm/accounts/{id}?limit=10' } }, { type: 'db-select', config: { sql: 'SELECT * FROM orders' } }] },
  ],
})
const call = (path) => ({ type: 'http-request', config: { method: 'GET', path } })
const mine = (steps, source = { type: 'http-listener', config: { path: '/api/orders' } }) => ({ flows: [{ source, steps }] })
const select = { type: 'db-select', config: { sql: 'select id from ORDERS where x = 1' } }
const gaps = (d) => missingSystems(given, d).map((s) => s.name).join(',')
if (gaps(mine([call('/crm/accounts/{accountId}'), select])) !== '') fail('a renamed URI parameter does not reach the listed path')
if (gaps(mine([call('#["/crm/accounts/" ++ vars.id]'), select])) !== '') fail('a run-time path does not reach the listed path')
if (gaps(mine([call('/crm/accounts/{id}')])) !== 'orders') fail('a missing table goes unnoticed')
if (gaps(mine([call('/crm/contacts/{id}'), select])) !== 'GET /crm/accounts/{id}?limit=10') fail('a different path counts as the listed one')
if (gaps(mine([call('/crm/accounts/{id}'), select], null)) !== 'GET /api/orders') fail('a missing endpoint goes unnoticed')

// what the design does to each system, where, and from which start
const sub = (destination) => ({ type: 'mq-subscriber', config: { destination } })
const upd = (s) => ({ type: 'db-update', config: { sql: s } })
const handler = (steps) => ({ type: 'on-error-continue', config: {}, steps })
const reference = {
  flows: [
    { name: 'email-worker', source: sub('email-q'), steps: [upd("UPDATE notice SET status = 'SENT'")], errorHandlers: [handler([upd("UPDATE notice SET status = 'FAILED'")])] },
    { name: 'sms-worker', source: sub('sms-q'), steps: [{ type: 'flow-ref', config: { name: 'mark-sent' } }] },
    { name: 'mark-sent', steps: [upd("UPDATE notice SET status = 'SENT'")] },
    { name: 'get:\\orders:api-config', steps: [{ type: 'db-select', config: { sql: 'SELECT * FROM orders' } }] },
  ],
}
const wanted = systemUsesIn(reference)
const left = (d) => missingSystems(wanted, d).map(useText).join(' | ')
const without = (change) => {
  const d = structuredClone(reference)
  change(d)
  return left(d)
}
if (left(reference) !== '') fail(`the reference misses its own uses: ${left(reference)}`)
if (!/update notice .* in an error handler/.test(without((d) => (d.flows[0].errorHandlers = [])))) fail('a missing update in an error handler goes unnoticed')
if (!/receives from sms-q/.test(without((d) => (d.flows[1].steps = [])))) fail('a step one of two workers leaves out goes unnoticed')
if (without((d) => (d.flows[1].steps = [upd("UPDATE notice SET status = 'SENT'")]))) fail('making the call in the flow itself, not a sub-flow, does not count')
if (!/read orders/.test(without((d) => (d.flows[3].steps = [])))) fail('an APIkit flow missing its query goes unnoticed')
if (!/update notice/.test(without((d) => (d.flows[0].steps = [{ type: 'db-select', config: { sql: 'SELECT * FROM notice' } }])))) fail('a read counts as the update it replaces')
// a queue name written as a DataWeave string, or built at run time, is still that queue
const vm = (queueName) => ({ flows: [{ steps: [{ type: 'vm-publish', config: { queueName } }] }] })
const wantQ = systemUsesIn(vm('auditQueue'))
if (missingSystems(wantQ, vm("#['auditQueue']")).length) fail('#[\'auditQueue\'] does not count as auditQueue')
if (missingSystems(wantQ, vm('#[ "auditQueue" ]')).length) fail('#[ "auditQueue" ] does not count as auditQueue')
if (missingSystems(wantQ, vm('#["audit" ++ "Queue"]')).length) fail('a queue name built from its pieces does not count')
if (!missingSystems(wantQ, vm("#['auditQ']")).length) fail('#[\'auditQ\'] counts as auditQueue')
if (!missingSystems(wantQ, vm('otherQueue')).length) fail('another queue counts as auditQueue')
if (!/TRUNCATE|delete from stage/.test(useText(systemUsesIn({ flows: [{ steps: [upd('TRUNCATE TABLE stage')] }] })[0]))) fail('TRUNCATE is not read as a delete')

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`All systems lists check out (${listed} flow problems list systems; ${labelRules} label checks in ${diagrams} diagrams use names the scenario gives).`)
