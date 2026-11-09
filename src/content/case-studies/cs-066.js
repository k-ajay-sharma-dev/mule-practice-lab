import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-066',
  category: 'case-studies',
  title: 'Grocery Chain Automating Store Replenishment With a Forecasting SaaS',
  level: 'INTERMEDIATE',
  tags: ['retail', 'supply-chain', 'replenishment', 'batch', 'scheduler', 'sap', 'wms', 'edi'],
  estMinutes: 45,
  diagram: {
    task: 'draw the nightly replenishment cycle: an extract job reading the sales data warehouse and sending files to the forecasting SaaS over SFTP, an import job that splits order proposals onto a DC queue and a supplier queue, Process APIs that create DC orders in the WMS and supplier purchase orders in SAP and over EDI, and a dead-letter queue.',
    checks: [
      { label: 'The extract job reads the sales data warehouse', rule: { type: 'edge', from: 'batch-job', to: 'data-warehouse', kind: 'sync' } },
      { label: 'Scheduled jobs move files both to and from the SFTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server', min: 2 } },
      { label: 'The import job splits proposals onto separate DC and supplier queues', rule: { type: 'edge', from: 'batch-job', to: 'queue', kind: 'async', min: 2 } },
      { label: 'A DC replenishment Process API creates orders in the WMS', rule: { type: 'path', from: 'queue', to: 'wms', via: { type: 'process-api', label: ['dc', 'store'] } } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'A supplier orders Process API creates purchase orders in SAP', rule: { type: 'path', from: 'queue', to: 'erp', via: { type: 'process-api', label: ['supplier', 'purchase'] } } },
      { label: 'Supplier orders are also sent out over EDI', rule: { type: 'path', from: { type: 'process-api', label: ['supplier', 'purchase'] }, to: 'external-api', via: 'system-api' } },
      { label: 'No synchronous chain runs from a scheduled job to the WMS', rule: { type: 'no-path', from: 'batch-job', to: 'wms', kind: 'sync' } },
      { label: 'Orders that cannot be processed go to a dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq', kind: 'async' } },
    ],
    reference: diagram(
      {
        dw: ['data-warehouse', 'Sales data warehouse (Snowflake)'],
        ext: ['batch-job', 'Nightly sales and stock extract (01:00)'],
        sftp: ['sftp-server', 'RELEX SFTP'],
        relex: ['saas', 'RELEX forecasting and replenishment'],
        imp: ['batch-job', 'Order proposal import (03:30)'],
        qdc: ['queue', 'replenishment.dc-orders'],
        qsup: ['queue', 'replenishment.supplier-orders'],
        pdc: ['process-api', 'prc-dc-replenishment'],
        psup: ['process-api', 'prc-supplier-orders'],
        swms: ['system-api', 'sys-wms-api'],
        wms: ['wms', 'Blue Yonder WMS (4 DCs)'],
        ssap: ['system-api', 'sys-sap-purchasing-api'],
        sap: ['erp', 'SAP S/4HANA'],
        sedi: ['system-api', 'sys-edi-outbound-api'],
        edi: ['external-api', 'EDI gateway (EDIFACT ORDERS)'],
        dlq: ['dlq', 'replenishment DLQ'],
      },
      [
        'ext -> dw', 'ext -> sftp', 'relex -> sftp', 'imp -> sftp', 'imp ~> qdc', 'imp ~> qsup', 'qdc ~> pdc', 'qsup ~> psup',
        'pdc -> swms', 'swms -> wms', 'psup -> ssap', 'ssap -> sap', 'psup -> sedi', 'sedi -> edi', 'qdc ~> dlq', 'qsup ~> dlq',
      ],
    ),
  },
  description: `
**Context.** A grocery chain runs 600 supermarkets and convenience stores, each with up to 25,000 products. Store managers still order most products by hand with a handheld scanner, so shelves are empty on Sunday evenings and fresh food waste is 4.1% of sales.

**The change.** The business has signed with RELEX, a forecasting and replenishment SaaS. Each night RELEX needs the day's sales and stock, and it returns order proposals.
- Most products come from the chain's 4 DCs, which run Blue Yonder WMS.
- About 15% (bread, milk, eggs, magazines) are delivered straight to stores by 140 suppliers. These need purchase orders in SAP S/4HANA and an EDIFACT ORDERS message to the supplier.

**Interfaces RELEX supports.** Bulk files over SFTP (CSV, up to 4 GB a night) and a REST API for small changes. RELEX recommends files for the nightly cycle.

**Timeline every night**
| Time | Step |
|---|---|
| 00:30 | Stores close the day; POS sales land in the Snowflake data warehouse |
| 01:00 | Sales, stock and open orders must be sent to RELEX |
| 03:30 | RELEX publishes about 2.5 million order lines |
| 05:00 | DC wave planning starts; DC orders must be in the WMS by then |
| 06:00 | Supplier cut-off for next-day delivery |

**Constraints**
- The WMS import API accepts 500 lines per call and cannot take parallel calls per DC.
- A bad line (unknown product, closed store) must not stop the other 2.5 million.
- Operations must know by 04:45 if the run is late.

**Your task.** Design the nightly replenishment integration.
`,
  answerTemplate: `## Sending sales and stock to RELEX

## Receiving and splitting order proposals

## DC orders into the WMS

## Supplier orders into SAP and over EDI

## Deadlines, errors and monitoring
`,
  keyPoints: [
    'Use files over SFTP for the nightly bulk exchange, with scheduled jobs for export at 01:00 and import at 03:30, as RELEX recommends.',
    'The import job streams the file and splits lines onto a DC queue and a supplier queue, so the two flows run at their own pace.',
    'The DC Process API groups lines into batches of 500 per DC and calls the WMS one batch at a time per DC through a System API.',
    'The supplier Process API creates SAP purchase orders and sends EDIFACT ORDERS through an EDI System API.',
    'Bad lines go to a DLQ with the reason; a deadline monitor alerts at 04:45 if the DC queue is not empty.',
  ],
  solution: `
**Export (01:00).** A scheduled job reads the day's sales, stock and open orders from Snowflake in pages and writes three CSV files to the RELEX SFTP folder, then a done file. The job uses streaming so a 4 GB file does not fill memory.

**Import (03:30).** A second job waits for the RELEX done file, reads the proposal file as a stream and publishes each line, grouped by store and DC, onto:
- \`replenishment.dc-orders\` for DC-supplied products
- \`replenishment.supplier-orders\` for direct-to-store products

Unknown products or closed stores are written to an error file and the DLQ; the rest continue.

**DC orders.** \`prc-dc-replenishment\` takes messages from the DC queue, builds batches of 500 lines per DC and calls \`sys-wms-api\`. A separate consumer per DC (one at a time per DC) respects the WMS limit while 4 DCs load in parallel. 2.1 million DC lines finish in about 70 minutes.

**Supplier orders.** \`prc-supplier-orders\` groups lines by supplier and store, creates purchase orders through \`sys-sap-purchasing-api\` and sends the EDIFACT ORDERS message through \`sys-edi-outbound-api\`. It records the SAP PO number on each line so a replay does not create a second PO.

**Monitoring.** A dashboard shows lines exported, imported, queued and loaded per DC. At 04:45 an alert fires if a DC queue still has messages, so the DC can delay wave planning.
`,
  followUps: [
    { q: 'Why use SFTP files instead of the RELEX REST API at night?', a: 'The nightly exchange is millions of lines in one window. Bulk files are faster, cheaper and what RELEX recommends; the API suits small daytime changes.' },
    { q: 'How do you respect the WMS limit of one call at a time per DC?', a: 'Run one consumer per DC that sends batches of 500 lines in turn. Different DCs still load in parallel.' },
    { q: 'What stops a rerun creating duplicate supplier purchase orders?', a: 'Each line keeps the SAP purchase order number once created. A replay checks it and skips lines that already have a PO.' },
    { q: 'How does operations know the run is late?', a: 'A monitor checks queue depth and loaded counts per DC. It alerts at 04:45 if any DC still has unloaded lines.' },
  ],
}
