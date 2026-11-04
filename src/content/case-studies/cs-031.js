import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-031',
  category: 'case-studies',
  title: 'Hotel Group Consolidating Bookings and Loyalty',
  level: 'INTERMEDIATE',
  tags: ['hospitality', 'loyalty', 'experience-api', 'caching', 'events'],
  estMinutes: 40,
  diagram: {
    task: 'draw the target API architecture: three channels, shared availability/booking/member Process APIs, System APIs per CRS/PMS, cached search, the StayCompleted event to loyalty, and where card data goes.',
    checks: [
      { label: 'Mobile, web and call centre each call an Experience API', rule: { type: 'each', of: ['mobile-app', 'web-app', 'internal-app'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Separate Process APIs for availability, booking and member', rule: { type: 'node', match: 'process-api', min: 3 } },
      { label: 'Availability results are cached briefly to cut latency and per-call CRS cost', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'Availability search fans out to at least two CRS System APIs', rule: { type: 'edge', from: { type: 'process-api', label: ['avail', 'search'] }, to: 'system-api', min: 2 } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Checkouts are published asynchronously as canonical events', rule: { type: 'edge', from: 'system-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Checkout events drive points posting in the loyalty platform', rule: { type: 'path', from: ['queue', 'topic', 'event-stream'], to: { type: ['saas', 'crm', 'database'], label: ['loyalty', 'points'] } } },
      { label: 'Card details go straight from the channel to the payment provider, never through Mule', rule: { type: 'only-via', target: 'payment', from: ['mobile-app', 'web-app', 'internal-app'] } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        web: ['web-app', 'Web booking site'],
        cc: ['internal-app', 'Call centre'],
        em: ['experience-api', 'exp-mobile-api'],
        ew: ['experience-api', 'exp-web-api'],
        ec: ['experience-api', 'exp-callcentre-api'],
        av: ['process-api', 'prc-availability-api'],
        bk: ['process-api', 'prc-booking-api'],
        mem: ['process-api', 'prc-member-api'],
        cache: ['cache', 'Availability cache + property routing'],
        q: ['queue', 'stay-completed'],
        sca: ['system-api', 'sys-crs-a-api'],
        scb: ['system-api', 'sys-crs-b-api'],
        spms: ['system-api', 'sys-pms-x-api'],
        sloy: ['system-api', 'sys-loyalty-api'],
        crsa: ['saas', 'CRS A'],
        crsb: ['saas', 'CRS B'],
        pms: ['legacy', 'PMS X'],
        loy: ['saas', 'Loyalty platform'],
        pay: ['payment', 'Payment provider (tokenisation)'],
      },
      [
        'mob -> em', 'web -> ew', 'cc -> ec', 'em -> av', 'em -> bk', 'em -> mem', 'ew -> av', 'ew -> bk', 'ec -> bk', 'ec -> mem',
        'av -> cache', 'av -> sca', 'av -> scb', 'bk -> sca', 'bk -> scb', 'sca -> crsa', 'scb -> crsb',
        'spms -> pms', 'spms ~> q', 'q ~> mem', 'mem -> sloy', 'sloy -> loy', 'mob -> pay', 'web -> pay',
      ],
    ),
  },
  description: `
**Context.** A hotel group with 300 properties grew through acquisitions and now runs three property-management systems (PMS) and two central reservation systems (CRS). The loyalty programme lives in a separate platform that only gets stay data via nightly files, so points arrive days late and members cannot see a single booking history. A new mobile app must show "my bookings", availability and prices across all brands, and award points at checkout.

**Goals**
- One booking API for web, mobile and call centre across all brands.
- Points posted within minutes of checkout; members see one profile and history.
- Availability searches must be fast (< 1 s) even though some CRS calls take 2–3 s.

**Constraints**
- PMS/CRS replacements are planned over three years — the design must survive them.
- Two CRSs charge per availability call.
- Member data includes personal data and payment tokens; card data must not pass through the integration layer.
- Peak: holiday sales campaigns generate 20x normal search traffic.

**Your task.** Propose the API architecture, the approach for search vs booking, loyalty event flow and how you keep it stable through future system replacements.
`,
  answerTemplate: `## API layers and routing by brand/property

## Availability search (performance and cost)

## Booking and cancellation

## Loyalty events and member profile

## Surviving PMS/CRS replacement

## Risks
`,
  keyPoints: [
    'Channel Experience APIs call shared Process APIs (availability, booking, member); System APIs per CRS/PMS hide which system a property uses.',
    'A property-to-system routing table makes the target CRS/PMS a configuration decision, so system replacements move properties one at a time without consumer changes.',
    'Availability is cached briefly (and searches throttled per channel) to cut latency and per-call cost; booking always confirms live with the CRS.',
    'Checkout events from each PMS are turned into a canonical StayCompleted event that drives near-real-time points posting idempotently.',
    'Payments are tokenised by the payment provider/CRS; the integration layer passes tokens, never raw card data.',
    'A unified member profile is assembled from loyalty (system of record) plus booking history, not by copying all data into a new store.',
  ],
  solution: `
**Layers.** \`mobile-eapi\`, \`web-eapi\`, \`callcentre-eapi\` → \`availability-papi\`, \`booking-papi\`, \`member-papi\` → \`crs-a-sapi\`, \`crs-b-sapi\`, \`pms-x-sapi\`, \`pms-y-sapi\`, \`pms-z-sapi\`, \`loyalty-sapi\`.

**Routing.** A property reference store (property ID → brand, CRS, PMS, timezone) is cached in the Process APIs. When a property moves to a new CRS, only that row changes.

**Search.** \`availability-papi\` fans out in parallel (scatter-gather) only to CRSs relevant to the requested properties, with timeouts; results are cached for ~1–5 minutes per (property, dates, occupancy). Rate limits per Experience API protect against campaign surges; the cache absorbs repeat searches and lowers per-call charges. Price shown in search is labelled indicative.

**Booking.** \`booking-papi\` re-checks availability and price live, creates the reservation in the right CRS with an idempotency key from the client, and returns a confirmation. Card details go straight from the app to the payment provider; only a token travels through Mule. Cancellations follow the same routing.

**Loyalty.** Each PMS sends checkout events (or is polled every few minutes where no events exist). \`pms-*-sapi\` maps them to a canonical \`StayCompleted\` event published to Anypoint MQ; \`member-papi\` consumers post points to the loyalty platform using the folio ID as an idempotency key. Nightly files remain as a reconciliation check for the first months.

**Member profile.** \`member-papi\` composes loyalty profile + upcoming bookings (from CRSs) + recent stays, with short caching. Loyalty stays the system of record for the member.

**Rollout.** Mobile app on one brand first, then call centre, then web. Retire nightly files when reconciliation shows no gaps for two months.

**Risks.** CRS cost/latency (cache and throttle), duplicate points (idempotency), PII exposure (field-level minimisation, no PII in logs), and campaign spikes (load test at 20x, autoscale replicas).
`,
  followUps: [
    { q: 'Why not cache prices for longer to save even more money?', a: 'Stale prices cause failed bookings and complaints. A short TTL plus a live re-check at booking balances cost, speed and accuracy; the TTL can be tuned per brand.' },
    { q: 'A PMS has no events. How do you get checkouts quickly?', a: 'Poll its API or a database view every few minutes using a last-modified watermark, and emit the same canonical event so downstream logic does not care about the source.' },
    { q: 'How does this design help when CRS A is retired?', a: 'Consumers call the Process APIs, not CRS A. Properties are moved to the new CRS by changing their routing rows, a wave at a time, and \`crs-a-sapi\` is retired when no property points at it.' },
  ],
}
