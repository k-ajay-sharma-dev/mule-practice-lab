// Stricter diagram checks: each pilot problem must fail diagrams that look right but are wrong, and must still pass
// other correct diagrams. A model answer passing proves little on its own, so this tests both directions.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { diagramHint, runDiagramChecks } from '../src/arch/checks.js'

const load = async (id) => (await import(pathToFileURL(join(resolve('src/content/architecture'), `${id}.js`)).href)).default

// Changes to a copied model answer. A line is written 'a -> b', as in the content files, and is found in either kind.
const parse = (spec) => {
  const m = /^(\S+) (->|~>) (\S+)$/.exec(spec)
  return { from: m[1], to: m[3], kind: m[2] === '~>' ? 'async' : 'sync' }
}
const line = (d, spec) => {
  const { from, to } = parse(spec)
  const e = d.edges.find((x) => x.from === from && x.to === to)
  assert.ok(e, `no line ${spec}`)
  return e
}
const cut = (d, ...specs) => {
  for (const spec of specs) d.edges.splice(d.edges.indexOf(line(d, spec)), 1)
}
const flip = (d, spec) => {
  const e = line(d, spec)
  ;[e.from, e.to] = [e.to, e.from]
}
const swap = (d, spec) => {
  const e = line(d, spec)
  e.kind = e.kind === 'sync' ? 'async' : 'sync'
}
const draw = (d, ...specs) => {
  for (const spec of specs) d.edges.push({ id: `x${d.edges.length}`, ...parse(spec) })
}
const box = (d, id, type, label) => d.nodes.push({ id, type, label })
const unbox = (d, id) => {
  d.nodes = d.nodes.filter((n) => n.id !== id)
  d.edges = d.edges.filter((e) => e.from !== id && e.to !== id)
}
const rename = (d, id, label) => {
  d.nodes.find((n) => n.id === id).label = label
}

let wrong = 0
let right = 0

async function results(id, change) {
  const { checks, reference } = (await load(id)).diagram
  const design = structuredClone(reference)
  change(design)
  return { design, checks, out: runDiagramChecks(design, checks) }
}

