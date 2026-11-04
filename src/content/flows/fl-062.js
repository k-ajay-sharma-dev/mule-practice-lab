import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-062',
  category: 'flows',
  title: 'Oracle OMS Order Status Changes to Salesforce with a Database Listener',
  level: 'INTERMEDIATE',
  tags: ['retail', 'order-management', 'oracle', 'db-listener', 'watermark', 'salesforce', 'cdc'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'Oracle rows are picked up by a Database listener with a watermark column',
      rule: { type: 'source', component: 'db-listener', where: { watermarkColumn: { set: true } } },
    },
    {
      label: 'An ID column is configured so the same row is not processed twice concurrently',
      rule: { type: 'source', component: 'db-listener', where: { idColumn: { set: true } } },
    },
    { label: 'OMS status codes are mapped to the Salesforce model with DataWeave', rule: { type: 'before', first: 'transform', then: 'sf-upsert' } },
    {
      label: 'Salesforce is updated with an upsert on an external ID (idempotent on replays)',
      rule: { type: 'exists', component: 'sf-upsert', where: { externalIdField: { set: true } } },
    },
    { label: 'Transient Salesforce failures are retried (Until Successful)', rule: { type: 'inside', component: 'sf-upsert', within: 'until-successful' } },
    {
      label: 'Rows that still fail are parked in an Oracle error table for replay',
      rule: { type: 'inside', component: ['db-insert', 'jms-publish'], within: ['on-error-continue', 'on-error-propagate'] },
    },
  ],
  referenceFlow: design(
    flow(
      'oms-status-to-salesforce',
      // db:listener: table ORDER_STATUS_V (view over ORDER_HEADER), frequency 15 s, watermark LAST_UPDATED_TS, idColumn ORDER_ID.
      // Each changed row triggers its own flow execution.
      source('db-listener', { table: 'ORDER_STATUS_V', watermarkColumn: 'LAST_UPDATED_TS', idColumn: 'ORDER_ID' }),
      [
        step('transform', {
          script:
            '%dw 2.0\noutput application/java\nvar statusMap = {\n  "CR": "Created", "AL": "Allocated", "PK": "Picked",\n  "SH": "Shipped", "DL": "Delivered", "CX": "Cancelled", "RT": "Returned"\n}\n---\n[{\n  OMS_Order_Id__c: payload.ORDER_ID as String,\n  Status__c: statusMap[payload.STATUS_CODE] default "Unknown",\n  Carrier__c: payload.CARRIER_CODE,\n  Tracking_Number__c: payload.TRACKING_NO,\n  Status_Changed_At__c: payload.LAST_UPDATED_TS as DateTime\n}]',
        }),
        scope('until-successful', { maxRetries: 3, millisBetweenRetries: 5000 }, [
          step('sf-upsert', { objectType: 'Customer_Order__c', externalIdField: 'OMS_Order_Id__c' }),
        ]),
        step('logger', { level: 'DEBUG', message: '#["Order status synced: " ++ (payload.items[0].id default "")]' }),
      ],
      [
        // Continue: the watermark moves on, so the row must be parked somewhere replayable.
        handler('on-error-continue', { type: 'ANY' }, [
          step('db-insert', {
            sql: "INSERT INTO INTEGRATION_ERROR (ERROR_ID, INTERFACE, BUSINESS_KEY, PAYLOAD, ERROR_TEXT, STATUS, CREATED_AT)\nVALUES (INTEGRATION_ERROR_SEQ.NEXTVAL, 'OMS_STATUS_SF', :orderId, :payload, :errorText, 'NEW', SYSTIMESTAMP)",
          }),
          step('logger', { level: 'ERROR', message: '#["Status sync parked: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A retailer's **order management system** runs on **Oracle**. Store associates and the contact centre use **Salesforce Service Cloud**, where each order is a \`Customer_Order__c\` record (external ID \`OMS_Order_Id__c\`). Agents keep asking "where is my order?" because Salesforce shows stale statuses.

- \`ORDER_HEADER\` has \`ORDER_ID\`, \`STATUS_CODE\` (CR, AL, PK, SH, DL, CX, RT), \`CARRIER_CODE\`, \`TRACKING_NO\`, and \`LAST_UPDATED_TS\` (TIMESTAMP, set by a trigger on every change).
- ~**60,000 status changes/day**, bursts of 50/s when the DCs close waves.
- Salesforce must reflect a change **within 1 minute**.
- The OMS team will not install triggers that call out, nor Oracle GoldenGate; read-only access to a view is fine.
- A Salesforce outage must not lose changes.

**Design the flow(s).**
`,
  answerTemplate: `## Change detection

## Mapping

## Salesforce update

## Failures and replay

## Watermark caveats in Oracle
`,
  keyPoints: [
    'Database On Table Row (db:listener) polls a table/view, uses a watermark column to fetch only rows changed since the last poll, and runs the flow once per row.',
    'idColumn lets the listener avoid handing the same row to two executions at once (e.g. in a cluster or while a slow flow is running).',
    'DataWeave maps OMS status codes to Salesforce picklist values and converts the Oracle TIMESTAMP.',
    'Salesforce Upsert on OMS_Order_Id__c is idempotent, so re-processing a row is harmless.',
    'Until Successful covers short Salesforce blips; anything still failing is written to an error table, because the next poll only picks up rows with a higher watermark, so a failed row may never come back.',
    'Oracle watermark caveat: a trigger timestamp is set at update time, not commit time, so a long transaction can commit a row with an older timestamp than the watermark — keep an overlap window or use an ORA_ROWSCN/sequence-based column.',
  ],
  solution: `
1. **Database On Table Row** — table/view \`ORDER_STATUS_V\`, **watermarkColumn** \`LAST_UPDATED_TS\`, **idColumn** \`ORDER_ID\`, frequency 15 s. The listener selects only rows with a higher watermark than the last poll; each row triggers one flow execution.
2. **Transform Message** — status code lookup (\`CR → Created\` ...), carrier, tracking, timestamp → a one-element list of \`Customer_Order__c\` records.
3. **Until Successful** (3 retries, 5 s) → **Salesforce Upsert** \`Customer_Order__c\` on \`OMS_Order_Id__c\`. Check \`payload.items.successful\` and raise an error for record-level failures (validation rules, locked records).
4. **On Error Continue** → **Database Insert** into \`INTEGRATION_ERROR\` (business key, payload, error, status NEW) + log. A small replay flow (or an ops API) re-submits NEW rows later.

**Why park instead of propagate?** The next poll only picks up rows with a higher watermark, so do not count on a failed row coming back; propagating could lose it. The error table is the replay source.

**Throughput:** at 50/s, per-row upserts may hit API limits. If they do, switch to a **Scheduler + Database Select** on the watermark (Object Store) and send changes in chunks of 200 with a Batch Aggregator or Salesforce Composite/Bulk calls.

**Oracle caveats:** a row stamped at 10:00:01 inside a transaction that commits at 10:00:20 can be missed if the poll at 10:00:15 already advanced the watermark to 10:00:14. Mitigate with a small overlap (select from watermark minus 60 s, and rely on the idempotent upsert) or use a commit-ordered column.
`,
  followUps: [
    {
      q: 'Where does the Database listener keep its watermark, and what happens on redeploy?',
      a: 'The connector reference does not spell this out. Expect an object store managed by the listener, and test what happens on a restart, a redeploy and a delete before relying on it: if the watermark is lost, the table is read from the beginning, which the idempotent upsert absorbs.',
    },
    {
      q: 'How is this different from Salesforce CDC in the other direction?',
      a: 'Here Mule polls Oracle — a pull with a delay of one polling interval. Salesforce CDC pushes events with a replay ID; Oracle offers similar push via GoldenGate/LogMiner-based tools, which the OMS team ruled out.',
    },
    {
      q: 'Two status changes for the same order arrive in one poll — can they overtake each other?',
      a: 'Yes, if the listener runs rows concurrently. Upserting the latest status and timestamp, and ignoring updates older than Status_Changed_At__c (or limiting concurrency to 1 per order), prevents an older status overwriting a newer one.',
    },
  ],
}
