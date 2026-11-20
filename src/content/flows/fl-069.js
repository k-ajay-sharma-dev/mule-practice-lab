import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-069',
  category: 'flows',
  title: 'Product Recall: Lot Trace and Quarantine in Oracle, then Fan-out to Stores, DCs and Customers',
  level: 'EXPERT',
  tags: ['myproject', 'supply-chain', 'retail', 'recall', 'traceability', 'oracle', 'stored-procedure', 'activemq', 'jms', 'scatter-gather'],
  estMinutes: 50,
  flowChecks: [
    { label: 'QA raises a recall through an HTTP API', rule: { type: 'source', component: 'http-listener', where: { path: 'recall' } } },
    {
      label: 'Affected lots are quarantined by an Oracle procedure inside a DB transaction with the recall record',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-stored-procedure', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' } },
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' } },
        ],
      },
    },
    {
      label: 'The fan-out is handed off via JMS only after the quarantine committed',
      rule: { type: 'before', first: 'try', firstWhere: { transactionalAction: 'ALWAYS_BEGIN' }, then: 'jms-publish', outside: true },
    },
    {
      label: 'The slow notifications do not run inside the QA request, so QA gets an answer within 5 seconds',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'scatter-gather' },
          { type: 'absent', component: 'scatter-gather', inFlowWith: { component: 'http-listener' } },
          { type: 'absent', component: 'http-request', inFlowWith: { component: 'http-listener' } },
        ],
      },
    },
    {
      label: 'A recall submitted twice is rejected, not executed again',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'QUERY_EXECUTION' } },
          { type: 'exists', component: 'idempotent' },
        ],
      },
    },
    {
      label: 'A separate JMS-driven flow consumes the recall event and does the fan-out',
      rule: { type: 'source', component: 'jms-listener', where: { destination: 'RECALL' } },
    },
    {
      label: 'The fan-out listener reads the destination the recall API publishes to',
      rule: { type: 'linked', from: { component: 'jms-publish', key: 'destination' }, to: { component: 'jms-listener', key: 'destination' } },
    },
    {
      label: 'Affected locations and customers are traced in Oracle before notifying',
      rule: { type: 'before', first: ['db-stored-procedure', 'db-select'], then: 'scatter-gather' },
    },
    { label: 'Stores, DCs and customers are notified in parallel (Scatter-Gather, 3 routes)', rule: { type: 'routes', component: 'scatter-gather', min: 3 } },
    {
      label: 'Each store gets its own recall message (per-store JMS destination)',
      rule: { type: 'inside', component: 'jms-publish', where: { destination: 'STORE' }, within: 'scatter-gather' },
    },
    {
      label: 'The WMS gets its hold command on WMS.HOLD.COMMANDS in parallel',
      rule: { type: 'inside', component: 'jms-publish', where: { destination: 'WMS.HOLD.COMMANDS' }, within: 'scatter-gather' },
    },
    {
      label: 'The slow, flaky customer notification call is retried',
      rule: { type: 'inside', component: 'http-request', within: 'until-successful' },
    },
    {
      label: 'Every notification outcome is recorded in Oracle for the audit trail',
      rule: { type: 'before', first: 'scatter-gather', then: ['db-bulk-insert', 'db-insert'], outside: true },
    },
  ],
  simulation: {
    systems: {
      http: [{ method: 'POST', path: '/notifications/v1/campaigns', latencyMs: 2500, respond: { status: 202, body: { campaignId: 'CMP-20931', status: 'QUEUED' } } }],
      db: {
        tables: {
          RECALL: { key: 'RECALL_ID', columns: ['RECALL_ID', 'SKU', 'LOT_LIST', 'REASON', 'SEVERITY', 'STATUS', 'RAISED_BY', 'RAISED_AT', 'NOTIFIED_AT'], rows: [] },
          RECALL_NOTIFICATION: { columns: ['RECALL_ID', 'TARGET', 'STATUS', 'ERROR_TEXT', 'NOTIFIED_AT'], rows: [] },
          STOCK_LOT: {
            key: ['LOCATION_ID', 'SKU', 'LOT_NO'],
            rows: [
              { LOCATION_ID: 'DC-01', LOCATION_TYPE: 'DC', SKU: 'SPIN-BAG-250', LOT_NO: 'L2611A', QTY: 840, STATUS: 'AVAILABLE' },
              { LOCATION_ID: '0117', LOCATION_TYPE: 'STORE', SKU: 'SPIN-BAG-250', LOT_NO: 'L2611A', QTY: 36, STATUS: 'AVAILABLE' },
              { LOCATION_ID: '0242', LOCATION_TYPE: 'STORE', SKU: 'SPIN-BAG-250', LOT_NO: 'L2611B', QTY: 24, STATUS: 'AVAILABLE' },
              { LOCATION_ID: '0242', LOCATION_TYPE: 'STORE', SKU: 'SPIN-BAG-250', LOT_NO: 'L2609C', QTY: 30, STATUS: 'AVAILABLE' },
            ],
          },
        },
        procedures: {
          // Blocks the lots everywhere and reports how much stock and how many locations it blocked.
          'TRACE_PKG.QUARANTINE_LOTS': (args, db) => {
            const lots = String(args.lotCsv ?? '').split(',')
            const hit = db.tables.STOCK_LOT.rows.filter((r) => r.SKU === args.sku && lots.includes(r.LOT_NO))
            for (const r of hit) r.STATUS = 'QUARANTINE'
            return { quarantinedQty: hit.reduce((n, r) => n + r.QTY, 0), locationCount: new Set(hit.map((r) => r.LOCATION_ID)).size }
          },
          // The stores, DCs and customers that have the quarantined lots.
          'TRACE_PKG.AFFECTED_PARTIES': (args, db) => ({
            locations: db.tables.STOCK_LOT.rows.filter((r) => r.STATUS === 'QUARANTINE').map((r) => ({ LOCATION_ID: r.LOCATION_ID, LOCATION_TYPE: r.LOCATION_TYPE, LOT_NO: r.LOT_NO, QTY: r.QTY })),
            customers: [
              { CUSTOMER_ID: 'C-5520193', PREFERRED_CHANNEL: 'EMAIL', ORDER_ID: 'WEB-771045' },
              { CUSTOMER_ID: 'C-6100877', PREFERRED_CHANNEL: 'SMS', ORDER_ID: null },
            ],
          }),
        },
      },
    },
    tests: [
      {
        name: 'QA raises a recall',
        about: 'Two lots are blocked in Oracle and QA hears back at once. Then the stores, the WMS and the customers are told, and each outcome is recorded.',
        trigger: {
          http: {
            method: 'POST',
            path: '/api/recalls',
            body: { recallId: 'RC-2026-031', sku: 'SPIN-BAG-250', lots: ['L2611A', 'L2611B'], reason: 'Possible Listeria contamination', severity: 'CLASS_I', raisedBy: 'qa.lead@example.com' },
          },
        },
        expect: {
          status: 202,
          maxMs: 5000,
          db: {
            RECALL: { has: { RECALL_ID: 'RC-2026-031' } },
            STOCK_LOT: { has: [{ LOT_NO: 'L2611A', STATUS: 'QUARANTINE' }, { LOT_NO: 'L2611B', STATUS: 'QUARANTINE' }], lacks: { LOT_NO: 'L2609C', STATUS: 'QUARANTINE' } },
            RECALL_NOTIFICATION: { has: { RECALL_ID: 'RC-2026-031' } },
          },
          sent: [
            { destination: 'STORE.0117.RECALL', count: 1 },
            { destination: 'STORE.0242.RECALL', count: 1 },
            { destination: 'WMS.HOLD.COMMANDS', count: 1 },
          ],
          calls: [{ method: 'POST', path: '/notifications/v1/campaigns', count: 1 }],
        },
      },
      {
        name: 'The same recall is sent twice',
        about: 'The QA portal submits the recall again. It is not executed a second time, so nobody is notified twice.',
        triggers: [
          { http: { method: 'POST', path: '/api/recalls', body: { recallId: 'RC-2026-031', sku: 'SPIN-BAG-250', lots: ['L2611A'], reason: 'Possible Listeria contamination', severity: 'CLASS_I', raisedBy: 'qa.lead@example.com' } } },
          { afterMs: 60000, http: { method: 'POST', path: '/api/recalls', body: { recallId: 'RC-2026-031', sku: 'SPIN-BAG-250', lots: ['L2611A'], reason: 'Possible Listeria contamination', severity: 'CLASS_I', raisedBy: 'qa.lead@example.com' } } },
        ],
        expect: {
          db: { RECALL: { count: 1 } },
          sent: [
            { destination: 'STORE.0117.RECALL', count: 1 },
            { destination: 'WMS.HOLD.COMMANDS', count: 1 },
          ],
          calls: [{ method: 'POST', path: '/notifications/v1/campaigns', count: 1 }],
        },
      },
      {
        name: 'The quarantine fails',
        about: 'The quarantine procedure fails in Oracle. The request fails, the recall record is rolled back with it, and nobody is notified.',
        trigger: {
          http: {
            method: 'POST',
            path: '/api/recalls',
            body: { recallId: 'RC-2026-033', sku: 'SPIN-BAG-250', lots: ['L2611B'], reason: 'Label shows the wrong allergens', severity: 'CLASS_II', raisedBy: 'qa.lead@example.com' },
          },
        },
        // the procedure is not there, so the call fails with DB:QUERY_EXECUTION
        overrides: { systems: { db: { procedures: { 'TRACE_PKG.QUARANTINE_LOTS': null } } } },
        expect: {
          error: 'DB:QUERY_EXECUTION',
          db: { RECALL: { count: 0 }, STOCK_LOT: { lacks: { STATUS: 'QUARANTINE' } } },
          notSent: ['WMS.HOLD.COMMANDS', 'STORE.0242.RECALL'],
          calls: [{ path: '/notifications/v1/campaigns', count: 0 }],
        },
      },
      {
        name: 'The notification service stays down',
        about: 'Customers cannot be told. QA still gets the quick answer, the stores and the WMS are told, the service is tried again, and the failure is recorded for the audit.',
        trigger: {
          http: {
            method: 'POST',
            path: '/api/recalls',
            body: { recallId: 'RC-2026-032', sku: 'SPIN-BAG-250', lots: ['L2609C'], reason: 'Foreign body found', severity: 'CLASS_II', raisedBy: 'qa.lead@example.com' },
          },
        },
        overrides: { systems: { http: [{ method: 'POST', path: '/notifications/v1/campaigns', respond: { status: 503, body: { message: 'Service Unavailable' } } }] } },
        expect: {
          status: 202,
          maxMs: 5000,
          sent: [
            { destination: 'STORE.0242.RECALL', count: 1 },
            { destination: 'WMS.HOLD.COMMANDS', count: 1 },
          ],
          calls: [{ method: 'POST', path: '/notifications/v1/campaigns', min: 2 }],
          db: { RECALL_NOTIFICATION: { has: { RECALL_ID: 'RC-2026-032' } } },
        },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-propagate',
      why: 'The catch-all handlers only log the error and pass it on, which Mule does by default. The duplicate recall and the failed fan-out have their own checks.',
    },
  ],
  referenceFlow: design(
    flow(
      'recall-api',
      source('http-listener', { path: '/api/recalls', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-empty-collection', expression: '#[payload.lots]', message: 'At least one lot is required' }),
        step('set-variable', { variableName: 'recall', value: '#[payload]' }),
        step('set-variable', { variableName: 'lotCsv', value: '#[payload.lots joinBy ","]' }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          // PK RECALL_ID: the same recall submitted twice fails with ORA-00001 → 409.
          step('db-insert', {
            database: 'Oracle',
            sql: "INSERT INTO RECALL (RECALL_ID, SKU, LOT_LIST, REASON, SEVERITY, STATUS, RAISED_BY, RAISED_AT)\nVALUES (:recallId, :sku, :lotCsv, :reason, :severity, 'QUARANTINING', :raisedBy, SYSTIMESTAMP)",
            // Kept aside, so the procedure still reads the recall from the payload.
            target: 'recallInsert',
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
          step('set-variable', { variableName: 'errorText', value: '#[error.description]' }),
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
- \`STOCK_LOT\`: stock by lot at **3 DCs, 650 stores** and in transit.
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

**Facts**
- \`RECALL\` has \`RECALL_ID\` (primary key), \`SKU\`, \`LOT_LIST\`, \`REASON\`, \`SEVERITY\`, \`STATUS\`, \`RAISED_BY\`, \`RAISED_AT\` and \`NOTIFIED_AT\`.
- \`TRACE_PKG.QUARANTINE_LOTS(recallId, sku, lotCsv, quarantinedQty OUT, locationCount OUT)\` blocks the lots (given as one comma-separated text) everywhere. It does not commit.
- \`TRACE_PKG.AFFECTED_PARTIES(recallId, locations OUT, customers OUT)\` returns the locations (\`LOCATION_ID\`, \`LOCATION_TYPE\` STORE or DC, \`LOT_NO\`, \`QTY\`) and the customers (\`CUSTOMER_ID\`, \`PREFERRED_CHANNEL\`, \`ORDER_ID\`).
- The notification service is \`POST /notifications/v1/campaigns\`. It can take tens of seconds and is sometimes down for minutes.
- Audit rows go to \`RECALL_NOTIFICATION\` (\`RECALL_ID\`, \`TARGET\`, \`STATUS\`, \`ERROR_TEXT\`, \`NOTIFIED_AT\`).
- QA gets **202** with the quantity and location count, and **409** for a recall id that already exists.
- The hand-off to the fan-out uses an ActiveMQ queue whose name starts with \`RECALL\`, for example \`RECALL.ISSUED\`.

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
**Flow 1: \`recall-api\`** (target < 5 s)
1. **HTTP Listener** \`POST /api/recalls\`; validate lots.
2. **Try (ALWAYS_BEGIN)**: **Database Insert** \`RECALL\` (PK \`RECALL_ID\`) + **Stored Procedure** \`TRACE_PKG.QUARANTINE_LOTS\` (OUT quantity and location count). The procedure must not COMMIT itself; the Try commits both. The lots go in as one comma-separated value kept in a variable, and the Insert puts its result in a target variable, so the procedure still reads the recall from the payload.
3. **JMS Publish** \`RECALL.ISSUED\` → **202** with the quarantine summary.
4. ORA-00001 → **409** (recall already exists). If the publish fails after the commit, a 500 tells QA to retry; with the 409 path that would block the retry, so an outbox (event row in the same transaction + poller) is the robust choice.

**Flow 2: \`recall-fanout\`**
1. **JMS On New Message** \`RECALL.ISSUED\`.
2. **Stored Procedure** \`TRACE_PKG.AFFECTED_PARTIES\` with two **OUT SYS_REFCURSOR** parameters (locations, customers).
3. DataWeave → \`vars.targets\` (stores grouped by store, DC lines, customers).
4. **Scatter-Gather** (3 routes):
   - Stores: For Each store → **JMS Publish** \`STORE.<id>.RECALL\`.
   - DCs: one **JMS Publish** to \`WMS.HOLD.COMMANDS\`.
   - Customers: **Until Successful** → **HTTP Request** to the notification service with an idempotency key (\`RECALL-<id>\`).
5. Flatten the route results → **Database Bulk Insert** \`RECALL_NOTIFICATION\` → mark the recall NOTIFIED.

**Failures:** if a route fails, Scatter-Gather raises **MULE:COMPOSITE_ROUTING** with the successful and failed results; record the partial failure and propagate so the event is redelivered (DLQ after N attempts, with an alert, because a recall stuck in a DLQ is a P1). Because routes may run again, stores, WMS and the campaign service must de-duplicate on recallId.

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
