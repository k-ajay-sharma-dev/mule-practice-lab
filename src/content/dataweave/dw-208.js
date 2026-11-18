export default {
  id: 'dw-208',
  category: 'dataweave',
  title: 'Match Files Sent Over SFTP With Acknowledgement Files From the Planning Platform',
  level: 'EXPERT',
  tags: ['myproject', 'sftp', 'acknowledgement', 'planning-platform', 'reconciliation', 'json'],
  estMinutes: 30,
  description: `
Marrow & Pine Home sends daily sales and inventory files to the planning platform over SFTP. For each file the platform drops an acknowledgement file in a return folder, with the same base name and a \`.ack\` extension. When it reprocesses a file, it writes a newer ack with the same name, and the poller keeps both. Nobody noticed for three days that the platform had rejected the inventory file, so the plans were built on old stock.

\`payload.sent\` lists what was sent: \`fileName\`, \`sentAt\` and \`rows\`. \`vars.acks\` lists the parsed ack files: \`ackFile\`, \`result\` (\`ACCEPTED\` or \`REJECTED\`), \`rowsAccepted\`, \`rowsRejected\` and \`receivedAt\`. \`vars.now\` is the check time and \`vars.overdueHours\` the wait limit. All times are UTC.

**Rules**
- An ack belongs to a sent file when their names match without the extension.
- When a file has several acks, use the one with the latest \`receivedAt\`.
- The status of each sent file, in \`payload.sent\` order:
  - with an ack: \`REJECTED\` when the result is \`REJECTED\`, \`COUNT_MISMATCH\` when accepted plus rejected rows differ from \`rows\`, \`PARTIAL\` when some rows were rejected, otherwise \`ACCEPTED\`
  - without an ack: \`OVERDUE\` when more than \`overdueHours\` passed since \`sentAt\`, otherwise \`WAITING\`
- \`ackFile\` is the ack used, or \`null\`.
- \`orphanAcks\`: ack files with no sent file, sorted by name.
- \`alert\` is \`true\` when any file is \`REJECTED\`, \`COUNT_MISMATCH\` or \`OVERDUE\`, or there is an orphan ack.

Output \`alert\`, \`files\` (\`fileName\`, \`status\`, \`ackFile\`) and \`orphanAcks\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "sent": [
    { "fileName": "sales_20261117.csv", "sentAt": "2026-11-18T01:00:00Z", "rows": 48210 },
    { "fileName": "inventory_20261117.csv", "sentAt": "2026-11-18T01:20:00Z", "rows": 91000 },
    { "fileName": "receipts_20261117.csv", "sentAt": "2026-11-18T01:30:00Z", "rows": 3100 },
    { "fileName": "transfers_20261117.csv", "sentAt": "2026-11-18T01:40:00Z", "rows": 820 },
    { "fileName": "sales_20261118.csv", "sentAt": "2026-11-18T07:30:00Z", "rows": 12000 },
    { "fileName": "stores_20261117.csv", "sentAt": "2026-11-18T01:05:00Z", "rows": 140 }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "now": "2026-11-18T08:00:00Z",
  "overdueHours": 4,
  "acks": [
    { "ackFile": "sales_20261117.ack", "result": "ACCEPTED", "rowsAccepted": 48200, "rowsRejected": 10, "receivedAt": "2026-11-18T01:30:00Z" },
    { "ackFile": "inventory_20261117.ack", "result": "ACCEPTED", "rowsAccepted": 91000, "rowsRejected": 0, "receivedAt": "2026-11-18T01:50:00Z" },
    { "ackFile": "inventory_20261117.ack", "result": "REJECTED", "rowsAccepted": 0, "rowsRejected": 91000, "receivedAt": "2026-11-18T03:10:00Z" },
    { "ackFile": "receipts_20261117.ack", "result": "ACCEPTED", "rowsAccepted": 3000, "rowsRejected": 0, "receivedAt": "2026-11-18T02:00:00Z" },
    { "ackFile": "stores_20261117.ack", "result": "ACCEPTED", "rowsAccepted": 140, "rowsRejected": 0, "receivedAt": "2026-11-18T01:20:00Z" },
    { "ackFile": "items_20261116.ack", "result": "ACCEPTED", "rowsAccepted": 5000, "rowsRejected": 0, "receivedAt": "2026-11-18T01:15:00Z" }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "alert": true,
  "files": [
    { "fileName": "sales_20261117.csv", "status": "PARTIAL", "ackFile": "sales_20261117.ack" },
    { "fileName": "inventory_20261117.csv", "status": "REJECTED", "ackFile": "inventory_20261117.ack" },
    { "fileName": "receipts_20261117.csv", "status": "COUNT_MISMATCH", "ackFile": "receipts_20261117.ack" },
    { "fileName": "transfers_20261117.csv", "status": "OVERDUE", "ackFile": null },
    { "fileName": "sales_20261118.csv", "status": "WAITING", "ackFile": null },
    { "fileName": "stores_20261117.csv", "status": "ACCEPTED", "ackFile": "stores_20261117.ack" }
  ],
  "orphanAcks": ["items_20261116.ack"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  files: payload.sent map (s) -> {
    fileName: s.fileName,
    status: if (vars.acks.ackFile contains (s.fileName replace ".csv" with ".ack")) "ACCEPTED" else "WAITING"
  }
}
`,
  hints: [
    'Strip the extension with `replace /\\.[^.]*$/ with ""` and group the acks by that base name.',
    'Pick the latest ack of a group with `(group orderBy (a) -> a.receivedAt)[-1]`. ISO times in UTC sort as text.',
    'A `DateTime` turned into a `Number` gives epoch seconds, so hours are `(now - sent) / 3600`.',
  ],
  solution: `%dw 2.0
output application/json
import some from dw::core::Arrays

fun base(name) = name replace /\\.[^.]*$/ with ""
fun epoch(t) = (t as DateTime) as Number

var acksByBase = vars.acks groupBy (a) -> base(a.ackFile)
var sentBases = payload.sent map (s) -> base(s.fileName)
var nowSec = epoch(vars.now)

var files = payload.sent map (s) -> do {
  var group = acksByBase[base(s.fileName)]
  var ack = if (group == null) null else (group orderBy (a) -> a.receivedAt)[-1]
  var hours = (nowSec - epoch(s.sentAt)) / 3600
  ---
  {
    fileName: s.fileName,
    status:
      if (ack == null) (if (hours > vars.overdueHours) "OVERDUE" else "WAITING")
      else if (ack.result == "REJECTED") "REJECTED"
      else if (ack.rowsAccepted + ack.rowsRejected != s.rows) "COUNT_MISMATCH"
      else if (ack.rowsRejected > 0) "PARTIAL"
      else "ACCEPTED",
    ackFile: if (ack == null) null else ack.ackFile
  }
}

var orphans = ((vars.acks filter (a) -> not (sentBases contains base(a.ackFile))) map (a) -> a.ackFile)
  distinctBy $ orderBy $
var bad = ["REJECTED", "COUNT_MISMATCH", "OVERDUE"]
---
{
  alert: (files some (f) -> bad contains f.status) or not isEmpty(orphans),
  files: files,
  orphanAcks: orphans
}`,
  explanation: `
**Sending is not delivering.** A file on the partner server only means the bytes arrived. The ack says the platform read and accepted it. A flow that stops at the upload has no idea whether the plans use the data.

**The latest ack wins.** The inventory file was accepted first, then rejected on a rerun. Reading the first ack hides the problem, which is what happened here.

**Count mismatches matter even when accepted.** If the platform counted fewer rows than were sent, rows were lost on the way or dropped by a parser. That is a data gap.

**Silence is a status too.** A missing ack after the agreed time is an alert. A file still inside the window is only waiting.

**Orphan acks point to a mix up.** An ack for a file this run never sent may be for a manual upload or another system writing to the same folder.
`,
  tests: [
    {
      name: 'All accepted',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "sent": [{ "fileName": "a.csv", "sentAt": "2026-11-18T01:00:00Z", "rows": 10 }] }' },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "now": "2026-11-18T02:00:00Z", "overdueHours": 4, "acks": [{ "ackFile": "a.ack", "result": "ACCEPTED", "rowsAccepted": 10, "rowsRejected": 0, "receivedAt": "2026-11-18T01:10:00Z" }] }',
        },
      ],
      expected: '{ "alert": false, "files": [{ "fileName": "a.csv", "status": "ACCEPTED", "ackFile": "a.ack" }], "orphanAcks": [] }',
    },
    {
      name: 'Rejected then accepted on a rerun',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "sent": [{ "fileName": "b.csv", "sentAt": "2026-11-18T01:00:00Z", "rows": 5 }] }' },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "now": "2026-11-18T09:00:00Z", "overdueHours": 4, "acks": [{ "ackFile": "b.ack", "result": "ACCEPTED", "rowsAccepted": 5, "rowsRejected": 0, "receivedAt": "2026-11-18T04:00:00Z" }, { "ackFile": "b.ack", "result": "REJECTED", "rowsAccepted": 0, "rowsRejected": 5, "receivedAt": "2026-11-18T01:30:00Z" }] }',
        },
      ],
      expected: '{ "alert": false, "files": [{ "fileName": "b.csv", "status": "ACCEPTED", "ackFile": "b.ack" }], "orphanAcks": [] }',
    },
    {
      name: 'Exactly at the limit is still waiting',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "sent": [{ "fileName": "c.csv", "sentAt": "2026-11-18T01:00:00Z", "rows": 5 }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "now": "2026-11-18T05:00:00Z", "overdueHours": 4, "acks": [] }' },
      ],
      expected: '{ "alert": false, "files": [{ "fileName": "c.csv", "status": "WAITING", "ackFile": null }], "orphanAcks": [] }',
    },
  ],
  followUps: [
    {
      q: 'Who should define the ack format and timing?',
      a: 'Both teams, in the interface agreement: file naming, fields, the maximum wait and what a rerun produces. Without it, every flow guesses.',
    },
    {
      q: 'What do you do with an ack after reading it?',
      a: 'Store its result against the sent file in a tracking table, then move the ack to a processed folder so the next poll does not read it again.',
    },
    {
      q: 'How would you run this check?',
      a: 'A scheduler every half hour reads the tracking table and the return folder, builds this result and raises an alert email or incident when alert is true.',
    },
  ],
}
