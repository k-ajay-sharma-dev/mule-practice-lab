import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const rej = (id, sku, reason, on) => ({ reject_id: id, sku, supplier_id: 'SUP-OAKLEY', reason, rejected_on: on })
const rows = [
  rej(1, 'LAMP-OAK-09', 'UNKNOWN_SUPPLIER', '2026-11-09'),
  rej(2, 'LAMP-OAK-10', 'UNKNOWN_SUPPLIER', '2026-11-10'),
  rej(3, 'SHADE-LIN-40', 'MISSING_BARCODE', '2026-11-11'),
  rej(4, 'RUG-WOOL-90', 'MISSING_BARCODE', '2026-10-30'),
]
const tables = (r) => ({ item_rejects: { key: 'reject_id', rows: r } })

export default {
  id: 'fl-237',
  category: 'flows',
  title: 'A Weekly Reject Summary by Email: Counts by Reason in an HTML Table, the Rows as a CSV Attachment, and No Email at All When Nothing Was Rejected',
  level: 'BEGINNER',
  tags: ['myproject', 'email', 'smtp', 'html', 'attachment', 'reject-table', 'oracle', 'scheduler'],
  estMinutes: 25,
  flowChecks: [
    { label: 'A Scheduler runs every Monday at 07:00', rule: { type: 'source', component: 'scheduler', where: { expression: { all: ['0 0 7', 'MON'] } } } },
    { label: 'The rejects are counted by reason in Oracle', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['item_rejects', 'COUNT', 'GROUP BY reason'] } } } },
    { label: 'The week\'s rows are read for the attachment', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['item_rejects', 'sku', 'rejected_on >='] } } } },
    { label: 'The email is HTML, to the data team, with the rows attached', rule: { type: 'exists', component: 'email-send', where: { contentType: 'text/html', toAddresses: 'item-data@marrowpine.example', attachments: { set: true } } } },
    { label: 'No email is sent when the week had no rejects', rule: { type: 'inside', component: 'email-send', within: 'choice', inSlot: 'otherwise' } },
  ],
  simulation: {
    systems: { db: { tables: tables(rows) } },
    tests: [
      {
        name: 'A week with rejects',
        about: 'Three rejects fall in the last seven days: two UNKNOWN_SUPPLIER and one MISSING_BARCODE. The email table shows both reasons with their counts.',
        trigger: { schedule: {} },
        expect: { noError: true, emails: [{ to: 'item-data@marrowpine.example', count: 1, has: 'UNKNOWN_SUPPLIER</td><td>2' }, { has: 'MISSING_BARCODE</td><td>1', count: 1 }] },
      },
      {
        name: 'A clean week',
        about: 'Only an old reject is in the table. No email goes out.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: tables([rows[3]]) } } },
        expect: { noEmails: true },
      },
    ],
  },
  referenceFlow: design(
    flow('weekly-reject-summary', source('scheduler', { strategy: 'cron', expression: '0 0 7 ? * MON' }), [
      step('set-variable', { variableName: 'since', value: '#[(now() - |P7D|) as String {format: "yyyy-MM-dd"}]' }),
      step('db-select', {
        database: 'Oracle',
        sql: 'SELECT reason, COUNT(*) AS line_count FROM item_rejects WHERE rejected_on >= :since GROUP BY reason ORDER BY reason',
        inputParameters: '#[{ since: vars.since }]',
        target: 'summary',
      }),
      router(
        'choice',
        {},
        [route({ expression: '#[isEmpty(vars.summary)]' }, [step('logger', { level: 'INFO', message: 'No item rejects this week, no email sent' })])],
        {
          otherwise: [
            step('db-select', {
              database: 'Oracle',
              sql: 'SELECT sku, supplier_id, reason, rejected_on FROM item_rejects WHERE rejected_on >= :since ORDER BY rejected_on',
              inputParameters: '#[{ since: vars.since }]',
              target: 'detail',
            }),
            step('transform', {
              script:
                '%dw 2.0\noutput text/plain\n---\n"<p>Item rejects since " ++ vars.since ++ "</p><table><tr><th>Reason</th><th>Lines</th></tr>" ++ ((vars.summary map ((r) -> "<tr><td>" ++ r.REASON ++ "</td><td>" ++ (r.LINE_COUNT as String) ++ "</td></tr>")) joinBy "") ++ "</table><p>The rows are attached as rejects.csv.</p>"',
            }),
            step('email-send', {
              toAddresses: 'item-data@marrowpine.example',
              subject: '#["Item rejects this week: " ++ (sum(vars.summary map $.LINE_COUNT) as String)]',
              content: '#[payload]',
              contentType: 'text/html',
              attachments: '#[{ "rejects.csv": write(vars.detail, "application/csv") }]',
            }),
          ],
        },
      ),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, rejects item lines that fail its checks into the Oracle table \`item_rejects\` (\`reject_id\`, \`sku\`, \`supplier_id\`, \`reason\`, \`rejected_on\` as \`yyyy-MM-dd\`). The item data team fixes them at the start of each week, and asked for a summary at \`item-data@marrowpine.example\`.

**Requirements**
- Every Monday at 07:00, look at the rejects of the last seven days.
- Send an HTML email with a table of reasons and how many lines each has. The rows themselves go as a CSV attachment named \`rejects.csv\`.
- A week with no rejects sends no email.

**Facts**
- The last seven days means \`rejected_on >= :since\`, where \`since\` is today minus 7 days as \`yyyy-MM-dd\` text. The tests start the flow by hand on 2026-11-13, a Friday, so \`since\` is 2026-11-06.
- Each reason is one table row with no spaces between cells: \`<tr><td>UNKNOWN_SUPPLIER</td><td>2</td></tr>\`.

**What each system sends back**
- The count query (\`SELECT reason, COUNT(*) AS line_count ... GROUP BY reason\`) returns one row per reason. Oracle returns unquoted column names and aliases in upper case, so a row reads \`{ "REASON": ..., "LINE_COUNT": ... }\`: \`[ { "REASON": "MISSING_BARCODE", "LINE_COUNT": 1 }, { "REASON": "UNKNOWN_SUPPLIER", "LINE_COUNT": 2 } ]\`. A clean week returns an empty list.
- The detail query returns the rows with the columns you select, such as \`{ "SKU": "LAMP-OAK-09", "SUPPLIER_ID": "SUP-OAKLEY", "REASON": "UNKNOWN_SUPPLIER", "REJECTED_ON": "2026-11-09" }\`. Written as CSV, those names become the header line.

**Design the flow.**
`,
  answerTemplate: `## The schedule and the query

## The HTML body and the attachment

## A clean week
`,
  keyPoints: [
    'Let Oracle count: GROUP BY reason returns one row per reason, which is all the table needs.',
    'The body is for reading at a glance; the attachment is for working on. Keep them apart.',
    'Set the body type to text/html, or the mail client shows the tags as text.',
    'Attachments in the Email connector are a map of file name to content. write(..., "application/csv") turns the rows into the file.',
    'No rejects, no email. A summary that says "0" every week trains people to ignore it. If they want proof the job ran, send a short "all clear" instead, on purpose.',
    'Watch the size. A bad week with 50,000 rejects makes an attachment many mail servers refuse. Then send a link instead.',
  ],
  solution: `
1. **Scheduler** cron \`0 0 7 ? * MON\`.
2. **Set Variable** \`since\` = today minus 7 days.
3. **Database Select** \`SELECT reason, COUNT(*) AS line_count ... GROUP BY reason\`, Target \`summary\`.
4. **Choice**: empty, INFO log. Otherwise:
   - **Database Select** the rows, Target \`detail\`.
   - **Transform** the HTML table.
   - **Email Send** to \`item-data@marrowpine.example\`, body type \`text/html\`, attachments \`{ "rejects.csv": write(vars.detail, "application/csv") }\`.
`,
  followUps: [
    {
      q: 'A reason contains a < sign. What happens to the HTML?',
      a: 'It can break the table or inject markup. Escape text values before putting them in HTML, or build the body with a template that escapes for you.',
    },
    {
      q: 'Where do the SMTP host and the credentials live?',
      a: 'In the Email SMTP configuration, with the password in a secure property, never in the flow or the repository.',
    },
  ],
}
