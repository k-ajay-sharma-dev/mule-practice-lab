import { diagram } from '../../arch/dsl.js'

const bags = { type: 'database', label: 'bag status' }
const airlines = { type: 'external-api', label: 'airline' }
const scans = { name: 'bag scans', from: 'device', rps: 200, to: [bags, airlines], kind: 'write' }
const passengers = { name: 'passengers', from: 'mobile-app', rps: 500, to: bags }

export default {
  id: 'uc-139',
  category: 'use-cases',
  title: 'Where Is My Bag? Airport Scanners Feed One Event Stream, Airlines and the Passenger App Each Read Their Own Way, and a Slow Airline Delays Nobody',
  level: 'ADVANCED',
  tags: ['aviation', 'event-streaming', 'kafka', 'cache', 'experience-api', 'partner-feed'],
  estMinutes: 40,
  diagram: {
    task: 'draw the bag scanners sending scans to an Experience API that publishes them to an event stream. One Process API reads the stream and updates the bag status database through a System API. Another Process API reads the stream and sends each scan to the airline systems through a System API. The passenger app reads bag status through its own Experience API, a cache and the bag status System API.',
    checks: [
      { label: 'The scanners send to an Experience API', rule: { type: 'edge', from: 'device', to: 'experience-api' } },
      { label: 'Scans reach the bag status database through the event stream', rule: { type: 'path', from: 'device', via: 'event-stream', to: bags } },
      { label: 'Scans reach the airlines through the same event stream', rule: { type: 'path', from: 'device', via: 'event-stream', to: airlines } },
      { label: 'The stream has a consumer for the database and another for the airlines', rule: { type: 'each', of: 'event-stream', edgeTo: 'process-api', count: 2 } },
      { label: 'The bag status writer never waits on an airline', rule: { type: 'no-path', from: { type: 'process-api', label: 'status' }, to: airlines } },
      { label: 'The passenger app reads through its own Experience API and a cache', rule: { type: 'path', from: 'mobile-app', via: 'experience-api', to: 'cache' } },
      { label: 'The bag status database is reached only through a System API', rule: { type: 'only-via', target: bags, from: 'system-api' } },
    ],
    reference: diagram(
      {
        scn: ['device', 'Bag scanners'],
        expS: ['experience-api', 'exp-bag-scans', { vCores: '0.5' }],
        es: ['event-stream', 'bag-events'],
        prcS: ['process-api', 'prc-bag-status', { vCores: '0.5' }],
        sysS: ['system-api', 'sys-bag-status', { vCores: '0.5' }],
        db: ['database', 'Bag status database'],
        prcA: ['process-api', 'prc-airline-feeds', { vCores: '0.5' }],
        sysA: ['system-api', 'sys-airline-messaging', { vCores: '0.5' }],
        air: ['external-api', 'Airline baggage systems'],
        app: ['mobile-app', 'Passenger app'],
        expP: ['experience-api', 'exp-passenger-bags', { replicas: 2, vCores: '0.5' }],
        c: ['cache', 'Bag status cache', { ttlSec: 30 }],
      },
      ['scn -> expS', 'expS ~> es', 'es ~> prcS', 'prcS -> sysS', 'sysS -> db', 'es ~> prcA', 'prcA -> sysA', 'sysA -> air', 'app -> expP', 'expP -> c', 'expP -> sysS'],
    ),
    simulation: {
      systems: [
        { match: 'database', latencyMs: 15, maxRps: 400 },
        { match: 'external-api', latencyMs: 400, maxRps: 300 },
      ],
      cache: { hitRatio: 0.95, atTtlSec: 30 },
      tests: [
        {
          name: 'Morning departures',
          about: 'Scanners send 200 scans a second and 500 passengers a second check their bags in the app. Every scan reaches the database and the airlines, and the app answers fast.',
          traffic: [scans, passengers],
          durationMin: 30,
          expect: {
            answers: [{ flow: 'passengers', minSuccess: 0.99, maxMs: 200 }, { flow: 'bag scans', minSuccess: 0.99 }],
            delivered: [{ flow: 'bag scans', to: bags, min: 0.99 }, { flow: 'bag scans', to: airlines, min: 0.99 }],
            peakRps: [{ node: 'database', max: 400 }],
          },
        },
        {
          name: 'The airline systems are down for half an hour',
          about: 'The airlines\' baggage messaging is down for 30 minutes. Bag status keeps updating, so passengers see where their bags are, and the airline messages wait in the stream.',
          traffic: [scans, passengers],
          incidents: [{ down: 'external-api', at: 5, forMin: 30 }],
          durationMin: 40,
          expect: { delivered: [{ flow: 'bag scans', to: bags, min: 0.99 }], answers: [{ flow: 'passengers', minSuccess: 0.99 }], lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
An airport tracks every checked bag. **Bag scanners** on the belts, at security screening and at the aircraft send a scan each time a bag passes. Two parties need the scans:

- The **airline baggage systems**, which decide what to do with a bag that is late or on the wrong belt. They take messages through an airline industry messaging service that is sometimes slow or down.
- The airport's **passenger app**, which shows passengers where their bag is, from a **bag status database**.

Today one Mule app takes each scan, sends it to the airlines and then writes it to the database. When the airline messaging is slow, the app falls behind and passengers see their bag "at check-in" while it is already on the aircraft.

**Numbers**
- About **200 scans a second** in the morning departure peak.
- About **500 passenger requests a second** in the app at the same time.
- The bag status database takes up to 400 queries a second.
- The airline messaging takes about 400 ms per message, and has outages of up to half an hour.
- A bag status that is up to 30 seconds old is fine in the app, and the app must answer within **200 ms**.
- No scan may be lost, for the database or for the airlines, even during an airline outage.

**Questions:**
- Draw the design.
- How do the airline feed and the bag status database get every scan without waiting on each other?
- How does the app take 500 requests a second without hurting the database?
- What happens during an outage of the airline messaging?
`,
  answerTemplate: `## Design

## One stream, two consumers

## The passenger app

## During an airline outage
`,
  keyPoints: [
    'Publish each scan once to an event stream. A bag status consumer and an airline feed consumer each read it at their own pace.',
    'The bag status writer has nothing to do with the airlines, so a slow airline never delays what passengers see.',
    'Key the stream by bag tag number, so all scans of one bag stay in order for both consumers.',
    'The passenger app has its own Experience API with a cache of 30 seconds. Most reads never reach the database.',
    'During an airline outage the airline consumer falls behind and the stream keeps the scans. It catches up after, in order.',
    'Size each piece for its own load: the passenger Experience API for 500 requests a second, the consumers for 200 scans a second.',
  ],
  solution: `
**Design**
\`\`\`
Bag scanners ─► exp-bag-scans ~► bag-events (stream) ~► prc-bag-status ───► sys-bag-status ─► Bag status database
                                                      ~► prc-airline-feeds ─► sys-airline-messaging ─► Airline baggage systems
Passenger app ─► exp-passenger-bags ─► (Bag status cache) ─► sys-bag-status
\`\`\`

**One stream, two consumers.** Each consumer reads \`bag-events\` in its own consumer group. \`prc-bag-status\` writes the latest place of each bag. \`prc-airline-feeds\` turns each scan into the airline message format and sends it.

**The passenger app.** \`exp-passenger-bags\` reads the cache first. With a 30 second time to live, most of the 500 reads a second are answered from the cache. The database sees the scans and a small share of the reads.

**During an airline outage.** \`prc-airline-feeds\` cannot send, so it stops moving forward in the stream. Bag status is untouched. When the airlines are back, the feed sends the waiting scans in order. A late message is still useful to the airline, because it shows the path the bag took.

**Sizing.** The scanner Experience API and both consumers carry 200 a second, so half a vCore each in this model. The passenger Experience API carries 500 a second, so two replicas of half a vCore.
`,
  followUps: [
    {
      q: 'An airline wants scans for its own bags only. Where does that filter go?',
      a: 'In prc-airline-feeds, which looks up the airline from the bag tag and sends each scan to that airline only. The stream still holds every scan for the airport.',
    },
    {
      q: 'Why not let the passenger app read the stream?',
      a: 'The app wants the latest place of one bag, not every scan of every bag. The database answers that question directly, and the cache keeps it cheap.',
    },
  ],
}
