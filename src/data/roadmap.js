// The learning path, in order. Each stage pulls problems by category + level,
// so new content lands in the right stage automatically.
export const PHASES = [
  {
    stage: 1,
    title: 'Foundations',
    goal: 'Read and write basic DataWeave, understand the Mule event, and build simple flows end to end.',
    focus: ['DataWeave selectors, map, filter, default', 'Mule event: payload, attributes, variables', 'Sources, processors and basic error handling'],
    picks: [
      ['dataweave', 'BEGINNER'],
      ['mulesoft', 'BEGINNER'],
      ['flows', 'BEGINNER'],
    ],
  },
  {
    stage: 2,
    title: 'Core Development',
    goal: 'Handle the everyday work of a Mule developer: grouping, formats, connectors, routers and error types.',
    focus: ['groupBy, pluck, reduce, XML and CSV', 'Connectors, streaming, Object Store, batch basics', 'Routers, scopes and error mapping'],
    picks: [
      ['dataweave', 'INTERMEDIATE'],
      ['mulesoft', 'INTERMEDIATE'],
      ['flows', 'INTERMEDIATE'],
    ],
  },
  {
    stage: 3,
    title: 'Integration Patterns',
    goal: 'Translate business requirements into integrations and start thinking in API-led layers.',
    focus: ['Sync vs async, idempotency, retries', 'API-led connectivity basics', 'First production troubleshooting'],
    picks: [
      ['use-cases', 'BEGINNER'],
      ['use-cases', 'INTERMEDIATE'],
      ['architecture', 'BEGINNER'],
      ['incidents', 'BEGINNER'],
    ],
  },
  {
    stage: 4,
    title: 'Advanced Development',
    goal: 'Master complex transformations, performance, reliability and harder production issues.',
    focus: ['Recursion, functions, modules in DataWeave', 'Batch tuning, transactions, threading', 'Diagnosing timeouts, duplicates, memory'],
    picks: [
      ['dataweave', 'ADVANCED'],
      ['mulesoft', 'ADVANCED'],
      ['flows', 'ADVANCED'],
      ['incidents', 'INTERMEDIATE'],
    ],
  },
  {
    stage: 5,
    title: 'Architecture & Production',
    goal: 'Design secure, scalable solutions, defend trade-offs and run integrations in production.',
    focus: ['Security, governance, deployment strategy', 'Scalability, HA and disaster recovery', 'Enterprise programmes and migrations'],
    picks: [
      ['architecture', 'INTERMEDIATE'],
      ['architecture', 'ADVANCED'],
      ['use-cases', 'ADVANCED'],
      ['incidents', 'ADVANCED'],
      ['case-studies', 'BEGINNER'],
      ['case-studies', 'INTERMEDIATE'],
    ],
  },
  {
    stage: 6,
    title: 'Expert & Interview Simulation',
    goal: 'Work through expert-level problems under time pressure and practise every interview follow-up out loud.',
    focus: ['Expert DataWeave and flow design', 'Architect-level case studies', 'Mock interviews with follow-up questions'],
    picks: [
      ['dataweave', 'EXPERT'],
      ['mulesoft', 'EXPERT'],
      ['flows', 'EXPERT'],
      ['architecture', 'EXPERT'],
      ['use-cases', 'EXPERT'],
      ['incidents', 'EXPERT'],
      ['case-studies', 'ADVANCED'],
      ['case-studies', 'EXPERT'],
    ],
  },
]

export function phaseProblems(phase, problems) {
  return problems.filter((p) => phase.picks.some(([cat, level]) => p.category === cat && p.level === level))
}

// The first stage with work left: you move on by finishing a stage, not by the date. Null once everything is solved.
export const currentStage = (phases) => phases.find((ph) => ph.done < ph.list.length) ?? null
