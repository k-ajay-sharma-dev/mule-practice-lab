import { diagram } from '../../arch/dsl.js'

const bookings = { name: 'bookings', from: 'web-app', rps: 120, to: 'database', kind: 'write' }
const office = { name: 'back office', from: 'internal-app', rps: 60, to: 'data-warehouse' }

export default {
  id: 'ar-168',
  category: 'architecture',
  title: 'A Ferry Operator Must Keep Taking Bookings Through a Cloud Region Outage on a 3.5 vCore Budget: Two Regions Where Customers Are, One Region Where Staff Can Wait',
  level: 'EXPERT',
  tags: ['multi-region', 'active-active', 'cost', 'criticality', 'sizing', 'travel'],
  estMinutes: 50,
  diagram: {
    task: 'draw the booking website calling a booking Experience API, then a booking Process API, then a System API in front of the booking database. Draw the back office app calling its own Experience API, which reads the data warehouse through a System API.',
    checks: [
      { label: 'The booking website calls an Experience API', rule: { type: 'edge', from: 'web-app', to: 'experience-api' } },
      { label: 'The back office app calls an Experience API', rule: { type: 'edge', from: 'internal-app', to: 'experience-api' } },
      { label: 'Each channel has its own Experience API', rule: { type: 'each', of: 'experience-api', edgeFrom: ['web-app', 'internal-app'], max: 1 } },
      { label: 'Bookings go through a Process API to the booking database', rule: { type: 'path', from: 'web-app', via: 'process-api', to: 'database' } },
      { label: 'The booking database is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'The data warehouse is reached only through a System API', rule: { type: 'only-via', target: 'data-warehouse', from: 'system-api' } },
      { label: 'The back office never shares a box with the booking path', rule: { type: 'no-path', from: 'internal-app', to: 'database' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Booking website'],
        office: ['internal-app', 'Back office app'],
        expB: ['experience-api', 'exp-bookings', { vCores: '0.5', regions: '2' }],
        prc: ['process-api', 'prc-bookings', { vCores: '0.5', regions: '2' }],
        sysB: ['system-api', 'sys-bookings', { vCores: '0.5', regions: '2' }],
        db: ['database', 'Booking database'],
        expO: ['experience-api', 'exp-back-office', { vCores: '0.2' }],
        sysW: ['system-api', 'sys-warehouse', { vCores: '0.2' }],
        dw: ['data-warehouse', 'Data warehouse'],
      },
      ['web -> expB', 'expB -> prc', 'prc -> sysB', 'sysB -> db', 'office -> expO', 'expO -> sysW', 'sysW -> dw'],
    ),
    simulation: {
      systems: [
        { match: 'database', latencyMs: 40, regions: 2 },
        { match: 'data-warehouse', latencyMs: 300, regions: 1 },
      ],
      tests: [
        {
          name: 'Summer peak',
          about: 'Customers make 120 bookings a second while staff run 60 back office queries a second. Everything is answered, and the estate stays within 3.5 vCores.',
          traffic: [bookings, office],
          durationMin: 30,
          expect: { answers: [{ flow: 'bookings', minSuccess: 0.99, maxMs: 400 }, { flow: 'back office', minSuccess: 0.99 }], vCores: { max: 3.5 } },
        },
        {
          name: 'A cloud region goes down',
          about: 'The primary region has an outage for 30 minutes at the summer peak. Customers go on booking through the other region. Back office queries wait until the region is back.',
          traffic: [bookings, office],
          incidents: [{ region: true, at: 5, forMin: 30 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'bookings', minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
A ferry operator sells crossings through its **booking website**. Last summer its cloud provider lost a region for 40 minutes on a Saturday, and the operator lost a day's worth of bookings to a competitor.

The board wants bookings to **survive a whole region going down**. The **booking database** is already replicated to a second region by the database team. The finance director has set a budget of **3.5 vCores** for the Mule estate.

The estate also has a **back office app**, used by staff for reports from the **data warehouse**. The warehouse runs in one region only.

**Numbers**
- Bookings: about **120 a second** at the summer peak.
- Back office queries: about **60 a second** in office hours.
- In this model one vCore serves about 500 simple requests a second, and running an API in two regions doubles its vCores.

**Questions:**
- Draw the design.
- Which parts need to run in two regions, and which do not? Why?
- How must the two-region parts be sized, given that a region outage leaves half the capacity?
- How does the design fit the budget?
`,
  answerTemplate: `## Design

## What runs in two regions

## Sizing for a region outage

## The budget
`,
  keyPoints: [
    'Not every part of an estate needs the same availability. Decide per path from what an outage costs: lost bookings cost money, delayed staff reports do not.',
    'A path is only as available as its least available part. The booking path runs in two regions, and so does the booking database it depends on.',
    'Running the back office in two regions would not help: the warehouse it reads is in one region. It would only spend vCores.',
    'In active-active, each region must carry the whole peak alone during an outage. 120 bookings a second need more than 0.2 vCore per API in each region.',
    'Three booking APIs at 0.5 vCore in two regions is 3 vCores. The back office at 0.2 vCore twice is 0.4. That fits 3.5; two regions for everything would not.',
  ],
  solution: `
**Design**
\`\`\`
Booking website ─► exp-bookings ─► prc-bookings ─► sys-bookings ─► Booking database        (2 regions)
Back office app ─► exp-back-office ─► sys-warehouse ─► Data warehouse                       (1 region)
\`\`\`

**What runs in two regions.** \`exp-bookings\`, \`prc-bookings\` and \`sys-bookings\` run in both regions, active-active, behind a global load balancer. The booking database replicates between the regions. The back office runs in one region, next to the warehouse. During a region outage staff wait; customers do not.

**Sizing for a region outage.** Each region must take all 120 bookings a second on its own. At 0.5 vCore an API takes about 250 a second in this model, so one region is enough, with room for a spike. At 0.2 vCore it would take about 100 and drop a fifth of the bookings during an outage.

**The budget.** Booking path: 3 APIs × 0.5 vCore × 2 regions = 3 vCores. Back office: 2 APIs × 0.2 vCore = 0.4. Total 3.4 vCores. Putting the back office in two regions as well would make it 3.8, over budget, for no gain.

**What the database team must confirm.** How it fails over, how much recent data can be lost in a failover, and whether both regions can write at once. If only one region can write, the booking System API in the other region must send writes there until a failover.
`,
  followUps: [
    {
      q: 'Payments go through a provider that is in one region. Does that break the design?',
      a: 'Ask the provider: most large payment providers run in several regions behind one address. If one does not, take the payment after the booking, through a queue, so a provider outage delays payment capture but not bookings.',
    },
    {
      q: 'Could the booking path run active-passive instead, to save money?',
      a: 'Yes: a smaller warm standby in the second region, scaled up during an outage. It costs less, but the scale-up takes minutes, and a standby nobody uses tends to fail on the day. Test the failover regularly if you choose it.',
    },
  ],
}
