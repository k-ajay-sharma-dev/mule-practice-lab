// Runs a problem's simulator tests against a design, and remembers the answer for that design so the check list,
// the step guide and the hints can all ask without running the flow again.
import { COMPONENTS } from '../flow/catalog.js'
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
  const { result, lines } = runTest(design, rule.scenario, rule.test)
  const first = lines.find((l) => !l.ok)
  if (!first) return ''
  const clue = runClues(result, lines)[0]
  return `${first.text}.${clue ? ` ${clue.text}` : ' Open the Run tab to see each step.'}`
}

const isLeaf = (type) => ['processor', 'source'].includes(COMPONENTS[type]?.kind)

// Where a failed run went wrong, in words, with the components to look at: [{ text, ids }]
//  - too slow: the steps the time went to, and how far over the budget it is
//  - an error: the step that raised it, and the handler that turned it into the answer
export function runClues(result, lines = []) {
  const failed = lines.filter((l) => !l.ok)
  if (!failed.length || !result?.trace) return []
  const out = []
  const trace = result.trace
  const slow = failed.map((l) => /answers within (\d+) ms/.exec(l.text)).find(Boolean)
  if (slow) {
    const budget = Number(slow[1])
    const got = Number(/got (\d+) ms/.exec(failed.find((l) => /answers within/.test(l.text)).text)?.[1]) || 0
    const byId = new Map()
    for (const e of trace) {
      if (e.id && e.ms > 0 && isLeaf(e.type) && !(byId.get(e.id)?.ms >= e.ms)) byId.set(e.id, e)
    }
    const top = [...byId.values()].sort((a, b) => b.ms - a.ms).slice(0, 2)
    if (top.length) {
      const named = top.map((e) => `${e.label} took ${e.ms} ms${e.kind === 'error' && /TIMEOUT/.test(e.error?.type ?? e.text) ? ' (it waited for its whole timeout)' : ''}`).join(', ')
      out.push({
        text: `The time went to: ${named}.${got > budget ? ` The answer is ${got - budget} ms over the ${budget} ms budget, so that step must give up sooner (a lower timeout) or the work must happen while the caller is not waiting.` : ''}`,
        ids: top.map((e) => e.id),
      })
    }
  }
  const err = trace.find((e) => e.kind === 'error' && e.id)
  if (err) {
    const caught = trace.find((e) => e.kind === 'handler' && e.error?.type === err.error?.type)
    const why = err.error?.description ? `: ${err.error.description.replace(/\.\s*$/, '')}` : ''
    out.push({
      text: `${err.text}${why}.${caught ? ` ${caught.text}, and that decides the answer.` : ' No error handler caught it.'}`,
      ids: [err.id, caught?.id].filter(Boolean),
      uncaught: !caught,
    })
  }
  // a missing or misdirected email or message: the steps that sent them, so Find it compares their settings.
  // Matched on how each check's text starts (see sim/expect.js), as a queue can be called welcome-emails.
  const effects = [
    [/^(\d+ emails?|An email|No email)\b/, (e) => e.type === 'email-send', 'email'],
    [/^(\d+ messages? sent to|A message sent to|Nothing is sent to)\b/, (e) => /publish/.test(e.type ?? ''), 'message'],
  ]
  for (const [about, sends, noun] of effects) {
    if (!failed.some((l) => about.test(l.text))) continue
    const steps = trace.filter((e) => e.kind === 'step' && e.id && sends(e))
    if (!steps.length) continue
    const where = [...new Set(steps.map((e) => `${e.label} in ${e.flow}`))].join(', ')
    out.push({ text: `The ${noun} came from ${where}. Compare its settings with what the test expects.`, ids: [...new Set(steps.map((e) => e.id))] })
  }
  return out
}
