import { writeLocal } from '../store/local.js'

// Six-month interview-readiness plan. Each phase pulls problems by category + level,
// so new content lands in the right month automatically.
export const PHASES = [
  {
    month: 1,
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
    month: 2,
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
    month: 3,
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
    month: 4,
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
    month: 5,
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
    month: 6,
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

const PLAN_START_KEY = 'pl.planStart'

export function getPlanStart() {
  try {
    let start = localStorage.getItem(PLAN_START_KEY)
    // a missing or malformed date (e.g. edited by hand) restarts the plan today instead of showing "Month NaN"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? '') || isNaN(Date.parse(start))) {
      start = new Date().toLocaleDateString('en-CA')
      localStorage.setItem(PLAN_START_KEY, start)
    }
    return start
  } catch {
    return new Date().toLocaleDateString('en-CA')
  }
}

export function setPlanStart(date) {
  writeLocal(PLAN_START_KEY, date)
}

// Month 1..6 based on days since the plan started (30-day months); 7 means the plan is finished.
export function currentMonth(start, today = new Date()) {
  const days = Math.floor((today - new Date(`${start}T00:00:00`)) / 86400000)
  if (!Number.isFinite(days)) return 1
  return Math.max(1, Math.min(7, Math.floor(days / 30) + 1))
}
