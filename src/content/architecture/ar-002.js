import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-002',
  category: 'architecture',
  title: 'Sync Request/Reply vs Async Events',
  level: 'INTERMEDIATE',
  tags: ['sync', 'async', 'event-driven'],
  estMinutes: 45,
  diagram: {
    task: 'draw all three integrations: the synchronous quote lookup, the PolicyIssued fan-out to four consumers, and the claim upload that is accepted and then processed in the background.',
    checks: [
      { label: 'A channel calls an Experience API synchronously for the quote', rule: { type: 'edge', from: ['web-app', 'mobile-app', 'partner'], to: 'experience-api', kind: 'sync' } },
      { label: 'The broker gets the quote from the pricing engine over sync calls', rule: { type: 'path', from: ['web-app', 'partner'], to: ['external-api', 'saas', 'legacy', 'erp'], kind: 'sync' } },
      { label: 'The policy admin system (or its System API) publishes PolicyIssued asynchronously to an exchange or topic', rule: { type: 'edge', from: ['legacy', 'erp', 'saas', 'system-api', 'process-api'], to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'The exchange fans out to at least four queues (one per consumer)', rule: { type: 'edge', from: ['topic', 'event-stream'], to: 'queue', min: 4 } },
      { label: 'Every queue has a consumer', rule: { type: 'each', of: 'queue', edgeTo: ['process-api', 'system-api', 'batch-job', 'erp', 'crm', 'saas', 'data-warehouse', 'database', 'legacy'] } },
      { label: 'PolicyIssued reaches all four consumer systems through the exchange', rule: { type: 'path', from: ['topic', 'event-stream'], to: ['erp', 'crm', 'saas', 'data-warehouse', 'database', 'legacy', 'external-api'], min: 4 } },
      { label: 'Claim files are stored in file/object storage', rule: { type: 'edge', from: ['experience-api', 'process-api', 'system-api', 'mobile-app', 'web-app'], to: 'file-store' } },
      { label: 'The upload is stored during the request, before the 202 reply', rule: { type: 'path', from: ['mobile-app', 'web-app'], to: 'file-store', kind: 'sync' } },
      { label: 'Claim ingestion is handed off asynchronously instead of running inside the HTTP call', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: ['queue', 'topic'], kind: 'async' } },
      { label: 'A background worker takes each claim from the queue to the claims system', rule: { type: 'path', from: 'experience-api', via: ['queue', 'topic', 'event-stream', 'cloud-queue'], to: { type: ['saas', 'legacy', 'erp', 'crm', 'external-api'], label: 'claim' } } },
      { label: 'No chain of sync calls joins the upload request to the slow claims system', rule: { type: 'no-path', from: 'experience-api', to: { type: ['saas', 'legacy', 'erp', 'crm', 'external-api'], label: 'claim' }, kind: 'sync', ifDrawn: true } },
      { label: 'Channels never call backends directly', rule: { type: 'no-edge', from: ['web-app', 'mobile-app'], to: ['external-api', 'legacy', 'erp', 'crm', 'saas', 'data-warehouse', 'database'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['web-app', 'mobile-app', 'partner', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        brk: ['web-app', 'Broker portal'],
        cust: ['mobile-app', 'Customer claims app'],
        eq: ['experience-api', 'exp-quote-api', { vCores: '0.5' }],
        ec: ['experience-api', 'exp-claims-api (202 + claimId)'],
        sp: ['system-api', 'sys-pricing-api', { vCores: '0.5', timeoutMs: 2000 }],
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
        pci: ['process-api', 'prc-claim-ingest', { timeoutMs: 600000 }],
        cls: ['saas', 'Claims system'],
      },
      [
        'brk -> eq', 'eq -> sp', 'sp -> pe',
        'pas ~> ex', 'ex ~> qb', 'ex ~> qd', 'ex ~> qw', 'ex ~> qc',
        'qb ~> bill', 'qd ~> doc', 'qw ~> dwh', 'qc ~> crm',
        'cust -> ec', 'ec -> fs', 'ec ~> cq', 'cq ~> pci', 'pci -> fs', 'pci -> cls',
      ],
    ),
    simulation: {
      systems: [
        { match: 'external-api', latencyMs: 300 },
        { match: { type: 'saas', label: 'claim' }, latencyMs: 180000 },
        { match: 'file-store', latencyMs: 1500 },
        { match: 'erp', maxRps: 20 },
      ],
      tests: [
        {
          name: 'Brokers ask for quotes at peak',
          about: 'The broker portal sends 100 quote requests a second for ten minutes. Brokers wait on screen, so nearly all must be answered in well under a second, within the 2 vCore budget.',
          traffic: [{ name: 'quotes', from: 'web-app', rps: 100, to: 'external-api' }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 600 }], vCores: { max: 2 } },
        },
        {
          name: 'Billing is down for 30 minutes',
          about: 'The policy admin system issues 2 policies a second for an hour, and billing is down from minute 5 to minute 35. Its messages wait in its own queue, the other consumers carry on, and nothing is lost.',
          durationMin: 60,
          traffic: [
            {
              name: 'policy issued',
              from: 'legacy',
              rps: 2,
              kind: 'write',
              to: ['erp', { type: 'saas', label: 'document' }, 'data-warehouse', 'crm'],
            },
          ],
          incidents: [{ down: 'erp', at: 5, forMin: 30 }],
          expect: {
            answers: [{ minSuccess: 0.99 }],
            delivered: [
              { to: 'erp', min: 0.99 },
              { to: { type: 'saas', label: 'document' }, min: 0.99 },
              { to: 'data-warehouse', min: 0.99 },
              { to: 'crm', min: 0.99 },
            ],
            backlog: [{ queue: 'queue', maxEnd: 0 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'Customers upload claims',
          about: 'Customers upload 1 claim a second for half an hour. Each upload is stored and answered with 202 in a few seconds, and the worker hands every claim to the claims system, which takes about 3 minutes per claim.',
          durationMin: 30,
          traffic: [{ name: 'claims', from: 'mobile-app', rps: 1, kind: 'write', to: ['file-store', { type: 'saas', label: 'claim' }] }],
          expect: {
            answers: [{ minSuccess: 0.99, maxMs: 2500 }],
            delivered: [{ to: { type: 'saas', label: 'claim' }, min: 0.9, max: 1.05 }],
            backlog: [{ queue: { type: 'queue', label: 'claim' }, maxEnd: 120 }],
          },
        },
      ],
    },
  },
  description: `
An insurance company is building three integrations on Mule 4 (CloudHub 2.0):

1. **Quote lookup**: the broker portal calls an API to get a premium quote. Brokers wait on screen; the pricing engine answers in ~300 ms.
2. **Policy issued notification**: when a policy is issued in the policy admin system, **four** downstream systems need to know: billing, document generation, the data warehouse and a CRM. More consumers are expected next year.
3. **Claim document upload**: a customer uploads a claim with photos (up to 50 MB). The claims system takes 2 to 10 minutes to ingest and classify the files.

Numbers for sizing: at peak brokers ask for 100 quotes a second. About 2 policies are issued a second. Customers upload up to 1 claim a second; storing the files takes about 1.5 s, and the claims system takes about 3 minutes per claim. Billing has had outages of 30 minutes. The budget for the APIs is 2 vCores.

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
    'Sizing: 100 quotes a second needs 0.5 vCore on the quote APIs. The claim worker needs a timeout longer than the 3 minute ingest, or every claim times out and is tried again.',
  ],
  solution: `
**1. Quote lookup → synchronous.** The broker is waiting and the pricing engine answers in ~300 ms, so a plain HTTP request/reply API fits. Add a sensible timeout and a clear error (e.g. 503) if the engine is unavailable: there is no value in queuing a quote nobody is waiting for any more.

**2. Policy issued → asynchronous, publish/subscribe.** The policy system (or a System API in front of it) publishes one \`PolicyIssued\` event to an **Anypoint MQ exchange**; each consumer has its own queue bound to it. Benefits:
- The publisher does not know or wait for consumers; adding a fifth consumer only needs a new bound queue.
- If billing is down for 30 minutes, its messages wait in its queue and are processed when it recovers. Other consumers are unaffected.
- Consumers must be idempotent because delivery is at-least-once.

**3. Claim upload → async with acknowledgement.** Accept the upload (store the files, e.g. in object storage), return **202 Accepted** with a \`claimId\`, and process ingestion in the background (queue-driven worker). A 2 to 10 minute HTTP call would hit timeouts and hold threads. The customer learns the outcome via a \`GET /claims/{id}/status\` endpoint (polling), a webhook/callback, or an email/push notification triggered by a \`ClaimClassified\` event.

**Sizing and failure handling.**
- At 100 quotes a second, 0.1 vCore (about 50 requests a second) is too small. 0.5 vCore on the quote Experience API and the pricing System API carries the peak. A 2 s timeout on the pricing call fails fast when the engine hangs.
- The claim worker waits for the claims system, which takes minutes. Give its call a timeout of 10 minutes. With the default 10 s, every claim times out, goes back on the queue and is sent to the claims system again and again.
- While billing is down, its messages wait in billing-q. The other three queues keep flowing, and billing-q drains when billing is back. The design uses 1.2 vCores.

**Rule of thumb.** Use sync when the caller needs the answer to continue and every hop is fast and available. Use async when work is long-running, when one event has many consumers, or when producers and consumers must survive each other's outages. Async adds complexity (eventual consistency, duplicates, monitoring queues), so do not use it by default.
`,
}
