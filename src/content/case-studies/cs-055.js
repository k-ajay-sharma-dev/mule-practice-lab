import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-055',
  category: 'case-studies',
  title: 'Food Manufacturer Building Lot Traceability and a Recall Programme',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'traceability', 'recall', 'lot-tracking', 'sap', 'oracle', 'events'],
  estMinutes: 45,
  diagram: {
    task: 'draw the traceability and recall architecture: lot events from plant MES, SAP and the DC WMS feeding a genealogy Process API and a traceability store, and a recall console that blocks batches in SAP, holds stock in the WMS and notifies customers through a recall topic.',
    checks: [
      { label: 'MES, SAP and the WMS each publish lot events asynchronously', rule: { type: 'edge', from: ['legacy', 'erp', 'wms', 'system-api'], to: ['event-stream', 'queue', 'topic'], kind: 'async', min: 3 } },
      { label: 'A genealogy/traceability Process API consumes the lot events', rule: { type: 'edge', from: ['event-stream', 'queue', 'topic'], to: { type: 'process-api', label: ['trace', 'lot', 'genealogy'] } } },
      { label: 'The traceability store is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'The QA team starts a recall through an Experience API and a recall Process API', rule: { type: 'path', from: 'internal-app', to: { type: 'process-api', label: ['recall'] }, via: 'experience-api' } },
      { label: 'A recall blocks the affected batches in SAP', rule: { type: 'path', from: { type: 'process-api', label: ['recall'] }, to: 'erp' } },
      { label: 'Recall notices are published once and fanned out to several consumers', rule: { type: 'edge', from: 'topic', kind: 'async', min: 2 } },
      { label: 'Recall notices put stock on hold in the WMS', rule: { type: 'path', from: 'topic', to: 'wms' } },
      { label: 'Customers are told which lots to withdraw', rule: { type: 'path', from: 'topic', to: ['external-api', 'notification'] } },
    ],
    reference: diagram(
      {
        qa: ['internal-app', 'QA & recall team console'],
        erc: ['experience-api', 'exp-recall-console-api'],
        gen: ['process-api', 'prc-lot-genealogy'],
        rec: ['process-api', 'prc-recall-api'],
        ls: ['event-stream', 'lot-events'],
        rt: ['topic', 'recall-notices'],
        strace: ['system-api', 'sys-trace-store-api'],
        ssap: ['system-api', 'sys-sap-batch-api'],
        swms: ['system-api', 'sys-wms-api'],
        scust: ['system-api', 'sys-customer-edi-api'],
        mes: ['legacy', 'Plant MES (4 plants)'],
        sap: ['erp', 'SAP S/4HANA (batch management)'],
        wms: ['wms', 'DC WMS'],
        tdb: ['database', 'Oracle traceability store'],
        cust: ['external-api', 'Retail customers (EDI / portal)'],
        notif: ['notification', 'Internal recall alerts'],
      },
      [
        'mes ~> ls', 'sap ~> ls', 'wms ~> ls', 'ls ~> gen', 'gen -> strace', 'strace -> tdb',
        'qa -> erc', 'erc -> rec', 'rec -> strace', 'rec -> ssap', 'ssap -> sap', 'rec ~> rt',
        'rt ~> swms', 'swms -> wms', 'rt ~> scust', 'scust -> cust', 'scust -> notif',
      ],
    ),
  },
  description: `
**Context.** A food manufacturer with four plants and three distribution centres supplies supermarkets and food-service customers. Raw material lots, production batches and shipments are recorded in different systems: SAP S/4HANA (batch management, goods receipts, deliveries), a plant MES (which raw lots went into which production batch) and a WMS in each DC (which pallets went on which truck). During the last allergen recall, it took the team 30 hours and a lot of spreadsheets to work out which customers had received the affected batches.

**Goals**
- Trace one step back (supplier lots) and one step forward (customers) for any lot within 2 hours.
- Run a recall from one console: block batches, hold stock, notify customers.
- Produce audit evidence for regulators and retailer audits.

**Constraints**
| Item | Detail |
|---|---|
| MES | On-premises, can write events to an outbound table or a JMS queue; no API |
| SAP | Batch and delivery data available through IDocs/OData; batches can be blocked via a standard function |
| WMS | Publishes pallet and shipment confirmations; has an API to place stock on hold |
| Customers | Large retailers want recall notices by EDI or their supplier portal; smaller ones by email |
| Data | Several million lot links a year; records kept for several years |

**Your task.** Design the traceability data flow, the recall process and how you would prove it works.
`,
  answerTemplate: `## Traceability data model (lots, batches, shipments, links)

## Capturing lot events from MES, SAP and WMS

## Tracing back and forward

## Recall workflow

## Testing and audit evidence

## Risks
`,
  keyPoints: [
    'Traceability is a graph of lot links (consumed-into, produced-as, shipped-to); every source system publishes lot events as they happen instead of being queried during a crisis.',
    'A genealogy Process API normalises events into one model and writes them to a dedicated traceability store behind a System API, indexed for back and forward queries.',
    'The recall console calls a recall Process API that blocks batches in SAP and publishes a recall notice event fanned out to WMS holds and customer notifications.',
    'Customer notifications are sent per customer preference (EDI, portal, email) and acknowledgements are tracked until every customer confirms.',
    'Mock recalls run on a schedule with timed results, giving audit evidence and catching gaps in the data.',
  ],
  solution: `
**Phases**
1. **Capture (months 1–3).** MES writes consumption/production events to a JMS queue (or an outbound table read by a \`db:listener\` with a watermark column). SAP batch and delivery events via IDocs; WMS shipment confirmations via its event feed. All are mapped to a common \`LotEvent\` (lot, parent lot, quantity, location, time, source) and published to \`lot-events\`.
2. **Store and query (months 3–5).** \`prc-lot-genealogy\` validates and de-duplicates (source + event ID) and calls \`sys-trace-store-api\`, which writes links into an Oracle traceability store with indexes for both directions (hierarchical queries with \`CONNECT BY\` or recursive \`WITH\`). Back-fill two years of history from SAP and MES extracts.
3. **Recall (months 5–7).** \`exp-recall-console-api\` → \`prc-recall-api\`: run the trace, show affected batches, customers and stock positions, and on approval block batches in SAP, publish a \`RecallNotice\` to the \`recall-notices\` topic. Subscribers place WMS holds and send customer notices (EDI, portal or email) with lot lists. Customer acknowledgements are tracked.
4. **Prove it (ongoing).** Quarterly mock recalls with a timer, results reported to QA leadership.

**Architecture.** Event-driven capture, API-led access. Nothing queries MES or WMS live during a recall; the store already has the links.

**Governance.** Data owners per source; lot ID formats agreed across plants; retention rules agreed with legal; recall runbook with approvals (who can trigger a recall).

**Risks.** Missing links because a plant records consumption late (data-quality dashboards, gap alerts), mismatched lot formats between systems (normalisation and cross-reference), customer contact data out of date (validated in mock recalls), and over-broad recalls when data is incomplete.
`,
  followUps: [
    { q: 'Why not query SAP, MES and WMS live when a recall starts?', a: 'Live queries across systems with different keys are slow and fragile under pressure. Capturing links continuously means the trace is a fast query on one store.' },
    { q: 'How do you know the traceability data is complete?', a: 'Reconcile counts per day and per plant against the sources, alert on production batches with no consumed lots, and run timed mock recalls.' },
    { q: 'What if a WMS hold call fails during a recall?', a: 'The WMS subscriber retries, then sends the notice to a DLQ with an alert; the recall dashboard shows which holds are still pending so someone can act manually.' },
    { q: 'Would you use a graph database instead of Oracle?', a: 'It is a reasonable option for deep genealogy queries. Oracle recursive queries are usually enough for one-up/one-down at this scale and the company already operates Oracle.' },
  ],
}
