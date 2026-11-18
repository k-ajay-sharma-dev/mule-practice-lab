import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const line = (lineNo, sku, uom, qty) => ({ lineNo, sku, uom, qty })
const doc = (messageId, lines) => ({ message: { kind: 'jms', destination: 'RECEIPT.WORK', payload: { messageId, dc: 'DC-NORTH', lines } } })
const map = (ext, int) => ({ map_name: 'UOM', ext_code: ext, int_code: int })
const tables = () => ({
  code_map: { rows: [map('CS', 'CASE'), map('EA', 'EACH'), map('PL', 'PALLET'), { map_name: 'DC', ext_code: 'DC-NORTH', int_code: '210' }] },
  stg_receipt_lines: { columns: ['message_id', 'line_no', 'sku', 'uom', 'qty'], rows: [] },
  receipt_rejects: { columns: ['message_id', 'line_no', 'sku', 'reason'], rows: [] },
})
const mixed = [line(1, 'TENT-2P-OLV', 'CS', 12), line(2, 'SOCK-WOOL-L', 'BX', 40), line(3, 'BOTTLE-1L', 'EA', 96)]

export default {
  id: 'fl-227',
  category: 'flows',
  title: 'Receipt Lines Into Oracle Through a Code Map: Read the Map Once, Translate Each Unit of Measure, and Send Unknown Codes to a Reject Table',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'oracle', 'code-map', 'cross-reference', 'reject-table', 'jms', 'bulk-insert'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Receipts are read from RECEIPT.WORK', rule: { type: 'source', component: 'jms-listener', where: { destination: 'RECEIPT.WORK' } } },
    {
      label: 'The UOM code map is read from code_map once, before any line is written, and not inside a loop',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'db-select', firstWhere: { sql: { all: ['code_map', 'UOM'] } }, then: 'db-bulk-insert' },
          { type: 'absent', component: 'db-select', within: ['foreach', 'parallel-foreach'] },
        ],
      },
    },
    { label: 'Lines with a known code are bulk inserted into stg_receipt_lines', rule: { type: 'exists', component: 'db-bulk-insert', where: { sql: 'stg_receipt_lines' } } },
    { label: 'Lines with an unknown code are bulk inserted into receipt_rejects', rule: { type: 'exists', component: 'db-bulk-insert', where: { sql: 'receipt_rejects' } } },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'One unknown unit',
        about: 'CS and EA translate to CASE and EACH and are staged. BX is not in the map, so line 2 goes to receipt_rejects with UNKNOWN_UOM.',
        trigger: doc('MSG-61020', mixed),
        expect: {
          noError: true,
          db: {
            stg_receipt_lines: { count: 2, has: [{ line_no: 1, uom: 'CASE' }, { line_no: 3, uom: 'EACH' }] },
            receipt_rejects: { count: 1, has: [{ message_id: 'MSG-61020', line_no: 2, reason: 'UNKNOWN_UOM' }] },
          },
        },
      },
      {
        name: 'Every unit is known',
        about: 'Nothing is rejected, and an empty list is never sent to the reject table.',
        trigger: doc('MSG-61021', [line(1, 'TENT-2P-OLV', 'PL', 1), line(2, 'BOTTLE-1L', 'EA', 24)]),
        expect: { noError: true, db: { stg_receipt_lines: { count: 2, has: [{ uom: 'PALLET' }] }, receipt_rejects: { count: 0 } } },
      },
      {
        name: 'The data team adds BX to the map',
        about: 'A row for BX is added to code_map. The same lines now all load, with no change to the flow.',
        trigger: doc('MSG-61022', mixed),
        overrides: { systems: { db: { tables: { ...tables(), code_map: { rows: [...tables().code_map.rows, map('BX', 'BOX')] } } } } },
        expect: { db: { stg_receipt_lines: { count: 3, has: [{ line_no: 2, uom: 'BOX' }] }, receipt_rejects: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('receipt-lines-load', source('jms-listener', { destination: 'RECEIPT.WORK', ackMode: 'AUTO' }), [
      step('set-variable', { variableName: 'doc', value: '#[payload]' }),
      step('db-select', { database: 'Oracle', sql: "SELECT ext_code, int_code FROM code_map WHERE map_name = 'UOM'", target: 'uomMap' }),
      step('transform', {
        target: 'variable',
        variableName: 'mapped',
        script:
          '%dw 2.0\noutput application/java\nvar codes = { (vars.uomMap map ((m) -> { (m.ext_code): m.int_code })) }\n---\nvars.doc.lines map ((l) -> { message_id: vars.doc.messageId, line_no: l.lineNo, sku: l.sku, uom: codes[l.uom], qty: l.qty, ext_uom: l.uom })',
      }),
      step('set-variable', { variableName: 'good', value: '#[vars.mapped filter ($.uom != null) map ($ - "ext_uom")]' }),
      step('set-variable', { variableName: 'bad', value: '#[vars.mapped filter ($.uom == null) map ((l) -> { message_id: l.message_id, line_no: l.line_no, sku: l.sku, reason: "UNKNOWN_UOM" })]' }),
      router('choice', {}, [
        route({ expression: '#[not isEmpty(vars.good)]' }, [
          step('set-payload', { value: '#[vars.good]' }),
          step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO stg_receipt_lines (message_id, line_no, sku, uom, qty) VALUES (:message_id, :line_no, :sku, :uom, :qty)' }),
        ]),
      ]),
      router('choice', {}, [
        route({ expression: '#[not isEmpty(vars.bad)]' }, [
          step('set-payload', { value: '#[vars.bad]' }),
          step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO receipt_rejects (message_id, line_no, sku, reason) VALUES (:message_id, :line_no, :sku, :reason)' }),
        ]),
      ]),
      step('logger', { level: 'INFO', message: '#["Receipt " ++ vars.doc.messageId ++ " good=" ++ (sizeOf(vars.good) as String) ++ " bad=" ++ (sizeOf(vars.bad) as String)]' }),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, receives goods receipts from its distribution centres on the JMS queue \`RECEIPT.WORK\`:

\`\`\`json
{ "messageId": "MSG-61020", "dc": "DC-NORTH",
  "lines": [ { "lineNo": 1, "sku": "TENT-2P-OLV", "uom": "CS", "qty": 12 } ] }
\`\`\`

The DCs send their own unit codes (\`CS\`, \`EA\`, \`PL\`). The merchandising system wants its own (\`CASE\`, \`EACH\`, \`PALLET\`). The data team keeps the translations in the Oracle table \`code_map\` (\`map_name\`, \`ext_code\`, \`int_code\`); unit rows have \`map_name = 'UOM'\`. They add rows when a DC starts using a new code.

Tables:
- \`stg_receipt_lines\` (\`message_id\`, \`line_no\`, \`sku\`, \`uom\`, \`qty\`), with the translated unit.
- \`receipt_rejects\` (\`message_id\`, \`line_no\`, \`sku\`, \`reason\`).

**Requirements**
- Read the unit code map from Oracle once per message, not once per line.
- Translate each line's unit. A line whose unit is not in the map goes to \`receipt_rejects\` with reason \`UNKNOWN_UOM\`; the other lines go on.
- Bulk insert the good lines and the rejects. Never send an empty list to a bulk insert.
- A new row in \`code_map\` must take effect without changing the flow.

**Design the flow.**
`,
  answerTemplate: `## Reading the code map

## Translating the lines

## Good lines and rejects
`,
  keyPoints: [
    'A code map in a table lets the data team fix a new code without a release. The flow reads it, it does not hard code it.',
    'Read the map once and turn it into a DataWeave object keyed by the external code. A lookup is then codes[l.uom], with no query per line.',
    'Split good and bad once into two lists, each shaped for its own table, and bulk insert each list in one call.',
    'Keep the original code in the reject, or the reason column, so the data team knows which row to add.',
    'For very large maps, cache them for a few minutes. For a few hundred rows, one select per message is fine.',
  ],
  solution: `
1. **JMS On New Message** on \`RECEIPT.WORK\`. **Set Variable** \`doc\`.
2. **Database Select** \`SELECT ext_code, int_code FROM code_map WHERE map_name = 'UOM'\`, Target \`uomMap\`.
3. **Transform** into \`vars.mapped\`:
\`\`\`
var codes = { (vars.uomMap map ((m) -> { (m.ext_code): m.int_code })) }
---
vars.doc.lines map ((l) -> { ..., uom: codes[l.uom], ext_uom: l.uom })
\`\`\`
4. **Set Variable** \`good\` (uom not null) and \`bad\` (uom null, reason \`UNKNOWN_UOM\`).
5. **Choice** good not empty: **Bulk Insert** into \`stg_receipt_lines\`.
6. **Choice** bad not empty: **Bulk Insert** into \`receipt_rejects\`.
7. **Logger** with both counts.

**A default instead of a reject.** Some maps have a safe default (an unknown store region becomes \`OTHER\`). Use \`codes[l.uom] default "EACH"\` only when the business agrees that a guess is better than a reject.
`,
  followUps: [
    {
      q: 'Should both inserts be in one transaction?',
      a: 'Usually yes. If the staging insert fails after the rejects are written, a retry writes the rejects twice. A Try with ALWAYS_BEGIN around both avoids that.',
    },
    {
      q: 'Where would you put a cache, and for how long?',
      a: 'A Cache scope around the code map select, keyed by map name, for about five minutes. The data team then waits at most five minutes for a new row to work.',
    },
  ],
}
