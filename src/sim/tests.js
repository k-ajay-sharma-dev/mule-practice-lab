// Runs a problem's simulator tests against a design, and remembers the answer for that design so the check list,
// the step guide and the hints can all ask without running the flow again.
import { simulate } from './engine.js'
import { checkExpectations } from './expect.js'

const memo = new WeakMap()

// → { result, lines: [{ ok, text }], pass }
export function runTest(design, scenario, test) {
  let byTest = memo.get(design)
  if (!byTest) memo.set(design, (byTest = new Map()))
  if (byTest.has(test)) return byTest.get(test)
  const result = simulate(design, scenario, test)
  const lines = checkExpectations(result, test.expect)
  const out = { result, lines, pass: lines.length > 0 && lines.every((l) => l.ok) }
  byTest.set(test, out)
  return out
}

// The checks a problem's tests add to its design checks: one per test, named after what the test sends.
export function testChecks(problem) {
  const sim = problem.simulation
  if (!sim?.tests?.length) return []
  return sim.tests.map((test) => ({ label: `Run: ${test.name}`, rule: { type: 'runs', scenario: sim, test }, run: true }))
}

// The first thing a failing test still needs, for the hint under the check.
export function testHint(design, rule) {
  const { lines } = runTest(design, rule.scenario, rule.test)
  const first = lines.find((l) => !l.ok)
  return first ? `${first.text}. Open the Run tab to see each step.` : ''
}
