import { diagram } from '../../arch/dsl.js'

const reports = { name: 'dashboard reads', from: 'internal-app', rps: 300, to: { type: 'oracle-db', label: 'standby' } }
const orders = { name: 'order writes', from: 'web-app', rps: 40, to: { type: 'oracle-db', label: 'primary' }, kind: 'write' }

export default {
  id: 'uc-189',
  category: 'use-cases',
  title: 'Store Dashboards Off the Oracle Primary: Read From the Standby Copy Through Their Own System API, and Size the Read Path for 300 Requests a Second',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'oracle', 'read-replica', 'reporting', 'system-api', 'sizing'],
  estMinutes: 35,
  diagram: {
    task: 'draw the web shop writing orders through an orders Experience API and an orders System API into the Oracle primary. Draw the store dashboards reading through a dashboards Experience API and a reporting System API from the Oracle standby (the read only copy). The dashboards must never reach the primary.',
    checks: [
      { label: 'Orders are written to the Oracle primary through a System API', rule: { type: 'path', from: 'web-app', via: 'system-api', to: { type: 'oracle-db', label: 'primary' } } },
      { label: 'Dashboards read the standby through a System API', rule: { type: 'path', from: 'internal-app', via: 'system-api', to: { type: 'oracle-db', label: 'standby' } } },
      { label: 'Dashboards never reach the Oracle primary', rule: { type: 'no-path', from: 'internal-app', to: { type: 'oracle-db', label: 'primary' } } },
      { label: 'Each Oracle database is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop'],
        expO: ['experience-api', 'exp-orders'],
        sysO: ['system-api', 'sys-orders-oracle'],
        pri: ['oracle-db', 'Oracle primary'],
        dash: ['internal-app', 'Store dashboards'],
        expD: ['experience-api', 'exp-dashboards', { vCores: '1' }],
        sysR: ['system-api', 'sys-reporting-oracle', { vCores: '1' }],
        stb: ['oracle-db', 'Oracle standby (read only)'],
      },
      ['web -> expO', 'expO -> sysO', 'sysO -> pri', 'dash -> expD', 'expD -> sysR', 'sysR -> stb'],
    ),
    simulation: {
      systems: [
        { match: { type: 'oracle-db', label: 'primary' }, latencyMs: 30, maxRps: 150 },
        { match: { type: 'oracle-db', label: 'standby' }, latencyMs: 60, maxRps: 600 },
      ],
      tests: [
        {
          name: 'Monday morning',
          about: 'Every store opens its dashboard at 08:00: about 300 reads a second, while the web shop writes 40 orders a second. Both are answered, and the primary only carries the orders.',
          traffic: [reports, orders],
          durationMin: 30,
          expect: { answers: [{ flow: 'dashboard reads', minSuccess: 0.99 }, { flow: 'order writes', minSuccess: 0.99 }], peakRps: [{ node: { type: 'oracle-db', label: 'primary' }, max: 50 }] },
        },
        {
          name: 'The standby is rebuilt',
          about: 'The standby is down for 20 minutes. Dashboards fail for that time, but the web shop does not notice at all.',
          traffic: [reports, orders],
          incidents: [{ down: { type: 'oracle-db', label: 'standby' }, at: 5, forMin: 20 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'order writes', minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, gives each store a dashboard of sales, waste and stock. The dashboards ran their queries on the same **Oracle primary** that takes web shop orders. On Monday mornings, when every store opens its dashboard at once, order writes slowed to several seconds and checkouts failed.

The DBA team keeps a **standby copy** of the database (Oracle Active Data Guard), open read only, a few seconds behind the primary.

**Numbers**
- Dashboards: about **300 reads a second** on Monday mornings.
- Web shop: about **40 order writes a second**.
- The primary takes about 150 calls a second before it slows. The standby takes about 600.
- In this model one vCore serves about 500 simple requests a second, and the smallest API (0.1 vCore) about 50.

**Questions:**
- Draw the design.
- What may the dashboards read from the standby, and what must they never use it for?
- Size the dashboard read path.
- What happens to the web shop when the standby is down?
`,
  answerTemplate: `## Design

## What the standby is good for

## Sizing the read path

## When the standby is down
`,
  keyPoints: [
    'Reports and dashboards can live with data a few seconds old. Moving them to the standby takes their load off the primary, where orders need it.',
    'Give the read path its own Experience and System API. Their sizing, connection pool and outage are then separate from the order path.',
    'Never write to the standby, and never use it for a read that must see a write made a moment ago (an order confirmation page). Those stay on the primary.',
    '300 reads a second needs more than the smallest API: about 1 vCore on each box of the read path, in this model.',
    'With the paths apart, a standby rebuild costs dashboards only; checkouts carry on.',
  ],
  solution: `
**Design**
\`\`\`
Web shop ─► exp-orders ─► sys-orders-oracle ─► Oracle primary
Store dashboards ─► exp-dashboards ─► sys-reporting-oracle ─► Oracle standby (read only)
\`\`\`

**Settings.** \`exp-dashboards\` and \`sys-reporting-oracle\`: 1 vCore each. The order path stays small.

**A short cache.** Most stores ask the same questions on Monday morning. A cache of a minute or two in \`exp-dashboards\` would cut the reads further, since the data is already seconds old.
`,
  followUps: [
    {
      q: 'The standby falls 10 minutes behind during a big batch load. What do the dashboards show?',
      a: 'Ten minute old numbers. Show the standby\'s time on the dashboard (a "data as of" line), so stores know, and alert the DBA team when the lag passes a set limit.',
    },
    {
      q: 'Can the dashboards fall back to the primary when the standby is down?',
      a: 'Technically yes, but that brings back the Monday problem at the worst time. Better to show the last numbers or a clear message, and keep the primary for orders.',
    },
  ],
}
