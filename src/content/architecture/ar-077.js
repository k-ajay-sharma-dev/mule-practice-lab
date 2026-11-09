import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-077',
  category: 'architecture',
  title: 'Lot Traceability and Product Recall Data Architecture',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'retail', 'traceability', 'recall', 'lot-tracking', 'events', 'wms', 'edi'],
  estMinutes: 35,
  diagram: {
    task: 'draw how lot movements from suppliers and the WMS are captured into a traceability store, and how a recall is executed from the quality team to the stores.',
    checks: [
      { label: 'Lot movements are published as events by the WMS System API and the supplier ASN flow', rule: { type: 'edge', from: ['system-api', 'process-api'], to: ['topic', 'event-stream', 'queue'], kind: 'async', min: 2 } },
      { label: 'An ingest flow writes lineage through a System API into the traceability store', rule: { type: 'path', from: ['topic', 'event-stream', 'queue'], to: 'database', via: 'system-api' } },
      { label: 'The traceability store is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'The quality team uses an Experience API', rule: { type: 'each', of: 'internal-app', edgeTo: 'experience-api' } },
      { label: 'The recall Process API queries lineage through the traceability System API', rule: { type: 'edge', from: { type: 'process-api', label: ['recall'] }, to: { type: 'system-api', label: ['trace', 'lineage', 'lot'] } } },
      { label: 'Recall notices reach the store systems', rule: { type: 'path', from: 'internal-app', via: { type: 'process-api', label: ['recall'] }, to: 'pos' } },
      { label: 'WMS and store systems are reached only through System APIs', rule: { type: 'only-via', target: ['wms', 'pos'], from: 'system-api' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
      { label: 'WMS lot events reach the traceability store', rule: { type: 'path', from: 'system-api', via: ['topic', 'event-stream', 'queue'], to: 'database' } },
      { label: 'Supplier ASN lots reach the traceability store through the event stream', rule: { type: 'path', from: 'partner', via: ['topic', 'event-stream', 'queue'], to: 'database' } },
      { label: 'Every Experience API calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['database', 'wms', 'pos'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['internal-app', 'partner', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        qa: ['internal-app', 'Quality / food safety team'],
        erec: ['experience-api', 'exp-recall-console'],
        prec: ['process-api', 'prc-recall'],
        strace: ['system-api', 'sys-traceability'],
        tdb: ['database', 'Traceability store (lot lineage, 3 yrs)'],
        sup: ['partner', 'Suppliers (856 ASN with lot)'],
        pasn: ['process-api', 'prc-b2b-asn'],
        swms: ['system-api', 'sys-wms'],
        wms: ['wms', 'WMS (receipts, picks, shipments by lot)'],
        tev: ['event-stream', 'trace.events'],
        ping: ['process-api', 'prc-trace-ingest'],
        rtopic: ['topic', 'recall.notices'],
        pstore: ['process-api', 'prc-store-recall'],
        spos: ['system-api', 'sys-store-systems'],
        pos: ['pos', 'Store POS (sales block)'],
        notif: ['notification', 'Loyalty customer alerts'],
      },
      [
        'qa -> erec', 'erec -> prec', 'prec -> strace', 'strace -> tdb',
        'sup -> pasn', 'pasn ~> tev', 'swms -> wms', 'swms ~> tev', 'tev ~> ping', 'ping -> strace',
        'prec ~> rtopic', 'rtopic ~> pstore', 'pstore -> spos', 'spos -> pos', 'prec -> notif',
      ],
    ),
  },
  description: `
A grocery chain (2 DCs, 300 stores) must be able to answer, **within 4 hours**, the regulator's recall questions: *"For lot L-4471 of supplier X's spinach, which DCs received it, which stores did it ship to, how much is still on hand, and which loyalty customers bought it?"* Today this takes **3 days** of spreadsheets.

Where the data is:
- **Supplier ASNs (EDI 856)** contain lot numbers and best-before dates.
- The **WMS** records receipts and picks by lot, and shipments to stores by pallet (SSCC).
- **Oracle EBS** has POs and item masters (no lots).
- **Store POS** records sales by item (GTIN), not by lot; loyalty data links sales to customers.
- Records must be kept for 3 years.

**Questions:**
- What data model lets you trace a lot one step back and one step forward (supplier → DC → store)?
- How is it populated, and from which events?
- How does a recall execute end to end (find, block, notify)?
- How do you handle the fact that POS sales are not lot-specific?
`,
  answerTemplate: `## Traceability data model

## Capturing lot movements

## Executing a recall

## Store and customer level (no lot at POS)
`,
  keyPoints: [
    'Model traceability as an append-only event/lineage store of critical tracking events (receive, ship, transform) keyed by lot, location, SSCC and time — separate from operational systems.',
    'Populate it from events: ASN lot data from the B2B flow and receipt/pick/ship events from the WMS, through a dedicated ingest Process API and System API.',
    'The recall Process API queries lineage, then fans out blocking instructions to stores asynchronously and notifies affected customers.',
    'POS sales have no lot, so store-level exposure is inferred from shipments to the store and the time window, then matched to loyalty purchases of that item.',
    'Keep records for the retention period and practise mock recalls to prove the 4-hour target.',
  ],
  solution: `
**Data model.** An append-only **traceability store** of events:
\`\`\`
trace_event(event_id, type[RECEIVE|SHIP|TRANSFORM|SELL_WINDOW], gtin, lot, sscc,
            from_location, to_location, qty, event_time, source, source_ref)
\`\`\`
Lot + SSCC link a supplier ASN to a DC receipt, and DC shipments (by SSCC) to store receipts. This gives "one step back, one step forward" without querying four systems during a crisis.

**Capture.**
\`\`\`
 Supplier 856 ─► prc-b2b-asn ~► trace.events ~► prc-trace-ingest ─► sys-traceability ─► trace store
 WMS ◄─ sys-wms ~► trace.events (receipt by lot, pick, ship by SSCC)
\`\`\`
Ingest is idempotent (event id), tolerant of order (store events, compute lineage at query time), and flags ASNs without lot data back to the supplier.

**Recall.**
1. The quality team opens \`exp-recall-console\` and enters GTIN + lot(s).
2. \`prc-recall\` asks \`sys-traceability\` for the forward lineage: DCs, stores, quantities, dates.
3. It blocks remaining DC stock via the WMS and publishes **recall.notices** per affected store; \`prc-store-recall\` tells the store systems to block the item at the till and remove it from shelves.
4. Affected loyalty customers (bought that GTIN at those stores within the window) get alerts.
5. Everything is logged for the regulator.

**No lot at POS.** Exposure per store = shipments of the lot to that store and the sell-through window (receipt date to best-before). Customer notification is therefore **probable exposure**; that is the accepted practice, and it is why the window must be accurate.

**Trade-offs:** another data store to own and secure (loyalty data is PII); it is only as good as supplier ASN quality; an append-only model grows quickly — partition by date and archive after 3 years.
`,
  followUps: [
    { q: 'Why not just query the WMS and POS at recall time?', a: 'They are operational systems with short retention, different identifiers and no lineage; querying them under time pressure is slow and risky. A purpose-built lineage store answers in seconds and survives system changes.' },
    { q: 'How do you prove you meet the 4-hour target?', a: 'Run regular mock recalls on a real lot, time each step, and track data-quality metrics such as the percentage of ASNs and receipts with lot numbers.' },
    { q: 'A supplier sends a corrected ASN with different lots after receipt. What happens?', a: 'Store it as a correction event that supersedes the earlier one (never overwrite), and flag the receipt for review so lineage reflects what was actually received.' },
  ],
}
