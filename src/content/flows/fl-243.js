import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const good = 'invoice_no,line_no,item_id,amount\nHT-55021,1,FX-1001,412.50\nHT-55021,2,FX-1002,96.00'
const broken = 'invoice_no,line_no,item_id,amount\nHT-55022,1,FX-1001,\nHT-55022,2,FX-1002,96.00'
const email = (from, messageId, csv = good) => ({
  source: 'email-listener',
  payload: { body: 'Invoice attached.', attachments: { 'invoice.csv': csv } },
  attributes: { id: 4410, subject: 'Invoice', fromAddresses: [from], headers: { 'Message-ID': messageId } },
})
const tables = (log = []) => ({
  suppliers: { key: 'supplier_id', rows: [{ supplier_id: 'SUP-HALE', email_domain: 'hale-timber.example', contact_email: 'ar-team@hale-timber.example' }] },
  mail_log: { key: 'message_id', columns: ['message_id', 'supplier_id', 'status'], rows: log },
  invoice_lines: { columns: ['invoice_no', 'line_no', 'item_id', { name: 'amount', notNull: true }, 'supplier_id'], rows: [] },
})
const moved = (folder, count) => ({ type: 'email-move', settings: { targetFolder: folder }, count })

export default {
  id: 'fl-243',
  category: 'flows',
  title: 'Supplier Invoices by Email Into Oracle: Trust Only Known Sender Domains, Load Each Message-ID Once, and Tell the Supplier\'s Registered Contact When a File Fails',
  level: 'ADVANCED',
  tags: ['myproject', 'email', 'imap', 'smtp', 'oracle', 'idempotency', 'security', 'attachments'],
  estMinutes: 45,
  flowChecks: [
    { label: 'New emails in INBOX start the flow', rule: { type: 'source', component: 'email-listener', where: { folder: 'INBOX' } } },
    { label: 'The sender\'s domain is looked up in suppliers before anything is loaded', rule: { type: 'before', first: 'db-select', firstWhere: { sql: { all: ['suppliers', 'email_domain'] } }, then: 'db-bulk-insert' } },
    { label: 'An unknown sender is moved to Quarantine and gets no reply', rule: { type: 'inside', component: 'email-move', within: 'choice', where: { targetFolder: 'Quarantine' } } },
    { label: 'The Message-ID is checked in mail_log', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['mail_log', 'message_id'] } } } },
    {
      label: 'The lines and the mail_log row are written in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'invoice_lines' } },
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'mail_log' } },
        ],
      },
    },
    {
      label: 'A failed file goes to Error and the supplier\'s registered contact is told, not the From address',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'email-move', within: 'on-error-continue', where: { targetFolder: 'Error' } },
          { type: 'inside', component: 'email-send', within: 'on-error-continue', where: { toAddresses: 'contact_email' } },
        ],
      },
    },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'A good invoice',
        about: 'The domain is known, the Message-ID is new. Both lines load with the mail_log row, and the email moves to Processed.',
        trigger: email('accounts@hale-timber.example', '<inv-55021@hale-timber.example>'),
        expect: {
          noError: true,
          db: { invoice_lines: { count: 2, has: [{ invoice_no: 'HT-55021', supplier_id: 'SUP-HALE' }] }, mail_log: { has: [{ message_id: '<inv-55021@hale-timber.example>', status: 'LOADED' }] } },
          connector: [moved('Processed', 1)],
          noEmails: true,
        },
      },
      {
        name: 'The same email again',
        about: 'The mailbox was restored from a backup and the email came back. Its Message-ID is in mail_log, so nothing loads twice and it moves to Processed.',
        trigger: email('accounts@hale-timber.example', '<inv-55021@hale-timber.example>'),
        overrides: { systems: { db: { tables: tables([{ message_id: '<inv-55021@hale-timber.example>', supplier_id: 'SUP-HALE', status: 'LOADED' }]) } } },
        expect: { db: { invoice_lines: { count: 0 } }, connector: [moved('Processed', 1)], noEmails: true },
      },
      {
        name: 'A sender nobody knows',
        about: 'The domain is not a supplier\'s. The email goes to Quarantine. No reply goes out, because a reply would confirm the mailbox to a stranger.',
        trigger: email('billing@hale-timber-payments.example', '<x91@hale-timber-payments.example>'),
        expect: { db: { invoice_lines: { count: 0 } }, connector: [moved('Quarantine', 1)], noEmails: true },
      },
      {
        name: 'A line with no amount',
        about: 'Oracle refuses the empty amount. Nothing loads, the email moves to Error, and ar-team@hale-timber.example is told which file failed.',
        trigger: email('accounts@hale-timber.example', '<inv-55022@hale-timber.example>', broken),
        expect: { db: { invoice_lines: { count: 0 }, mail_log: { count: 0 } }, connector: [moved('Error', 1), moved('Processed', 0)], emails: [{ to: 'ar-team@hale-timber.example', count: 1, subject: 'could not be loaded' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('supplier-invoice-mailbox', source('email-listener', { folder: 'INBOX', deleteAfterRetrieve: 'false', enableWatermark: 'true' }), [
      step('set-variable', { variableName: 'mailId', value: '#[attributes.id]' }),
      step('set-variable', { variableName: 'messageId', value: '#[attributes.headers["Message-ID"]]' }),
      step('set-variable', { variableName: 'domain', value: '#[lower((attributes.fromAddresses[0] splitBy "@")[1])]' }),
      step('set-variable', { variableName: 'mail', value: '#[payload]' }),
      step('db-select', { database: 'Oracle', sql: 'SELECT supplier_id, contact_email FROM suppliers WHERE email_domain = :domain', inputParameters: '#[{ domain: vars.domain }]', target: 'supplier' }),
      step('db-select', { database: 'Oracle', sql: 'SELECT message_id FROM mail_log WHERE message_id = :messageId', inputParameters: '#[{ messageId: vars.messageId }]', target: 'seen' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[isEmpty(vars.supplier)]' }, [
            step('logger', { level: 'WARN', message: '#["Mail " ++ (vars.mailId as String) ++ " from unknown domain " ++ vars.domain ++ " quarantined"]' }),
            step('email-move', { emailId: '#[vars.mailId]', targetFolder: 'Quarantine', createTargetFolder: 'true' }),
          ]),
          route({ expression: '#[not isEmpty(vars.seen)]' }, [
            step('logger', { level: 'INFO', message: '#["Mail " ++ vars.messageId ++ " was loaded before"]' }),
            step('email-move', { emailId: '#[vars.mailId]', targetFolder: 'Processed', createTargetFolder: 'true' }),
          ]),
        ],
        {
          otherwise: [
            scope('try', {}, [
              step('transform', {
                script: '%dw 2.0\noutput application/java\nvar csv = (vars.mail.attachments pluck ((content, name) -> content))[0]\n---\nread(csv, "application/csv") map ((r) -> { invoice_no: r.invoice_no, line_no: r.line_no as Number, item_id: r.item_id, amount: if (isEmpty(r.amount)) null else r.amount as Number, supplier_id: vars.supplier[0].supplier_id })',
              }),
              scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
                step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO invoice_lines (invoice_no, line_no, item_id, amount, supplier_id) VALUES (:invoice_no, :line_no, :item_id, :amount, :supplier_id)' }),
                step('db-insert', {
                  database: 'Oracle',
                  sql: "INSERT INTO mail_log (message_id, supplier_id, status) VALUES (:messageId, :supplierId, 'LOADED')",
                  inputParameters: '#[{ messageId: vars.messageId, supplierId: vars.supplier[0].supplier_id }]',
                }),
              ]),
              step('email-move', { emailId: '#[vars.mailId]', targetFolder: 'Processed', createTargetFolder: 'true' }),
            ], {
              errorHandlers: [
                handler('on-error-continue', { type: 'ANY' }, [
                  step('logger', { level: 'ERROR', message: '#["Invoice mail " ++ vars.messageId ++ " failed: " ++ error.description]' }),
                  step('email-move', { emailId: '#[vars.mailId]', targetFolder: 'Error', createTargetFolder: 'true' }),
                  scope('async', {}, [
                    step('email-send', {
                      toAddresses: '#[vars.supplier[0].contact_email]',
                      subject: 'Your invoice email could not be loaded',
                      content: '#["We could not load the invoice file sent to us. Please check that every line has an amount and send it again. Reference: " ++ vars.messageId]',
                    }),
                  ]),
                ]),
              ],
            }),
          ],
        },
      ),
    ]),
  ),
  description: `
Fenwick Supply, a fictional builders' merchant, receives supplier invoices as CSV attachments in a shared mailbox read over **IMAP**:

\`\`\`
invoice_no,line_no,item_id,amount
HT-55021,1,FX-1001,412.50
\`\`\`

Oracle tables:
- \`suppliers\` (\`supplier_id\`, \`email_domain\`, \`contact_email\`): who may send invoices, and who to tell about problems.
- \`mail_log\` (\`message_id\` key, \`supplier_id\`, \`status\`): the \`Message-ID\` header of every email loaded.
- \`invoice_lines\` (\`invoice_no\`, \`line_no\`, \`item_id\`, \`amount\` NOT NULL, \`supplier_id\`).

The mailbox has \`Processed\`, \`Error\` and \`Quarantine\` folders.

Incidents last year:
- A fake "supplier" sent invoices from a look alike domain, and the old flow loaded them.
- After a mailbox restore, 300 old invoices were loaded a second time.
- The old flow replied "your file failed" to the From address, which a phishing email had set to a stranger.

**Requirements**
- Accept mail only from a domain in \`suppliers\`. Anything else goes to \`Quarantine\` with a WARN, and gets no reply.
- An email whose \`Message-ID\` is in \`mail_log\` goes to \`Processed\` without loading.
- Otherwise load the lines and the \`mail_log\` row (status \`LOADED\`) together, then move the email to \`Processed\`.
- If the load fails, move the email to \`Error\`, log an ERROR, and email the supplier's **registered** \`contact_email\` (not the From address) with a reference. A mail problem must not change the outcome.

**Facts**
- The listener gives \`attributes.id\` (for Email Move), \`attributes.fromAddresses\` (a list) and \`attributes.headers["Message-ID"]\`. The payload's \`attachments\` maps each name to its content; the invoice is the only one.
- The domain is the part of the From address after the \`@\`, in lower case.
- Turn an empty \`amount\` into null, so Oracle refuses the line. Store \`line_no\` and \`amount\` as numbers.
- The subject of the supplier email is \`Your invoice email could not be loaded\`.

**What each system sends back**
- **Database Select** on \`suppliers\`: \`[ { "supplier_id": "SUP-HALE", "contact_email": "ar-team@hale-timber.example" } ]\` for \`hale-timber.example\`, or an empty list for an unknown domain. Read the row as \`[0]\`.
- **Database Select** on \`mail_log\`: \`[ { "message_id": "<inv-55021@hale-timber.example>" } ]\` when the email was loaded before, or an empty list.

**What failures look like**
- A line with no amount: Oracle refuses the null in the NOT NULL column, and the Bulk Insert raises \`DB:QUERY_EXECUTION\`. The transaction rolls back, so no line and no \`mail_log\` row stay.

**Design the flow.**
`,
  answerTemplate: `## Who may send

## Loading each email once

## The load

## Telling the supplier
`,
  keyPoints: [
    'The From address is written by the sender and proves nothing. Checking the domain against a known list is a first gate; SPF, DKIM and DMARC results from the mail server are the stronger one.',
    'Never reply to an unknown sender. A reply confirms the mailbox exists and may carry data to an attacker.',
    'The Message-ID header is the email\'s own identity. Keeping it with a unique key stops a restored mailbox or a reread from loading twice.',
    'The lines and the mail_log row share a transaction, so a log row always means the lines are in.',
    'Reply to the contact on record, from the database, and say only what the supplier needs to fix.',
    'Move the email last on each path. The folder is the visible record of what happened to it.',
  ],
  solution: `
1. **Email On New Email (IMAP)** on \`INBOX\`, watermark on, do not delete.
2. **Set Variable** \`mailId\`, \`messageId\` (the header), \`domain\` (after the @, lower case), \`mail\`.
3. **Database Select** the supplier by domain, Target \`supplier\`. **Database Select** \`mail_log\` by Message-ID, Target \`seen\`.
4. **Choice**:
   - no supplier: WARN, **Email Move** to \`Quarantine\`.
   - seen: INFO, **Email Move** to \`Processed\`.
   - otherwise a **Try**:
     - **Transform** the CSV to rows with \`supplier_id\`.
     - **Try** ALWAYS_BEGIN: **Bulk Insert** \`invoice_lines\`, **Insert** \`mail_log\` \`LOADED\`.
     - **Email Move** to \`Processed\`.
     - **On Error Continue**: ERROR, **Email Move** to \`Error\`, **Async** **Email Send** to \`vars.supplier[0].contact_email\`.

**Missing Message-ID.** A few mail tools leave it out. Fall back to a hash of sender, date and attachment, and log that you did.
`,
  followUps: [
    {
      q: 'How would you use SPF and DKIM results in Mule?',
      a: 'The receiving mail server adds an Authentication-Results header. Read it from the email headers and quarantine anything that does not pass, before looking at the domain list.',
    },
    {
      q: 'Why is the error email in an Async scope inside the handler?',
      a: 'If the reply fails, it must not replace the original error or stop the move to Error. Async keeps the reply apart from what happens to the invoice.',
    },
  ],
}
