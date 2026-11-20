import { diagram } from '../../arch/dsl.js'

const lookups = { name: 'stock lookups', from: 'internal-app', rps: 40, to: 'oracle-db' }

export default {
  id: 'uc-187',
  category: 'use-cases',
  title: 'Store Stock Lookups From Oracle: an Experience API, an Oracle System API, and Retries for the Seconds When Oracle Fails Over',
  level: 'BEGINNER',
  tags: ['myproject', 'oracle', 'system-api', 'retries', 'api-led', 'stores'],
  estMinutes: 25,
  diagram: {
    task: 'draw the store handheld app calling a stock Experience API. It calls an Oracle System API, which is the only box that reads the stock tables in the Oracle database.',
    checks: [
      { label: 'The store app calls an Experience API', rule: { type: 'edge', from: 'internal-app', to: 'experience-api' } },
      { label: 'The Experience API calls a System API', rule: { type: 'edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
      { label: 'The store app never calls Oracle or the System API directly', rule: { type: 'no-edge', from: 'internal-app', to: ['oracle-db', 'system-api'] } },
    ],
    reference: diagram(
      {
        app: ['internal-app', 'Store handheld app'],
        exp: ['experience-api', 'exp-store-stock'],
        sys: ['system-api', 'sys-stock-oracle', { retries: 2 }],
        ora: ['oracle-db', 'Stock Oracle database'],
      },
      ['app -> exp', 'exp -> sys', 'sys -> ora'],
    ),
    simulation: {
      systems: [{ match: 'oracle-db', latencyMs: 40 }],
      tests: [
        {
          name: 'A normal trading day',
          about: 'About 40 lookups a second. Every one is answered, in well under a second.',
          traffic: [lookups],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 500 }] },
        },
        {
          name: 'Oracle fails over',
          about: 'For five minutes while Oracle moves to its standby, one call in five fails with a lost connection. A retry gets through, so nearly every lookup is still answered.',
          traffic: [lookups],
          incidents: [{ errors: 'oracle-db', rate: 0.2, at: 2, forMin: 5 }],
          durationMin: 10,
          expect: { answers: [{ minSuccess: 0.98 }] },
        },
      ],
    },
  },
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, gives store staff a handheld app to look up stock: how many of an item the store has, and how many the nearest stores have. Stock lives in an **Oracle database**.

The first version let the app run SQL against Oracle with a shared account. The DBA team wants that gone: one account, used by one API, with the queries they can see and tune.

Oracle runs with a standby. When it fails over (for patching, about once a month) connections drop for a few minutes, and about **one call in five** fails during that time. Each try fails or works on its own, so a second try usually works, but not always.

**Numbers**
- About **40 lookups a second** in trading hours.
- Oracle answers in about 40 ms.
- Lookups must answer in under half a second.
- Even during a failover, at least **98 in 100 lookups** must be answered. Work out how many retries that needs.

**Questions:**
- Draw the design.
- Why only one System API in front of Oracle?
- What should the System API do when a call fails during a failover?
- What must be true of a call before you retry it?
`,
  answerTemplate: `## Design

## One way into Oracle

## Failover

## Safe to retry
`,
  keyPoints: [
    'The System API is the only holder of the Oracle account and the SQL. The DBA team tunes one set of queries, and the store app never needs Oracle drivers or passwords.',
    'The Experience API shapes the answer for the handheld; the System API speaks Oracle. Another channel can reuse the System API later.',
    'A failover drops connections for a short time. Two retries in the System API turn most of those failures into slower answers.',
    'Retry only what is safe to repeat. A read is. A write needs a key or a check so a retry cannot apply it twice.',
    'The connection pool should test connections before use (or on error) so dead ones from before the failover are thrown away.',
  ],
  solution: `
**Design**
\`\`\`
Store handheld app ─► exp-store-stock ─► sys-stock-oracle ─► Oracle
\`\`\`

**Settings.** \`sys-stock-oracle\`: 2 retries on Oracle calls, with a short wait between them. With one try in five failing, one retry still loses 1 in 25 lookups (96 percent answered). Two retries lose about 1 in 125 (over 99 percent). In Mule that is an Until Successful around the Database Select, or the connection's reconnection strategy for lost connections.

**Why not retry in the Experience API too?** Retries at two layers multiply: 3 tries times 3 tries is 9 calls to Oracle for one lookup. Retry once, close to the system.
`,
  followUps: [
    {
      q: 'Oracle fails over for 20 minutes instead of a few. Do more retries help?',
      a: 'No. Retries cover short failures. For a long outage the API should fail fast with a clear message, and the app should say stock cannot be checked right now.',
    },
    {
      q: 'Where does the connection pool size come from?',
      a: 'From the lookup rate times the query time: 40 a second at 40 ms needs about 2 connections busy on average. A pool of 5 to 10 leaves room, and the DBA team can see the limit.',
    },
  ],
}
