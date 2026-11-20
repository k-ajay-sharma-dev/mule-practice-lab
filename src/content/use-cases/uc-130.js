import { diagram } from '../../arch/dsl.js'

const journeys = { type: 'database', label: 'journey' }
const taps = { name: 'card taps', from: 'device', rps: 800, to: journeys, kind: 'write' }
const riders = { name: 'rider app', from: 'mobile-app', rps: 200, to: journeys }
const charges = { name: 'nightly charges', from: 'batch-job', rps: 40, to: 'payment', kind: 'write' }

export default {
  id: 'uc-130',
  category: 'use-cases',
  title: 'Tap-On, Tap-Off Bus Fares: Late Taps From Buses Out of Coverage, a Daily Fare Cap and One Charge per Card per Day',
  level: 'EXPERT',
  tags: ['myproject', 'kafka', 'event-stream', 'iot', 'payments', 'batch', 'idempotency', 'public-transport'],
  estMinutes: 60,
  diagram: {
    task: 'draw the fare platform: card readers send taps to a taps Experience API that publishes them to an event stream, and fetch the card denylist through their own Experience API and a System API. A journey builder Process API reads the stream and keeps journeys in a journeys database. The rider app reads journeys through its own Experience and Process APIs. A nightly charging job reads the journeys, charges each card once through a payments System API, and adds cards whose charge failed to the denylist through the denylist System API.',
    checks: [
      { label: 'Card readers send taps to an Experience API', rule: { type: 'path', from: 'device', to: { type: 'experience-api', label: 'tap' } } },
      { label: 'Taps go onto an event stream', rule: { type: 'edge', from: { type: 'experience-api', label: 'tap' }, to: 'event-stream', kind: 'async' } },
      { label: 'A journey builder reads the taps and keeps journeys in the journeys database', rule: { type: 'path', from: 'event-stream', via: { type: 'process-api', label: 'journey' }, to: journeys } },
      { label: 'No tap ever reaches the payment provider', rule: { type: 'no-path', from: 'device', to: 'payment' } },
      { label: 'The nightly job charges cards only through a payments System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'The nightly job reads the journeys and calls the payments System API', rule: { type: 'path', from: 'batch-job', via: 'system-api', to: 'payment' } },
      { label: 'The rider app reads journeys through its own APIs, never the stream', rule: { type: 'path', from: 'mobile-app', via: 'process-api', to: journeys } },
      { label: 'The rider app has no route to the event stream', rule: { type: 'no-path', from: 'mobile-app', to: 'event-stream' } },
      { label: 'Card readers fetch the denylist through a System API', rule: { type: 'path', from: 'device', via: 'system-api', to: { type: 'database', label: 'denylist' } } },
      { label: 'The charging job adds failed cards to the denylist', rule: { type: 'path', from: 'batch-job', to: { type: 'database', label: 'denylist' } } },
      { label: 'Every line into or out of the event stream is async', rule: { type: 'lines', touching: 'event-stream', kind: 'async' } },
    ],
    reference: diagram(
      {
        rdr: ['device', 'Card readers on 3,000 buses'],
        expT: ['experience-api', 'exp-taps', { replicas: 2, vCores: '1' }],
        es: ['event-stream', 'card-taps (key = card token)'],
        jb: ['process-api', 'prc-journey-builder', { replicas: 2, vCores: '2' }],
        jdb: ['database', 'Journeys database'],
        expD: ['experience-api', 'exp-reader-denylist'],
        sysD: ['system-api', 'sys-card-denylist'],
        deny: ['database', 'Card denylist'],
        app: ['mobile-app', 'Rider app'],
        expR: ['experience-api', 'exp-rider', { vCores: '0.5' }],
        prcR: ['process-api', 'prc-rider-journeys', { vCores: '0.5' }],
        job: ['batch-job', 'Nightly fare capping and charging (03:00)'],
        sysP: ['system-api', 'sys-card-payments', { retries: 2, timeoutMs: 3000 }],
        psp: ['payment', 'Card payment provider'],
      },
      [
        'rdr -> expT', 'expT ~> es', 'es ~> jb', 'jb -> jdb',
        'rdr -> expD', 'expD -> sysD', 'sysD -> deny',
        'app -> expR', 'expR -> prcR', 'prcR -> jdb',
        'job -> jdb', 'job -> sysP', 'sysP -> psp', 'job -> sysD',
      ],
    ),
    simulation: {
      systems: [
        { match: 'payment', latencyMs: 400, maxRps: 50 },
        { match: 'database', latencyMs: 5 },
      ],
      tests: [
        {
          name: 'The morning rush',
          about: 'Readers send 800 taps a second and riders check their journeys 200 times a second. Every tap is taken at once and reaches the journeys database, and the rider app stays fast.',
          traffic: [taps, riders],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }, { flow: 'card taps', maxMs: 200 }, { flow: 'rider app', maxMs: 300 }], delivered: [{ flow: 'card taps', to: journeys, min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The journeys database is down for 20 minutes',
          about: 'The journeys database fails over to its standby. Readers keep sending taps and every one is taken. The taps wait in the stream, none is lost, and the journeys catch up afterwards.',
          traffic: [taps],
          incidents: [{ down: journeys, at: 5, forMin: 20 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], lost: { max: 0 }, backlog: [{ queue: 'event-stream', maxEnd: 0 }], delivered: [{ to: journeys, min: 0.99 }] },
        },
        {
          name: 'The payment provider drops 2 calls in 100',
          about: 'During the nightly run the provider fails 2 calls in 100 at random. The payments System API tries again, and almost every card is charged.',
          traffic: [charges],
          incidents: [{ errors: 'payment', rate: 0.02 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.995 }] },
        },
      ],
    },
  },
  description: `
A city bus network is replacing paper tickets with **tap-on, tap-off** contactless cards. **Card readers on 3,000 buses** send each tap: card token, bus, stop, time. Fares depend on the journey, so a tap-on needs its tap-off. A **daily fare cap** means nobody pays more than the price of a day ticket.

How the money works: each card is **charged once per day**, overnight, for that day's capped total. A card whose charge fails goes on a **denylist**, which every reader downloads so the card is refused until the debt is paid.

Facts:
- At the morning rush the readers send about **800 taps a second**.
- Buses lose mobile coverage in tunnels and rural stretches. Readers keep taps and send them when coverage returns, sometimes **hours late** and out of order.
- The **rider app** shows today's journeys and the fare so far: about **200 requests a second** at peak.
- The **card payment provider** takes at most **50 requests a second**. Charging 150,000 cards takes about an hour at 40 a second. On some nights it fails 2 calls in 100 at random.
- The journeys database fails over to a standby a few times a year, which takes up to 20 minutes.
- A reader must get its answer to a tap within 200 ms, and the rider app within 300 ms. No tap may be lost.
- After a database failover, the journeys must catch up within 30 minutes of the database coming back, while new taps keep arriving.
- On a night when the provider fails 2 calls in 100, at least 995 cards in 1,000 must still be charged.

**Questions:**
- Draw the platform.
- How do you build journeys from taps that arrive late and out of order?
- When does the nightly charge run, and how do you make sure a card is never charged twice for one day?
- What happens to taps while the journeys database is down?
`,
  answerTemplate: `## Design

## From taps to journeys

## The daily cap and the nightly charge

## Never charging twice

## The denylist

## When the journeys database is down
`,
  keyPoints: [
    'Take taps in fast and put them on an event stream keyed by card token, so all taps of one card stay in order in one partition.',
    'Build journeys in a consumer with its own store. A late tap rebuilds that card\'s journeys for the day, so order of arrival does not matter.',
    'Charge after a cut-off that allows for late taps, such as 03:00 for the day before, and cap each card\'s total at the day ticket price.',
    'Charge each card once per day with an idempotency key of card and date. A retry after a timeout is then refused by the provider, not charged again.',
    'Retries in the payments System API turn random failures into charges. The job stays under the provider\'s 50 a second.',
    'Readers fetch the denylist through their own Experience API, so a slow rider app or charging job never delays a bus.',
    'When the journeys database is down, the taps wait in the stream. Readers are not affected, and the journey builder catches up afterwards.',
  ],
  solution: `
**Design**
\`\`\`
Card readers ─► exp-taps ~► card-taps (event stream, key = card token) ~► prc-journey-builder ─► Journeys database
Card readers ─► exp-reader-denylist ─► sys-card-denylist ─► Card denylist
Rider app    ─► exp-rider ─► prc-rider-journeys ─► Journeys database
Nightly fare capping and charging (03:00) ─► Journeys database
                                          ─► sys-card-payments ─► Card payment provider
                                          ─► sys-card-denylist
\`\`\`

**From taps to journeys.** \`prc-journey-builder\` stores every tap for the card and day, then rebuilds that card's journeys for the day from all its taps, sorted by tap time. A tap-off that arrives two hours late joins the right journey when it arrives. A tap-on with no tap-off by the end of service is charged the maximum fare for that route, as the fare rules say.

**The daily cap and the nightly charge.** At 03:00 the job takes each card with journeys the day before, adds up the fares, caps the total at the day ticket price and charges it. Most late taps have arrived by then; one that arrives later still is charged or refunded the next night as an adjustment.

**Never charging twice.** Each charge carries an idempotency key of card token and travel date. If the job crashes and runs again, or the System API retries after a timeout, the provider sees the same key and does not charge again. The job also marks each card and date CHARGED in the journeys database, so a second run skips it.

**Sizing.** \`exp-taps\` carries 800 taps a second: two replicas of one vCore in this model. \`prc-journey-builder\` needs more than the live rate, because after an outage it must work through a backlog of about a million taps while new ones keep coming: two replicas of two vCores. The rider path carries 200 a second: half a vCore each. The charging job stays at 40 a second, under the provider's 50, and \`sys-card-payments\` retries twice with a 3 second timeout.

**The denylist.** A failed charge, after the retries, adds the card to the denylist through \`sys-card-denylist\`. Readers refresh their copy every few minutes when in coverage. A rider who pays the debt in the app is taken off it.

**When the journeys database is down.** \`exp-taps\` still publishes every tap to the stream, so readers never notice. The journey builder cannot write, so its taps wait in the stream. When the standby is up it works through about 20 minutes of taps, and the rider app shows today's journeys again.
`,
  followUps: [
    {
      q: 'Why charge once a day instead of per journey?',
      a: 'The cap is daily, so the final amount is only known at the end of the day. One charge per day is also far fewer payment calls and fees.',
    },
    {
      q: 'Could the readers call the payment provider to check a card at the tap?',
      a: 'Not reliably: buses lose coverage, and a tap must be accepted in a fraction of a second. That is why the risk is managed with a downloaded denylist and a charge later.',
    },
    {
      q: 'What if a card is tapped on two buses at almost the same time?',
      a: 'It points to a cloned card or a reader clock error. The journey builder flags the card for review instead of charging two journeys.',
    },
  ],
}
