import { diagram } from '../../arch/dsl.js'

const searches = { name: 'timetable searches', from: 'mobile-app', rps: 150, to: 'database' }
const bookings = { name: 'bookings', from: 'mobile-app', rps: 20, to: 'legacy', kind: 'write' }

export default {
  id: 'ar-145',
  category: 'architecture',
  title: 'Strangling an Old Booking System One Feature at a Time: a Gateway That Routes by Path',
  level: 'BEGINNER',
  tags: ['strangler-fig', 'migration', 'api-gateway', 'legacy', 'api-led', 'travel'],
  estMinutes: 20,
  diagram: {
    task: 'draw the first step of the migration: the ferry app calls an API gateway, the gateway sends timetable searches to a new Experience API and everything else to the old booking system, and the new Experience API reads timetables through a System API from the timetable database.',
    checks: [
      { label: 'The app calls the API gateway', rule: { type: 'edge', from: 'mobile-app', to: 'api-gateway' } },
      { label: 'The app never calls the old booking system directly', rule: { type: 'no-edge', from: 'mobile-app', to: 'legacy' } },
      { label: 'The gateway still sends the features not yet moved to the old booking system', rule: { type: 'edge', from: 'api-gateway', to: 'legacy' } },
      { label: 'The gateway sends timetable searches to the new Experience API', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api' } },
      { label: 'The new Experience API never calls the old booking system', rule: { type: 'no-path', from: 'experience-api', to: 'legacy' } },
      { label: 'Timetables are read through a System API from the timetable database', rule: { type: 'path', from: 'experience-api', via: 'system-api', to: { type: 'database', label: 'timetable' } } },
      { label: 'Every line is a sync call, because the app waits for each answer', rule: { type: 'lines', touching: ['api-gateway', 'experience-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Ferry booking app'],
        gw: ['api-gateway', 'API gateway (routes by path)'],
        old: ['legacy', 'Old booking system'],
        exp: ['experience-api', 'exp-timetables', { vCores: '0.5' }],
        sys: ['system-api', 'sys-timetables', { vCores: '0.5' }],
        db: ['database', 'Timetable database'],
      },
      ['app -> gw', 'gw -> old', 'gw -> exp', 'exp -> sys', 'sys -> db'],
    ),
    simulation: {
      systems: [
        { match: 'legacy', latencyMs: 400, maxRps: 60 },
        { match: 'database', latencyMs: 10 },
      ],
      tests: [
        {
          name: 'Friday evening',
          about: 'Travellers search timetables 150 times a second and make 20 bookings a second. Searches are answered by the new APIs, and the old booking system only sees bookings.',
          traffic: [searches, bookings],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }, { flow: 'timetable searches', maxMs: 300 }], notReached: [{ flow: 'timetable searches', node: 'legacy' }] },
        },
        {
          name: 'The old booking system is down for a release',
          about: 'The old system is stopped for 30 minutes to deploy a fix. Bookings wait, but timetable searches go on as normal.',
          traffic: [searches, bookings],
          incidents: [{ down: 'legacy', at: 5, forMin: 30 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'timetable searches', minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
A ferry company sells crossings through a mobile app. Behind the app is one **old booking system** written 15 years ago. It does everything: timetables, prices, bookings, check-in. It can serve about **60 requests a second** before it slows down, and every release means stopping it for half an hour.

Most of its load is people looking at timetables: about **150 searches a second** on a Friday evening, against about **20 bookings a second**. The team wants to move off the old system, but rewriting it all at once is too risky.

The plan is to move one feature at a time. Timetables go first: they are already copied every night into a new **timetable database**.

An **API gateway** can route requests by path: \`/timetables/*\` to one place and everything else to another.

**Questions:**
- Draw the first step: timetables on new APIs, everything else still on the old system.
- How does the app keep working without knowing what has moved?
- What happens to timetable searches during a release of the old system?
- What is the next step, and when is the old system switched off?
`,
  answerTemplate: `## Design

## Routing in the gateway

## During a release

## The next steps
`,
  keyPoints: [
    'The strangler pattern moves a system piece by piece. New features grow around the old system until nothing is left in it.',
    'A gateway in front of both hides the move from the app. The app keeps calling the same addresses.',
    'Route by path: moved features to the new APIs, everything else to the old system.',
    'The new APIs must not call back into the old system, or its limits and outages still reach them.',
    'Move the busiest read-only feature first. It takes the most load off the old system and changes no data.',
    'Each step can be reversed by changing a route in the gateway.',
  ],
  solution: `
**Design**
\`\`\`
Ferry app ─► API gateway ─┬─► Old booking system          (bookings, prices, check-in)
                          └─► exp-timetables ─► sys-timetables ─► Timetable database
\`\`\`

**Routing in the gateway.** \`/timetables/*\` goes to \`exp-timetables\`. Every other path goes to the old booking system as before. The app's addresses do not change, so no app release is needed. If the new APIs misbehave, one route change sends timetables back to the old system.

**Load.** The old system drops from about 170 requests a second to about 20, well inside its 60. The new APIs carry 150 searches a second, so each needs more than the smallest size: half a vCore each in this model.

**During a release.** Bookings still stop while the old system is down. Timetable searches do not touch it any more, so travellers can still plan their crossing.

**The next steps.** Prices next, then check-in, then bookings, each with its own route in the gateway and its own APIs. When the gateway sends nothing to the old system for a full season, it is switched off.
`,
  followUps: [
    {
      q: 'The timetable database is filled every night from the old system. Is that a problem?',
      a: 'Only if timetables change during the day. If they do, have the old system send a change event, or move timetable editing to the new side next, so the new database becomes the source.',
    },
    {
      q: 'Why not route in the app instead of a gateway?',
      a: 'Every routing change would need an app release, and old app versions stay in use for months. The gateway changes in minutes and covers every version.',
    },
  ],
}
