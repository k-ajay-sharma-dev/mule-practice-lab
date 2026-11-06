import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-002',
  category: 'architecture',
  title: 'Sync Request/Reply vs Async Events',
  level: 'INTERMEDIATE',
  tags: ['sync', 'async', 'event-driven'],
  estMinutes: 30,
  diagram: {
    task: 'draw all three integrations: the synchronous quote lookup, the PolicyIssued fan-out to four consumers, and the claim upload that is accepted and then processed in the background.',
    checks: [
      { label: 'A channel calls an Experience API synchronously for the quote', rule: { type: 'edge', from: ['web-app', 'mobile-app', 'partner'], to: 'experience-api', kind: 'sync' } },
      { label: 'PolicyIssued is published asynchronously to an exchange/topic', rule: { type: 'edge', to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'The exchange fans out to at least four queues (one per consumer)', rule: { type: 'edge', from: ['topic', 'event-stream'], to: 'queue', min: 4 } },
      { label: 'Every queue has a consumer', rule: { type: 'each', of: 'queue', edgeTo: ['process-api', 'system-api', 'batch-job', 'erp', 'crm', 'saas', 'data-warehouse', 'database', 'legacy'] } },
      { label: 'Claim files are stored in file/object storage', rule: { type: 'edge', from: ['experience-api', 'process-api', 'system-api', 'mobile-app', 'web-app'], to: 'file-store' } },
      { label: 'Claim ingestion is handed off asynchronously instead of running inside the HTTP call', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: ['queue', 'topic'], kind: 'async' } },
      { label: 'Channels never call backends directly', rule: { type: 'no-edge', from: ['web-app', 'mobile-app'], to: ['external-api', 'legacy', 'erp', 'crm', 'saas', 'data-warehouse', 'database'] } },
    ],
    reference: diagram(
      {
        brk: ['web-app', 'Broker portal'],
        cust: ['mobile-app', 'Customer claims app'],
        eq: ['experience-api', 'exp-quote-api'],
        ec: ['experience-api', 'exp-claims-api (202 + claimId)'],
        sp: ['system-api', 'sys-pricing-api'],
        pe: ['external-api', 'Pricing engine'],
        pas: ['legacy', 'Policy admin system'],
        ex: ['topic', 'policy-issued exchange'],
        qb: ['queue', 'billing-q'],
        qd: ['queue', 'docgen-q'],
        qw: ['queue', 'dwh-q'],
        qc: ['queue', 'crm-q'],
        bill: ['erp', 'Billing'],
        doc: ['saas', 'Document generation'],
        dwh: ['data-warehouse', 'Data warehouse'],
        crm: ['crm', 'CRM'],
        fs: ['file-store', 'Claim files (object storage)'],
        cq: ['queue', 'claim-ingest-q'],
        pci: ['process-api', 'prc-claim-ingest'],
        cls: ['saas', 'Claims system'],
      },
      [
        'brk -> eq', 'eq -> sp', 'sp -> pe',
        'pas ~> ex', 'ex ~> qb', 'ex ~> qd', 'ex ~> qw', 'ex ~> qc',
        'qb ~> bill', 'qd ~> doc', 'qw ~> dwh', 'qc ~> crm',
        'cust -> ec', 'ec -> fs', 'ec ~> cq', 'cq ~> pci', 'pci -> fs', 'pci -> cls',
      ],
    ),
  },
  description: `
An insurance company is building three integrations on Mule 4 (CloudHub 2.0):

1. **Quote lookup** — the broker portal calls an API to get a premium quote. Brokers wait on screen; the pricing engine answers in ~300 ms.
2. **Policy issued notification** — when a policy is issued in the policy admin system, **four** downstream systems need to know: billing, document generation, the data warehouse and a CRM. More consumers are expected next year.
3. **Claim document upload** — a customer uploads a claim with photos (up to 50 MB). The claims system takes 2–10 minutes to ingest and classify the files.

**For each integration**, decide whether it should be **synchronous request/reply** or **asynchronous / event-driven**, and justify it:
- What does the caller need back, and when?
- What happens if a downstream system is down for 30 minutes?
- How would you tell the caller about the final result in the async cases?
`,
  answerTemplate: `## 1. Quote lookup

## 2. Policy issued notification

## 3. Claim document upload

## General rule of thumb
`,
  keyPoints: [
    'Quote lookup is synchronous request/reply (HTTP) because the user needs the answer immediately and the backend is fast.',
    'Policy issued is async publish/subscribe (e.g. Anypoint MQ exchange or another broker) so the publisher is decoupled from four-plus consumers.',
    'Async lets each consumer fail and catch up independently; a 30-minute outage only delays that consumer instead of failing the publisher.',
    'Claim upload accepts the request and returns 202 Accepted with a tracking ID, then processes in the background.',
    'Final status for async work is delivered by polling a status endpoint, a callback/webhook, or a notification event.',
    'Rule of thumb: sync when the caller needs the result now and the chain is short and fast; async for long-running work, fan-out, or when temporal decoupling matters.',
  ],
  solution: `
**1. Quote lookup → synchronous.** The broker is waiting and the pricing engine answers in ~300 ms, so a plain HTTP request/reply API fits. Add a sensible timeout and a clear error (e.g. 503) if the engine is unavailable — there is no value in queuing a quote nobody is waiting for any more.

**2. Policy issued → asynchronous, publish/subscribe.** The policy system (or a System API in front of it) publishes one \`PolicyIssued\` event to an **Anypoint MQ exchange**; each consumer has its own queue bound to it. Benefits:
- The publisher does not know or wait for consumers; adding a fifth consumer is just a new bound queue.
- If billing is down for 30 minutes, its messages wait in its queue and are processed when it recovers. Other consumers are unaffected.
- Consumers must be idempotent because delivery is at-least-once.

**3. Claim upload → async with acknowledgement.** Accept the upload (store the files, e.g. in object storage), return **202 Accepted** with a \`claimId\`, and process ingestion in the background (queue-driven worker). A 2–10 minute HTTP call would hit timeouts and hold threads. The customer learns the outcome via a \`GET /claims/{id}/status\` endpoint (polling), a webhook/callback, or an email/push notification triggered by a \`ClaimClassified\` event.

**Rule of thumb.** Use sync when the caller needs the answer to continue and every hop is fast and available. Use async when work is long-running, when one event has many consumers, or when producers and consumers must survive each other's outages. Async adds complexity (eventual consistency, duplicates, monitoring queues), so do not use it by default.
`,
}
