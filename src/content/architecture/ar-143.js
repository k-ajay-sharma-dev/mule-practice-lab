import { diagram } from '../../arch/dsl.js'

const cell = (k, name) => ({
  [`exp${k}`]: ['experience-api', `exp-payroll-api (cell ${name})`, { vCores: '0.5' }],
  [`prc${k}`]: ['process-api', `prc-payroll-runs (cell ${name})`, { vCores: '0.5' }],
  [`db${k}`]: ['database', `Payroll database (cell ${name})`],
})

export default {
  id: 'ar-143',
  category: 'architecture',
  title: 'Limiting the Blast Radius of a Multi-Tenant Payroll Platform: Three Cells Behind a Tenant Router',
  level: 'ADVANCED',
  tags: ['cell-based', 'blast-radius', 'multi-tenancy', 'resilience', 'deployment', 'saas'],
  estMinutes: 45,
  diagram: {
    task: 'draw a cell-based payroll platform: employers and their staff app calling one tenant router, a tenant directory the router reads, and three cells, each with its own Experience API, Process API and payroll database. Nothing in one cell calls another cell.',
    checks: [
      { label: 'Every channel goes through the tenant router', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: ['load-balancer', 'api-gateway'], max: 1 } },
      { label: 'The router reads the tenant directory to find each tenant\'s cell', rule: { type: 'edge', from: ['load-balancer', 'api-gateway'], to: { type: ['cache', 'database'], label: ['tenant', 'directory'] } } },
      { label: 'The router sends traffic to at least three cells', rule: { type: 'edge', from: ['load-balancer', 'api-gateway'], to: 'experience-api', min: 3 } },
      { label: 'Each Experience API calls exactly one Process API, the one in its own cell', rule: { type: 'each', of: 'experience-api', min: 3, edgeTo: 'process-api', max: 1 } },
      { label: 'Each cell has its own payroll database', rule: { type: 'node', match: { type: 'database', label: ['payroll', 'cell'] }, min: 3 } },
      { label: 'Each Process API uses exactly one payroll database', rule: { type: 'each', of: 'process-api', min: 3, edgeTo: { type: 'database', label: ['payroll', 'cell'] }, max: 1 } },
      { label: 'No payroll database is shared between cells', rule: { type: 'each', of: { type: 'database', label: ['payroll', 'cell'] }, edgeFrom: 'process-api', max: 1 } },
      { label: 'No cell calls another cell\'s Process API', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', max: 1 } },
      { label: 'Channels never call a cell directly', rule: { type: 'no-edge', from: ['web-app', 'mobile-app'], to: ['experience-api', 'process-api'] } },
    ],
    reference: diagram(
      {
        emp: ['web-app', 'Employer payroll portal'],
        staff: ['mobile-app', 'Employee payslip app'],
        rtr: ['load-balancer', 'Tenant router (routes by tenant ID)'],
        dir: ['cache', 'Tenant directory: tenant to cell', { ttlSec: 600 }],
        ...cell('A', 'A'),
        ...cell('B', 'B'),
        ...cell('C', 'C'),
        mon: ['monitoring', 'Per-cell dashboards and alerts'],
      },
      [
        'emp -> rtr', 'staff -> rtr', 'rtr -> dir',
        'rtr -> expA', 'rtr -> expB', 'rtr -> expC',
        'expA -> prcA', 'expB -> prcB', 'expC -> prcC',
        'prcA -> dbA', 'prcB -> dbB', 'prcC -> dbC',
        'prcA -> mon', 'prcB -> mon', 'prcC -> mon',
      ],
    ),
    simulation: {
      systems: [{ match: 'database', latencyMs: 25 }],
      tests: [
        {
          name: 'Payday peak',
          about: 'Employers and staff send 600 requests a second in total, spread over the tenants of the three cells. Every request is answered and the platform stays inside 3 vCores.',
          traffic: [
            { name: 'employers', from: 'web-app', rps: 200, to: { type: 'database', label: 'payroll' }, kind: 'write' },
            { name: 'payslips', from: 'mobile-app', rps: 400, to: { type: 'database', label: 'payroll' } },
          ],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], vCores: { max: 3 } },
        },
        {
          name: 'A schema change locks the cell A database',
          about: 'A database change goes wrong in cell A and its database stops for 30 minutes. Only the tenants in cell A are affected: about two requests in three are still answered, and the other cells do not slow down.',
          traffic: [
            { name: 'employers', from: 'web-app', rps: 200, to: { type: 'database', label: 'payroll' }, kind: 'write' },
            { name: 'payslips', from: 'mobile-app', rps: 400, to: { type: 'database', label: 'payroll' } },
          ],
          incidents: [{ down: { type: 'database', label: 'cell A' }, at: 5, forMin: 30 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.6, maxMs: 300 }] },
        },
      ],
    },
  },
  description: `
A payroll software company sells its service to about **900 employers**. Its Mule APIs, on CloudHub 2.0, serve the employer portal and the employee payslip app. Today there is one set of APIs and **one shared payroll database** for every tenant.

Two incidents in one quarter:
- A database schema change took a table lock for **40 minutes on payday**. Every employer was down.
- One large employer imported a year of history during the working day. The shared APIs slowed for everyone.

Facts:
- On payday the platform takes about **600 requests a second**: 200 from employers, 400 from staff checking payslips. In this model one vCore serves about 500 requests a second.
- The budget is **3 vCores**.
- Every request carries a tenant ID in its token. No request needs data from two employers.
- The board asks: "When something breaks, how many customers can it take down?" They want the answer to be "a third at most".

**Questions:**
- Draw a design where one failure can reach only part of the tenants.
- How does a request find the right part?
- How do you roll out a change, such as a schema change, with this design?
- What does the design cost, and what stays shared?
`,
  answerTemplate: `## Design

## Routing a request to its cell

## What a failure can reach

## Rolling out changes

## Costs and what stays shared
`,
  keyPoints: [
    'A cell is a full copy of the stack (APIs and database) that serves a fixed group of tenants. A failure inside a cell stays inside it.',
    'The blast radius is one cell. With three cells of equal size, one failure reaches about a third of the tenants.',
    'A thin router maps each tenant ID to its home cell, using a tenant directory it caches. It holds no business logic.',
    'Cells never call each other. Any line between cells would carry a failure from one cell to the next.',
    'Changes go out one cell at a time, so a bad schema change or release hits one cell, and you stop before the next.',
    'A big tenant can get a cell of its own, which also contains the noisy neighbour problem.',
    'The router and the tenant directory are shared by all cells, so keep them small, replicated and rarely changed.',
  ],
  solution: `
**Design**
\`\`\`
Employer portal ─┐
Payslip app     ─┴─► Tenant router ─► tenant directory (cached)
                         ├─► cell A: exp-payroll-api ─► prc-payroll-runs ─► payroll DB A
                         ├─► cell B: exp-payroll-api ─► prc-payroll-runs ─► payroll DB B
                         └─► cell C: exp-payroll-api ─► prc-payroll-runs ─► payroll DB C
\`\`\`

**Routing.** The router reads the tenant ID from the token and looks up the tenant's cell in the directory. It keeps the mapping in memory for 10 minutes, since tenants move rarely. Each cell is the same code, deployed with its own configuration and database. Tenants are placed so the cells carry about the same load, and the largest employers are spread across cells.

**What a failure can reach.** The cell A database stops: only cell A tenants see errors, about a third of the traffic. Cells B and C have their own threads and databases, so they do not slow down. A tenant that floods its cell slows only that cell, and a very large tenant can be moved to a cell of its own.

**Rolling out changes.** Every schema change and release goes to cell A first, then waits and watches the per-cell dashboards, then goes to B and C. A change that breaks cell A is stopped before it reaches the others. Payday changes are frozen in all cells.

**Costs and what stays shared.** Each cell needs about 200 requests a second, so 0.5 vCore for its Experience API and 0.5 for its Process API: 3 vCores in total, inside the budget. There are three databases to run, back up and migrate. The router and the tenant directory are shared, so they are kept small and replicated, and the router keeps working from its cached mapping if the directory is slow. Reports across all tenants read from a warehouse fed by every cell, never from the cells' databases at once.

**Moving a tenant.** Copy its data to the new cell, freeze its writes for a short window, switch its entry in the directory, then remove the old copy.
`,
  followUps: [
    {
      q: 'Why not one bigger database with high availability?',
      a: 'High availability protects against a server failing. It does not protect against a bad schema change, a lock or a runaway query, which hit every tenant at once in a shared database.',
    },
    {
      q: 'What if the router itself fails?',
      a: 'Then every cell is unreachable, so the router is the one shared part to protect. Run several replicas, keep its logic tiny and change it rarely.',
    },
    {
      q: 'How many cells should there be?',
      a: 'Enough that losing one is acceptable to the business, and few enough to operate. Three meets the board\'s "a third at most". More cells shrink the blast radius but add databases and deployments.',
    },
  ],
}
