import { diagram } from '../../arch/dsl.js'

const primary = { type: 'database', label: 'primary' }
const replica = { type: 'database', label: 'replica' }
const checkout = { name: 'checkout', from: 'web-app', rps: 120, to: primary, kind: 'write' }
const reports = { name: 'reports', from: 'internal-app', rps: 250, to: replica }

export default {
  id: 'ar-146',
  category: 'architecture',
  title: 'Month-End Reports Slowing Down Checkout: Move the Reporting Reads to a Read Replica',
  level: 'INTERMEDIATE',
  tags: ['read-replica', 'reporting', 'database', 'bulkhead', 'system-api', 'retail'],
  estMinutes: 30,
  diagram: {
    task: 'draw the two paths: checkout from the web shop through its Experience API and the orders System API to the primary orders database, and finance reporting from the reporting tool through a reports Process API and a reporting System API to a read replica that the primary database feeds.',
    checks: [
      { label: 'Checkout writes to the primary database through a System API', rule: { type: 'path', from: 'web-app', via: 'system-api', to: primary } },
      { label: 'The read replica is fed from the primary database', rule: { type: 'edge', from: primary, to: replica, kind: 'async' } },
      { label: 'The finance tool calls a reports Process API', rule: { type: 'edge', from: 'internal-app', to: 'process-api' } },
      { label: 'Reports read the read replica', rule: { type: 'path', from: 'internal-app', via: 'system-api', to: replica } },
      { label: 'No report request reaches the primary database', rule: { type: 'no-path', from: 'internal-app', to: primary } },
      {
        label: 'Reporting and checkout each have their own System API, so a heavy report cannot use up checkout\'s threads',
        rule: { type: 'each', of: 'system-api', min: 2, edgeFrom: ['experience-api', 'process-api'], max: 1 },
      },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop'],
        exp: ['experience-api', 'exp-checkout', { vCores: '0.5' }],
        sysO: ['system-api', 'sys-orders', { vCores: '0.5' }],
        db: ['database', 'Orders database (primary)'],
        rep: ['database', 'Orders read replica'],
        fin: ['internal-app', 'Finance reporting tool'],
        prc: ['process-api', 'prc-sales-reports', { vCores: '1' }],
        sysR: ['system-api', 'sys-orders-reporting', { vCores: '1' }],
      },
      ['web -> exp', 'exp -> sysO', 'sysO -> db', 'db ~> rep', 'fin -> prc', 'prc -> sysR', 'sysR -> rep'],
    ),
    simulation: {
      systems: [
        { match: primary, latencyMs: 10, maxRps: 300 },
        { match: replica, latencyMs: 30, maxRps: 400 },
      ],
      tests: [
        {
          name: 'Month-end close',
          about: 'Checkout writes 120 orders a second while finance runs reports at 250 queries a second. Checkout stays fast, and no report query reaches the primary database.',
          traffic: [checkout, reports],
          durationMin: 60,
          expect: {
            answers: [{ minSuccess: 0.99 }, { flow: 'checkout', maxMs: 300 }],
            notReached: [{ flow: 'reports', node: primary }],
            peakRps: [{ node: primary, max: 150 }],
          },
        },
        {
          name: 'The read replica is down for an hour',
          about: 'The replica is rebuilt after a disk failure. Reports wait, but every checkout still goes through.',
          traffic: [checkout, reports],
          incidents: [{ down: replica, at: 5, forMin: 60 }],
          durationMin: 70,
          expect: { answers: [{ flow: 'checkout', minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
A garden supplies retailer keeps its orders in one PostgreSQL **orders database**. The web shop writes about **120 orders a second** at peak through \`exp-checkout\` and \`sys-orders\`.

At month end the finance team runs sales reports from a **finance reporting tool**. Today the tool calls \`sys-orders\` too, and its queries scan months of orders: about **250 queries a second** while the reports run. The database then serves about 370 requests a second, more than the **300** it can take, and \`sys-orders\` holds its threads waiting. Last month checkout slowed to 9 seconds and 1 order in 8 failed during the close.

The DBA can add a **read replica**: a second copy of the database that the primary database keeps up to date by streaming its changes. It is usually less than a few seconds behind, and it can serve about **400 queries a second**.

Finance is happy with figures a few seconds old.

**Questions:**
- Draw a design where month-end reporting cannot slow down checkout.
- Why is a separate System API for reporting part of the answer, and not only the replica?
- What do reports see if the replica falls behind or goes down?
- What would you still keep on the primary database?
`,
  answerTemplate: `## Design

## Why a separate System API

## Sizing

## When the replica is behind or down
`,
  keyPoints: [
    'Reads that can be a few seconds old do not need the primary database. Send them to a read replica.',
    'The primary database then only carries the writes and reads that must be current, such as checkout.',
    'Give reporting its own System API. Slow report queries then hold that API\'s threads, not the ones checkout needs.',
    'A replica is fed by the database itself, not by Mule. Draw it as a copy the primary keeps up to date.',
    'Size each API for its own traffic. The reporting path carries more requests than checkout at month end.',
    'A replica can lag. Show reports with the time of the data, and keep anything that must be exact on the primary.',
  ],
  solution: `
**Design**
\`\`\`
Web shop ─► exp-checkout ─► sys-orders ─► Orders database (primary)
                                                 ~► Orders read replica
Finance reporting tool ─► prc-sales-reports ─► sys-orders-reporting ─┘
\`\`\`

**Why a separate System API.** The replica takes the load off the database, but not off \`sys-orders\`. A report query that runs for seconds holds a thread of the API that serves it. If reports and checkout share an API, a busy close still uses up the threads checkout needs. \`sys-orders-reporting\` keeps that apart: it can be slow without checkout noticing.

**Sizing.** \`sys-orders\` and \`exp-checkout\` serve 120 requests a second, so half a vCore each in this model. The reporting path serves 250 a second, so one vCore each for \`prc-sales-reports\` and \`sys-orders-reporting\`. The primary database now sees about 120 requests a second at month end, well inside its 300.

**When the replica is behind or down.** Reports show data a few seconds old, which finance accepts. Put the time of the latest order in each report. If the replica is down, reports fail or wait, and checkout carries on. Do not fail over reporting to the primary automatically, or the next close takes checkout down again.

**What stays on the primary.** Anything a customer or a payment depends on at that moment: checkout, the order status a customer sees after paying, stock reservations.
`,
  followUps: [
    {
      q: 'Why not send the reports to the data warehouse instead?',
      a: 'For heavy analysis over years, yes. The warehouse is often loaded once a night, though, and finance needs today\'s figures during the close. A replica is current within seconds.',
    },
    {
      q: 'Could a cache do the same job?',
      a: 'Not for reports. Each report asks a different question over many rows, so almost nothing would be a cache hit.',
    },
    {
      q: 'What if someone points the reporting System API at the primary during an incident?',
      a: 'It brings back the original problem. Make the replica\'s address part of the reporting API\'s configuration per environment, and treat a change to it like any release.',
    },
  ],
}
