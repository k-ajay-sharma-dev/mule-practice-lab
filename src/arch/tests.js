// Runs a problem's architecture tests against a diagram, and remembers the answer for that diagram so the check list,
// the step guide, the hints and the Run tab can all ask without running it again.
import { simulateArch } from './sim.js'
import { checkExpectations } from './expect.js'

const memo = new WeakMap()

// → { result, lines: [{ ok, text }], pass }
export function runArchTest(diagram, simulation, test) {
  let byTest = memo.get(diagram)
  if (!byTest) memo.set(diagram, (byTest = new Map()))
  if (byTest.has(test)) return byTest.get(test)
  const result = simulateArch(diagram, simulation, test)
  const lines = checkExpectations(result, test.expect, diagram)
  const out = { result, lines, pass: lines.length > 0 && lines.every((l) => l.ok) }
  byTest.set(test, out)
  return out
}

// The checks a problem's tests add to its diagram checks: one per test.
export function archTestChecks(problem) {
  const sim = problem.diagram?.simulation
  if (!sim?.tests?.length) return []
  return sim.tests.map((test) => ({ label: `Run: ${test.name}`, rule: { type: 'runs', simulation: sim, test }, run: true }))
}

// The first thing a failing test still needs, for the hint under the check.
export function archTestHint(diagram, rule) {
  const { lines, result } = runArchTest(diagram, rule.simulation, rule.test)
  const first = lines.find((l) => !l.ok)
  const note = result.notes[0] ? ` ${result.notes[0]}` : ''
  return first ? `${first.text}.${note} Open the Run tab to see where the requests went.` : ''
}
