import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-028',
  category: 'case-studies',
  title: 'City Transport Authority Publishing Real-Time Arrivals',
  level: 'BEGINNER',
  tags: ['public-sector', 'open-data', 'caching', 'rate-limiting', 'api-management'],
  estMinutes: 25,
  diagram: {
    task: 'draw the target state: the official app, stop signs and third-party apps reaching one public arrivals API, served from a cache that a scheduled poller fills from the three operator systems.',
    checks: [
      { label: 'The official app, stop signs and third-party apps all go through the API gateway', rule: { type: 'each', of: ['mobile-app', 'device', 'partner'], min: 3, edgeTo: 'api-gateway' } },
      { label: 'The gateway (client ID, SLA tiers) fronts the public Experience API', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api' } },
      { label: 'Public requests are answered from the merged arrivals cache', rule: { type: 'path', from: 'partner', to: 'cache' } },
      { label: 'A scheduled poller pulls each of the three operator feeds', rule: { type: 'edge', from: 'batch-job', to: 'system-api', min: 3 } },
      { label: 'The poller stores the merged predictions in the cache', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'cache' } },
      { label: 'Operator tracking systems are reached only through System APIs', rule: { type: 'only-via', target: ['external-api', 'legacy'], from: 'system-api' } },
      { label: 'The Experience API never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Official app'],
        sign: ['device', 'Stop signs'],
        tp: ['partner', 'Third-party journey planners'],
        gw: ['api-gateway', 'API Manager (client ID, SLA tiers)'],
        eapi: ['experience-api', 'exp-public-arrivals-api', { replicas: 3, vCores: '4' }],
        prc: ['process-api', 'prc-arrivals-api', { replicas: 3, vCores: '4' }],
        poll: ['batch-job', 'Operator feed poller (every 15 s)'],
        cache: ['cache', 'Merged arrivals per stop (TTL 60 s)'],
        sa: ['system-api', 'sys-operator-a-api'],
        sb: ['system-api', 'sys-operator-b-api'],
        sc: ['system-api', 'sys-operator-c-api'],
        sst: ['system-api', 'sys-stops-api'],
        oa: ['external-api', 'Operator A tracking'],
        ob: ['external-api', 'Operator B tracking'],
        oc: ['external-api', 'Operator C tracking'],
        db: ['database', 'Stop reference data'],
      },
      [
        'app -> gw', 'sign -> gw', 'tp -> gw', 'gw -> eapi', 'eapi -> prc', 'prc -> cache', 'prc -> sst', 'sst -> db',
        'poll -> sa', 'poll -> sb', 'poll -> sc', 'poll -> cache', 'sa -> oa', 'sb -> ob', 'sc -> oc',
      ],
    ),
    simulation: {
      tests: [
        {
          name: 'Rush hour',
          about: 'At rush hour the app, the stop signs and the journey planners ask for arrivals 3,000 times a second. The public APIs have the replicas and cores to answer each one from the cache within 200 ms.',
          traffic: [{ name: 'arrivals', from: ['mobile-app', 'device', 'partner'], rps: 3000, to: 'cache' }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 200 }], notReached: [{ node: 'external-api' }] },
        },
        {
          name: 'A zone goes down at rush hour',
          about: 'Arrivals are asked for 3,000 times a second when one availability zone goes down. The replicas in the other zones still carry every request.',
          traffic: [{ name: 'arrivals', from: ['mobile-app', 'device', 'partner'], rps: 3000, to: 'cache' }],
          incidents: [{ zone: true, at: 3 }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 200 }] },
        },
      ],
    },
  },
  description: `
**Context.** A city transport authority runs buses and trams operated by three contractors. Each operator has its own vehicle-tracking system that produces predicted arrival times per stop. The authority wants one public "next arrivals" API for its own app, digital signs at stops, and third-party journey-planner apps.

**Goals**
- \`GET /stops/{stopId}/arrivals\` returning the next arrivals across all operators.
- Free access for registered developers, with fair limits.
- Stop signs and the official app must keep working when a third-party app misbehaves.

**Constraints**
- Operator systems are fragile: each can only take ~20 requests/second.
- Predictions change every 15 to 30 seconds; data older than ~60 seconds is useless.
- Peak public demand is ~3,000 requests/second during rush hour.
- 4,000 stops; stop reference data changes a few times a year.
- The 3,000 requests a second must still be answered within 200 ms when an availability zone goes down. Run the public Experience API and the arrivals Process API on 3 replicas of 4 vCores each, so the 2 replicas left after a zone loss carry the peak.

**Your task.** Propose the API design, how you protect the operator systems, and how you manage developer access.
`,
  answerTemplate: `## API layers

## Getting data from operators

## Caching and freshness

## Access management for developers

## Monitoring and risks
`,
  keyPoints: [
    'Public traffic never reaches operator systems directly: arrivals are fetched/pushed on the authority side and served from a cache with a short TTL.',
    'A Process API merges and normalises predictions from the three operators into one stop-based model.',
    'Short TTL caching (seconds) is acceptable because data is refreshed every 15 to 30 seconds; responses include a timestamp so consumers see freshness.',
    'Developers register in a public developer portal (Exchange-backed), receive client credentials, and are rate limited per client by SLA tier.',
    'Internal consumers (signs, official app) get a separate, higher tier or separate API instance so third-party abuse cannot starve them.',
  ],
  solution: `
**Layers.** \`sys-operator-a-api\`, \`sys-operator-b-api\`, \`sys-operator-c-api\` (each wraps one tracking system) → \`prc-arrivals-api\` (reads merged arrivals per stop and adds stop details) → \`exp-public-arrivals-api\` exposed through API Manager. A \`sys-stops-api\` serves reference data with long caching.

**Protecting operator systems.** Instead of calling an operator per public request, a scheduled poller pulls each operator's full prediction feed every ~15 seconds (one call, not 4,000), normalises vehicle, route and stop codes, and merges and sorts them. It stores the merged result per stop in Object Store or a fast cache, with a TTL of ~60 seconds. If an operator supports push, consume that instead. Public requests read only from this store, so 3,000 req/s become a few calls per minute to each operator.

**Freshness.** Each response includes \`generatedAt\` and per-operator status; if an operator feed is stale, return the other operators' data plus a flag rather than failing the whole response. The HTTP response can also carry \`Cache-Control: max-age=15\` so CDNs and clients cache briefly.

**Developer access.** Publish the API spec in Exchange and a public developer portal. Apply client ID enforcement and SLA-based rate limiting: e.g. Free tier 5 req/s, Partner tier 50 req/s (approved manually), Internal tier much higher. Signs and the official app use their own client apps on the Internal tier.

**Scaling.** The Experience API is stateless and read-only, so scale it horizontally with replicas spread across zones; add a CDN in front if traffic grows.

**Monitoring.** Alerts on feed staleness per operator, 429 rates per client, and latency. Publish a status page so third parties know when data is degraded.

**Risks.** Operator feed outages (degrade gracefully per operator), inconsistent stop codes across operators (reference mapping owned by the authority), abusive clients (rate limits, ability to revoke a client app).
`,
  followUps: [
    { q: 'Why poll the operators instead of calling them on demand?', a: 'On-demand calls would multiply public traffic onto systems that can take only ~20 req/s. One scheduled bulk pull per operator gives every consumer the same fresh data at a fixed, small load.' },
    { q: 'What happens if Object Store is unavailable?', a: 'The API can fall back to an in-memory copy of the last merged feed held by each replica, flagged as possibly stale, rather than calling operators directly.' },
    { q: 'How do you stop one developer creating many free accounts?', a: 'Require verified registration, monitor usage patterns per organisation, and keep the right to revoke client apps; a CDN or WAF can add IP-level protection.' },
  ],
}
