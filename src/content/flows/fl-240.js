import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const msg = (id, attempts, nextTry, status = 'PENDING') => ({ id, to_addr: `store${id}@larkfield.example`, subject: 'Delivery slot changed', body: 'Your Thursday delivery moves to 06:00.', status, attempts, next_try_at: nextTry })
const rows = [msg(1, 0, '2026-11-13T09:50:00'), msg(2, 4, '2026-11-13T09:40:00'), msg(3, 1, '2026-11-13T23:00:00'), msg(4, 0, '2026-11-13T09:00:00', 'SENT')]
const tables = () => ({ email_outbox: { key: 'id', rows: structuredClone(rows) } })

export default {
  id: 'fl-240',
  category: 'flows',
  title: 'Store Emails That Hit a Busy Mail Relay: Retry From an Oracle Outbox With a Growing Wait, and Mark the Email FAILED After Five Tries',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'smtp', 'retry', 'backoff', 'outbox', 'oracle', 'scheduler'],
  estMinutes: 35,
  flowChecks: [
    { label: 'A Scheduler polls the outbox', rule: { type: 'source', component: 'scheduler' } },
    { label: 'Only PENDING emails whose next try time has come are read', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['email_outbox', 'PENDING', 'next_try_at <='] } } } },
    { label: 'Each email is sent in its own Try and marked SENT after the send', rule: { type: 'all', rules: [{ type: 'inside', component: 'email-send', within: 'try' }, { type: 'before', first: 'email-send', then: 'db-update', thenWhere: { sql: 'SENT' } }] } },
    { label: 'A failed send counts the attempt and sets a later next try time', rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', where: { sql: { all: ['attempts = attempts + 1', 'next_try_at = :'] } } } },
    { label: 'After the fifth failed try the email is marked FAILED', rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', where: { sql: 'FAILED' } } },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'The relay works',
        about: 'Emails 1 and 2 are due and are sent and marked SENT. Email 3 waits for its next try time, and email 4 was sent before.',
        trigger: { schedule: {} },
        expect: { noError: true, emails: [{ count: 2 }], db: { email_outbox: { has: [{ id: 1, status: 'SENT' }, { id: 2, status: 'SENT' }, { id: 3, status: 'PENDING', attempts: 1 }] } } },
      },
      {
        name: 'The relay refuses mail',
        about: 'Both sends fail. Email 1 now has 1 attempt and a later try time. Email 2 has failed five times and is marked FAILED, with an ERROR.',
        trigger: { schedule: {} },
        overrides: { systems: { email: { fault: true } } },
        expect: {
          noError: true,
          db: { email_outbox: { has: [{ id: 1, status: 'PENDING', attempts: 1 }, { id: 2, status: 'FAILED', attempts: 5 }], lacks: [{ id: 1, next_try_at: '2026-11-13T09:50:00' }] } },
          logs: [{ level: 'ERROR', has: 'email 2' }],
        },
      },
    ],
  },
  referenceFlow: design(
    flow('store-email-sender', source('scheduler', { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'MINUTES' }), [
      step('set-variable', { variableName: 'now', value: '#[now() as String {format: "yyyy-MM-dd\'T\'HH:mm:ss"}]' }),
      step('db-select', {
        database: 'Oracle',
        sql: "SELECT id, to_addr, subject, body, attempts FROM email_outbox WHERE status = 'PENDING' AND next_try_at <= :now ORDER BY id FETCH FIRST 20 ROWS ONLY",
        inputParameters: '#[{ now: vars.now }]',
      }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'mail', value: '#[payload]' }),
        scope('try', {}, [
          step('email-send', { toAddresses: '#[vars.mail.to_addr]', subject: '#[vars.mail.subject]', content: '#[vars.mail.body]' }),
          step('db-update', { database: 'Oracle', sql: "UPDATE email_outbox SET status = 'SENT' WHERE id = :id", inputParameters: '#[{ id: vars.mail.id }]' }),
        ], {
          errorHandlers: [
            handler('on-error-continue', { type: 'ANY' }, [
              router(
                'choice',
                {},
                [
                  route({ expression: '#[vars.mail.attempts + 1 >= 5]' }, [
                    step('logger', { level: 'ERROR', message: '#["Gave up on email " ++ (vars.mail.id as String) ++ " after 5 tries: " ++ error.description]' }),
                    step('db-update', { database: 'Oracle', sql: "UPDATE email_outbox SET status = 'FAILED', attempts = attempts + 1 WHERE id = :id", inputParameters: '#[{ id: vars.mail.id }]' }),
                  ]),
                ],
                {
                  otherwise: [
                    step('set-variable', {
                      variableName: 'nextTry',
                      value: '#[(now() + ([|PT1M|, |PT2M|, |PT4M|, |PT8M|][vars.mail.attempts])) as String {format: "yyyy-MM-dd\'T\'HH:mm:ss"}]',
                    }),
                    step('db-update', {
                      database: 'Oracle',
                      sql: 'UPDATE email_outbox SET attempts = attempts + 1, next_try_at = :nextTry WHERE id = :id',
                      inputParameters: '#[{ nextTry: vars.nextTry, id: vars.mail.id }]',
                    }),
                  ],
                },
              ),
            ]),
          ],
        }),
      ]),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, emails its stores about delivery changes. Other apps write each email to the Oracle table \`email_outbox\` (\`id\`, \`to_addr\`, \`subject\`, \`body\`, \`status\`, \`attempts\`, \`next_try_at\` as \`yyyy-MM-ddTHH:mm:ss\`) with status \`PENDING\`, \`attempts\` 0 and \`next_try_at\` = now.

The company's mail relay answers **421 try again later** (a 4xx reply) when it is busy, often for a few minutes at a time around 06:00. The first sender retried every email every minute, which kept the relay busy for longer.

**Requirements**
- Every minute, read up to 20 \`PENDING\` emails whose \`next_try_at\` has come, in ID order.
- Send each on its own. When it works, set \`SENT\`.
- When it fails, add 1 to \`attempts\` and set \`next_try_at\` later each time: 1, 2, 4, then 8 minutes from now.
- When the fifth try fails, set \`FAILED\` with an ERROR log, and stop trying that email.

**Facts**
- Pass now as \`yyyy-MM-ddTHH:mm:ss\` text and compare it with \`next_try_at <= :now\`. In the tests now is 2026-11-13T10:00:00.
- Count the fifth try too: a \`FAILED\` email ends with \`attempts\` 5.
- The ERROR log names the email as \`email <id>\`.

**What each system sends back**
- **Database Select** on \`email_outbox\`: a list of due rows. In the tests emails 1 and 2 are due:
\`\`\`json
[ { "id": 1, "to_addr": "store1@larkfield.example", "subject": "Delivery slot changed", "body": "Your Thursday delivery moves to 06:00.", "attempts": 0 },
  { "id": 2, "to_addr": "store2@larkfield.example", "subject": "Delivery slot changed", "body": "...", "attempts": 4 } ]
\`\`\`

**What failures look like**
- The relay refuses mail: each Email Send raises an \`EMAIL\` error (such as \`EMAIL:SEND\`) inside its own Try. Email 1 goes from 0 to 1 attempt with a later try time. Email 2 was on attempt 4, so this fifth failure marks it \`FAILED\`.

**Design the flow.**
`,
  answerTemplate: `## Choosing what to send

## Sending one at a time

## Waiting longer each time

## Giving up
`,
  keyPoints: [
    'A 4xx SMTP reply means "not now". Retrying is right, but retrying at once adds to the load that caused it. A growing wait (backoff) gives the relay room to recover.',
    'Keep the retry state in the outbox row: attempts and next_try_at. It survives restarts, and support can see why an email has not gone.',
    'The select only takes rows that are due, so the backoff needs no sleeping thread in Mule.',
    'A 5xx reply (bad address, mailbox unknown) will never work. If the error tells you so, mark it FAILED at once instead of using up five tries.',
    'Mark SENT right after each send, not at the end of the run, so a crash half way does not resend the emails already sent.',
  ],
  solution: `
1. **Scheduler** every minute. **Set Variable** \`now\`.
2. **Database Select** \`... WHERE status = 'PENDING' AND next_try_at <= :now ORDER BY id FETCH FIRST 20 ROWS ONLY\`.
3. **For Each** row: \`mail\`, then a **Try**:
   - **Email Send** to \`to_addr\`. **Database Update** \`SENT\`.
   - **On Error Continue** (ANY): **Choice**:
     - \`attempts + 1 >= 5\`: ERROR log, **Database Update** \`FAILED\`.
     - Otherwise: \`nextTry\` = now plus 1, 2, 4 or 8 minutes by \`attempts\`, **Database Update** \`attempts = attempts + 1, next_try_at = :nextTry\`.

**Why not Until Successful?** It holds the flow and a thread while it waits, keeps its count in memory, and blocks the emails behind it. The table keeps going with each email on its own clock.

**Two workers.** In a cluster, run the Scheduler on the primary node only, or claim rows with FOR UPDATE SKIP LOCKED.
`,
  followUps: [
    {
      q: 'Why add some random jitter to the wait?',
      a: 'When many emails fail at the same moment, the same waits make them all come back at the same moment too. A few random seconds spread them out.',
    },
    {
      q: 'How does the sender tell a 4xx from a 5xx in Mule?',
      a: 'The Email connector raises its own error types, and the server\'s reply text is in the description. Match the reply code there, and keep a short list of codes that are worth retrying.',
    },
  ],
}
