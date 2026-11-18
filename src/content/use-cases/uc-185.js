import { diagram } from '../../arch/dsl.js'

const planning = { name: 'planning pulls', from: 'saas', rps: 180, to: 'sql-server', kind: 'read' }
const reports = { name: 'store reports', from: 'internal-app', rps: 40, to: 'sql-server', kind: 'read' }

export default {
  id: 'uc-185',
  category: 'use-cases',
  title: 'A SQL Server Extract API Sized for the 02:00 Peak: Enough vCores for the Planning Platform\'s Pulls, a Second Replica for a Zone Outage, and a Cost Cap',
  level: 'ADVANCED',
  tags: ['myproject', 'sql-server', 'sizing', 'vcores', 'replicas', 'availability', 'planning'],
  estMinutes: 45,
  diagram: {
    task: 'draw the planning platform and the store reports app calling an extract Experience API, which reads through a retail extract System API in front of SQL Server. Size both APIs.',
    checks: [
      { label: 'The planning platform reaches SQL Server through the APIs', rule: { type: 'path', from: 'saas', to: 'sql-server' } },
      { label: 'The reports app reaches SQL Server through the APIs', rule: { type: 'path', from: 'internal-app', to: 'sql-server' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'Callers come in through an Experience API', rule: { type: 'edge', from: 'saas', to: 'experience-api' } },
    ],
    reference: diagram(
      {
        plat: ['saas', 'Planning platform'],
        rep: ['internal-app', 'Store reports app'],
        exp: ['experience-api', 'exp-retail-extract', { replicas: 2, vCores: '0.5' }],
        sys: ['system-api', 'sys-retail-extract', { replicas: 2, vCores: '0.5' }],
        sql: ['sql-server', 'Retail SQL Server'],
      },
      ['plat -> exp', 'rep -> exp', 'exp -> sys', 'sys -> sql'],
    ),
    simulation: {
      systems: [{ match: 'sql-server', latencyMs: 120 }],
      tests: [
        {
          name: 'The 02:00 peak',
          about: 'The planning platform pulls about 180 pages a second and store reports about 40. Every call is answered, and the APIs stay within 2 vCores in all.',
          traffic: [planning, reports],
          durationMin: 30,
          expect: { answers: [{ flow: 'planning pulls', minSuccess: 0.99 }, { flow: 'store reports', minSuccess: 0.99 }], vCores: { max: 2 } },
        },
        {
          name: 'A zone fails at 02:00',
          about: 'An availability zone is down for 20 minutes during the peak. The replicas in the other zone carry every call.',
          traffic: [planning, reports],
          incidents: [{ zone: true, at: 5, forMin: 20 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'planning pulls', minSuccess: 0.99 }, { flow: 'store reports', minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, lets the planning platform pull items, stores and stock from the retail **SQL Server** through APIs, page by page. Store managers' reports read the same data.

The APIs were set up with the smallest size and one replica each. At 02:00, when the platform starts its pulls, about half the calls were refused, and the platform's run started late.

**Numbers**
- At 02:00, about **180 pages a second** from the planning platform and **40 a second** from reports, for half an hour.
- Each page query takes about 120 ms on SQL Server.
- In this model one vCore serves about **500 requests a second**; sizes are 0.1, 0.2, 0.5, 1, 2 and 4 vCores per replica. A zone outage takes one replica of each API away.
- Budget: **2 vCores** in all for the two APIs.
- Last year a zone failed for 20 minutes during the night.

**Questions:**
- Draw the design.
- Size each API: replicas and vCores. Show the sums.
- Why two replicas, and not one bigger one?
- What would you ask the DBA about the 02:00 load?
`,
  answerTemplate: `## Design

## Sizes

## Two replicas

## The DBA
`,
  keyPoints: [
    'Both APIs carry about 220 calls a second at the peak. The smallest size, 0.1 vCore, serves about 50.',
    'Two replicas of 0.5 vCore serve about 500 a second together, and about 250 with one zone down: still above 220.',
    'One replica of 1 vCore costs the same and serves the peak, but a zone outage takes the whole API away.',
    'Two replicas of 0.5 on each API is 2 vCores, the budget. Two of 1 vCore would be 4.',
    'Ask the DBA whether 220 page queries a second fit beside the night jobs, and whether a read replica should carry them.',
  ],
  solution: `
**Design**
\`\`\`
Planning platform ─► exp-retail-extract ─► sys-retail-extract ─► Retail SQL Server
Store reports app ─►
\`\`\`

**Sizes.** Each API: 2 replicas of 0.5 vCore. 2 × 0.5 × 500 = 500 a second; with one zone down, 250. In all, 2 vCores.

**Paging.** Keyset paging (WHERE id > last ORDER BY id) keeps each page query quick on large tables, where OFFSET gets slower page by page.

**Rate limit.** A limit for the platform's client ID on the Experience API keeps a runaway pull from taking the reports' share.
`,
  followUps: [
    {
      q: 'The platform doubles its pulls next year. What changes?',
      a: 'About 400 calls a second needs about 1,000 of capacity to survive a zone: 2 replicas of 1 vCore on each API, 4 vCores in all. Or move the pull to nightly files and keep the API for small reads.',
    },
    {
      q: 'Why not cache the pages?',
      a: 'Stock changes all day and each page is read once a night, so a cache would rarely be hit. Caching suits small lists read often, like the store list for reports.',
    },
  ],
}
