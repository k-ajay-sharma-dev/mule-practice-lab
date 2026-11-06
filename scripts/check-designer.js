// Designer help: undo history, duplicating, step splitting and the hints a failed check gives, across every real problem.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { diagramHint, runDiagramChecks } from '../src/arch/checks.js'
import { duplicateNode as duplicateBox, emptyDiagram } from '../src/arch/model.js'
import { designChecks, missingHint, runChecks } from '../src/flow/checks.js'
import { countComponents, createNode, duplicateNode, emptyDesign, findItem, insertNode, walk } from '../src/flow/model.js'
import { currentStep, diagramSteps, flowSteps } from '../src/study/steps.js'
import { record, redo, startHistory, undo } from '../src/study/undo.js'

// undo history
let h = startHistory('a')
h = record(h, 'b', 10000)
h = record(h, 'c', 20000)
assert.deepEqual(h.past, ['a', 'b'])
h = undo(h)
assert.equal(h.present, 'b')
h = redo(h)
assert.equal(h.present, 'c')
h = undo(h)
h = record(h, 'd', 30000)
assert.deepEqual(h.future, [], 'a new change drops the redo steps')
// typing merges into one step
let t = record(startHistory(''), 'x', 1000, true)
t = record(t, 'xy', 1300, true)
t = record(t, 'xyz', 1600, true)
assert.deepEqual(t.past, [''])
assert.equal(undo(t).present, '')
// other quick changes stay separate steps
assert.equal(record(record(startHistory('a'), 'b', 1000), 'c', 1100).past.length, 2)
assert.equal(undo(startHistory('a')).present, 'a')

// duplicate: new ids all the way down, placed after the original
const d0 = emptyDesign()
const key = `${d0.flows[0].id}:steps`
const choice = createNode('choice')
const d1 = insertNode(d0, key, 0, choice)
const inner = createNode('logger')
const d2 = insertNode(d1, `${choice.routes[0].id}:steps`, 0, inner)
const dup = duplicateNode(d2, choice.id)
assert.equal(countComponents(dup.design), 4)
assert.equal(dup.design.flows[0].steps[1].id, dup.id)
const ids = []
walk(dup.design, (item) => ids.push(item.id))
assert.equal(new Set(ids).size, ids.length, 'no id is shared with the copy')
assert.ok(findItem(dup.design, inner.id))
const withSource = insertNode(d0, `${d0.flows[0].id}:source`, 0, createNode('http-listener'))
assert.equal(duplicateNode(withSource, withSource.flows[0].source.id).id, null, 'a flow has one source')
const box = duplicateBox({ ...emptyDiagram(), nodes: [{ id: 'a', type: 'queue', label: 'orders' }] }, 'a')
assert.equal(box.diagram.nodes.length, 2)
assert.notEqual(box.id, 'a')

// every real problem: all checks land in exactly one small step, and every check has a hint on an empty canvas
const load = async (dir) => {
  const root = resolve('src/content', dir)
  return Promise.all(readdirSync(root).map(async (f) => (await import(pathToFileURL(join(root, f)).href)).default))
}
const coverAll = (steps, checks, id) => {
  assert.deepEqual(steps.flatMap((s) => s.items).sort((a, b) => a - b), checks.map((_, i) => i), id)
  for (const s of steps) assert.ok(s.items.length >= 1 && s.items.length <= 3, id)
  assert.equal(new Set(steps.map((s) => s.title)).size, steps.length, id)
}

let flows = 0
for (const p of await load('flows')) {
  if (!p.flowChecks?.length) continue
  flows++
  const checks = designChecks(p)
  const steps = flowSteps(checks)
  coverAll(steps, checks, p.id)
  const empty = emptyDesign()
  for (const c of checks) {
    const hint = missingHint(empty, c.rule)
    assert.ok(typeof hint === 'string' && hint.length > 8 && !hint.includes('undefined'), `${p.id}: ${c.label}: ${hint}`)
  }
  if (p.referenceFlow) assert.equal(currentStep(steps, runChecks(p.referenceFlow, checks)), steps.length, p.id)
}

let diagrams = 0
for (const p of await load('architecture')) {
  if (!p.diagram) continue
  diagrams++
  const { checks, reference } = p.diagram
  const steps = diagramSteps(checks)
  coverAll(steps, checks, p.id)
  for (const c of checks) {
    const hint = diagramHint(emptyDiagram(), c.rule)
    assert.ok(typeof hint === 'string' && hint.length > 8 && !hint.includes('undefined'), `${p.id}: ${c.label}: ${hint}`)
  }
  assert.equal(currentStep(steps, runDiagramChecks(reference, checks)), steps.length, p.id)
}

// hints read the design: the right component with a wrong value is told so
const listener = createNode('http-listener')
const design = insertNode(d0, `${d0.flows[0].id}:source`, 0, listener)
const hint = missingHint(design, { type: 'source', component: 'http-listener', where: { path: 'sys-' } })
assert.match(hint, /^Your HTTP Listener needs Path containing “sys-”/)
assert.match(missingHint(d0, { type: 'exists', component: 'logger' }), /^Add Logger/)
const wrongKind = {
  nodes: [
    { id: 'a', type: 'queue', label: 'q' },
    { id: 'b', type: 'system-api', label: 's' },
  ],
  edges: [{ id: 'e', from: 'a', to: 'b', kind: 'sync' }],
}
assert.match(diagramHint(wrongKind, { type: 'edge', from: 'queue', to: 'system-api', kind: 'async' }), /async/)

console.log(`All designer checks pass (${flows} flows, ${diagrams} diagrams).`)
