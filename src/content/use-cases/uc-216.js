import { diagram } from '../../arch/dsl.js'

const tills = { name: 'till writes', from: 'pos', rps: 150, to: 'sql-server', kind: 'write' }
const pulls = { name: 'platform pulls', from: 'partner', rps: 40, to: 'sql-server' }

export default {
  id: 'uc-216',
  category: 'use-cases',
  title: 'The Planning Platform\'s Extract Pulls Must Not Starve the Tills: One SQL Server Behind One System API, a Rate Limit on the Platform\'s Own Experience API, Retries for Deadlocks and Replicas for a Zone Outage',
  level: 'ADVANCED',
  tags: ['myproject', 'sql-server', 'rate-limit', 'capacity', 'retry', 'replicas', 'planning', 'api-led'],
  estMinutes: 45,
  diagram: {
    task: 'draw the store tills calling a tills Experience API and the planning platform calling its own extract Experience API. Both Experience APIs call one retail System API, which is the only box that reaches SQL Server.',
    checks: [
      { label: 'The tills and the platform come in through different Experience APIs', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'The platform reaches SQL Server through an Experience API and the System API', rule: { type: 'path', from: 'partner', via: 'experience-api', to: 'sql-server' } },
      { label: 'The tills reach SQL Server through the System API', rule: { type: 'path', from: 'pos', via: 'system-api', to: 'sql-server' } },
      { label: 'SQL Server is reached only through the System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'The platform never reaches the tills\' Experience API', rule: { type: 'no-edge', from: 'partner', to: { type: 'experience-api', label: 'till' } } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store tills'],
        expT: ['experience-api', 'exp-till-sales', { replicas: 2, vCores: '0.5' }],
        plat: ['partner', 'Planning platform'],
        expP: ['experience-api', 'exp-planning-extract', { rateLimit: 100 }],
        sys: ['system-api', 'sys-retail-sql', { replicas: 2, vCores: '1', retries: 2 }],
        sql: ['sql-server', 'Retail SQL Server'],
      },
      ['pos -> expT', 'expT -> sys', 'plat -> expP', 'expP -> sys', 'sys -> sql'],
    ),
    simulation: {
      systems: [{ match: 'sql-server', latencyMs: 40, maxRps: 300 }],
      tests: [
        {
          name: 'A normal evening',
          about: 'The tills write 150 sales a second and the platform pulls 40 pages a second. Both are served.',
          traffic: [tills, pulls],
          durationMin: 30,
          expect: { answers: [{ flow: 'till writes', minSuccess: 0.99 }, { flow: 'platform pulls', minSuccess: 0.99 }] },
        },
        {
          name: 'The platform pulls with forty threads',
          about: 'A new platform release pulls 400 pages a second. The platform is held to its share and told to slow down, the tills are still served, and SQL Server never gets more than it can take.',
          traffic: [tills, { ...pulls, rps: 400 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'till writes', minSuccess: 0.99 }, { flow: 'platform pulls', minLimited: 0.5 }], peakRps: [{ node: 'sql-server', max: 300 }] },
        },
        {
          name: 'Deadlocks at closing time',
          about: 'The end of day job runs while the tills write. One statement in twenty is a deadlock victim for 20 minutes and works when tried again.',
          traffic: [tills],
          incidents: [{ errors: 'sql-server', rate: 0.05, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'A zone fails in the evening',
          about: 'One availability zone goes down for 15 minutes. The replicas in the other zone serve every till.',
          traffic: [tills, pulls],
          incidents: [{ zone: true, at: 5, forMin: 15 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'till writes', minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, keeps sales and stock in one **SQL Server**. Two kinds of caller reach it through Mule:
- The **store tills** write each sale as it happens. A till that cannot write queues sales locally and the store manager is called.
- The **planning platform** pulls stock and sales pages through an extract API, all evening.

Last month a platform release started pulling with forty threads instead of four. SQL Server ran at its limit, till writes slowed and failed, and 90 stores ran on local queues for an hour.

**Numbers**
- Tills: about **150 writes a second** in the evening.
- Platform: about **40 page reads a second**; the new release can send **400**. The platform team agrees that 100 a second is its fair share.
- SQL Server takes about **300 statements a second** before it slows down.
- At closing time **1 statement in 20** is a deadlock victim for up to 20 minutes, and works when tried again.
- In this model one vCore serves about 500 requests a second, and an availability zone can fail.

**Questions:**
- Draw the design.
- Where does the rate limit go, and why not on the System API?
- What does the platform see when it is over its share, and what should it do?
- Set the rate limit, the retries, the replicas and the vCores, and say on which box each goes.
`,
  answerTemplate: `## Design

## The rate limit

## What the platform sees

## Settings
`,
  keyPoints: [
    'Give each kind of caller its own Experience API. Then a limit can be put on one caller without touching the other.',
    'A rate limit on the System API would cut the tills too. On the platform\'s Experience API it caps only the platform, at 100 a second.',
    'Over the limit the platform gets 429 Too Many Requests. It should wait and try again, ideally after the time the answer suggests; keyset paging lets it carry on where it stopped.',
    '150 till writes plus 100 platform reads stay under the 300 SQL Server takes. Without the limit, 400 platform reads alone would be over it.',
    'Retry deadlock victims in the System API, close to the database. Two replicas of each API carry the evening through a zone outage.',
  ],
  solution: `
**Design**
\`\`\`
Store tills ─► exp-till-sales ─► sys-retail-sql ─► Retail SQL Server
Planning platform ─► exp-planning-extract ─► sys-retail-sql
\`\`\`

**Settings.** \`exp-planning-extract\`: rate limit 100 a second. \`exp-till-sales\`: 2 replicas of 0.5 vCore. \`sys-retail-sql\`: 2 replicas of 1 vCore, 2 retries for deadlock victims.

**Another lever.** Point the platform's reads at a readable secondary or a reporting copy, if the tables allow a few minutes of delay. The rate limit is still useful there.
`,
  followUps: [
    {
      q: 'The platform says 429 broke its nightly run. What do you agree with them?',
      a: 'The limit, what 429 means, and how to back off: wait the Retry-After time and resume from the last cursor. A limit is a contract, so write it in the interface agreement.',
    },
    {
      q: 'Could a client ID policy with SLA tiers do the same?',
      a: 'Yes, in API Manager the rate limit can be tied to the client\'s contract, so a second platform environment gets its own lower tier without a new Experience API.',
    },
  ],
}
