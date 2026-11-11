// Checks the "Systems you can call" list each flow scenario shows (src/flow/systems.js).
import { readdirSync } from 'node:fs'
import { landscapeOf } from '../src/arch/landscape.js'
import { systemsIn } from '../src/flow/systems.js'

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

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`All systems lists check out (${listed} flow problems list systems; ${labelRules} label checks in ${diagrams} diagrams use names the scenario gives).`)
