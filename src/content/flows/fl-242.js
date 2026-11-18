import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const notice = (n, status = 'PENDING') => ({
  id: n,
  store_id: String(100 + n).padStart(4, '0'),
  to_addr: `store${String(100 + n).padStart(4, '0')}@larkfield.example`,
  subject: 'Price changes for Monday',
  body: 'Your shelf edge labels for Monday are ready to print.',
  status,
})
const pending = (n) => Array.from({ length: n }, (_, i) => notice(i + 1))
const tables = (rows) => ({ store_notices: { key: 'id', rows } })

export default {
  id: 'fl-242',
  category: 'flows',
  title: 'Price Notices to 400 Stores Through a Mail Relay That Takes 30 Emails a Minute: Send at Most 30 per Run, Stop When the Relay Pushes Back, and Leave the Rest for the Next Minute',
  level: 'ADVANCED',
  tags: ['myproject', 'email', 'smtp', 'rate-limit', 'throttling', 'oracle', 'scheduler', 'stores'],
  estMinutes: 40,
  flowChecks: [
    {
      label: 'A Scheduler runs every minute',
      rule: {
        type: 'any',
        rules: [
          { type: 'source', component: 'scheduler', where: { frequency: 1, timeUnit: 'MINUTES' } },
          { type: 'source', component: 'scheduler', where: { frequency: 60, timeUnit: 'SECONDS' } },
          { type: 'source', component: 'scheduler', where: { frequency: 60000, timeUnit: 'MILLISECONDS' } },
          { type: 'source', component: 'scheduler', where: { expression: '0 * * * * ?' } },
        ],
      },
    },
    { label: 'PENDING notices are read in ID order', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['store_notices', 'PENDING', 'ORDER BY id'] } } } },
    { label: 'Each notice is marked SENT straight after its send', rule: { type: 'all', rules: [{ type: 'inside', component: 'email-send', within: 'foreach' }, { type: 'before', first: 'email-send', then: 'db-update', thenWhere: { sql: 'SENT' } }] } },
    {
      label: 'A refused send ends the run, so the rest wait for the next minute',
      rule: { type: 'all', rules: [{ type: 'absent', component: 'try', within: 'foreach' }, { type: 'handler', component: ['on-error-continue', 'on-error-propagate'] }] },
    },
  ],
  simulation: {
    systems: { db: { tables: tables(pending(35)) } },
    tests: [
      {
        name: 'Monday morning, 35 notices waiting',
        about: 'The relay allows 30 a minute. This run sends the first 30 and marks them SENT. Notices 31 to 35 stay PENDING for the next minute.',
        trigger: { schedule: {} },
        expect: { noError: true, emails: [{ count: 30 }], db: { store_notices: { has: [{ id: 1, status: 'SENT' }, { id: 30, status: 'SENT' }, { id: 31, status: 'PENDING' }, { id: 35, status: 'PENDING' }] } } },
      },
      {
        name: 'The relay pushes back',
        about: 'The relay refuses the first send. The run stops with a WARN, nothing is marked SENT, and every notice waits for the next minute.',
        trigger: { schedule: {} },
        overrides: { systems: { email: { fault: true } } },
        expect: { emails: [{ count: 0 }], db: { store_notices: { lacks: [{ status: 'SENT' }] } }, logs: [{ level: 'WARN' }] },
      },
      {
        name: 'Nothing waiting',
        about: 'Every notice was sent before. No email goes out.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: tables([notice(1, 'SENT'), notice(2, 'SENT')]) } } },
        expect: { noEmails: true },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-notice-sender',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'MINUTES' }),
      [
        step('db-select', { database: 'Oracle', sql: "SELECT id, to_addr, subject, body FROM store_notices WHERE status = 'PENDING' ORDER BY id FETCH FIRST 30 ROWS ONLY", target: 'batch' }),
        router('choice', {}, [
          route({ expression: '#[not isEmpty(vars.batch)]' }, [
            scope('foreach', { collection: '#[vars.batch]' }, [
              step('email-send', { toAddresses: '#[payload.to_addr]', subject: '#[payload.subject]', content: '#[payload.body]' }),
              step('db-update', { database: 'Oracle', sql: "UPDATE store_notices SET status = 'SENT' WHERE id = :id", inputParameters: '#[{ id: payload.id }]' }),
            ]),
            step('logger', { level: 'INFO', message: '#["Sent " ++ (sizeOf(vars.batch) as String) ++ " store notices"]' }),
          ]),
        ]),
      ],
      [handler('on-error-continue', { type: 'ANY' }, [step('logger', { level: 'WARN', message: '#["The relay refused a send, stopping until the next run: " ++ error.description]' })])],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, emails each of its 400 stores when shelf prices change. Head office writes one row per store to the Oracle table \`store_notices\` (\`id\`, \`store_id\`, \`to_addr\`, \`subject\`, \`body\`, \`status\` = \`PENDING\`).

The company mail relay allows each sending account **30 emails a minute**. Above that it answers \`421\` and, if pushed, locks the account for an hour. The first sender sent all 400 in a loop; the account was locked by the 31st, and most stores got nothing that day.

**Requirements**
- Every minute, take at most 30 \`PENDING\` notices, lowest ID first, and send them one by one.
- Mark each notice \`SENT\` straight after its own send.
- If the relay refuses a send, stop this run with a WARN. Do not try the rest of the batch; they wait for the next minute.
- No email when nothing is waiting.

**Design the flow.**
`,
  answerTemplate: `## Pacing the sends

## Marking each notice

## When the relay pushes back
`,
  keyPoints: [
    'A limit per minute becomes a batch size per minute: one run a minute, at most 30 rows. The database holds the queue.',
    'Mark each notice SENT straight after its send. A failure half way then leaves an exact list of what is still to go.',
    'When the relay pushes back, every further send makes it worse and risks a lockout. Ending the run at the first refusal is the polite answer.',
    'Here the loop has no Try of its own, so the first refusal leaves the For Each and reaches the flow handler. Per row Trys suit a bad address, not a busy relay.',
    'Run the Scheduler on the primary node only. Two nodes each sending 30 is 60 a minute.',
    'For a large estate, ask for a higher limit, a bulk sending service, or one email per region with the stores in BCC; but never put addresses of different customers in one To line.',
  ],
  solution: `
1. **Scheduler** every 1 minute (primary node only).
2. **Database Select** \`... WHERE status = 'PENDING' ORDER BY id FETCH FIRST 30 ROWS ONLY\`, Target \`batch\`.
3. **Choice** not empty: **For Each** \`vars.batch\`: **Email Send**, **Database Update** \`SENT\`. Then INFO with the count.
4. Flow **On Error Continue** (ANY): WARN.

**A bad address in the batch.** It fails too and would stop the run every minute. Tell the two apart by the reply: a 5xx for one address marks that row \`FAILED\` and goes on; a 4xx for the relay stops the run.
`,
  followUps: [
    {
      q: 'Could you send faster with Parallel For Each?',
      a: 'Faster is what the relay does not allow. Parallel sends hit the limit sooner and make the order unpredictable. Sending one by one is the right speed here.',
    },
    {
      q: 'Some stores must get the notice before 07:00. How do you make sure?',
      a: 'Order by a priority column, then by ID, and start early enough: 400 at 30 a minute takes about 14 minutes. Alert if any notice is still PENDING at 06:45.',
    },
  ],
}
