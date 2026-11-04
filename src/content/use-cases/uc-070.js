import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-070',
  category: 'use-cases',
  title: 'Returning Online Orders at the Store (BORIS)',
  level: 'INTERMEDIATE',
  tags: ['retail', 'returns', 'omnichannel', 'pos', 'activemq', 'oracle', 'oracle-ebs', 'payments', 'refunds'],
  estMinutes: 30,
  diagram: {
    task: 'draw the buy-online-return-in-store flow: the store POS calling through the gateway to a returns Experience API, the cross-channel returns Process API using the OMS and payment System APIs, a ReturnCompleted event on a topic consumed by the store inventory and finance System APIs, and the offline-returns queue.',
    checks: [
      { label: 'The store POS reaches the returns Experience API through the gateway', rule: { type: 'path', from: 'pos', to: 'experience-api', via: 'api-gateway' } },
      { label: 'The returns Process API validates the order and refunds via System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'The OMS and payment provider are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'payment'], from: 'system-api' } },
      { label: 'A completed return is published once as an event', rule: { type: 'edge', from: 'process-api', to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'Store inventory and finance both consume the return event', rule: { type: 'edge', from: ['topic', 'event-stream'], to: 'system-api', kind: 'async', min: 2 } },
      { label: 'Returns taken while the store is offline are queued and replayed', rule: { type: 'edge', from: 'pos', to: 'queue', kind: 'async' } },
      { label: 'Store inventory (Oracle) and Oracle EBS are reached only through System APIs', rule: { type: 'only-via', target: ['database', 'erp'], from: 'system-api' } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store POS (420 stores)'],
        gw: ['api-gateway', 'Gateway (client ID, mTLS)'],
        exp: ['experience-api', 'exp-pos-returns'],
        prc: ['process-api', 'prc-cross-channel-returns'],
        t: ['topic', 'RETURN.COMPLETED (ActiveMQ)'],
        qoff: ['queue', 'POS.RETURNS.OFFLINE'],
        soms: ['system-api', 'sys-oms-orders'],
        spay: ['system-api', 'sys-psp-refunds'],
        ssi: ['system-api', 'sys-store-inventory'],
        sgl: ['system-api', 'sys-oracle-ebs-finance'],
        oms: ['saas', 'Salesforce Order Management'],
        psp: ['payment', 'Online PSP'],
        ora: ['database', 'Store inventory (Oracle)'],
        ebs: ['erp', 'Oracle EBS (AR / GL)'],
      },
      [
        'pos -> gw', 'gw -> exp', 'exp -> prc', 'prc -> soms', 'prc -> spay', 'prc ~> t', 't ~> ssi', 't ~> sgl', 'pos ~> qoff', 'qoff ~> prc',
        'soms -> oms', 'spay -> psp', 'ssi -> ora', 'sgl -> ebs',
      ],
    ),
  },
  description: `
A sportswear retailer lets customers **return online orders in any of its 420 stores** (BORIS — buy online, return in store). Today store staff cannot see online orders, so they issue store credit and finance fixes things manually.

Systems:
- **Store POS** — needs a new "return online order" function.
- **Salesforce Order Management** — online orders, lines, return eligibility, refund status.
- **Online PSP** — card / wallet payments of online orders; refunds must go back to the **original tender**.
- **Store inventory** (Oracle) — returned items go back into **store** stock, not the DC.
- **Oracle EBS** — finance: online sales are booked in the e-commerce legal entity; the return happens in a store entity, so an **inter-company settlement** entry is needed.

Rules and facts:
- Staff scan the order QR code from the email or search by order number + email.
- Eligible: within 30 days, not final-sale, not already returned. Response at the till in **< 2 seconds**.
- Refund must be issued at the till (customer gets confirmation immediately); finance entries can follow within an hour.
- ~6,000 store returns of online orders/day; peak in January.
- If the online lookup is unavailable, a manager can approve an **offline return** (store credit only) that must be reconciled later.

**Questions:**
1. Describe the APIs and the sequence at the till.
2. How do you make sure the refund is not issued twice (customer at another store, POS retries)?
3. How do inventory and finance get updated?
4. How do offline returns work?
`,
  answerTemplate: `## APIs

## Sequence at the till

## Preventing double refunds

## Inventory and finance updates

## Offline returns

## NFRs
`,
  keyPoints: [
    'POS → gateway → exp-pos-returns → prc-cross-channel-returns, which checks eligibility in the OMS and refunds through sys-psp-refunds in the till flow (< 2 s).',
    'Double refunds prevented by a return-line lock in the OMS (status RETURN_IN_PROGRESS) and an idempotency key per return on the PSP refund call.',
    'After the refund, one ReturnCompleted event on an ActiveMQ topic updates store inventory and books the inter-company finance entries in EBS asynchronously.',
    'Offline returns: POS stores the return locally and publishes it to a queue when back online; the Process API reconciles against the OMS and flags exceptions.',
    'Gateway policies identify each store client (client ID / mTLS) and limit rates; correlation ID from the till through every system.',
  ],
  solution: `
\`\`\`
 POS -> gateway -> exp-pos-returns -> prc-cross-channel-returns -> sys-oms-orders  -> Salesforce OM
                                                           -> sys-psp-refunds -> PSP
                                                           ~> [RETURN.COMPLETED] ~> sys-store-inventory -> Oracle
                                                                                 ~> sys-oracle-ebs-finance -> EBS
 POS (offline) ~> [POS.RETURNS.OFFLINE] ~> prc-cross-channel-returns (reconcile)
\`\`\`

**Sequence at the till.**
1. \`GET /online-orders/{orderNo}\` → order lines with returnable quantity, tender type and eligibility reason codes.
2. Staff select lines, check the goods, \`POST /online-orders/{orderNo}/returns\` with a return ID generated by the POS.
3. The Process API calls OMS to **create the return** (locks the lines), then the PSP **refund** with the return ID as idempotency key, then confirms the return in the OMS.
4. Responds to the POS with refund reference; the receipt is printed.
5. Publishes **ReturnCompleted** to the topic.

**Preventing double refunds.** The OMS rejects a second return for lines already in progress/returned. The PSP idempotency key makes a POS retry return the original refund instead of a new one. If the PSP times out, the Process API checks refund status before retrying.

**Inventory and finance.** Consumers of the topic (own queues per consumer): sys-store-inventory adds stock to the store with reason "online return" (MERGE on store + SKU), and sys-oracle-ebs-finance creates the inter-company entry (e-commerce entity owes nothing, store entity reverses revenue) through the EBS interface tables. Both are idempotent on return ID.

**Offline returns.** If the lookup fails (\`HTTP:TIMEOUT\` / connectivity) the POS offers offline mode: manager approval, store credit only, stored locally and published to \`POS.RETURNS.OFFLINE\` when connectivity returns. The Process API matches it with the OMS; mismatches (already returned elsewhere) are flagged to loss prevention.

**NFRs.** < 2 s at the till: OMS and PSP calls have tight timeouts (e.g. 800 ms) and the slow work (inventory, finance) is async. Monitoring of refund failures per store; DLQ on each consumer queue.
`,
  followUps: [
    { q: 'Why not refund to store credit always and avoid the PSP call?', a: 'Consumer law and customer expectations usually require refunds to the original payment method; store credit is only acceptable as an exception (offline mode).' },
    { q: 'What if the PSP refund succeeds but the OMS confirmation fails?', a: 'The return stays in progress; a retry (same idempotency key) is safe, and a reconciliation job closes returns where the PSP shows a refund but the OMS is not updated.' },
    { q: 'Why publish an event instead of calling inventory and finance in the till flow?', a: 'They are not needed for the customer\'s receipt; making them async keeps the till fast and means an EBS outage does not stop returns.' },
  ],
}
