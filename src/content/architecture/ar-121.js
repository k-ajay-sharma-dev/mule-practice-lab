import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-121',
  category: 'architecture',
  title: 'One System API in Front of a Database',
  level: 'BEGINNER',
  tags: ['api-led', 'system-api', 'layers', 'retail'],
  estMinutes: 20,
  diagram: {
    task: 'draw one System API in front of a database. Use four boxes: two Process API boxes named orders API and returns API, one System API box and one Database box. Draw a line from each Process API to the System API, and a line from the System API to the Database.',
    checks: [
      { label: 'Both Process APIs call the System API', rule: { type: 'each', of: 'process-api', min: 2, edgeTo: 'system-api' } },
      { label: 'One System API is shared by both', rule: { type: 'node', match: 'system-api', min: 1, max: 1 } },
      { label: 'The System API connects to the database', rule: { type: 'edge', from: 'system-api', to: 'database' } },
      { label: 'The Process APIs never connect to the database directly', rule: { type: 'no-edge', from: 'process-api', to: 'database' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
      { label: 'The Process APIs call the System API with sync calls', rule: { type: 'lines', from: 'process-api', to: 'system-api', kind: 'sync' } },
    ],
    reference: diagram(
      {
        ord: ['process-api', 'prc-orders-api', { replicas: 2 }],
        ret: ['process-api', 'prc-returns-api', { replicas: 2 }],
        sys: ['system-api', 'sys-customers-api', { replicas: 2, vCores: '0.2' }],
        db: ['database', 'Customer database'],
      },
      ['ord -> sys', 'ret -> sys', 'sys -> db'],
    ),
    simulation: {
      systems: [{ match: 'database', latencyMs: 30 }],
      tests: [
        {
          name: 'Both teams at peak',
          about: 'The orders API sends 40 customer lookups a second and the returns API 20, for ten minutes. The shared System API carries both, and the APIs stay inside 1 vCore.',
          traffic: [
            { name: 'orders', from: { type: 'process-api', label: 'orders' }, rps: 40, to: 'database' },
            { name: 'returns', from: { type: 'process-api', label: 'returns' }, rps: 20, to: 'database' },
          ],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], peakRps: [{ node: 'system-api', min: 55 }], vCores: { max: 1 } },
        },
        {
          name: 'A zone goes down',
          about: 'One availability zone fails for the whole run at peak load. Both teams depend on the shared System API, so every API must keep answering.',
          traffic: [
            { name: 'orders', from: { type: 'process-api', label: 'orders' }, rps: 40, to: 'database' },
            { name: 'returns', from: { type: 'process-api', label: 'returns' }, rps: 20, to: 'database' },
          ],
          incidents: [{ zone: true }],
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
A shoe retailer keeps its customers in one database. The orders team and the returns team each wrote code that connects to it, so one table change breaks both.

A **System API** gives access to one backend system and hides its details. A **Process API** applies business rules and calls System APIs.

The plan: both Process APIs stop connecting to the database and share one System API.

Some numbers for the design:
- At peak the orders API looks up 40 customers a second and the returns API 20. A database query takes about 30 ms.
- Both teams now depend on one System API. It and both Process APIs must keep answering when one availability zone is lost.
- The budget for the three APIs is 1 vCore.

**Questions:**
- Draw the design.
- What happens to the Process APIs when a table changes?
`,
  answerTemplate: `## Design

## When a table changes
`,
  keyPoints: [
    'A System API gives access to one backend system and hides its details.',
    'Only the System API connects to the database. Everything else calls the System API.',
    'A table change is fixed in one place, and the API contract stays the same for its callers.',
    'A shared System API carries the load of all its callers, so size it for the sum. It is also a single point of failure, so run two replicas.',
  ],
  solution: `
**Design.**
\`\`\`
 prc-orders-api ──┐
                  ├─► sys-customers-api ─► Customer database
 prc-returns-api ─┘
\`\`\`

**When a table changes.** The team updates the System API only. The Process APIs keep calling the same operations and receive the same response, so they do not change. Before this design, the same fix was needed in two places.

**Sizing.** The System API carries both teams, 60 lookups a second. 0.1 vCore serves about 50 a second, so each replica gets 0.2 vCore. Two replicas sit in different availability zones, so one zone going down leaves 0.2 vCore, still enough for 60 a second. The Process APIs carry 40 and 20 a second and run two replicas of 0.1 vCore each. The total is 0.8 vCore, inside the budget.
`,
  followUps: [
    {
      q: 'Should a System API hold business rules, such as who counts as a VIP customer?',
      a: 'No. It gives access to the data. Rules belong in a Process API, so the System API can be reused by anyone who needs that data.',
    },
    {
      q: 'What if the retailer moves to a new database next year?',
      a: 'The System API is rebuilt against the new database. If its contract stays the same, the callers do not notice the move.',
    },
  ],
}
