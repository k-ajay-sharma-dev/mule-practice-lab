import { diagram } from '../../arch/dsl.js'

const north = { type: 'saas', label: 'north' }
const central = { type: 'saas', label: 'central' }
const south = { type: 'saas', label: 'south' }
const searches = { name: 'slot searches', from: 'web-app', rps: 100, to: [north, central, south] }
const finder = { type: 'process-api', label: 'slot' }

export default {
  id: 'uc-144',
  category: 'use-cases',
  title: 'A Vaccination Slot Finder Over Three Health Boards: Ask All Three at Once, Show What Comes Back Within Two Seconds, and Leave Out a Board That Is Down',
  level: 'INTERMEDIATE',
  tags: ['scatter-gather', 'parallel-calls', 'partial-response', 'timeouts', 'healthcare', 'public-sector'],
  estMinutes: 30,
  diagram: {
    task: 'draw the public booking website calling an Experience API, which calls a slot finder Process API. The Process API asks the booking systems of the north, central and south health boards, each through its own System API.',
    checks: [
      { label: 'The website calls an Experience API', rule: { type: 'edge', from: 'web-app', to: 'experience-api' } },
      { label: 'The Experience API calls the slot finder Process API', rule: { type: 'edge', from: 'experience-api', to: finder } },
      { label: 'The slot finder calls three System APIs', rule: { type: 'each', of: finder, edgeTo: 'system-api', count: 3 } },
      { label: 'Each board\'s booking system is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Each System API calls one booking system', rule: { type: 'each', of: 'system-api', edgeTo: 'saas', count: 1, max: 1 } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Public booking website'],
        exp: ['experience-api', 'exp-vaccine-booking', { vCores: '0.2' }],
        prc: ['process-api', 'prc-slot-finder', { vCores: '0.2', calls: 'in parallel', timeoutMs: 1500, onFailure: 'partial answer' }],
        sysN: ['system-api', 'sys-north-bookings', { vCores: '0.2' }],
        sysC: ['system-api', 'sys-central-bookings', { vCores: '0.2' }],
        sysS: ['system-api', 'sys-south-bookings', { vCores: '0.2' }],
        n: ['saas', 'North health board bookings'],
        c: ['saas', 'Central health board bookings'],
        s: ['saas', 'South health board bookings'],
      },
      ['web -> exp', 'exp -> prc', 'prc -> sysN', 'prc -> sysC', 'prc -> sysS', 'sysN -> n', 'sysC -> c', 'sysS -> s'],
    ),
    simulation: {
      systems: [
        { match: north, latencyMs: 400 },
        { match: central, latencyMs: 600 },
        { match: south, latencyMs: 800 },
      ],
      tests: [
        {
          name: 'Booking opens for a new age group',
          about: 'People search for slots 100 times a second. Each search gets the slots of all three boards in about a second.',
          traffic: [searches],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1200, maxDegraded: 0.01 }] },
        },
        {
          name: 'The south board\'s system hangs',
          about: 'The south board\'s booking system stops answering for 10 minutes. Searches still show the north and central slots within two seconds, with a note that the south is missing.',
          traffic: [searches],
          incidents: [{ hang: south, at: 3, forMin: 10 }],
          durationMin: 15,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 2000, minDegraded: 0.5 }] },
        },
      ],
    },
  },
  description: `
A country runs one **public booking website** for vaccinations. The slots are held by three regional health boards, each with its own **booking system**: north, central and south. A person may book at any clinic, so a search must show the slots of all three.

Today Mule asks the three boards one after another. A search takes nearly two seconds on a good day, and when one board's system hangs, every search hangs with it. On the day a new age group was invited, the website showed errors for an hour because the south board's system was slow.

**Numbers**
- About **100 searches a second** when a new age group is invited.
- The north board answers in about 400 ms, central in about 600 ms, south in about 800 ms.
- The rule from the programme: a search answers within **two seconds**, always, with whatever slots it has.

**Questions:**
- Draw the design.
- How do you bring a search down to about a second?
- What should a search show when one board is down or hanging?
- What does each System API hide?
`,
  answerTemplate: `## Design

## Asking all three at once

## A board that is down

## The System APIs
`,
  keyPoints: [
    'Ask the three boards in parallel, for example with Scatter-Gather. The search then takes as long as the slowest board, not the sum of all three.',
    'Give each call a timeout under the budget, here 1.5 seconds, so a hanging board cannot hold the search.',
    'Answer with the slots that came back and say which board is missing. Slots from two boards are far better than an error.',
    'Each board\'s System API hides that board\'s system: its API, its codes for clinics and vaccines, its credentials. The Process API sees one shape.',
    'Size for the threads: each search holds a thread in each API while it waits.',
  ],
  solution: `
**Design**
\`\`\`
Public booking website ─► exp-vaccine-booking ─► prc-slot-finder ─┬► sys-north-bookings ─► North board
                                                                  ├► sys-central-bookings ─► Central board
                                                                  └► sys-south-bookings ─► South board
\`\`\`

**Asking all three at once.** \`prc-slot-finder\` uses Scatter-Gather with one route per board. A search takes about 800 ms, the time of the south board, instead of 1.8 seconds.

**A board that is down.** Each route has a 1.5 second timeout and its own error handling, so a failed or late route gives an empty list and a flag such as \`{ "board": "south", "available": false }\`. The website shows "slots from the south are not available right now, please try again later". In Mule 4 a failed route makes Scatter-Gather raise an error once all routes finish, so put a Try with On Error Continue inside each route.

**Sizing.** 100 searches a second, each held for up to a second, is more than the smallest size in this model, so each API gets 0.2 vCore.
`,
  followUps: [
    {
      q: 'Could the slots be cached to take load off the boards?',
      a: 'For a few seconds at most: slots are booked fast on a busy day, and a cached slot that is gone frustrates people. A short cache helps most when the same search is repeated many times a second.',
    },
    {
      q: 'Who stops two people booking the same slot?',
      a: 'The board\'s booking system, when the booking is made. The finder only shows what looks free; the booking call must expect a "slot taken" answer and offer the next one.',
    },
  ],
}