// This wrong diagram must fail the check whose label holds `label`, and every failed check must give a usable hint.
async function failsOn(id, label, change) {
  const { design, checks, out } = await results(id, change)
  const failed = out.filter((r) => !r.pass).map((r) => r.label)
  assert.ok(failed.some((l) => l.includes(label)), `${id}: expected "${label}" to fail, failed: ${failed.join(' | ') || 'nothing'}`)
  out.forEach((r, i) => {
    if (r.pass) return
    const hint = diagramHint(design, checks[i].rule)
    assert.ok(hint.length > 8 && !/undefined|\[object/.test(hint), `${id}: bad hint: ${hint}`)
  })
  wrong++
}

// This different but correct diagram must pass everything.
async function passes(id, change) {
  const { out } = await results(id, change)
  assert.deepEqual(out.filter((r) => !r.pass).map((r) => r.label), [], id)
  right++
}

// Each file in scripts/arch-cases saves wrong and other correct diagrams for some problems.
// Usage: node scripts/check-arch-strict.js [pilot a b ...] runs only those files.
const caseDir = resolve('scripts/arch-cases')
const only = process.argv.slice(2)
const tools = { failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }
for (const file of readdirSync(caseDir).filter((x) => x.endsWith('.js')).sort()) {
  if (only.length && !only.includes(file.replace(/\.js$/, ''))) continue
  await (await import(pathToFileURL(join(caseDir, file)).href)).default(tools)
}

// The rules themselves, on small diagrams
const n = (id, type, label = id) => ({ id, type, label })
const small = (nodes, edges) => ({ nodes, edges: edges.map((s, i) => ({ id: `e${i}`, ...parse(s) })) })
const pass = (d, rule) => runDiagramChecks(d, [{ label: 'x', rule }])[0].pass
const abc = [n('a', 'process-api'), n('b', 'queue'), n('c', 'system-api')]

const mixed = small(abc, ['a ~> b', 'b -> c'])
assert.equal(pass(mixed, { type: 'path', from: 'process-api', to: 'system-api' }), true)
assert.equal(pass(mixed, { type: 'path', from: 'process-api', to: 'system-api', kind: 'sync' }), false, 'a sync route has no async hop')
assert.equal(pass(mixed, { type: 'no-path', from: 'process-api', to: 'system-api', kind: 'sync' }), true)
assert.equal(pass(mixed, { type: 'no-path', from: 'process-api', to: 'system-api' }), false)
assert.equal(pass(small(abc, ['a -> b', 'b -> c']), { type: 'no-path', from: 'process-api', to: 'system-api', kind: 'sync' }), false)
assert.equal(pass(small([abc[0]], []), { type: 'no-path', from: 'process-api', to: 'system-api' }), false, 'both ends must be drawn')
assert.equal(pass(small([abc[0]], []), { type: 'no-path', from: 'process-api', to: 'system-api', ifDrawn: true }), true)

const fan = small([n('p', 'process-api'), n('q', 'queue'), n('s', 'system-api'), n('t', 'system-api')], ['p ~> q', 'q ~> s', 'q ~> t'])
assert.equal(pass(fan, { type: 'path', from: 'process-api', via: 'queue', to: 'system-api', min: 2 }), true)
assert.equal(pass(fan, { type: 'path', from: 'process-api', via: 'queue', to: 'system-api', min: 3 }), false)
assert.equal(pass(fan, { type: 'each', of: 'queue', edgeTo: 'system-api', count: 2 }), true)
assert.equal(pass(fan, { type: 'each', of: 'queue', edgeTo: 'system-api', count: 3 }), false)

assert.equal(pass(small(abc, ['b -> a']), { type: 'link', from: 'process-api', to: 'queue' }), true, 'a link reads both ways')
assert.equal(pass(small(abc, ['a -> c']), { type: 'link', from: 'process-api', to: 'queue' }), false)

const lines = { type: 'lines', touching: 'queue', kind: 'async' }
assert.equal(pass(mixed, lines), false, 'a sync line out of the queue')
assert.equal(pass(small(abc, ['a ~> b', 'b ~> c']), lines), true)
assert.equal(pass(small(abc, ['a -> c']), lines), true, 'no such line is fine')
assert.equal(pass(small(abc, []), lines), false, 'an empty canvas never passes')
assert.equal(pass(mixed, { type: 'lines', from: 'process-api', to: 'queue', kind: 'async' }), true)

// max and some on each, ifDrawn on no-edge, unless on no-path
const channels = (edges) => small([n('web', 'web-app'), n('mob', 'mobile-app'), n('xw', 'experience-api'), n('xm', 'experience-api'), n('p', 'process-api')], edges)
const ownApi = { type: 'each', of: 'experience-api', edgeFrom: ['web-app', 'mobile-app'], max: 1 }
assert.ok(pass(channels(['web -> xw', 'mob -> xm', 'xw -> p', 'xm -> p']), ownApi))
assert.equal(pass(channels(['web -> xw', 'web -> xm', 'mob -> xm', 'xw -> p', 'xm -> p']), ownApi), false)
assert.match(diagramHint(channels(['web -> xw', 'web -> xm', 'mob -> xm']), ownApi), /no more than 1/)
const shared = { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true }
assert.ok(pass(small([...channels([]).nodes, n('p2', 'process-api')], ['xw -> p', 'xm -> p']), shared))
assert.equal(pass(small([...channels([]).nodes, n('p2', 'process-api')], ['xw -> p', 'xm -> p2']), shared), false)
assert.match(diagramHint(channels(['xw -> p']), shared), /At least one/)
const noOwnDb = { type: 'no-edge', from: 'process-api', to: 'database', ifDrawn: true }
assert.ok(pass(small([n('p', 'process-api'), n('s', 'system-api')], ['p -> s']), noOwnDb))
assert.equal(pass(small([n('p', 'process-api'), n('d', 'database')], ['p -> d']), noOwnDb), false)
assert.equal(pass(small([n('p', 'process-api'), n('s', 'system-api')], ['p -> s']), { ...noOwnDb, ifDrawn: false }), false)
const viaTopic = { type: 'no-path', from: 'queue', to: 'database', unless: { type: 'topic', label: 'aggregate' } }
const regions = (edges) => small([n('q', 'queue'), n('agg', 'topic', 'sales aggregate'), n('raw', 'topic', 'raw sales'), n('a', 'process-api'), n('dw', 'database')], edges)
assert.ok(pass(regions(['q ~> a', 'a ~> agg', 'agg ~> dw']), viaTopic))
assert.equal(pass(regions(['q ~> a', 'a ~> raw', 'raw ~> dw']), viaTopic), false)
assert.equal(pass(regions(['q ~> a', 'a ~> agg', 'agg ~> dw', 'a ~> raw', 'raw ~> dw']), viaTopic), false)
assert.match(diagramHint(regions(['q ~> a', 'a ~> raw', 'raw ~> dw']), viaTopic), /must pass through/)

// Hints name what to do
assert.match(diagramHint(mixed, lines), /to or from Queue an async message/)
assert.match(diagramHint(small(abc, ['a -> b', 'b -> c']), { type: 'no-path', from: 'process-api', to: 'system-api', kind: 'sync' }), /Put a queue or topic/)
assert.match(diagramHint(mixed, { type: 'path', from: 'process-api', to: 'system-api', kind: 'sync' }), /using only sync calls/)
assert.match(diagramHint(fan, { type: 'each', of: 'queue', edgeTo: 'system-api', count: 3 }), /needs 3 lines/)

console.log(`All strict diagram checks pass (${wrong} wrong diagrams fail, ${right} other correct diagrams pass).`)
