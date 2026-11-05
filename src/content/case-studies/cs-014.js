import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-014',
  category: 'case-studies',
  title: 'Streaming Service Unifying Subscription Entitlements',
  level: 'INTERMEDIATE',
  tags: ['media', 'entitlements', 'caching', 'events', 'partners'],
  estMinutes: 35,
  diagram: {
    task: 'draw the entitlement design: the three purchase sources and how they are ingested, the queue and entitlements Process API that write one canonical store, the change event, and the fast read path used by the playback service.',
    checks: [
      { label: 'Billing webhooks and app-store notifications each arrive at an ingestion Experience API', rule: { type: 'each', of: 'partner', min: 2, edgeTo: 'experience-api' } },
      { label: 'Webhooks are acknowledged fast and queued for asynchronous processing', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Nightly partner files are loaded by a batch job', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'Partner file records join the same pipeline into the entitlements Process API', rule: { type: 'path', from: 'batch-job', to: 'process-api', via: ['queue', 'topic', 'event-stream'] } },
      { label: 'The entitlements Process API writes one canonical entitlement store', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'An EntitlementChanged event is published for cache invalidation', rule: { type: 'edge', from: 'process-api', to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'Playback checks are served from a fast cache / key-value store, not from the purchase sources', rule: { type: 'path', from: ['internal-app', 'device', 'mobile-app', 'web-app'], to: 'cache' } },
    ],
    reference: diagram(
      {
        bw: ['partner', 'Billing platform webhooks'],
        as: ['partner', 'App-store server notifications'],
        play: ['internal-app', 'Playback service (other team)'],
        ebill: ['experience-api', 'billing-events-eapi'],
        eapp: ['experience-api', 'appstore-notifications-eapi'],
        pb: ['batch-job', 'partner-bundles loader'],
        pent: ['process-api', 'entitlements-papi'],
        q: ['queue', 'purchase-events'],
        top: ['topic', 'entitlement-changed'],
        sent: ['system-api', 'entitlements-sapi (cached read)'],
        pf: ['file-store', 'Partner bundle files'],
        store: ['database', 'Entitlement store'],
        kv: ['cache', 'Replicated entitlement cache (KV)'],
      },
      [
        'bw -> ebill', 'as -> eapp', 'ebill ~> q', 'eapp ~> q',
        'pb -> pf', 'pb ~> q', 'q ~> pent',
        'pent -> store', 'pent -> kv', 'pent ~> top', 'top ~> kv',
        'play -> sent', 'sent -> kv',
      ],
    ),
  },
  description: `
**Context.** A video streaming company sells subscriptions directly (web, via a billing platform), through mobile app stores, and bundled by telecom partners. Each source tells the company about subscriptions differently: billing webhooks, app-store server notifications, and nightly partner files. Playback apps on TVs, phones and web check "can this user watch this title?" on every play.

**Goals**
- One entitlement answer per user, whatever the purchase channel.
- Entitlement check under 100 ms at p95, millions of checks per hour at peak (big sports events).
- Cancellations and payment failures take effect within minutes; partner bundles within a day.

**Constraints**
- Partner files have inconsistent formats; some partners provide an API.
- The billing platform is the source of truth for direct customers only.
- The playback service is owned by another team and is not built on MuleSoft.

**Your task.** Propose the design for collecting purchase events and serving entitlement checks.
`,
  answerTemplate: `## Sources and ingestion

## Canonical entitlement model

## Serving entitlement checks

## Consistency and timing

## Risks
`,
  keyPoints: [
    'Ingestion is separated from serving: Mule ingests and normalises purchase events from all channels into one entitlement store.',
    'A canonical entitlement model (user, product/plan, source, valid from/to, status) is defined and each source is mapped to it.',
    'The hot read path (entitlement check) is served from a fast store/cache close to the playback service, not by calling billing, app stores and partners per play.',
    'Webhooks/notifications are verified (signature or auth), acknowledged quickly and processed asynchronously with idempotency on the source event ID.',
    'Partner files are validated, loaded with a report of rejects, and reconciled against partner counts.',
    'Out-of-order events are handled by timestamps/versions so an older event never overwrites a newer state.',
  ],
  solution: `
**Ingestion.**
- \`billing-events-eapi\`: receives billing webhooks, verifies signature, puts the event on Anypoint MQ, returns 200 quickly.
- \`appstore-notifications-eapi\`: same pattern for app-store server notifications; verifies them per the store's documented mechanism.
- \`partner-bundles\` batch app: per-partner DataWeave mappings from files (or partner APIs) to the canonical model; rejects reported back to partners.

**Canonical model.** \`userId, entitlementId, plan, source (DIRECT/APPSTORE/PARTNER), validFrom, validTo, status, sourceEventId, sourceTimestamp\`. A user can have several entitlements; the effective answer is the union of valid ones.

**Processing.** \`entitlements-papi\` consumes events, resolves the user (account linking), applies idempotency on \`sourceEventId\`, ignores events older than the stored \`sourceTimestamp\`, writes to the entitlement store and publishes \`EntitlementChanged\`.

**Serving checks.** The playback team needs very low latency at huge volume. Options: expose \`entitlements-sapi\` with aggressive caching, or let the playback service read a replicated key-value store/cache that the Mule pipeline updates. The second is usually better at this scale, and you invalidate it via the \`EntitlementChanged\` event. Mule stays out of the per-play hot path or sits behind a cache.

**Timing.** Direct/app-store events within minutes; partner files daily, with a grace period so bundled users are not cut off by a late file.

**Risks.** Account-linking errors (wrong user gets access), peak events (pre-warm caches, load-test), and partner data quality.
`,
  followUps: [
    { q: 'Should every play call go through a Mule API?', a: 'Not at millions of checks per hour with a 100 ms budget unless cached heavily. The better pattern is Mule maintaining the entitlement store and the playback service reading it directly or via a cache.' },
    { q: 'How do you handle a partner file that arrives a day late?', a: 'Grant a grace period on partner entitlements (e.g. validTo plus N days), alert when a file is missing, and reconcile once it arrives.' },
    { q: 'How do you measure success?', a: 'Entitlement-check latency and error rate, time from purchase/cancel event to effect, wrongful denial complaints, and partner reconciliation mismatches.' },
  ],
}
