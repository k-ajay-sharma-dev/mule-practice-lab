// Splits a problem's checks into small steps, so a big design can be built one piece at a time.
// A step is { title, items } where items are indexes into the checks list.
const MAX_PER_STEP = 3

function buildSteps(checks, stages, stageOf) {
  const steps = []
  for (const { key, title } of stages) {
    const items = checks.flatMap((c, i) => (stageOf(c.rule) === key ? [i] : []))
    const parts = Math.ceil(items.length / MAX_PER_STEP)
    const size = Math.ceil(items.length / Math.max(parts, 1))
    for (let p = 0; p < parts; p++) {
      steps.push({
        title: parts > 1 ? `${title} (${p + 1} of ${parts})` : title,
        items: items.slice(p * size, (p + 1) * size),
      })
    }
  }
  return steps.filter((s) => s.items.length)
}

const FLOW_STAGES = [
  { key: 'start', title: 'Start the flow' },
  { key: 'logic', title: 'Build the main logic' },
  { key: 'errors', title: 'Handle errors' },
  { key: 'final', title: 'Final checks' },
]

const componentsIn = (rule) => [rule.component, rule.first, rule.then, rule.within].flat().filter(Boolean)
const isErrorPart = (type) => type.startsWith('on-error') || type === 'raise-error' || type === 'try'

function flowStage(rule) {
  if (rule.type === 'source' || rule.type === 'flows') return 'start'
  if (rule.type === 'absent' || rule.type === 'refs') return 'final'
  if (rule.type === 'handler' || componentsIn(rule).some(isErrorPart)) return 'errors'
  return 'logic'
}

const DIAGRAM_STAGES = [
  { key: 'boxes', title: 'Add the boxes' },
  { key: 'lines', title: 'Connect them' },
  { key: 'limits', title: 'Keep the boundaries' },
]

function diagramStage(rule) {
  if (rule.type === 'node') return 'boxes'
  if (['edge', 'each', 'path'].includes(rule.type)) return 'lines'
  return 'limits'
}

export const flowSteps = (checks) => buildSteps(checks, FLOW_STAGES, flowStage)
export const diagramSteps = (checks) => buildSteps(checks, DIAGRAM_STAGES, diagramStage)

// The first step with a check still failing, or steps.length when every step passes.
export function currentStep(steps, results) {
  const i = steps.findIndex((s) => s.items.some((n) => !results[n]?.pass))
  return i === -1 ? steps.length : i
}
