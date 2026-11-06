import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-069',
  category: 'flows',
  title: 'Product Recall: Lot Trace and Quarantine in Oracle, then Fan-out to Stores, DCs and Customers',
  level: 'EXPERT',
  tags: ['supply-chain', 'retail', 'recall', 'traceability', 'oracle', 'stored-procedure', 'activemq', 'jms', 'scatter-gather'],
  estMinutes: 50,
  flowChecks: [
    { label: 'QA raises a recall through an HTTP API', rule: { type: 'source', component: 'http-listener', where: { path: 'recall' } } },
    {
      label: 'Affected lots are quarantined by an Oracle procedure inside a DB transaction with the recall record',
      rule: { type: 'inside', component: 'db-stored-procedure', within: 'try' },
    },
    {
      label: 'The fan-out is handed off via JMS only after the quarantine committed',
      rule: { type: 'before', first: 'try', then: 'jms-publish' },
    },
    {
      label: 'A separate JMS-driven flow consumes the recall event and does the fan-out',
      rule: { type: 'source', component: 'jms-listener', where: { destination: 'RECALL' } },
    },
    {
      label: 'Affected locations and customers are traced in Oracle before notifying',
      rule: { type: 'before', first: ['db-stored-procedure', 'db-select'], then: 'scatter-gather' },
    },
    { label: 'Stores, DCs and customers are notified in parallel (Scatter-Gather, 3 routes)', rule: { type: 'routes', component: 'scatter-gather', min: 3 } },
    {
      label: 'Each store gets its own recall message (per-store JMS destination)',
      rule: { type: 'inside', component: 'jms-publish', within: 'scatter-gather' },
    },
    {
      label: 'Every notification outcome is recorded in Oracle for the audit trail',
      rule: { type: 'before', first: 'scatter-gather', then: ['db-bulk-insert', 'db-insert'] },
    },
  ],
  referenceFlow: design(
    flow(
      'recall-api',
      source('http-listener', { path: '/api/recalls', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-empty-collection', expression: '#[payload.lots]', message: 'At least one lot is required' }),
        step('set-variable', { variableName: 'recall', value: '#[payload]' }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          // PK RECALL_ID: the same recall submitted twice fails with ORA-00001 → 409.
          step('db-insert', {
            sql: "INSERT INTO RECALL (RECALL_ID, SKU, LOT_LIST, REASON, SEVERITY, STATUS, RAISED_BY, RAISED_AT)\nVALUES (:recallId, :sku, :lotCsv, :reason, :severity, 'QUARANTINING', :raisedBy, SYSTIMESTAMP)",
          }),
          // Sets STOCK_LOT.STATUS = 'QUARANTINE' everywhere (DCs, stores, in transit) and blocks sales; no COMMIT inside.
          step('db-stored-procedure', {
            sql: '{ call TRACE_PKG.QUARANTINE_LOTS(:recallId, :sku, :lotCsv, :quarantinedQty, :locationCount) }',
          }),
        ]),
        step('set-variable', { variableName: 'quarantine', value: '#[payload]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ recallId: vars.recall.recallId, sku: vars.recall.sku, severity: vars.recall.severity }',
        }),
        step('jms-publish', { destination: 'RECALL.ISSUED' }),
        step('set-variable', { variableName: 'httpStatus', value: '202' }),
        step('set-payload', {
          value: '#[output application/json --- { recallId: vars.recall.recallId, status: "QUARANTINED", quantity: vars.quarantine.quarantinedQty, locations: vars.quarantine.locationCount }]',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'DB:QUERY_EXECUTION', when: '#[error.description contains "ORA-00001"]' }, [
          step('set-variable', { variableName: 'httpStatus', value: '409' }),
          step('set-payload', { value: '#[output application/json --- { error: "Recall already exists", recallId: vars.recall.recallId }]' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Recall failed: " ++ error.description]' }),
        ]),
      ],
    ),
    flow(
      'recall-fanout',
      // Max redelivery 5 → DLQ.RECALL.ISSUED; every target is idempotent on recallId.
      source('jms-listener', { destination: 'RECALL.ISSUED', ackMode: 'AUTO', transactionalAction: 'NONE' }),
      [
        step('set-variable', { variableName: 'recallId', value: '#[payload.recallId]' }),
        // OUT p_locations SYS_REFCURSOR (store/DC rows), OUT p_customers SYS_REFCURSOR (loyalty/e-com buyers of the lots).
        step('db-stored-procedure', {
          sql: '{ call TRACE_PKG.AFFECTED_PARTIES(:recallId, :locations, :customers) }',
        }),
        step('transform', {
          target: 'variable',
          variableName: 'targets',
          script:
            '%dw 2.0\noutput application/java\nvar locs = payload.locations\n---\n{\n  stores: (locs filter ((l) -> l.LOCATION_TYPE == "STORE")) groupBy ((l) -> l.LOCATION_ID as String) pluck ((rows, id) -> { storeId: id as String, lots: rows map ((r) -> { lot: r.LOT_NO, qty: r.QTY }) }),\n  dcs: locs filter ((l) -> l.LOCATION_TYPE == "DC") map ((l) -> { dc: l.LOCATION_ID, lot: l.LOT_NO, qty: l.QTY }),\n  customers: payload.customers map ((c) -> { customerId: c.CUSTOMER_ID, channel: c.PREFERRED_CHANNEL, orderId: c.ORDER_ID })\n}',
        }),
        router('scatter-gather', { timeout: 600000, maxConcurrency: 3 }, [
          route({}, [
            scope('foreach', { collection: '#[vars.targets.stores]' }, [
              step('transform', {
                script: '%dw 2.0\noutput application/json\n---\n{ recallId: vars.recallId, storeId: payload.storeId, action: "PULL_FROM_SHELF", lots: payload.lots }',
              }),
              step('jms-publish', { destination: '#["STORE." ++ payload.storeId ++ ".RECALL"]' }),
            ]),
            step('set-payload', { value: '#[vars.targets.stores map ((s) -> { target: "STORE:" ++ s.storeId, status: "SENT" })]' }),
          ]),
          route({}, [
            step('transform', {
              script: '%dw 2.0\noutput application/json\n---\n{ recallId: vars.recallId, command: "HOLD_LOTS", items: vars.targets.dcs }',
            }),
            step('jms-publish', { destination: 'WMS.HOLD.COMMANDS' }),
            step('set-payload', { value: '#[vars.targets.dcs map ((d) -> { target: "DC:" ++ (d.dc as String), status: "SENT" })]' }),
          ]),
          route({}, [
            step('transform', {
              script: '%dw 2.0\noutput application/json\n---\n{ campaignKey: "RECALL-" ++ vars.recallId, template: "product-recall", recipients: vars.targets.customers }',
            }),
            scope('until-successful', { maxRetries: 5, millisBetweenRetries: 30000 }, [
              step('http-request', { method: 'POST', path: '/notifications/v1/campaigns', responseTimeout: 30000 }),
            ]),
            step('set-payload', { value: '#[output application/json --- [{ target: "CUSTOMERS:" ++ (sizeOf(vars.targets.customers) as String), status: "SENT" }] ]' }),
          ]),
        ]),
        step('transform', {
          script:
            '%dw 2.0\noutput application/java\n---\nflatten(valuesOf(payload) map ((r) -> r.payload)) map ((n) -> { recallId: vars.recallId, target: n.target, status: n.status })',
        }),
        step('db-bulk-insert', {
          sql: 'INSERT INTO RECALL_NOTIFICATION (RECALL_ID, TARGET, STATUS, NOTIFIED_AT)\nVALUES (:recallId, :target, :status, SYSTIMESTAMP)',
        }),
        step('db-update', { sql: "UPDATE RECALL SET STATUS = 'NOTIFIED', NOTIFIED_AT = SYSTIMESTAMP WHERE RECALL_ID = :recallId" }),
      ],
      [
        // MULE:COMPOSITE_ROUTING when a route fails: record what failed, then propagate → redelivery.
        handler('on-error-propagate', { type: 'MULE:COMPOSITE_ROUTING' }, [
          step('db-insert', {
            sql: "INSERT INTO RECALL_NOTIFICATION (RECALL_ID, TARGET, STATUS, ERROR_TEXT, NOTIFIED_AT)\nVALUES (:recallId, 'FANOUT', 'PARTIAL_FAILURE', :errorText, SYSTIMESTAMP)",
          }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Recall fan-out failed for " ++ (vars.recallId default "?") ++ ": " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A food retailer must be able to execute a **product recall** within minutes. Quality assurance raises it in a QA portal, which calls \`POST /api/recalls\` with \`{ recallId, sku, lots[], reason, severity, raisedBy }\`.

Data in **Oracle**:
- \`STOCK_LOT\` — stock by lot at **3 DCs, 650 stores** and in transit.
- Sales history linking lots to **loyalty customers** and **online orders** (via the package \`TRACE_PKG\`, which returns REF CURSORs).

**Requirements**
1. Within **15 minutes**, affected lots must be **blocked for sale and picking** everywhere (Oracle stock status drives POS and WMS).
2. QA must get an answer within **5 seconds**: accepted, how much stock and how many locations are affected.
3. Then notify, in parallel:
   - every affected **store** on its ActiveMQ queue \`STORE.<id>.RECALL\` (pull from shelf);
   - the **WMS** at the DCs via \`WMS.HOLD.COMMANDS\` (hold lots, stop shipments);
   - **customers** who bought the lots, via the marketing notification service (REST, slow, flaky).
4. Regulators require an **audit trail**: which party was notified, when, and with what outcome.
5. A recall submitted twice must not be executed twice.

**Design the flow(s).**
`,
  answerTemplate: `## Recall API (synchronous part)

## Quarantine transaction

## Hand-off to the fan-out

## Tracing affected parties

## Parallel notifications

## Audit trail and idempotency

## Failure handling
`,
  keyPoints: [
    'Split the work: a fast synchronous API does the critical, transactional part (record + quarantine) and returns 202; notifications run asynchronously from a JMS event.',
    'Recall insert and QUARANTINE_LOTS run in one Oracle transaction (Try, ALWAYS_BEGIN), so a recall is never recorded without its stock being blocked, or vice versa.',
    'Publish the RECALL.ISSUED event only after the commit; the unique RECALL_ID makes a double submission return 409.',
    'The fan-out flow traces affected stores, DCs and customers with a stored procedure returning REF CURSORs, then uses a Scatter-Gather with three routes.',
    'Per-store JMS destinations, a WMS command queue, and a retried REST call for customers; each target is idempotent on recallId because redelivery may repeat routes.',
    'Notification results go to a RECALL_NOTIFICATION table for the regulator audit trail; MULE:COMPOSITE_ROUTING tells you which route failed.',
  ],
  solution: `
**Flow 1 — \`recall-api\`** (target < 5 s)
1. **HTTP Listener** \`POST /api/recalls\`; validate lots.
2. **Try (ALWAYS_BEGIN)** — **Database Insert** \`RECALL\` (PK \`RECALL_ID\`) + **Stored Procedure** \`TRACE_PKG.QUARANTINE_LOTS\` (OUT quantity and location count). The procedure must not COMMIT itself; the Try commits both.
3. **JMS Publish** \`RECALL.ISSUED\` → **202** with the quarantine summary.
4. ORA-00001 → **409** (recall already exists). If the publish fails after the commit, a 500 tells QA to retry; with the 409 path that would block the retry, so an outbox (event row in the same transaction + poller) is the robust choice.

**Flow 2 — \`recall-fanout\`**
1. **JMS On New Message** \`RECALL.ISSUED\`.
2. **Stored Procedure** \`TRACE_PKG.AFFECTED_PARTIES\` with two **OUT SYS_REFCURSOR** parameters (locations, customers).
3. DataWeave → \`vars.targets\` (stores grouped by store, DC lines, customers).
4. **Scatter-Gather** (3 routes):
   - Stores: For Each store → **JMS Publish** \`STORE.<id>.RECALL\`.
   - DCs: one **JMS Publish** to \`WMS.HOLD.COMMANDS\`.
   - Customers: **Until Successful** → **HTTP Request** to the notification service with an idempotency key (\`RECALL-<id>\`).
5. Flatten the route results → **Database Bulk Insert** \`RECALL_NOTIFICATION\` → mark the recall NOTIFIED.

**Failures:** if a route fails, Scatter-Gather raises **MULE:COMPOSITE_ROUTING** with the successful and failed results; record the partial failure and propagate so the event is redelivered (DLQ after N attempts, with an alert — a recall stuck in a DLQ is a P1). Because routes may run again, stores, WMS and the campaign service must de-duplicate on recallId.

**Why not do it all in the API?** Customer notification can take minutes and the REST service is flaky; holding QA's HTTP call open would break the 5-second requirement and lose work on a timeout.
`,
  followUps: [
    {
      q: 'How do you read a REF CURSOR OUT parameter with the Database connector?',
      a: 'Declare it in outputParameters with the JDBC type REF_CURSOR; the result contains an iterable of rows under that parameter name, which you can stream or map in DataWeave.',
    },
    {
      q: 'Why is the quarantine not done asynchronously too?',
      a: 'It is the safety-critical step: blocking sale must be confirmed to QA. Keeping it in the synchronous, transactional part gives a definite answer and a single commit point.',
    },
    {
      q: 'A store is offline for six hours. Is the recall at risk?',
      a: 'The stock is already blocked in Oracle so POS lookups refuse the sale; the persistent message waits on the store queue. An escalation job should flag stores that have not confirmed the pull within an SLA.',
    },
    {
      q: 'Could you use an ActiveMQ topic instead of per-store queues?',
      a: 'A topic would send the full recall to every store, including unaffected ones, and offline stores need durable subscriptions. Per-store queues send only affected stores their own lot list and keep messages until each store is back.',
    },
  ],
}
