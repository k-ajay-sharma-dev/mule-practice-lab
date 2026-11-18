import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const contacts = [
  { store: '0412', email: 'mgr-0412@brindle.example', status: 'ACTIVE' },
  { store: '0415', email: 'mgr-0415@brindle.example', status: 'ACTIVE' },
]
const tables = { store_contact: { key: 'email', columns: ['store', 'email', 'status'], rows: contacts } }
const dsn = (recipient, status, text) =>
  `This is the mail system at host relay.brindle.example.\n\n${text}\n\nReporting-MTA: dns; relay.brindle.example\n\nFinal-Recipient: rfc822; ${recipient}\nAction: failed\nStatus: ${status}\nDiagnostic-Code: smtp; ${text}`
const mail = (id, subject, body) => ({ source: 'email-listener', payload: body, attributes: { id, subject, fromAddresses: ['mailer-daemon@relay.brindle.example'] } })

export default {
  id: 'fl-286',
  category: 'flows',
  title: 'Bounced Store Reports From the Bounce Mailbox: Find the Failed Address and the Status Code, Mark a Hard Bounce in SQL Server, Leave a Soft One Alone, and Send Everything Else to a Review Folder',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'imap', 'bounce', 'regex', 'sql-server', 'mailbox-folders'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Mail is read from the bounce mailbox with the IMAP listener', rule: { type: 'source', component: 'email-listener' } },
    { label: 'A hard bounce marks the contact BOUNCED in store_contact', rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['store_contact', 'BOUNCED'] } } } },
    { label: 'The contact is updated before its bounce is filed', rule: { type: 'before', first: 'db-update', then: 'email-move', thenWhere: { targetFolder: 'Processed' }, samePath: true } },
    { label: 'Bounces go to Processed and other mail to Review', rule: { type: 'all', rules: [{ type: 'exists', component: 'email-move', where: { targetFolder: 'Processed' } }, { type: 'exists', component: 'email-move', where: { targetFolder: 'Review' } }] } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'A hard bounce',
        about: 'Store 0412\'s manager address no longer exists (status 5.1.1). The contact is marked BOUNCED and the bounce is filed in Processed.',
        trigger: mail('M-901', 'Undelivered Mail Returned to Sender', dsn('mgr-0412@brindle.example', '5.1.1', '550 5.1.1 User unknown')),
        expect: {
          noError: true,
          db: { store_contact: { has: [{ email: 'mgr-0412@brindle.example', status: 'BOUNCED' }, { email: 'mgr-0415@brindle.example', status: 'ACTIVE' }] } },
          connector: [{ type: 'email-move', settings: { emailId: 'M-901', targetFolder: 'Processed' }, count: 1 }],
        },
      },
      {
        name: 'A soft bounce',
        about: 'Store 0415\'s mailbox is full (status 4.2.2). That passes, so the contact stays ACTIVE. The bounce is still filed in Processed.',
        trigger: mail('M-902', 'Delivery Status Notification (Delay)', dsn('mgr-0415@brindle.example', '4.2.2', '452 4.2.2 Mailbox full')),
        expect: { noError: true, db: { store_contact: { has: [{ email: 'mgr-0415@brindle.example', status: 'ACTIVE' }] } }, connector: [{ type: 'email-move', settings: { targetFolder: 'Processed' }, count: 1 }] },
      },
      {
        name: 'Not a bounce',
        about: 'An out of office reply has no failed recipient. Nothing is changed and it goes to Review for a person to read.',
        trigger: mail('M-903', 'Automatic reply: Weekly stock report', 'I am out of the office until Monday. For urgent matters call the store.'),
        expect: { noError: true, db: { store_contact: { lacks: [{ status: 'BOUNCED' }] } }, connector: [{ type: 'email-move', settings: { emailId: 'M-903', targetFolder: 'Review' }, count: 1 }] },
      },
    ],
  },
  referenceFlow: design(
    flow('report-bounces', source('email-listener', { folder: 'INBOX', deleteAfterRetrieve: 'false', enableWatermark: 'true' }), [
      step('set-variable', { variableName: 'recipient', value: '#[(payload scan /Final-Recipient:\\s*rfc822;\\s*([^\\s>]+)/)[0][1] default null]' }),
      step('set-variable', { variableName: 'statusClass', value: '#[(payload scan /Status:\\s*(\\d)\\.\\d+\\.\\d+/)[0][1] default null]' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[vars.recipient != null and vars.statusClass == "5"]' }, [
            step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.store_contact SET status = 'BOUNCED' WHERE email = :email", inputParameters: '#[{ email: lower(vars.recipient) }]', target: 'marked' }),
            step('logger', { level: 'WARN', message: '#["Hard bounce for " ++ vars.recipient]' }),
            step('email-move', { emailId: '#[attributes.id]', targetFolder: 'Processed', createTargetFolder: 'false' }),
          ]),
          route({ expression: '#[vars.recipient != null]' }, [
            step('logger', { level: 'INFO', message: '#["Soft bounce for " ++ vars.recipient ++ ", status class " ++ (vars.statusClass default "?")]' }),
            step('email-move', { emailId: '#[attributes.id]', targetFolder: 'Processed', createTargetFolder: 'false' }),
          ]),
        ],
        {
          otherwise: [
            step('logger', { level: 'INFO', message: '#["Not a bounce: " ++ attributes.subject]' }),
            step('email-move', { emailId: '#[attributes.id]', targetFolder: 'Review', createTargetFolder: 'false' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, emails a weekly stock report to the manager of each of its 140 stores. The addresses are in \`dbo.store_contact\` (\`store\`, \`email\`, \`status\`) in SQL Server; the report job skips contacts that are not \`ACTIVE\`.

Managers move between stores, and old addresses are closed. The mail relay sends each failure back to the bounce mailbox \`reports-bounces@brindle.example\`, where nobody reads it. Last month 23 stores got no report for weeks.

A bounce is a delivery status report. The part that matters looks like this:

\`\`\`
Final-Recipient: rfc822; mgr-0412@brindle.example
Action: failed
Status: 5.1.1
\`\`\`

A status starting with **5** is permanent (the address does not exist). One starting with **4** is temporary (mailbox full, server busy) and usually clears.

The mailbox also gets out of office replies and the odd message from a person.

**Requirements**
- Read the bounce mailbox over IMAP.
- For a **permanent** bounce, mark the contact \`BOUNCED\`.
- File every bounce, permanent or temporary, in the \`Processed\` folder after it is handled.
- Anything that is not a bounce goes to the \`Review\` folder untouched.

**Design the flow.**
`,
  answerTemplate: `## Finding the failed address

## Permanent or temporary

## Filing the mail
`,
  keyPoints: [
    'Final-Recipient and Status are the parts of a delivery report written for machines. They are steadier than the subject, which every mail server words its own way.',
    'scan finds the pattern anywhere in the body and gives the groups. A missing match gives an empty list, so default null turns "not a bounce" into a plain value.',
    'Only a 5.x.x status is permanent. Marking a full mailbox as BOUNCED would stop a store\'s reports for a problem that passes in a day.',
    'Update the contact before moving the mail. If the update fails, the mail stays in the inbox and is read again.',
    'Mail that is not understood goes to Review, not to the bin. A person sees it, and nothing is lost.',
  ],
  solution: `
1. **Email On New Email (IMAP)** on \`INBOX\` of the bounce mailbox, watermark on.
2. **Set Variable** \`recipient\` = \`(payload scan /Final-Recipient:\\s*rfc822;\\s*([^\\s>]+)/)[0][1] default null\`.
3. **Set Variable** \`statusClass\` = the first digit after \`Status:\`.
4. **Choice**:
   - recipient and class 5: **Database Update** \`store_contact\` to BOUNCED, **Logger** WARN, **Email Move** to \`Processed\`.
   - recipient: **Logger** INFO, **Email Move** to \`Processed\`.
   - otherwise: **Logger** INFO, **Email Move** to \`Review\`.

**The body.** Many delivery reports are multipart, with the machine part as its own section. Check what your connector gives as the payload for such mail; you may need to look in the attachments or parts for the report.
`,
  followUps: [
    {
      q: 'A soft bounce comes back every day for two weeks. Should it stay ACTIVE?',
      a: 'Count soft bounces per address with a date, and mark it BOUNCED after, for example, five in a row over a week. A real full mailbox gets cleared; an abandoned one never does.',
    },
    {
      q: 'Who sets a contact back to ACTIVE?',
      a: 'The store support team, once the new manager\'s address is entered. The report job could also list BOUNCED stores in its own summary, so the gap is seen at once.',
    },
  ],
}
