import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-067',
  category: 'flows',
  title: 'Purchase Orders to Suppliers as EDI 850 over SFTP, with 855 Acknowledgements Back',
  level: 'ADVANCED',
  tags: ['supply-chain', 'procurement', 'edi', 'x12', 'sftp', 'oracle', 'activemq', 'jms'],
  estMinutes: 45,
  flowChecks: [
    {
      label: 'Approved POs arrive as events on the ActiveMQ queue PROC.PO.APPROVED',
      rule: { type: 'source', component: 'jms-listener', where: { destination: 'PROC.PO.APPROVED' } },
    },
    { label: 'PO header and lines are read from Oracle before the 850 is written', rule: { type: 'before', first: 'db-select', then: 'sftp-write' } },
    {
      label: 'A redelivered event for a PO already sent finds nothing to send (only APPROVED POs are read)',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'db-select', where: { sql: 'APPROVED' } },
          { type: 'exists', component: 'idempotent' },
        ],
      },
    },
    {
      label: 'An event for a PO that is no longer APPROVED is logged and dropped, not failed and redelivered',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'on-error-continue', where: { type: 'VALIDATION' } },
          { type: 'inside', component: 'sftp-write', within: 'choice' },
        ],
      },
    },
    {
      label: 'The interchange control number is taken from the Oracle sequence EDI_ICN_SEQ',
      rule: { type: 'exists', component: 'db-select', where: { sql: 'EDI_ICN_SEQ' } },
    },
    {
      label: 'The 850 file is written with CREATE_NEW (a sent PO file is never overwritten)',
      rule: { type: 'exists', component: 'sftp-write', where: { mode: 'CREATE_NEW' } },
    },
    {
      label: 'The PO is marked SENT only after the file was written',
      rule: { type: 'before', first: 'sftp-write', then: 'db-update', thenWhere: { sql: 'SENT' }, every: true, outside: true },
    },
    {
      label: 'Supplier 855 files are picked up from the inbound SFTP folder /edi/inbound/855',
      rule: { type: 'source', component: 'sftp-listener', where: { directory: '855' } },
    },
    {
      label: 'Line-level acknowledgement codes are written to Oracle in one Bulk Update',
      rule: { type: 'exists', component: 'db-bulk-update', where: { sql: 'ACK_CODE' } },
    },
    {
      label: 'Only POs with rejected or changed lines are raised to buyers on PROC.PO.ACK.EXCEPTIONS (behind a Choice)',
      rule: { type: 'inside', component: 'jms-publish', where: { destination: 'PROC.PO.ACK.EXCEPTIONS' }, within: 'choice' },
    },
    { label: 'A scheduled monitor flags POs with no 855 after 24 hours', rule: { type: 'source', component: 'scheduler' } },
    {
      label: 'The monitor raises overdue POs on the exceptions queue',
      rule: { type: 'before', first: 'scheduler', then: 'jms-publish', thenWhere: { destination: 'PROC.PO.ACK.EXCEPTIONS' } },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'po-to-supplier-850',
      why: 'This handler only logs the error and passes it on, which Mule does by default.',
    },
  ],
  referenceFlow: design(
    flow(
      'po-to-supplier-850',
      source('jms-listener', { destination: 'PROC.PO.APPROVED', ackMode: 'AUTO', transactionalAction: 'NONE' }),
      [
        step('set-variable', { variableName: 'poNumber', value: '#[payload.poNumber]' }),
        step('db-select', {
          sql: "SELECT h.PO_NUMBER, h.PO_DATE, h.SUPPLIER_ID, s.EDI_ISA_ID, s.EDI_GS_ID, s.SFTP_FOLDER, h.SHIP_TO_DC, h.CURRENCY,\n       l.LINE_NO, l.SKU, l.SUPPLIER_ITEM, l.QTY, l.UOM, l.UNIT_PRICE, l.NEED_BY_DATE\nFROM PO_HEADER h\nJOIN SUPPLIER s ON s.SUPPLIER_ID = h.SUPPLIER_ID\nJOIN PO_LINE l ON l.PO_NUMBER = h.PO_NUMBER\nWHERE h.PO_NUMBER = :poNumber AND h.STATUS = 'APPROVED'\nORDER BY l.LINE_NO",
        }),
        step('validation', { check: 'is-not-empty-collection', expression: '#[payload]', message: 'PO not found or not APPROVED' }),
        step('set-variable', { variableName: 'po', value: '#[payload]' }),
        // Interchange control number from an Oracle sequence (ISA13 / GS06 / ST02).
        step('db-select', { sql: 'SELECT EDI_ICN_SEQ.NEXTVAL AS ICN FROM DUAL' }),
        step('set-variable', { variableName: 'icn', value: '#[payload[0].ICN]' }),
        // Builds the X12 850 structure; the X12 module write operation serialises it (not in the palette).
        step('transform', {
          script:
            '%dw 2.0\noutput application/java\nvar h = vars.po[0]\n---\n{\n  TransactionSets: { v004010: { "850": [{\n    Heading: {\n      "020_BEG": { BEG01: "00", BEG02: "SA", BEG03: h.PO_NUMBER, BEG05: h.PO_DATE as Date },\n      "300_N1_Loop": [{ "310_N1": { N101: "ST", N102: h.SHIP_TO_DC, N103: "92", N104: h.SHIP_TO_DC } }]\n    },\n    Detail: { "010_PO1_Loop": vars.po map ((l) -> {\n      "010_PO1": {\n        PO101: l.LINE_NO as String, PO102: l.QTY, PO103: l.UOM, PO104: l.UNIT_PRICE,\n        PO106: "VP", PO107: l.SUPPLIER_ITEM, PO108: "SK", PO109: l.SKU\n      }\n    }) },\n    Summary: { "010_CTT_Loop": { "010_CTT": { CTT01: sizeOf(vars.po) } } }\n  }] } }\n}',
        }),
        step('sftp-write', { path: '#[vars.po[0].SFTP_FOLDER ++ "/in/PO_" ++ vars.poNumber ++ "_" ++ vars.icn ++ ".edi"]', mode: 'CREATE_NEW' }),
        step('db-update', {
          sql: "UPDATE PO_HEADER SET STATUS = 'SENT', EDI_ICN = :icn, SENT_AT = SYSTIMESTAMP, ACK_DUE_AT = SYSTIMESTAMP + INTERVAL '24' HOUR\nWHERE PO_NUMBER = :poNumber AND STATUS = 'APPROVED'",
        }),
      ],
      [
        handler('on-error-continue', { type: 'VALIDATION:EMPTY_COLLECTION' }, [
          step('logger', { level: 'WARN', message: '#["PO " ++ vars.poNumber ++ " is not APPROVED (already sent or cancelled), ignored"]' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["850 for PO " ++ (vars.poNumber default "?") ++ " failed: " ++ error.description]' }),
        ]),
      ],
    ),
    flow(
      'supplier-855-inbound',
      source('sftp-listener', { directory: '/edi/inbound/855', matcher: '*.edi', postAction: 'move', moveTo: '/edi/archive/855' }),
      [
        // Saved now: the error handler moves the file, and the database operations replace the attributes.
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        // X12 module read parses the file into the 855 structure (not in the palette); 997 is generated for the supplier.
        step('transform', {
          target: 'variable',
          variableName: 'ack',
          script:
            '%dw 2.0\noutput application/java\nvar ts = payload.TransactionSets.v004010."855"[0]\n---\n{\n  poNumber: ts.Heading."020_BAK".BAK03,\n  ackType: ts.Heading."020_BAK".BAK02,\n  lines: ts.Detail."010_PO1_Loop" map ((loop) -> {\n    poNumber: ts.Heading."020_BAK".BAK03,\n    lineNo: loop."010_PO1".PO101 as Number,\n    ackCode: loop."270_ACK_Loop"[0]."270_ACK".ACK01,\n    ackQty: loop."270_ACK_Loop"[0]."270_ACK".ACK02 default loop."010_PO1".PO102,\n    ackDate: loop."270_ACK_Loop"[0]."270_ACK".ACK05\n  })\n}',
        }),
        // Bulk Update reads its rows from #[payload] by default.
        step('set-payload', { value: '#[vars.ack.lines]' }),
        step('db-bulk-update', {
          sql: 'UPDATE PO_LINE SET ACK_CODE = :ackCode, ACK_QTY = :ackQty, ACK_DATE = :ackDate, ACK_AT = SYSTIMESTAMP\nWHERE PO_NUMBER = :poNumber AND LINE_NO = :lineNo',
        }),
        step('db-update', {
          sql: "UPDATE PO_HEADER SET STATUS = CASE WHEN :ackType = 'RJ' THEN 'REJECTED' ELSE 'ACKNOWLEDGED' END, ACK_AT = SYSTIMESTAMP\nWHERE PO_NUMBER = :poNumber",
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.ack.ackType == "RJ" or (sizeOf(vars.ack.lines filter ((l) -> l.ackCode != "IA")) > 0)]' }, [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\n---\n{\n  poNumber: vars.ack.poNumber,\n  ackType: vars.ack.ackType,\n  exceptions: vars.ack.lines filter ((l) -> l.ackCode != "IA")\n}',
              }),
              step('jms-publish', { destination: 'PROC.PO.ACK.EXCEPTIONS' }),
            ]),
          ],
          { otherwise: [step('logger', { level: 'INFO', message: '#["PO " ++ vars.ack.poNumber ++ " fully accepted"]' })] },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/edi/error/855' }),
          step('logger', { level: 'ERROR', message: '#["855 file failed: " ++ error.description]' }),
        ]),
      ],
    ),
    flow(
      'overdue-855-monitor',
      source('scheduler', { strategy: 'cron', expression: '0 0 * * * ?' }),
      [
        step('db-select', {
          sql: "SELECT PO_NUMBER, SUPPLIER_ID, SENT_AT FROM PO_HEADER WHERE STATUS = 'SENT' AND ACK_DUE_AT < SYSTIMESTAMP",
        }),
        scope('foreach', { collection: '#[payload]' }, [
          step('jms-publish', { destination: 'PROC.PO.ACK.EXCEPTIONS' }),
        ]),
      ],
    ),
  ),
  description: `
A grocery wholesaler buys from **~900 suppliers**. When a buyer approves a purchase order in the **Oracle** procurement database, the procurement app posts \`{ poNumber }\` to the **ActiveMQ** queue \`PROC.PO.APPROVED\`. About **3,000 POs/day**, average 40 lines.

EDI-capable suppliers (about 600) exchange **X12 4010** files over the retailer's SFTP server:
- Outbound **850** purchase order: one file per PO in the supplier's folder \`/suppliers/<id>/in\`.
- Inbound **855** PO acknowledgement in \`/edi/inbound/855\`: \`BAK02\` = AC (accepted with changes), AD (accepted, no changes) or RJ (rejected); per line \`ACK01\` = IA (accepted), IQ (quantity changed), IR (rejected), IB (backordered), DR (date rescheduled).

**Requirements**
- An approved PO must reach the supplier exactly once (suppliers ship twice if they get a PO twice).
- Line-level acknowledgements are stored in Oracle (\`PO_LINE.ACK_CODE\`, \`ACK_QTY\`, \`ACK_DATE\`).
- Any rejected or changed line must reach the buyer's exception work queue \`PROC.PO.ACK.EXCEPTIONS\`.
- Suppliers must acknowledge within **24 hours**; overdue POs must be flagged to buyers.

**Facts**
- \`PO_HEADER.STATUS\` is \`APPROVED\` when the event arrives, \`SENT\` once the supplier has the 850, and \`ACKNOWLEDGED\` or \`REJECTED\` after the 855.
- Interchange control numbers (ISA13, GS06, ST02) come from the Oracle sequence \`EDI_ICN_SEQ\`.

**Design the flow(s).**
`,
  answerTemplate: `## Outbound 850

## Control numbers and exactly-once

## Inbound 855

## Exceptions to buyers

## Overdue acknowledgements
`,
  keyPoints: [
    'Outbound: JMS event carries only the PO number; the flow reads the authoritative PO from Oracle (status APPROVED) and maps it to an X12 850.',
    'Interchange/group/transaction control numbers come from an Oracle sequence and are stored with the PO for 997/855 correlation and audit.',
    'The status guard (only APPROVED POs are read) stops a redelivered event once the PO is SENT; SFTP Write with CREATE_NEW covers the gap before that update only if the file name depends on the PO number alone, because a new ICN in the name makes a new file.',
    'Inbound: SFTP listener → X12 read → line ACK codes written with a Database Bulk Update; header status updated from BAK02.',
    'A Choice publishes POs with rejected or changed lines to the buyers\' exception queue; fully accepted POs just log.',
    'A scheduled monitor finds POs still SENT after ACK_DUE_AT and raises them as exceptions.',
  ],
  solution: `
**Flow 1 — \`po-to-supplier-850\`**
1. **JMS On New Message** \`PROC.PO.APPROVED\`, with **Inbound Content-Type** \`application/json\` if the procurement app does not state the message type (the config default is \`*/*\`).
2. **Database Select** header + lines + supplier EDI IDs/folder, \`STATUS = 'APPROVED'\` (a redelivered event for a PO already SENT returns nothing and fails validation — log and drop, or route to a no-op).
3. Next control number from \`EDI_ICN_SEQ\`.
4. **Transform** to the X12 850 structure (BEG, N1 ship-to, PO1 lines, CTT) and **X12 Write** (X12 EDI module) to produce the file text.
5. **SFTP Write** \`PO_<po>_<icn>.edi\` with **CREATE_NEW**.
6. **Database Update** \`STATUS = 'SENT'\`, ICN, \`ACK_DUE_AT = +24h\`.
If the update fails after the file was written, the redelivered event would produce a new ICN and file. So either write the PO status first in a "SENDING" state with the ICN, or make the file name depend only on the PO number so CREATE_NEW rejects the second file.

**Flow 2 — \`supplier-855-inbound\`**
1. **SFTP listener** \`/edi/inbound/855\`, move to archive after success. Set **Apply Post Action When Failed** to false (the default is true), or failed files are archived too.
2. **X12 Read** (validates envelopes; produce a **997** back to the supplier) → DataWeave → \`vars.ack\` (PO number, BAK02, lines with ACK01/ACK02/ACK05).
3. **Database Bulk Update** \`PO_LINE\` ack columns; **Database Update** header status.
4. **Choice**: RJ or any line ≠ IA → JMS Publish exception summary to \`PROC.PO.ACK.EXCEPTIONS\`.
5. Errors → move the file to \`/edi/error/855\`.

**Flow 3 — \`overdue-855-monitor\`** — hourly **Scheduler** → POs \`STATUS = 'SENT' AND ACK_DUE_AT < now\` → publish to the exception queue (with a flag column so the same PO is not raised every hour).
`,
  followUps: [
    {
      q: 'What is the difference between the 997 and the 855?',
      a: 'The 997 functional acknowledgement only says the EDI file was received and syntactically valid. The 855 is a business response: whether the supplier accepts each line, quantity and date.',
    },
    {
      q: 'How do you handle suppliers who are not EDI-capable?',
      a: 'Route on a supplier attribute: EDI suppliers get the 850 over SFTP/AS2, others get a PDF or CSV by email or a supplier portal, and their confirmations are captured manually in the procurement app.',
    },
    {
      q: 'Why read the PO from Oracle instead of putting the whole PO in the JMS message?',
      a: 'The database is the source of truth: if the PO was changed or cancelled after approval, reading it at send time avoids sending stale data, and the message stays small.',
    },
    {
      q: 'Where would AS2 fit in?',
      a: 'Many large suppliers require AS2 instead of SFTP for signed, encrypted transfer with MDN receipts; the mapping stays the same and only the transport operation changes.',
    },
  ],
}
