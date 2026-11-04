import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-032',
  category: 'case-studies',
  title: 'Sports League Distributing Live Match Statistics',
  level: 'INTERMEDIATE',
  tags: ['sports', 'real-time', 'pub-sub', 'api-management', 'partners'],
  estMinutes: 40,
  diagram: {
    task: 'draw the distribution architecture: one ingestion System API publishing match events to a backbone, isolated push and delayed-tier consumers, the live pull API behind API Manager, and the stats store.',
    checks: [
      { label: 'Licensees, clubs/media and the league app all enter through API Manager', rule: { type: 'each', of: ['partner', 'web-app', 'mobile-app'], min: 2, edgeTo: 'api-gateway' } },
      { label: 'The official data provider is reached only through one ingestion System API', rule: { type: 'only-via', target: { type: 'external-api', label: ['provider', 'stadium', 'official'] }, from: 'system-api' } },
      { label: 'Ingestion publishes each event once, asynchronously, to the backbone', rule: { type: 'edge', from: 'system-api', to: ['event-stream', 'topic', 'queue'], kind: 'async' } },
      { label: 'Consumers are isolated: at least two independent subscriptions read the backbone', rule: { type: 'edge', from: ['event-stream', 'topic', 'queue'], to: ['process-api', 'system-api', 'batch-job'], kind: 'async', min: 2 } },
      { label: 'A delay buffer serves the free / delayed tier', rule: { type: 'node', match: { type: ['process-api', 'batch-job', 'queue', 'database', 'cache'], label: ['delay'] } } },
      { label: 'Real-time licensees can receive pushed events (webhooks)', rule: { type: 'path', from: ['event-stream', 'topic', 'queue'], to: { type: 'external-api', label: ['webhook', 'licensee'] } } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Pollers reach the event/stats store through the API layers', rule: { type: 'path', from: 'partner', to: 'database', via: 'experience-api' } },
    ],
    reference: diagram(
      {
        lic: ['partner', 'Licensees (betting, broadcasters)'],
        club: ['web-app', 'Club & media sites'],
        app: ['mobile-app', 'League app'],
        gw: ['api-gateway', 'API Manager (client ID, SLA tiers)'],
        live: ['experience-api', 'exp-live-api'],
        stats: ['experience-api', 'exp-stats-api'],
        prc: ['process-api', 'prc-match-events-api'],
        push: ['process-api', 'prc-licensee-push'],
        delay: ['process-api', 'prc-delay-buffer'],
        es: ['event-stream', 'match-events (matchId, seq)'],
        ing: ['system-api', 'sys-match-feed-api'],
        sst: ['system-api', 'sys-stats-store-api'],
        prov: ['external-api', 'Official data provider'],
        hooks: ['external-api', 'Licensee webhooks'],
        cache: ['cache', 'Response cache (1 s live, long for history)'],
        db: ['database', 'Events & stats store'],
      },
      [
        'lic -> gw', 'club -> gw', 'app -> gw', 'gw -> live', 'gw -> stats', 'live -> prc', 'stats -> prc', 'prc -> cache', 'prc -> sst',
        'ing -> prov', 'ing ~> es', 'es ~> push', 'es ~> delay', 'es ~> sst', 'push -> hooks', 'delay -> sst', 'sst -> db',
      ],
    ),
  },
  description: `
**Context.** A professional sports league collects live match data (scores, events, player stats) from an official data provider at each stadium. It wants to distribute this data to broadcasters, betting operators (licensed), fantasy-sports apps, club websites and its own app. Today each consumer gets a custom file feed, and during the last season the feed server crashed on the final match day.

**Goals**
- A low-latency live feed (target: < 2 seconds from stadium to consumer).
- Tiered products: delayed data free for clubs/media, real-time for paying licensees.
- Historical stats via a normal REST API.

**Constraints**
- Peak: 10 simultaneous matches; ~5 events/second per match; ~400 subscriber connections.
- Some consumers want push (webhook or streaming), others poll.
- Corrections happen (a goal is re-assigned to another player) and must reach everyone.
- Contracts include SLAs and an audit of who received which data, when.

**Your task.** Propose the distribution architecture, product/tier model and how you handle ordering and corrections.
`,
  answerTemplate: `## Ingestion from the data provider

## Distribution model (push and pull)

## Product tiers, access and SLAs

## Ordering, corrections and replay

## Historical stats API

## Risks
`,
  keyPoints: [
    'Ingestion is separated from distribution: provider events are validated, sequenced and published once to a messaging backbone.',
    'Consumers are isolated by subscription (queue/stream per consumer or tier) so a slow consumer cannot delay others.',
    'Tiers are enforced by API Manager (client ID, SLA tiers, rate limits) and by a delay buffer for the free/delayed product.',
    'Each event carries a match ID and sequence number; corrections are new events referencing the original, and consumers can replay from a sequence number.',
    'Historical stats are served from a read-optimised store via a cached REST API, separate from the live path.',
    'Delivery is logged per consumer for SLA and audit evidence.',
  ],
  solution: `
**Ingestion.** \`match-feed-sapi\` receives provider messages (push or polling), validates them, assigns a per-match sequence number if the provider does not, and publishes to the backbone. Use Anypoint MQ (FIFO queues where per-match order matters) for moderate scale; if the league expects much higher fan-out or long replay windows, a streaming platform such as Kafka with the Mule Kafka connector is a better backbone. Events are also written to the stats store.

**Distribution.**
- *Push*: per-licensee delivery flows consume their subscription and push to webhooks with retries; for very low latency, a streaming endpoint (e.g. WebSocket or SSE) served by a dedicated gateway/service may be required — call this out honestly, as long-lived streaming connections are not a typical Mule HTTP pattern.
- *Pull*: \`live-eapi\` exposes \`GET /matches/{id}/events?afterSeq=n\` so pollers fetch only new events; responses cached for 1 s to absorb polling storms.

**Tiers.** Exchange/portal products: Media (delayed 30–60 s, free), Club (delayed), Licensee Real-time (paid, SLA). API Manager applies client ID enforcement and SLA-based rate limits. The delayed product reads from a buffer that releases events after the configured delay.

**Ordering and corrections.** Consumers process by \`(matchId, seq)\`; gaps are detected and filled via the pull API. A correction is a new event \`type: CORRECTION, corrects: seq 412\`, so audit history stays intact. Replay: any consumer can re-request from a sequence number after an outage.

**Historical API.** \`stats-eapi\` over a database built from the same events; heavy caching because data rarely changes after a match.

**Resilience.** Load test with 10 parallel simulated matches at 3x event rate; replicas across availability zones; runbook for match day.

**Risks.** Latency targets (measure end to end), unlicensed redistribution (contracts plus watermarking/per-client identifiers), provider outage (fallback manual input feed).
`,
  followUps: [
    { q: 'Would you use Anypoint MQ or Kafka here?', a: 'Anypoint MQ is simpler and fine at this volume, with FIFO queues for ordering. If fan-out grows to thousands of consumers or long replay is required, a log-based platform like Kafka fits better, and Mule integrates through its connector.' },
    { q: 'How do you implement the delayed tier?', a: 'A consumer holds events in a time-ordered buffer and releases them only when event time + delay has passed; the delayed API reads only released events, so free users never see real-time data.' },
    { q: 'How do you prove SLA compliance?', a: 'Measure provider-received and consumer-delivered timestamps per event and client, aggregate them into SLA reports, and keep the logs for the contractual period.' },
  ],
}
