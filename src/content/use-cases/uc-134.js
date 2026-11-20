import { diagram } from '../../arch/dsl.js'

const waits = { type: 'database', label: 'wait' }
const sensors = { name: 'ride sensors', from: 'device', rps: 40, to: waits, kind: 'write' }
const guests = { name: 'guests', from: 'mobile-app', rps: 800, to: waits }
const partners = { name: 'partners', from: 'partner', rps: 20, to: waits }

export default {
  id: 'uc-134',
  category: 'use-cases',
  title: 'Ride Wait Times for a Theme Park: Sensor Events In, a Cached Answer for 800 Guests a Second, and a Rate-Limited Feed for Travel Partners',
  level: 'ADVANCED',
  tags: ['iot', 'kafka', 'cache', 'rate-limit', 'partner-api', 'experience-api', 'leisure'],
  estMinutes: 40,
  diagram: {
    task: 'draw three channels: the ride queue sensors send events to their own Experience API, which publishes them to an event stream that a Process API reads to update the wait times database through a System API. The guest app and the partners each have their own Experience API, both reading a cache first. Partners come in through an API gateway with a rate limit.',
    checks: [
      { label: 'The sensors send to an Experience API', rule: { type: 'edge', from: 'device', to: 'experience-api' } },
      { label: 'Sensor events go through an event stream before the wait times are updated', rule: { type: 'path', from: 'device', via: 'event-stream', to: waits } },
      { label: 'The guest app reads the wait times through a System API', rule: { type: 'path', from: 'mobile-app', via: 'system-api', to: waits } },
      { label: 'Partners come in through the API gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'Partners never reach an Experience API around the gateway', rule: { type: 'no-edge', from: 'partner', to: 'experience-api' } },
      { label: 'Sensors, guests and partners each have their own Experience API', rule: { type: 'each', of: 'experience-api', min: 3, edgeFrom: ['device', 'mobile-app', 'api-gateway'], max: 1 } },
      { label: 'The guest and partner APIs read a cache', rule: { type: 'edge', from: 'experience-api', to: 'cache', min: 2 } },
      { label: 'The wait times database is reached only through a System API', rule: { type: 'only-via', target: waits, from: 'system-api' } },
    ],
    reference: diagram(
      {
        sen: ['device', 'Ride queue sensors (40 rides)'],
        expS: ['experience-api', 'exp-ride-sensors'],
        es: ['event-stream', 'ride-events'],
        prc: ['process-api', 'prc-wait-times', { vCores: '0.5' }],
        sys: ['system-api', 'sys-wait-times', { vCores: '0.5' }],
        db: ['database', 'Current wait times'],
        app: ['mobile-app', 'Guest app'],
        expG: ['experience-api', 'exp-guest-app', { replicas: 2, vCores: '1' }],
        c: ['cache', 'Wait time cache', { ttlSec: 30 }],
        ptn: ['partner', 'Travel partners'],
        gw: ['api-gateway', 'Partner API gateway', { auth: 'client-id', rateLimit: 50 }],
        expP: ['experience-api', 'exp-partner-wait-times'],
      },
      ['sen -> expS', 'expS ~> es', 'es ~> prc', 'prc -> sys', 'sys -> db', 'app -> expG', 'expG -> c', 'expG -> sys', 'ptn -> gw', 'gw -> expP', 'expP -> c', 'expP -> sys'],
    ),
    simulation: {
      systems: [{ match: 'database', latencyMs: 15, maxRps: 300 }],
      cache: { hitRatio: 0.95, atTtlSec: 30 },
      tests: [
        {
          name: 'Opening time',
          about: 'Gates open and 800 guests a second check wait times, partners read 20 times a second, and the sensors send 40 events a second. Everyone gets a fast answer and every event is applied.',
          traffic: [sensors, guests, partners],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }, { flow: 'guests', maxMs: 200 }], delivered: [{ flow: 'ride sensors', to: waits, min: 0.99 }], peakRps: [{ node: waits, max: 250 }] },
        },
        {
          name: 'A partner\'s app polls in a loop',
          about: 'A partner\'s new release asks for wait times 600 times a second. The gateway limits it, and guests in the park notice nothing.',
          traffic: [guests, { ...partners, rps: 600 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'guests', minSuccess: 0.99, maxMs: 200 }, { flow: 'partners', minLimited: 0.8 }] },
        },
        {
          name: 'The wait times database fails over',
          about: 'The database is down for 5 minutes while it fails over. Most guests still get an answer from the cache, and sensor events wait in the stream and are all applied after.',
          traffic: [sensors, guests],
          incidents: [{ down: 'database', at: 5, forMin: 5 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'guests', minSuccess: 0.95 }], delivered: [{ flow: 'ride sensors', to: waits, min: 0.99 }], lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A theme park shows **ride wait times** in its **guest app** and sells a wait time feed to **travel partners** (booking sites and tour operators). Each of the 40 rides has **queue sensors** at the entrance and the exit. They send about **40 events a second** in all.

Today the app and the partners call one API that reads the wait times database for every request. On busy mornings the database slows, the app shows spinning wheels in the queue for the first ride, and a partner's app once polled the API 600 times a second and took everything down.

**Numbers**
- At opening time about **800 guest requests a second**, and about 20 a second from partners.
- The wait times database takes about **300 queries a second**.
- A wait time that is up to **30 seconds old** is fine for everyone.
- Partners each have a contract and a client ID.
- A guest must get an answer within **200 ms**, even while a partner's app misbehaves.
- A partner's app stuck in a loop must get 429 for at least 4 calls in 5.
- No sensor event may be lost, even during a database failover.

**Questions:**
- Draw the design for the sensors, the guests and the partners.
- How do 800 guests a second avoid reaching the database?
- How do you stop a partner's bug from hurting guests in the park?
- What happens during a 5 minute database failover?
`,
  answerTemplate: `## Design

## Sensor events in

## Guests and the cache

## Partners and the gateway

## During a database failover
`,
  keyPoints: [
    'Each channel gets its own Experience API: sensors, guests and partners differ in security, traffic and contracts.',
    'Sensor events go onto an event stream. A Process API applies them, and the stream keeps them while the database is away.',
    'Guests and partners read through a cache with a 30 second time to live, so only a small share of reads reaches the database.',
    'Partners come in through a gateway with a client ID and a rate limit. A partner\'s bug gets 429, not the park\'s capacity.',
    'Keep guests off the partner gateway, so a partner\'s limit never applies to them.',
    'During a failover the cache still answers most guests, and the stream holds the sensor events until the database is back.',
  ],
  solution: `
**Design**
\`\`\`
Ride sensors ─► exp-ride-sensors ~► ride-events ~► prc-wait-times ─► sys-wait-times ─► Current wait times
Guest app ─► exp-guest-app ─► (Wait time cache) ─► sys-wait-times
Travel partners ─► Partner API gateway ─► exp-partner-wait-times ─► (Wait time cache) ─► sys-wait-times
\`\`\`

**Sensor events in.** \`exp-ride-sensors\` checks each event and publishes it to \`ride-events\`, keyed by ride, so each ride's events stay in order. \`prc-wait-times\` works out the wait from the entry and exit counts and writes it.

**Guests and the cache.** The wait times change every few seconds, but 30 seconds old is fine. With a cache, most of the 800 reads a second never leave the Experience API. The database sees well under a hundred reads a second.

**Partners and the gateway.** Each partner has a client ID and a limit. In this model one limit of 50 a second covers all partners together. A loop of 600 a second gets 429 for most calls, and the guest path never shares that limit.

**During a database failover.** Guests whose answer is in the cache see it. The rest get an error for a few minutes. Sensor events wait in the stream, and \`prc-wait-times\` catches up when the database is back.

**Sizing.** The guest Experience API takes 800 calls a second, so two replicas of one vCore in this model. \`prc-wait-times\` gets half a vCore so it catches up quickly after a failover, and \`sys-wait-times\` half a vCore for the cache misses and the writes.
`,
  followUps: [
    {
      q: 'Why an event stream and not a queue for the sensor events?',
      a: 'A stream keeps the events for a while after they are read. The data team can replay a day of entries and exits to tune the wait time formula, and a second consumer can count visitors without changing the first.',
    },
    {
      q: 'Should partners get the same freshness as guests?',
      a: 'It is a product decision. A longer time to live on the partner side, such as 2 minutes, costs less and may match what partners pay for.',
    },
  ],
}
