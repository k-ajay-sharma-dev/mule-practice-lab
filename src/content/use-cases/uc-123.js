import { diagram } from '../../arch/dsl.js'

const sensors = { name: 'bay events', from: 'saas', rps: 60, to: { type: 'database', label: 'occupancy' }, kind: 'write' }
const app = { name: 'city app', from: 'mobile-app', rps: 200, to: { type: 'database', label: 'occupancy' } }
const partners = { name: 'navigation partners', from: 'partner', rps: 100, to: { type: 'database', label: 'occupancy' } }

export default {
  id: 'uc-123',
  category: 'use-cases',
  title: 'Free Parking Spaces for a City App and Navigation Partners: Sensor Events In, Counts Out, the Vendor API Left Alone',
  level: 'INTERMEDIATE',
  tags: ['iot', 'caching', 'rate-limiting', 'read-models', 'partners', 'public-sector'],
  estMinutes: 35,
  diagram: {
    task: 'draw the parking availability service: the sensor vendor\'s IoT platform sending bay events to an Experience API, a queue, an occupancy Process API that keeps the counts in an occupancy database, and the read side: the city app and the navigation partners, each through its own Experience API (partners through the API gateway), a shared availability Process API with a cache in front of the occupancy database.',
    checks: [
      { label: 'The IoT platform sends bay events to an Experience API', rule: { type: 'edge', from: 'saas', to: 'experience-api' } },
      { label: 'Bay events are queued before they are counted', rule: { type: 'path', from: 'experience-api', via: 'queue', to: { type: 'database', label: 'occupancy' } } },
      { label: 'The counts live in an occupancy database', rule: { type: 'edge', from: 'process-api', to: { type: 'database', label: 'occupancy' } } },
      { label: 'No app or partner request reaches the IoT platform', rule: { type: 'no-path', from: ['mobile-app', 'partner'], to: 'saas' } },
      { label: 'Partners come in through the API gateway', rule: { type: 'path', from: 'partner', via: 'api-gateway', to: 'experience-api' } },
      { label: 'No gateway is shared by the city app and the partners, so a partner flood cannot use up the app\'s limit', rule: { type: 'each', of: 'api-gateway', edgeFrom: ['mobile-app', 'partner'], max: 1 } },
      { label: 'The city app and the partners each have their own Experience API', rule: { type: 'each', of: ['mobile-app', 'partner'], min: 2, edgeTo: ['experience-api', 'api-gateway'], max: 1 } },
      { label: 'One availability Process API serves both channels', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'The availability Process API reads through a cache', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: 'queue', kind: 'async' } },
    ],
    reference: diagram(
      {
        iot: ['saas', 'Bay sensor IoT platform (vendor)'],
        expS: ['experience-api', 'exp-sensor-events', { vCores: '0.2' }],
        q: ['queue', 'bay-events', { maxRedelivery: 20 }],
        dlq: ['dlq', 'bay-events DLQ'],
        occ: ['process-api', 'prc-occupancy', { vCores: '0.2' }],
        db: ['database', 'Occupancy database (counts per car park)'],
        app: ['mobile-app', 'City parking app'],
        expA: ['experience-api', 'exp-city-app-parking', { vCores: '0.5' }],
        nav: ['partner', 'Navigation partners'],
        gw: ['api-gateway', 'API gateway (client ID, rate limit)', { auth: 'client-id', rateLimit: 150 }],
        expP: ['experience-api', 'exp-partner-parking-api', { vCores: '0.5' }],
        avl: ['process-api', 'prc-parking-availability', { vCores: '1' }],
        cache: ['cache', 'Availability cache (30 seconds)', { ttlSec: 30 }],
      },
      [
        'iot -> expS', 'expS ~> q', 'q ~> occ', 'q ~> dlq', 'occ -> db',
        'app -> expA', 'nav -> gw', 'gw -> expP', 'expA -> avl', 'expP -> avl', 'avl -> cache', 'avl -> db',
      ],
    ),
    simulation: {
      systems: [{ match: 'database', latencyMs: 15 }],
      cache: { hitRatio: 0.9, atTtlSec: 30 },
      tests: [
        {
          name: 'Saturday afternoon',
          about: 'Sensors send 60 bay events a second. The city app asks 200 times a second and partners 100 times. Every read is answered fast, and no read goes near the IoT platform.',
          traffic: [sensors, app, partners],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], notReached: [{ flow: 'city app', node: 'saas' }, { flow: 'navigation partners', node: 'saas' }] },
        },
        {
          name: 'The IoT platform is down for 30 minutes',
          about: 'The vendor platform stops sending events for 30 minutes. The counts stop moving, but every app and partner read is still answered.',
          traffic: [sensors, app, partners],
          incidents: [{ down: 'saas', at: 5, forMin: 30 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'city app', minSuccess: 0.99 }, { flow: 'navigation partners', minSuccess: 0.99 }] },
        },
        {
          name: 'A partner app floods the API',
          about: 'A bug in a partner\'s app sends 1,000 requests a second for 15 minutes. The gateway answers 429 to the extra partner requests, and the city app is not affected.',
          traffic: [app, { ...partners, rps: 1000, forMin: 15 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'city app', minSuccess: 0.99, maxMs: 300 }, { flow: 'navigation partners', minLimited: 0.5 }] },
        },
      ],
    },
  },
  description: `
A city council has fitted sensors to **9,000 parking bays** in 40 car parks. The sensors belong to a vendor, whose **IoT platform** can send an event to a webhook each time a bay becomes free or taken: up to **60 events a second** on a busy Saturday.

The council wants to show free spaces per car park:
- in its own **city parking app**, which asks about **200 times a second** at peak;
- to three **navigation partners**, whose in-car maps ask about **100 times a second** in total.

The first version asked the vendor's REST API for the counts on every request. The vendor allows **20 calls a second** and answered the rest with 429, so the app showed "no data" most Saturdays.

Facts:
- A count up to **30 seconds old** is fine for drivers.
- Partners sign up with a client ID, and a call without a valid client ID must be refused. Together the partners may make up to **150 requests a second**; anything over that gets 429. Last month one partner's app had a bug and sent about 1,000 requests a second.
- Every app and partner read must be answered within 300 ms. A Mule replica answers about 50 simple requests a second per 0.1 vCore, so 1 vCore takes about 500.
- The vendor's platform had two outages last year, of about half an hour each.

**Questions:**
- Draw a design where the app and the partners never depend on the vendor API.
- How do the counts stay up to date?
- How do you protect the city app from a partner that floods the API?
- What do drivers see when the IoT platform is down?
`,
  answerTemplate: `## Design

## Keeping the counts

## Answering reads

## Partner limits

## When the IoT platform is down
`,
  keyPoints: [
    'Turn the vendor\'s events into your own data: keep the free space count per car park in your own database.',
    'Reads come from that database through a short-lived cache. They never reach the vendor, so its rate limit and its outages do not touch the app.',
    'A queue between the webhook and the counter absorbs bursts and outages of the occupancy database.',
    'A 30 second cache matches what drivers accept and cuts the database reads by about nine in ten.',
    'Partners come in through a gateway with client ID enforcement and a rate limit. The city app has its own Experience API outside that limit.',
    'One availability Process API serves both channels, so the rule for counting free spaces lives in one place.',
    'When the events stop, show the last count with its time, so drivers know it may be old.',
  ],
  solution: `
**Design**
\`\`\`
IoT platform ─► exp-sensor-events ~► bay-events ~► prc-occupancy ─► Occupancy database
                                         ~► DLQ
City parking app   ─► exp-city-app-parking    ─┐
Navigation partners ─► API gateway ─► exp-partner-parking-api ─┴─► prc-parking-availability ─► cache (30 s) ─► Occupancy database
\`\`\`

**Keeping the counts.** Each bay event carries the bay, the car park and the new state. \`prc-occupancy\` applies it to the bay's row and to the free count for the car park. It ignores an event older than the one it already has for that bay, because events can arrive out of order. A nightly job compares the counts with the vendor's REST API once, inside its limit, and corrects any drift.

**Answering reads.** \`prc-parking-availability\` answers "free spaces per car park" from a 30 second cache in front of the occupancy database. With 300 reads a second and 40 car parks, about 9 reads in 10 are cache hits. Sized for the peak, \`prc-parking-availability\` runs on 1 vCore for 300 reads a second, the two read Experience APIs on 0.5 vCore, and the sensor path on 0.2 vCore for 60 events a second.

**Partner limits.** The gateway in front of \`exp-partner-parking-api\` enforces client IDs and a rate limit of 150 requests a second across partners, with lower limits per partner in their contracts. The city app uses its own Experience API, so a partner flood gets 429 at the gateway and the app does not notice.

**When the IoT platform is down.** No events arrive, so the counts stop changing. Reads are still answered from the database. The API includes the time of the last event for each car park, and the app shows "updated 25 minutes ago" when it is old.
`,
  followUps: [
    {
      q: 'Why not cache the vendor API answers instead of keeping your own counts?',
      a: 'A cache in front of the vendor still needs a call for every miss, and fails on every miss during an outage. With your own counts the vendor is only a source of events.',
    },
    {
      q: 'Why does the city app not go through the gateway too?',
      a: 'It can, with its own policies. What matters is that partners and the app do not share one rate limit, or one partner can use it all up.',
    },
    {
      q: 'What if events arrive twice?',
      a: 'Applying the same "bay 17 is taken" event twice gives the same state, as long as you store the state of each bay and not only add or subtract one from the count.',
    },
  ],
}
