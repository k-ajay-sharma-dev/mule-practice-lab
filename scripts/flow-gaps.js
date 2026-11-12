// Components a learner could leave out of a flow problem's design and still pass every check. Each component of
// the reference design is taken out in turn (with what sits inside it) and the checks run again.
// A problem may list steps that are fine to leave out, with the reason:
//   optionalSteps: [{ type: 'on-error-propagate', flow?: 'orders-api', why: '...' }]
// flow limits the entry to one flow of the reference. Anything not listed there is a gap.
import { designChecks, runChecks } from '../src/flow/checks.js'
import { removeNode, walk } from '../src/flow/model.js'

// Steps that only shape data or call another flow. Taking one out is caught by the checks on what they feed, or
// is a matter of style, so they are not tested one by one.
const CORE = new Set(['logger', 'transform', 'set-payload', 'set-variable', 'flow-ref', 'raise-error', 'validation', 'parse-template'])

const describe = (item, flow) => {
  const c = item.config ?? {}
  const what = c.sql ?? c.path ?? c.destination ?? c.type ?? ''
  return `${item.type} in ${flow}${what ? ` (${String(what).slice(0, 50)})` : ''}`
}

// Every gap, as { type, flow, text, optional }. optional holds the listed reason when the problem allows it.
export function gapsOf(problem) {
  if (!problem.flowChecks?.length || !problem.referenceFlow) return []
  const checks = designChecks(problem)
  const out = []
  walk(problem.referenceFlow, (item, ctx) => {
    if (ctx.isFlow || ctx.isRoute || CORE.has(item.type)) return
    const without = removeNode(problem.referenceFlow, item.id)
    if (!runChecks(without, checks).every((r) => r.pass)) return
    const flow = ctx.flow.name
    const ok = (problem.optionalSteps ?? []).find((o) => o.type === item.type && (!o.flow || o.flow === flow))
    out.push({ type: item.type, flow, text: describe(item, flow), optional: ok?.why })
  })
  return out
}
