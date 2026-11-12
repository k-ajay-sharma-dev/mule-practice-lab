import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { HANDLERS } from '../../flow/rules.js'

export default {
  id: 'fl-070',
  category: 'flows',
  title: 'Pallet Receipts Against ASNs to SAP Goods Receipts, Exactly Once via an Oracle Outbox',
  level: 'EXPERT',
  tags: ['supply-chain', 'asn', 'goods-receipt', 'sap', 'activemq', 'jms', 'oracle', 'outbox', 'idempotency'],
  estMinutes: 55,
  flowChecks: [
    { label: 'Dock scans are consumed from the ActiveMQ receipts queue', rule: { type: 'source', component: 'jms-listener', where: { destination: 'DOCK' } } },
    { label: 'Each pallet is matched to its ASN line in Oracle before deciding what to do', rule: { type: 'before', first: 'db-select', then: 'choice' } },
    {
      label: 'Pallets without a matching ASN go to an unmatched (blind receipt) queue',
      rule: { type: 'inside', component: 'jms-publish', within: 'choice' },
    },
    {
      label: 'Receipt and outbox rows are written in one Oracle transaction (Try, ALWAYS_BEGIN)',
      rule: { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, min: 2 },
    },
    {
      label: 'The dock intake never calls SAP, so SAP outages cannot stop scanning',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-request' },
          { type: 'absent', component: 'http-request', inFlowWith: { component: 'jms-listener' } },
        ],
      },
    },
    {
      label: 'No XA transaction is used',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'jms-listener' },
          { type: 'absent', component: 'jms-listener', where: { transactionalAction: 'ALWAYS_BEGIN', transactionType: 'XA' } },
        ],
      },
    },
    {
      label: 'A redelivered pallet (unique SSCC violation) is treated as already received',
      rule: { type: 'inside', component: 'on-error-continue', within: 'try', where: { type: 'DB:QUERY_EXECUTION' } },
    },
    {
      label: 'Other intake failures are not swallowed, so the broker redelivers the scan',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'jms-listener' },
          { type: 'absent', component: 'on-error-continue', where: { type: 'ANY' }, inFlowWith: { component: 'jms-listener' } },
        ],
      },
    },
    { label: 'A separate scheduled flow drains the outbox to SAP', rule: { type: 'source', component: 'scheduler' } },
    { label: 'Posting to SAP is retried for transient failures (Until Successful)', rule: { type: 'inside', component: 'http-request', within: 'until-successful' } },
    {
      label: 'SAP is checked for an existing document before posting, so a lost response does not post twice',
      rule: { type: 'before', first: 'http-request', firstWhere: { method: 'GET' }, then: 'http-request', thenWhere: { method: 'POST' } },
    },
    {
      label: 'The outbox row is marked POSTED only after SAP returned the material document',
      rule: { type: 'before', first: 'http-request', firstWhere: { method: 'POST' }, then: 'db-update', thenWhere: { sql: 'POSTED' }, outside: true },
    },
    {
      label: 'Each poller run claims its outbox rows before posting, so two replicas never post the same row',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'db-update', firstWhere: { sql: 'IN_PROGRESS' }, then: 'db-select' },
          { type: 'exists', component: 'db-select', where: { sql: 'SKIP LOCKED' } },
        ],
      },
    },
    {
      label: 'A SAP rejection raises a business error whose handler marks the row FAILED, so it is not retried',
      rule: {
        type: 'linked',
        from: { component: 'raise-error', key: 'type' },
        to: { component: HANDLERS, key: 'type', holding: { component: 'db-update', where: { sql: 'FAILED' } } },
        as: 'errorType',
      },
    },
    {
      label: 'A transient failure marks the row RETRY and counts the attempt',
      rule: { type: 'inside', component: 'db-update', where: { sql: { all: ['RETRY', 'ATTEMPTS'] } }, within: HANDLERS },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'dock-receipt-intake',
      why: 'Mule propagates the error by default, so the scan is redelivered without this handler. It only adds a log line.',
    },
  ],
  referenceFlow: design(
    flow(
      'dock-receipt-intake',
      // AUTO ack: acknowledged when the flow completes; an error recovers the session → broker redelivery.
      source('jms-listener', { destination: 'DOCK.RECEIPTS', ackMode: 'AUTO', transactionalAction: 'NONE' }),
      [
        step('set-variable', { variableName: 'scan', value: '#[payload]' }),
        step('db-select', {
          sql: "SELECT a.ASN_NO, a.PO_NUMBER, al.PO_LINE, al.SKU, al.EXPECTED_QTY, al.UOM, a.SUPPLIER_ID, a.PLANT, a.STORAGE_LOC\nFROM ASN_PALLET ap\nJOIN ASN_LINE al ON al.ASN_NO = ap.ASN_NO AND al.LINE_NO = ap.LINE_NO\nJOIN ASN a ON a.ASN_NO = ap.ASN_NO\nWHERE ap.SSCC = :sscc AND a.STATUS IN ('OPEN', 'PARTIAL')",
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(payload)]' }, [
              step('transform', {
                script: '%dw 2.0\noutput application/json\n---\nvars.scan ++ { reason: "NO_OPEN_ASN_FOR_SSCC" }',
              }),
              step('jms-publish', { destination: 'DOCK.RECEIPTS.UNMATCHED' }),
            ]),
          ],
          {
            otherwise: [
              step('transform', {
                target: 'variable',
                variableName: 'gr',
                script:
                  '%dw 2.0\noutput application/java\nvar asn = payload[0]\n---\n{\n  sscc: vars.scan.sscc,\n  asnNo: asn.ASN_NO,\n  poNumber: asn.PO_NUMBER,\n  poLine: asn.PO_LINE,\n  sku: asn.SKU,\n  receivedQty: vars.scan.qty as Number,\n  qtyVariance: (vars.scan.qty as Number) - asn.EXPECTED_QTY,\n  plant: asn.PLANT,\n  storageLoc: asn.STORAGE_LOC,\n  dock: vars.scan.dock,\n  scannedAt: vars.scan.scannedAt as DateTime,\n  outboxPayload: write({\n    PostingDate: (vars.scan.scannedAt as DateTime) as Date as String {format: "yyyy-MM-dd"},\n    GoodsMovementCode: "01",\n    MaterialDocumentHeaderText: vars.scan.sscc,\n    to_MaterialDocumentItem: [{\n      Material: asn.SKU,\n      Plant: asn.PLANT,\n      StorageLocation: asn.STORAGE_LOC,\n      GoodsMovementType: "101",\n      PurchaseOrder: asn.PO_NUMBER,\n      PurchaseOrderItem: asn.PO_LINE as String,\n      QuantityInEntryUnit: vars.scan.qty as String,\n      EntryUnit: asn.UOM\n    }]\n  }, "application/json")\n}',
              }),
              scope(
                'try',
                { transactionalAction: 'ALWAYS_BEGIN' },
                [
                  // GOODS_RECEIPT.SSCC is unique → a redelivered scan fails here and nothing else is written.
                  step('db-insert', {
                    sql: 'INSERT INTO GOODS_RECEIPT (SSCC, ASN_NO, PO_NUMBER, PO_LINE, SKU, RECEIVED_QTY, QTY_VARIANCE, DOCK, SCANNED_AT)\nVALUES (:sscc, :asnNo, :poNumber, :poLine, :sku, :receivedQty, :qtyVariance, :dock, :scannedAt)',
                  }),
                  step('db-insert', {
                    sql: "INSERT INTO GR_OUTBOX (OUTBOX_ID, SSCC, PAYLOAD, STATUS, ATTEMPTS, CREATED_AT)\nVALUES (GR_OUTBOX_SEQ.NEXTVAL, :sscc, :outboxPayload, 'PENDING', 0, SYSTIMESTAMP)",
                  }),
                ],
                {
                  errorHandlers: [
                    handler('on-error-continue', { type: 'DB:QUERY_EXECUTION', when: '#[error.description contains "ORA-00001"]' }, [
                      step('logger', { level: 'INFO', message: '#["Pallet " ++ vars.scan.sscc ++ " already received, ignoring redelivery"]' }),
                    ]),
                  ],
                },
              ),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Receipt not recorded, will be redelivered: " ++ error.description]' }),
        ]),
      ],
    ),
    flow(
      'gr-outbox-to-sap',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 30, timeUnit: 'SECONDS' }),
      [
        step('set-variable', { variableName: 'claimId', value: '#[uuid()]' }),
        // Claim a slice first (no FOR UPDATE with FETCH FIRST in Oracle); stale IN_PROGRESS claims are reset by a sweeper.
        step('db-update', {
          sql: "UPDATE GR_OUTBOX SET STATUS = 'IN_PROGRESS', CLAIM_ID = :claimId, CLAIMED_AT = SYSTIMESTAMP\nWHERE STATUS IN ('PENDING', 'RETRY') AND ATTEMPTS < 10 AND ROWNUM <= 200",
        }),
        step('db-select', { sql: 'SELECT OUTBOX_ID, SSCC, PAYLOAD, ATTEMPTS FROM GR_OUTBOX WHERE CLAIM_ID = :claimId ORDER BY OUTBOX_ID' }),
        scope('foreach', { collection: '#[payload]' }, [
          step('set-variable', { variableName: 'row', value: '#[payload]' }),
          scope(
            'try',
            { transactionalAction: 'INDIFFERENT' },
            [
              // Lost-response guard: was this SSCC already posted? (header text = SSCC)
              step('http-request', {
                method: 'GET',
                path: "/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentHeader?$filter=MaterialDocumentHeaderText eq '{sscc}'",
                responseTimeout: 10000,
              }),
              router(
                'choice',
                {},
                [
                  route({ expression: '#[not isEmpty(payload.d.results)]' }, [
                    step('set-variable', { variableName: 'matDoc', value: '#[payload.d.results[0].MaterialDocument]' }),
                  ]),
                ],
                {
                  otherwise: [
                    // The GET replaced the payload: send the stored request body.
                    step('set-payload', { value: '#[read(vars.row.PAYLOAD, "application/json")]' }),
                    // x-csrf-token fetched beforehand; deep insert header + items.
                    // Response validator values="200..299,400": a 400 inside Until Successful would be retried and
                    // come out as MULE:RETRY_EXHAUSTED, so treat it as a response and raise a business error after the scope.
                    scope('until-successful', { maxRetries: 3, millisBetweenRetries: 10000 }, [
                      step('http-request', { method: 'POST', path: '/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentHeader', responseTimeout: 30000 }),
                    ]),
                    router('choice', {}, [
                      route({ expression: '#[attributes.statusCode == 400]' }, [
                        step('raise-error', { type: 'APP:SAP_REJECTED', description: 'SAP rejected the goods receipt' }),
                      ]),
                    ]),
                    step('set-variable', { variableName: 'matDoc', value: '#[payload.d.MaterialDocument]' }),
                  ],
                },
              ),
              step('db-update', {
                sql: "UPDATE GR_OUTBOX SET STATUS = 'POSTED', SAP_MAT_DOC = :matDoc, POSTED_AT = SYSTIMESTAMP WHERE OUTBOX_ID = :outboxId",
              }),
            ],
            {
              errorHandlers: [
                // Business rejections (HTTP 400, e.g. PO line closed) → FAILED for the receiving clerk; transient → RETRY.
                handler('on-error-continue', { type: 'APP:SAP_REJECTED' }, [
                  step('db-update', {
                    sql: "UPDATE GR_OUTBOX SET STATUS = 'FAILED', LAST_ERROR = :errorText WHERE OUTBOX_ID = :outboxId",
                  }),
                ]),
                handler('on-error-continue', { type: 'ANY' }, [
                  step('db-update', {
                    sql: "UPDATE GR_OUTBOX SET STATUS = 'RETRY', ATTEMPTS = ATTEMPTS + 1, LAST_ERROR = :errorText WHERE OUTBOX_ID = :outboxId",
                  }),
                ]),
              ],
            },
          ),
        ]),
      ],
    ),
  ),
  description: `
A retailer's **3 distribution centres** receive ~**6,000 pallets/day** from suppliers. Suppliers send **EDI 856 ASNs** in advance; these are already loaded into **Oracle** (\`ASN\`, \`ASN_LINE\`, \`ASN_PALLET\` keyed by **SSCC**). When a pallet is scanned at the dock, the scanning system publishes \`{ sscc, qty, dock, scannedAt }\` to the **ActiveMQ** queue \`DOCK.RECEIPTS\` (bursts of 20/s when a truck is unloaded).

For each pallet a **goods receipt** (movement type 101 against the PO) must be posted in **SAP S/4HANA** using the OData service \`API_MATERIAL_DOCUMENT_SRV\`.

**Requirements**
- **Exactly one** goods receipt per pallet in SAP. Today, scanners re-send and the broker redelivers after failures, and SAP has posted the same pallet twice — inventory and supplier payments were wrong.
- SAP is unavailable during its nightly maintenance (45 min) and sometimes slow (10–30 s responses); dock scanning must **never stop** because of SAP.
- Pallets with no open ASN go to the receiving clerk's **blind-receipt** queue.
- Quantity differences against the ASN must be recorded for supplier claims.
- XA transactions are not allowed by the platform team.

**Facts**
- \`GR_OUTBOX\` rows have a \`STATUS\`: PENDING, IN_PROGRESS (claimed by one poller run), POSTED, FAILED (SAP rejected it, a clerk must fix it) or RETRY (a transient error, counted in \`ATTEMPTS\`).
- Several replicas may run the poller, so each run claims its rows before posting them.

**Design the flow(s).**
`,
  answerTemplate: `## Intake flow (JMS → Oracle)

## Matching against the ASN

## Idempotency on redelivery

## Outbox and the SAP posting flow

## Lost responses from SAP

## Failure classes and monitoring
`,
  keyPoints: [
    'Decouple dock scanning from SAP: the intake flow only writes to Oracle; a separate scheduled flow posts to SAP, so SAP outages never block the dock.',
    'Receipt and outbox rows are inserted in one local Oracle transaction; a unique SSCC on GOODS_RECEIPT turns redeliveries and scanner re-sends into a handled ORA-00001.',
    'Without XA, the JMS message is acknowledged after the Oracle commit (AUTO ack on successful completion); the worst case is a redelivery, which the unique key absorbs.',
    'The outbox poller claims rows with an UPDATE (claim ID) and processes them; Until Successful handles short SAP glitches, and rows are marked POSTED only after SAP returns the material document.',
    'A lost SAP response could still double-post, so check SAP first for an existing document with the SSCC in the header text before posting.',
    'Distinguish business rejections (FAILED for a clerk) from transient errors (RETRY with an attempt counter and alert).',
  ],
  solution: `
**Flow 1 — \`dock-receipt-intake\`**
1. **JMS On New Message** \`DOCK.RECEIPTS\`, AUTO ack, no transaction (XA not allowed), with **Inbound Content-Type** \`application/json\` if the scanning system does not state the message type (the config default is \`*/*\`).
2. **Database Select** the open ASN line for the SSCC.
3. **Choice**: no match → **JMS Publish** \`DOCK.RECEIPTS.UNMATCHED\` (blind receipt). Otherwise → DataWeave builds the receipt row (including qty variance) and the SAP request body.
4. **Try (ALWAYS_BEGIN)** — **Insert** \`GOODS_RECEIPT\` (unique SSCC) + **Insert** \`GR_OUTBOX\` (PENDING). Both commit or neither.
5. The Try's **On Error Continue** for ORA-00001 → "already received", message acknowledged.
6. Anything else → On Error Propagate → redelivery (DLQ after N attempts).

**Flow 2 — \`gr-outbox-to-sap\`** (Scheduler, 30 s; runs on the primary node only when the app is clustered — the claim step keeps it safe if several replicas fire)
1. **Claim** up to 200 PENDING/RETRY rows with an UPDATE that stamps a claim ID, then select them by claim ID.
2. **For Each** row → **Try**:
   - **GET** material documents with \`MaterialDocumentHeaderText eq '<SSCC>'\`. Found → reuse the document number (a previous POST succeeded but its response was lost).
   - Else **Until Successful** → **POST** \`A_MaterialDocumentHeader\` (deep insert, \`GoodsMovementCode "01"\`, movement type 101, PO + item). Fetch the CSRF token first.
   - **Database Update** outbox → POSTED with the material document.
   - A 400 (PO closed, over-delivery tolerance) must not be retried, and inside Until Successful it would come out as \`MULE:RETRY_EXHAUSTED\`. So add 400 to the request's success-status-code-validator and, after the scope, a Choice on \`attributes.statusCode\` raises \`APP:SAP_REJECTED\` → FAILED for the clerk; other errors → RETRY with \`ATTEMPTS + 1\`; alert when attempts reach 10.

**Exactly once =** at-least-once delivery (JMS redelivery, outbox retries) + idempotent receivers (unique SSCC in Oracle, SAP existence check by SSCC).

**Monitoring:** dashboards for outbox age (oldest PENDING), FAILED count and DLQ depth; a sweeper resets IN_PROGRESS claims older than 10 minutes (worker crash).
`,
  followUps: [
    {
      q: 'Why not call SAP directly from the JMS flow with a transaction?',
      a: 'SAP is not transactional with JMS or Oracle, so a timeout after SAP posted would roll back and redeliver, causing a second posting. SAP outages would also block the dock queue. The outbox isolates SAP behind its own retry loop.',
    },
    {
      q: 'Why claim rows with an UPDATE instead of SELECT ... FOR UPDATE SKIP LOCKED?',
      a: 'The claim commits immediately, so no row locks are held while slow SAP calls run, and a crashed worker leaves visible IN_PROGRESS rows for a sweeper. SKIP LOCKED also works but keeps a transaction open for the whole batch.',
    },
    {
      q: 'How would you post GRs per ASN rather than per pallet?',
      a: 'Aggregate outbox rows by ASN/PO when the truck is closed (a dock-close event), and post one material document with multiple items; the idempotency key then becomes the ASN number plus a receipt sequence.',
    },
    {
      q: 'What changes if this is SAP ECC instead of S/4HANA?',
      a: 'You would typically call BAPI_GOODSMVT_CREATE plus BAPI_TRANSACTION_COMMIT through the SAP connector (or send a goods movement IDoc); the outbox and idempotency design stays the same.',
    },
  ],
}
