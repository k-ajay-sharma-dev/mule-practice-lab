import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-080',
  category: 'flows',
  title: 'Legacy POP3 Courier Mailbox: Land First, Because the Email Will Not Be There Twice',
  level: 'ADVANCED',
  tags: ['myproject', 'email', 'pop3', 'postgresql', 'idempotency', 'file', 'error-handling'],
  estMinutes: 40,
  flowChecks: [
    {
      label: 'The mailbox is read with the POP3 listener, deleting after retrieve',
      rule: { type: 'source', component: 'email-listener-pop3', where: { deleteAfterRetrieve: 'true' } },
    },
    {
      label: 'The email is landed in a table with a duplicate-safe insert (ON CONFLICT)',
      rule: { type: 'exists', component: 'db-insert', where: { sql: 'ON CONFLICT' } },
    },
    {
      label: 'The mailbox flow only lands the email; the tracking call happens later from the landed row',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'email-listener-pop3' },
          { type: 'absent', component: 'http-request', inFlowWith: { component: 'email-listener-pop3' } },
        ],
      },
    },
    {
      label: 'If the landing insert fails, the email is spooled to disk by the error handler',
      rule: { type: 'inside', component: 'file-write', within: 'on-error-continue' },
    },
    { label: 'A file listener loads spooled emails back into the landing table', rule: { type: 'source', component: 'file-listener' } },
    {
      label: 'The file listener does not auto delete, which would also remove a file whose insert failed',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'file-listener' },
          { type: 'absent', component: 'file-listener', where: { postAction: 'delete' } },
        ],
      },
    },
    {
      label: 'A spool file is deleted only after its row is inserted',
      rule: { type: 'before', first: 'db-insert', then: 'file-delete', every: true, outside: true },
    },
    { label: 'Processing runs in a separate scheduled flow', rule: { type: 'source', component: 'scheduler' } },
    { label: 'The tracking system is called for each landed row', rule: { type: 'inside', component: 'http-request', within: 'foreach' } },
    {
      label: 'A row is marked as done only after the tracking system accepted it, never from an error handler',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'http-request', then: 'db-update', thenWhere: { sql: 'DONE' }, outside: true },
          { type: 'absent', component: 'db-update', where: { sql: 'DONE' }, within: ['on-error-continue', 'on-error-propagate'] },
        ],
      },
    },
    {
      label: 'One failing row is kept for a retry and does not stop the other rows',
      rule: { type: 'handler', component: 'on-error-continue', within: 'foreach' },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          mail_landing: {
            key: 'message_id',
            columns: ['message_id', 'sender', 'subject', 'body', { name: 'status', default: 'PENDING' }, 'received_at', { name: 'attempts', default: 0 }, 'last_error', 'done_at'],
            rows: [],
          },
        },
        latencyMs: 6,
      },
      http: [{ method: 'POST', path: '/tracking/events', latencyMs: 120, respond: { status: 202, body: { accepted: true } } }],
    },
    tests: [
      {
        name: 'A courier sends the email twice',
        about: 'The email is stored once as PENDING. The repeat with the same Message-ID changes nothing, and tracking is not called from the mailbox flow.',
        triggers: [
          {
            source: 'email-listener-pop3',
            payload: { body: 'AWB: 7712093\nSTATUS: DELIVERED\nLOCATION: LYON' },
            attributes: { subject: 'Status 7712093', fromAddresses: ['updates@rhone-couriers.example'], headers: { 'Message-ID': '<c7712093.1@rhone-couriers.example>' } },
          },
          {
            afterMs: 30000,
            source: 'email-listener-pop3',
            payload: { body: 'AWB: 7712093\nSTATUS: DELIVERED\nLOCATION: LYON' },
            attributes: { subject: 'Status 7712093', fromAddresses: ['updates@rhone-couriers.example'], headers: { 'Message-ID': '<c7712093.1@rhone-couriers.example>' } },
          },
        ],
        expect: {
          noError: true,
          db: { mail_landing: { count: 1, has: [{ message_id: '<c7712093.1@rhone-couriers.example>', status: 'PENDING' }] } },
          calls: [{ method: 'POST', path: '/tracking/events', count: 0 }],
        },
      },
      {
        name: 'PostgreSQL restarts during intake',
        about: 'The insert fails after the email left the mailbox, so the email is spooled to /data/mail-spool instead of being lost.',
        trigger: {
          source: 'email-listener-pop3',
          payload: { body: 'AWB: 5520018\nSTATUS: PICKED_UP\nLOCATION: TOULOUSE' },
          attributes: { subject: 'Status 5520018', fromAddresses: ['noreply@garonne-fret.example'], headers: { 'Message-ID': '<g5520018.3@garonne-fret.example>' } },
        },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { noError: true, files: { '/data/mail-spool/*': { count: 1, has: '5520018' } } },
      },
      {
        name: 'A spooled email is reloaded',
        about: 'An email spooled during a database restart is loaded into the table, and only then is its spool file deleted.',
        trigger: {
          file: {
            path: '/data/mail-spool/5b0e2c1a.json',
            content: '{ "messageId": "<c8810442.7@alpes-express.example>", "sender": "ops@alpes-express.example", "subject": "Status 8810442", "body": "AWB: 8810442\\nSTATUS: OUT_FOR_DELIVERY\\nLOCATION: GRENOBLE" }',
          },
        },
        overrides: {
          systems: {
            files: {
              '/data/mail-spool/5b0e2c1a.json':
                '{ "messageId": "<c8810442.7@alpes-express.example>", "sender": "ops@alpes-express.example", "subject": "Status 8810442", "body": "AWB: 8810442\\nSTATUS: OUT_FOR_DELIVERY\\nLOCATION: GRENOBLE" }',
            },
          },
        },
        expect: {
          db: { mail_landing: { has: [{ message_id: '<c8810442.7@alpes-express.example>', status: 'PENDING' }] } },
          files: { '/data/mail-spool/5b0e2c1a.json': { exists: false } },
        },
      },
      {
        name: 'The database is still down at reload',
        about: 'The insert fails again, so the spool file stays on disk and the email is not lost.',
        trigger: { file: { path: '/data/mail-spool/5b0e2c1a.json' } },
        overrides: {
          systems: {
            db: { fault: 'CONNECTIVITY' },
            files: {
              '/data/mail-spool/5b0e2c1a.json':
                '{ "messageId": "<c8810442.7@alpes-express.example>", "sender": "ops@alpes-express.example", "subject": "Status 8810442", "body": "AWB: 8810442\\nSTATUS: OUT_FOR_DELIVERY\\nLOCATION: GRENOBLE" }',
            },
          },
        },
        expect: { files: { '/data/mail-spool/5b0e2c1a.json': { exists: true } } },
      },
      {
        name: 'Tracking refuses one event',
        about: 'The first row fails and stays PENDING for a retry, and the second row still reaches tracking and is marked DONE.',
        trigger: { schedule: {} },
        overrides: {
          systems: {
            db: {
              tables: {
                mail_landing: {
                  key: 'message_id',
                  columns: ['message_id', 'sender', 'subject', 'body', { name: 'status', default: 'PENDING' }, 'received_at', { name: 'attempts', default: 0 }, 'last_error', 'done_at'],
                  rows: [
                    { message_id: '<c7712093.1@rhone-couriers.example>', sender: 'updates@rhone-couriers.example', subject: 'Status 7712093', body: 'AWB: 7712093\nSTATUS: DELIVERED\nLOCATION: LYON', status: 'PENDING', received_at: '2026-11-13T09:50:00Z', attempts: 0, last_error: null, done_at: null },
                    { message_id: '<c8810442.7@alpes-express.example>', sender: 'ops@alpes-express.example', subject: 'Status 8810442', body: 'AWB: 8810442\nSTATUS: OUT_FOR_DELIVERY\nLOCATION: GRENOBLE', status: 'PENDING', received_at: '2026-11-13T09:52:00Z', attempts: 0, last_error: null, done_at: null },
                  ],
                },
              },
            },
            http: [{ method: 'POST', path: '/tracking/events', responses: [{ status: 503, body: { message: 'Maintenance window' } }, { status: 202, body: { accepted: true } }] }],
          },
        },
        expect: {
          calls: [{ method: 'POST', path: '/tracking/events', count: 2 }],
          db: {
            mail_landing: {
              has: [
                { message_id: '<c7712093.1@rhone-couriers.example>', status: 'PENDING', attempts: 1 },
                { message_id: '<c8810442.7@alpes-express.example>', status: 'DONE' },
              ],
            },
          },
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'courier-mailbox-intake',
      // POP3S on port 995. No move, mark-as-read or expunge exists for POP3: deletion is the only way to remove a message.
      source('email-listener-pop3', { folder: 'INBOX', deleteAfterRetrieve: 'true' }),
      [
        // The mapped email becomes the payload, so the Insert's :messageId, :sender, :subject and :body find their values.
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  messageId: attributes.headers["Message-ID"] default uuid(),\n  sender: attributes.fromAddresses[0],\n  subject: attributes.subject,\n  body: payload.body as String\n}',
        }),
        // A copy for the error handler: the Insert replaces the payload.
        step('set-variable', { variableName: 'mail', value: '#[payload]' }),
        // The only job of this flow: get the email into storage we control.
        step('db-insert', {
          database: 'PostgreSQL',
          sql: "INSERT INTO mail_landing (message_id, sender, subject, body, status, received_at)\nVALUES (:messageId, :sender, :subject, :body, 'PENDING', now())\nON CONFLICT (message_id) DO NOTHING",
        }),
      ],
      [
        // The server copy may already be gone, so a failure here must not lose the content.
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Landing failed, spooling email: " ++ error.description]' }),
          step('set-payload', { value: '#[vars.mail]' }),
          step('file-write', { path: '#["/data/mail-spool/" ++ uuid() ++ ".json"]', mode: 'CREATE_NEW' }),
        ]),
      ],
    ),
    flow(
      'mail-spool-reload',
      // No post action on the listener: Apply Post Action When Failed defaults to true, so Auto Delete would also remove a file whose insert failed.
      source('file-listener', { directory: '/data/mail-spool', matcher: '*.json', postAction: 'none', timeBetweenSizeCheck: 1000 }),
      [
        step('set-variable', { variableName: 'spoolPath', value: '#[attributes.path]' }),
        step('transform', { script: '%dw 2.0\noutput application/java\n---\nread(payload, "application/json")' }),
        step('db-insert', {
          database: 'PostgreSQL',
          sql: "INSERT INTO mail_landing (message_id, sender, subject, body, status, received_at)\nVALUES (:messageId, :sender, :subject, :body, 'PENDING', now())\nON CONFLICT (message_id) DO NOTHING",
        }),
        step('file-delete', { path: '#[vars.spoolPath]' }),
      ],
    ),
    flow(
      'courier-status-processor',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'MINUTES' }),
      [
        step('db-select', {
          database: 'PostgreSQL',
          sql: "SELECT message_id, subject, body, attempts FROM mail_landing\nWHERE status = 'PENDING' AND attempts < 5\nORDER BY received_at LIMIT 200",
        }),
        scope('foreach', { collection: '#[payload]' }, [
          step('set-variable', { variableName: 'messageId', value: '#[payload.message_id]' }),
          scope(
            'try',
            {},
            [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\nvar fields = (payload.body splitBy "\\n") map (trim($) splitBy ":")\nfun field(name) = trim((fields filter (trim($[0]) == name))[0][1] default "")\n---\n{\n  awb: field("AWB"),\n  status: field("STATUS"),\n  location: field("LOCATION"),\n  sourceMessageId: vars.messageId\n}',
              }),
              step('http-request', { method: 'POST', path: '/tracking/events', responseTimeout: 10000 }),
              step('db-update', { database: 'PostgreSQL', sql: "UPDATE mail_landing SET status = 'DONE', done_at = now() WHERE message_id = :messageId" }),
            ],
            {
              errorHandlers: [
                handler('on-error-continue', { type: 'ANY' }, [
                  // :errorText needs a value, so the error text is put in a variable first.
                  step('set-variable', { variableName: 'errorText', value: '#[error.description]' }),
                  step('db-update', {
                    database: 'PostgreSQL',
                    sql: 'UPDATE mail_landing SET attempts = attempts + 1, last_error = :errorText WHERE message_id = :messageId',
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
A logistics company still receives delivery status updates from **12 regional couriers** by email. The mailbox \`courier-status@company.example\` sits on an old mail server that only offers **POP3S**. The hosting contract ends in two years, so nobody will add IMAP. Volume is about **3,000 plain text emails a day**, each with lines such as \`AWB: 7712093\`, \`STATUS: DELIVERED\` and \`LOCATION: LYON\`.

The mailbox has a small quota and must not fill up. A previous developer copied an IMAP design and asked for "move to Processed, otherwise leave it for retry", then found that none of those operations were available for POP3.

**Facts**
- PostgreSQL has a landing table \`mail_landing\` with a unique \`message_id\` and a \`status\` column. Its other columns are \`sender\`, \`subject\`, \`body\`, \`received_at\`, \`attempts\` (failed tracking calls so far, starting at 0), \`last_error\` and \`done_at\`.
- The \`message_id\` is the email's \`Message-ID\` header.
- The tracking system takes \`{ awb, status, location, sourceMessageId }\`, read from the \`AWB\`, \`STATUS\` and \`LOCATION\` lines.
- A row waiting for the tracking system has the status \`PENDING\`. A row the tracking system accepted gets the status \`DONE\`.
- The worker has a local disk folder, \`/data/mail-spool\`, that survives restarts and can hold emails as JSON files (\`{ messageId, sender, subject, body }\`).

**Requirements**
- Every status email must reach the **tracking system** (\`POST /tracking/events\`).
- The mailbox must be emptied as emails are read.
- The tracking system has maintenance windows of up to one hour and PostgreSQL has short restarts. Neither may lose an email.
- Couriers sometimes send the same email twice. A duplicate must not create a second tracking event.

**Design the flows.** Explain why the IMAP approach is not available, and how deleting on retrieval changes the failure design.
`,
  answerTemplate: `## What POP3 cannot do

## What delete after retrieve means for failures

## Landing the email

## When the landing store is down

## Processing and retries

## Duplicates
`,
  keyPoints: [
    'POP3 cannot look up a message by UID, so mark-as-read, move, delete and expunge are not available: they are IMAP operations. Delete after retrieve is the only way to remove messages.',
    'The POP3 listener has no watermark option. Without deletion nothing removes messages or records what was read, so the same emails can be seen again and the quota fills up.',
    'With delete after retrieve the server stops being the retry store. The docs do not say the deletion waits for the flow to succeed, so design as if the email is gone once the flow starts.',
    'The intake flow therefore does one thing: it lands the email in storage you control, and business processing moves to a separate flow.',
    'If the landing store fails, the error handler spools the email to disk and a file listener reloads it, so there is a second place for the content.',
    'The spool file is deleted by an explicit step after the insert. Apply Post Action When Failed defaults to true, so Auto Delete on the listener would also remove a file whose insert failed.',
    'A unique message_id with ON CONFLICT DO NOTHING makes duplicates and spool reloads harmless.',
  ],
  solution: `
**What POP3 cannot do.** POP3 is a download protocol. It has no folders to move to and keeps no read flag that a client can set. In the connector, POP3 cannot look up a message by UID, so \`mark-as-read\`, \`delete\`, \`move-to-folder\` and \`expunge-folder\` are IMAP operations only. The POP3 listener also has no watermark option. The only way to remove a message after retrieval is \`deleteAfterRetrieve\`.

**Why that changes the failure design.** With IMAP, "not yet moved" is your retry state, and the mailbox is the safe store. With POP3 and deletion, the mailbox gives you no second chance. The reference only says the emails are deleted after being retrieved, not that deletion waits for a successful flow. Treat the moment of retrieval as the point of no return.

**Flow 1, \`courier-mailbox-intake\`:**
1. **On New Email (POP3)**, POP3S on port 995, \`deleteAfterRetrieve="true"\`.
2. **Transform** to \`{ messageId, sender, subject, body }\` as the payload, so the Insert's named parameters find their values, and keep a copy in \`vars.mail\` because the Insert replaces the payload.
3. **Insert** into \`mail_landing\` with \`ON CONFLICT (message_id) DO NOTHING\`. No HTTP call happens here, so a tracking outage cannot touch this flow.
4. **On Error Continue** writes the JSON to \`/data/mail-spool\`. The spool sits on a disk that survives a worker restart.

**Flow 2, \`mail-spool-reload\`:** **File Listener** on the spool, **Insert**, then **File Delete** with the path saved in a variable. If the insert fails the file stays on disk, so the content is safe. Auto Delete on the listener would be wrong here because Apply Post Action When Failed defaults to true. The listener documentation does not spell out when a file left in place is picked up again, so test that before relying on it. Also alert on the age of the oldest spool file.

**Flow 3, \`courier-status-processor\`:** **Scheduler** every minute, **Select** PENDING rows, **For Each** with a **Try**: parse the lines, **POST** to tracking, **Update** to DONE. On failure the handler puts \`error.description\` in \`vars.errorText\` for the \`:errorText\` parameter, the attempt counter goes up and the row stays PENDING, so a one-hour maintenance window only delays events. Rows that reach five attempts stop being selected and show up on the support dashboard.

**Duplicates.** The Message-ID is the key of the landing table, so a repeated email or a reload is ignored. If a courier re-sends with a new Message-ID, the tracking system needs to accept repeats of the same AWB and status.

**Remaining risk, stated plainly.** If the worker stops between retrieval and the insert, that email can be lost. Deletion trades that small window for an empty mailbox. Without deletion you would need a Message-ID check on every poll and a separate clean-up, which the connector does not offer for POP3.
`,
  followUps: [
    {
      q: 'What happens if you leave deleteAfterRetrieve false on POP3?',
      a: 'There is no watermark or read flag to skip old messages, so each poll can see the same emails again and the quota still fills up. The flow would need an idempotency check on every message, and nothing would empty the mailbox.',
    },
    {
      q: 'Could the Idempotent Message Validator replace the ON CONFLICT clause?',
      a: 'It could stop duplicates in the intake flow, but the Message-ID would then be recorded before the row is safely stored. A unique key in the same table as the data keeps the check and the write together.',
    },
    {
      q: 'Why spool to disk rather than publish to a queue in the error handler?',
      a: 'Either works if it has a different failure mode from the landing store. A queue is better when workers have no durable disk. The point is that the fallback does not depend on the system that has failed.',
    },
    {
      q: 'When the mail server is finally replaced by one with IMAP, what simplifies?',
      a: 'The mailbox can again hold the state. Emails can stay until they are processed and then be moved to a Processed folder, so the spool flow can go. Keeping the landing table is still useful for retries and for keeping tracking outages away from the mailbox.',
    },
  ],
}
