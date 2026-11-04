import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-063',
  category: 'use-cases',
  title: 'Vendor-Managed Inventory Feed to Suppliers',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'retail', 'vmi', 'edi', 'x12', 'oracle', 'oracle-ebs', 'batch', 'b2b', 'activemq'],
  estMinutes: 30,
  diagram: {
    task: 'draw the VMI integration: the nightly feed job and VMI Process API reading Oracle inventory, delivery to EDI suppliers through the VAN and to API suppliers through the gateway, and supplier-generated orders flowing through a queue into Oracle EBS.',
    checks: [
      { label: 'A scheduled job triggers the nightly VMI feed', rule: { type: 'edge', from: 'batch-job', to: 'process-api' } },
      { label: 'The Oracle inventory and sales data is read only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'EDI suppliers are reached through the VAN only via a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'API-connected suppliers come through the gateway to a supplier Experience API', rule: { type: 'path', from: 'partner', to: 'experience-api', via: 'api-gateway' } },
      { label: 'Supplier-generated orders are queued asynchronously', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'A Process API consumes the supplier orders', rule: { type: 'edge', from: ['queue', 'topic'], to: 'process-api', kind: 'async' } },
      { label: 'Oracle EBS purchasing is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
    ],
    reference: diagram(
      {
        sup: ['partner', 'API suppliers (35)'],
        gw: ['api-gateway', 'Gateway (OAuth client credentials, rate limit)'],
        expp: ['experience-api', 'exp-supplier-vmi'],
        job: ['batch-job', 'Nightly VMI extract (02:00)'],
        prc: ['process-api', 'prc-vmi-feed'],
        qpo: ['queue', 'VMI.SUPPLIER.ORDERS'],
        prcpo: ['process-api', 'prc-vmi-orders'],
        sinv: ['system-api', 'sys-inventory-sales'],
        sedi: ['system-api', 'sys-b2b-edi'],
        serp: ['system-api', 'sys-oracle-ebs-po'],
        ora: ['database', 'Oracle inventory & sales mart'],
        van: ['external-api', 'VAN (85 EDI suppliers)'],
        ebs: ['erp', 'Oracle EBS Purchasing'],
        arc: ['file-store', 'Feed archive'],
      },
      [
        'sup -> gw', 'gw -> expp', 'expp -> prc', 'expp ~> qpo', 'qpo ~> prcpo', 'job -> prc', 'prc -> sinv', 'prc -> sedi', 'prc -> arc',
        'sinv -> ora', 'sedi -> van', 'prcpo -> serp', 'serp -> ebs',
      ],
    ),
  },
  description: `
A pharmacy chain with **300 stores and 2 DCs** wants its top **120 suppliers** to manage replenishment themselves (vendor-managed inventory). Every night each supplier must receive, for its own items only:
- on-hand, on-order and in-transit quantity per item and location (DC and store),
- units sold per item and location for the previous day.

Sources: an **Oracle 19c** inventory & sales mart (refreshed by 01:30 from POS and WMS) and **Oracle EBS Purchasing** for open POs.

| Supplier group | Count | Channel |
|---|---|---|
| Large | 35 | REST API — they pull their feed and push replenishment orders |
| Others | 85 | EDI X12 via a VAN: **852** product activity data + **846** inventory advice; they send replenishment orders as **850** |

Facts:
- ~40,000 items × 302 locations; a large supplier's feed is ~2 million rows.
- Suppliers must have the data by **05:00**; their orders must create POs in EBS by **09:00** so DCs can schedule receipts.
- A supplier must **never** see another supplier's data.
- Supplier orders must respect min/max levels agreed in the VMI contract; orders outside the limits need buyer approval.

**Questions:**
1. How do you extract and deliver the feed efficiently?
2. How do API suppliers get their data, and how do you enforce data isolation?
3. How do supplier orders become POs in EBS?
`,
  answerTemplate: `## Nightly extract

## Delivery to EDI suppliers

## Delivery to API suppliers

## Data isolation

## Supplier orders into EBS

## Monitoring
`,
  keyPoints: [
    'Nightly job → prc-vmi-feed reads Oracle per supplier with streaming (fetch size, no full in-memory load) via sys-inventory-sales; files are archived for audit.',
    'EDI suppliers receive 852/846 through sys-b2b-edi and the VAN; API suppliers pull a prepared feed (paged or file download) through the gateway.',
    'Isolation: the supplier ID comes from the OAuth client (client ID → supplier mapping), never from a request parameter; every query is filtered by it.',
    'Supplier orders are accepted fast, queued in ActiveMQ and validated against VMI min/max before creating POs in EBS via the purchasing open interface.',
    'Per-supplier delivery status and a 05:00 SLA alert; 997s confirm EDI receipt.',
  ],
  solution: `
\`\`\`
 02:00 job -> prc-vmi-feed -> sys-inventory-sales -> Oracle mart (streamed per supplier)
                    |-> sys-b2b-edi -> VAN (852 + 846)        -> archive
 API supplier -> gateway -> exp-supplier-vmi -> prc-vmi-feed (GET feed, paged)
 API supplier -> gateway -> exp-supplier-vmi ~> [VMI.SUPPLIER.ORDERS] ~> prc-vmi-orders -> sys-oracle-ebs-po -> EBS
 EDI supplier 850 -> VAN -> (B2B inbound) ~> same queue
\`\`\`

**Extract.** At 02:00 (after the mart refresh flag is set) the job loops over suppliers. For each, **sys-inventory-sales** runs a parameterised \`db:select\` filtered by supplier ID with **streaming** and a sensible fetch size, so 2 million rows are never held in memory. DataWeave streams the result into the EDI or CSV/JSON output. Several suppliers run in parallel (a bounded For Each / Parallel For Each with max concurrency), keeping the Oracle pool small.

**EDI delivery.** One 852 and one 846 per supplier, sent through sys-b2b-edi to the VAN; the interchange control number is stored and a 997 is expected within 1 hour.

**API delivery.** The feed for API suppliers is written as a compressed file and exposed by exp-supplier-vmi as \`GET /vmi/feed?date=\` (download) or a paged \`GET /vmi/positions\`. They poll after 03:00.

**Isolation.** The gateway enforces OAuth 2.0 client credentials; the Experience API maps the client ID to the supplier ID and passes it downstream — a supplier cannot ask for another supplier ID. Every SQL query includes \`WHERE supplier_id = :supplierId\`.

**Supplier orders.** \`POST /vmi/orders\` validates the schema, returns 202 with an order reference, and publishes to the ActiveMQ queue. prc-vmi-orders checks each line against VMI min/max (contract table): in range → insert into the purchasing open interface (PO_HEADERS_INTERFACE / PO_LINES_INTERFACE) and run the import; out of range → buyer approval task. Status is returned to the supplier via \`GET /vmi/orders/{ref}\` (and an 855 for EDI suppliers).

**Errors and NFRs.** One supplier failing must not stop the others — errors are caught per supplier and summarised in a run report. Late mart refresh → the job waits up to 60 minutes, then alerts. DLQ on the orders queue with replay.
`,
  followUps: [
    { q: 'Why not let API suppliers query the Oracle mart live?', a: 'Unpredictable ad-hoc queries from 35 companies would load the mart during the night batch. A prepared daily snapshot is consistent, cheap to serve and matches the business process.' },
    { q: 'How do you stream 2 million rows without running out of memory?', a: 'Use the Database connector\'s streaming result set with a fetch size, a streaming-friendly DataWeave transformation, and write directly to the file/SFTP output instead of collecting into an array.' },
    { q: 'How would you prove a supplier received its data?', a: 'For EDI the 997 matched on control number; for API suppliers access logs from the gateway showing the download, stored with the run report.' },
  ],
}
