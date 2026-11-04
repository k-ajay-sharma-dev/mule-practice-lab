// kind: 'code' problems are solved in the DataWeave editor and graded by the runner;
// 'flow' problems are designed on the Flow Designer canvas and checked against rules (never executed);
// 'self' problems get an interactive exercise when their content has one (see data/exercises.js),
// otherwise a written answer compared against a reference solution.
export const CATEGORIES = [
  {
    slug: 'dataweave',
    eyebrow: 'run & graded',
    label: 'DataWeave Lab',
    kind: 'code',
    blurb: 'Hands-on DataWeave 2.0 transformations, executed on the real engine and graded against hidden test cases.',
  },
  {
    slug: 'mulesoft',
    eyebrow: 'quizzes · explain it',
    label: 'Platform & Runtime',
    kind: 'self',
    blurb: 'Mule 4 runtime, connectors, error handling, deployment and Anypoint Platform fundamentals.',
  },
  {
    slug: 'flows',
    eyebrow: 'visual design & checks',
    label: 'Flow Design',
    kind: 'flow',
    blurb: 'Design Mule flows for real requirements: sources, routers, scopes, connectors and error handling.',
  },
  {
    slug: 'architecture',
    eyebrow: 'architecture design · explain it',
    label: 'Solution Architecture',
    kind: 'self',
    blurb: 'API-led connectivity, reliability, security and the trade-offs architects are expected to defend.',
  },
  {
    slug: 'use-cases',
    eyebrow: 'architecture design · explain it',
    label: 'Integration Scenarios',
    kind: 'self',
    blurb: 'Turn a business requirement into a complete, production-ready integration solution.',
  },
  {
    slug: 'case-studies',
    eyebrow: 'architecture design · explain it',
    label: 'Enterprise Case Studies',
    kind: 'self',
    blurb: 'End-to-end enterprise programmes with competing goals, constraints and risks.',
  },
  {
    slug: 'incidents',
    eyebrow: 'investigate · diagnose · explain it',
    label: 'Production Support',
    kind: 'self',
    blurb: 'Diagnose real production failures from symptoms and logs, restore service and prevent recurrence.',
  },
]

export const categoryBySlug = new Map(CATEGORIES.map((c) => [c.slug, c]))

export const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']

export const STATUSES = [
  { value: 'not-started', label: 'Not started' },
  { value: 'attempted', label: 'Attempted' },
  { value: 'solved', label: 'Solved' },
  { value: 'revisit', label: 'Revisit' },
]
