import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const mail = (id, subject, attachments) => ({ payload: { body: 'Please see attached.', attachments }, attributes: { id, subject, fromAddresses: ['despatch@hale-timber.example'] } })
const asn = 'asn_no,line_no,item_id,qty\nASN-7701,1,FX-1001,40\nASN-7701,2,FX-1002,12'
const inbox = [mail(3101, 'ASN 7701', { 'ASN-7701.csv': asn }), mail(3102, 'Delivery tomorrow', { 'photo.jpg': '/9j/4AAQSkZJRg' })]
const tables = () => ({ supplier_asn_lines: { columns: ['asn_no', 'line_no', 'item_id', 'qty', 'mail_id'], rows: [] } })
const moved = (folder, count) => ({ type: 'email-move', settings: { targetFolder: folder }, count })

export default {
  id: 'fl-239',
  category: 'flows',
  title: 'Supplier Delivery Notices From a Mailbox: List the Inbox on a Schedule, Load Each CSV Into Oracle, and Move Each Email to Processed or Error, but Leave It When Oracle Is Down',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'imap', 'mailbox', 'oracle', 'attachments', 'scheduler'],
  estMinutes: 35,
  flowChecks: [
    { label: 'A Scheduler lists the INBOX folder', rule: { type: 'all', rules: [{ type: 'source', component: 'scheduler' }, { type: 'exists', component: 'email-list-imap', where: { mailboxFolder: 'INBOX' } }] } },
    { label: 'Each email is handled in its own Try inside a For Each', rule: { type: 'inside', component: 'try', within: 'foreach' } },
    { label: 'The CSV lines are bulk inserted into supplier_asn_lines', rule: { type: 'exists', component: 'db-bulk-insert', where: { sql: 'supplier_asn_lines' } } },
    { label: 'A loaded email is moved to Processed after the insert', rule: { type: 'before', first: 'db-bulk-insert', then: 'email-move', thenWhere: { targetFolder: 'Processed' }, outside: true } },
    { label: 'An email that can never load is moved to Error', rule: { type: 'inside', component: 'email-move', within: 'on-error-continue', where: { targetFolder: 'Error' } } },
    { label: 'A lost database connection is not treated as a bad email', rule: { type: 'handler', component: ['on-error-continue', 'on-error-propagate'], errorType: 'DB:CONNECTIVITY' } },
  ],
  simulation: {
    systems: { db: { tables: tables() }, calls: { 'email-list-imap': { payload: inbox } } },
    tests: [
      {
        name: 'One notice and one photo',
        about: 'Mail 3101 carries a CSV; its two lines load and it moves to Processed. Mail 3102 has no CSV, so it moves to Error. The run goes on to the end.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          db: { supplier_asn_lines: { count: 2, has: [{ asn_no: 'ASN-7701', item_id: 'FX-1002', mail_id: 3101 }] } },
          connector: [moved('Processed', 1), moved('Error', 1)],
        },
      },
      {
        name: 'An empty inbox',
        about: 'Nothing to read, nothing moved.',
        trigger: { schedule: {} },
        overrides: { systems: { calls: { 'email-list-imap': { payload: [] } } } },
        expect: { noError: true, connector: [{ type: 'email-move', count: 0 }] },
      },
      {
        name: 'Oracle is down',
        about: 'The CSV is fine, but the database cannot be reached. Mail 3101 stays in the inbox for the next poll, not in Error.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { connector: [moved('Error', 1), moved('Processed', 0), { type: 'email-move', count: 1 }] },
      },
    ],
  },
  referenceFlow: design(
    flow('supplier-asn-mailbox', source('scheduler', { strategy: 'fixed-frequency', frequency: 5, timeUnit: 'MINUTES' }), [
      step('email-list-imap', { mailboxFolder: 'INBOX', limit: 20 }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'mailId', value: '#[payload.attributes.id]' }),
        scope('try', {}, [
          step('set-variable', { variableName: 'csvName', value: '#[(((payload.payload.attachments default {}) pluck ((content, name) -> name as String)) filter ((n) -> lower(n) endsWith ".csv"))[0]]' }),
          router('choice', {}, [route({ expression: '#[vars.csvName == null]' }, [step('raise-error', { type: 'APP:NO_CSV', description: 'The email has no CSV attachment' })])]),
          step('transform', {
            script: '%dw 2.0\noutput application/java\n---\nread(payload.payload.attachments[vars.csvName], "application/csv") map ((r) -> { asn_no: r.asn_no, line_no: r.line_no as Number, item_id: r.item_id, qty: r.qty as Number, mail_id: vars.mailId })',
          }),
          step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO supplier_asn_lines (asn_no, line_no, item_id, qty, mail_id) VALUES (:asn_no, :line_no, :item_id, :qty, :mail_id)' }),
          step('email-move', { emailId: '#[vars.mailId]', targetFolder: 'Processed', createTargetFolder: 'true' }),
        ], {
          errorHandlers: [
            handler('on-error-continue', { type: 'DB:CONNECTIVITY' }, [step('logger', { level: 'WARN', message: '#["Mail " ++ (vars.mailId as String) ++ " left in the inbox: the database is not reachable"]' })]),
            handler('on-error-continue', { type: 'ANY' }, [
              step('logger', { level: 'ERROR', message: '#["Mail " ++ (vars.mailId as String) ++ " moved to Error: " ++ error.description]' }),
              step('email-move', { emailId: '#[vars.mailId]', targetFolder: 'Error', createTargetFolder: 'true' }),
            ]),
          ],
        }),
      ]),
    ]),
  ),
  optionalSteps: [{ type: 'choice', why: 'Without the explicit check, reading a missing CSV fails anyway and the email still goes to Error. The Raise Error only gives a clearer reason in the log.' }],
  description: `
Fenwick Supply, a fictional builders' merchant, has small suppliers who cannot use the supplier portal. They email delivery notices (ASNs) as a CSV attachment to a shared mailbox, read over **IMAP**:

\`\`\`
asn_no,line_no,item_id,qty
ASN-7701,1,FX-1001,40
\`\`\`

The lines go into the Oracle table \`supplier_asn_lines\` (\`asn_no\`, \`line_no\`, \`item_id\`, \`qty\`, \`mail_id\`). The mailbox has \`Processed\` and \`Error\` folders, which the buyers check.

**Requirements**
- Every 5 minutes, list up to 20 emails in \`INBOX\`.
- Load each email on its own. One bad email must not stop the others.
- An email with a CSV: bulk insert its lines with the email's ID, then move it to \`Processed\`.
- An email with no CSV, or a CSV Oracle refuses, goes to \`Error\` with an ERROR log.
- If Oracle cannot be reached, leave the email in \`INBOX\` for the next poll, with a WARN.

**Facts**
- Each listed email has \`payload.attachments\` (attachment name to content) and \`attributes.id\`. \`mail_id\` is that ID.
- The CSV attachment is the one whose name ends in \`.csv\`. Read it as \`application/csv\`, and store \`line_no\` and \`qty\` as numbers.
- A database that cannot be reached raises \`DB:CONNECTIVITY\`.

**What each system sends back**

**Email List (IMAP)** returns a list of messages, each with its own \`payload\` and \`attributes\`. Inside the For Each, the current email is \`payload\`, so its ID is \`payload.attributes.id\` and its files are \`payload.payload.attachments\`:
\`\`\`json
[ { "payload": { "body": "Please see attached.", "attachments": { "ASN-7701.csv": "asn_no,line_no,item_id,qty\\nASN-7701,1,FX-1001,40\\n..." } },
    "attributes": { "id": 3101, "subject": "ASN 7701", "fromAddresses": ["despatch@hale-timber.example"] } },
  { "payload": { "body": "Please see attached.", "attachments": { "photo.jpg": "..." } },
    "attributes": { "id": 3102, "subject": "Delivery tomorrow" } } ]
\`\`\`
An empty inbox returns an empty list.

**What failures look like**
- Oracle is down: the Bulk Insert raises \`DB:CONNECTIVITY\`. Leave mail 3101 in \`INBOX\`. Mail 3102 still goes to \`Error\`, because it has no CSV.

**Design the flow.**
`,
  answerTemplate: `## Polling the mailbox

## One email at a time

## Processed and Error folders

## When Oracle is down
`,
  keyPoints: [
    'Moving an email out of INBOX is how the flow remembers it is done. Move it only after the insert, so a crash in between reads it again rather than losing it.',
    'A Try per email inside the For Each keeps one bad email from stopping the rest of the run.',
    'Tell a bad email from a bad moment. No CSV or a refused row will never load: Error. A lost connection will pass: leave it and try again.',
    'Order the handlers from specific to general. DB:CONNECTIVITY first, then ANY.',
    'Run the poll on the primary node only in a cluster, or two nodes read the same email.',
    'Anyone can send to the mailbox. Check the sender against a list of known suppliers before trusting the content.',
  ],
  solution: `
1. **Scheduler** every 5 minutes.
2. **Email List (IMAP)** on \`INBOX\`, limit 20.
3. **For Each** email: \`mailId\`, then a **Try**:
   - \`csvName\`: the first attachment name ending in \`.csv\`. **Choice**: none raises \`APP:NO_CSV\`.
   - **Transform** the CSV to rows with \`mail_id\`. **Bulk Insert** into \`supplier_asn_lines\`.
   - **Email Move** to \`Processed\`.
   - **On Error Continue** \`DB:CONNECTIVITY\`: WARN only.
   - **On Error Continue** ANY: ERROR log, **Email Move** to \`Error\`.

**The same email twice.** If the move to Processed fails after the insert, the next poll loads it again. Keep the mail ID (or the Message-ID header) in Oracle with a unique key, and treat a repeat as done.
`,
  followUps: [
    {
      q: 'Why list on a schedule instead of the On New Email listener?',
      a: 'Both work. Listing gives one run per poll that you can limit, log and reason about, and it makes the batch size explicit. The listener is fine when each email is handled on its own.',
    },
    {
      q: 'The mailbox moves to Microsoft 365 and basic IMAP login is switched off. What changes?',
      a: 'The connection needs OAuth for IMAP, or a move to the Graph API. Plan it early; providers have been retiring basic authentication for mail.',
    },
  ],
}
