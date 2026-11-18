import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const alert = (severity = 'ERROR') => ({
  message: { kind: 'jms', destination: 'OPS.ALERTS', payload: { app: 'inv-process', alertKey: 'inv-process:DB:CONNECTIVITY', severity, text: 'Could not get a connection from the pool' } },
})
const state = (lastSent, count) => ({ alert_key: 'inv-process:DB:CONNECTIVITY', last_sent_at: lastSent, suppressed_count: count })
const tables = (rows = []) => ({ alert_state: { key: 'alert_key', columns: ['alert_key', 'last_sent_at', 'suppressed_count'], rows } })

export default {
  id: 'fl-246',
  category: 'flows',
  title: 'An Alert Storm During an Oracle Outage: One Email per Alert Key per Hour, a Count of What Was Held Back, CRITICAL Always Through, and the State Kept in Oracle',
  level: 'EXPERT',
  tags: ['myproject', 'email', 'smtp', 'alerts', 'throttling', 'oracle', 'jms', 'transaction', 'skip-locked'],
  estMinutes: 55,
  flowChecks: [
    { label: 'Alerts are read from OPS.ALERTS', rule: { type: 'source', component: 'jms-listener', where: { destination: 'OPS.ALERTS' } } },
    {
      label: 'The alert key\'s row is read and locked inside a transaction',
      rule: { type: 'inside', component: 'db-select', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: { all: ['alert_state', 'FOR UPDATE'] } } },
    },
    {
      label: 'A held back alert only adds to suppressed_count',
      rule: { type: 'inside', component: 'db-update', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'suppressed_count = suppressed_count + 1' } },
    },
    { label: 'A sent alert resets the count and the last sent time', rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['last_sent_at = :', 'suppressed_count = 0'] } } } },
    { label: 'The email goes out after the transaction, in an Async scope', rule: { type: 'all', rules: [{ type: 'inside', component: 'email-send', within: 'async' }, { type: 'before', first: 'try', then: 'async' }] } },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'The first alert of its kind',
        about: 'No row yet for this key. A row is created and on call gets the email.',
        trigger: alert(),
        expect: { noError: true, db: { alert_state: { count: 1, has: [{ suppressed_count: 0 }] } }, emails: [{ to: 'oncall-integration@marrowpine.example', count: 1, subject: 'inv-process:DB:CONNECTIVITY' }] },
      },
      {
        name: 'The same alert ten minutes later',
        about: 'An email for this key went out ten minutes ago. This one is held back and counted: 2 becomes 3. No email.',
        trigger: alert(),
        overrides: { systems: { db: { tables: tables([state('2026-11-13T09:50:00', 2)]) } } },
        expect: { noEmails: true, db: { alert_state: { has: [{ suppressed_count: 3, last_sent_at: '2026-11-13T09:50:00' }] } } },
      },
      {
        name: 'The same alert after an hour',
        about: 'The last email was 90 minutes ago, and 7 were held back since. A new email goes out that says so, and the count starts again.',
        trigger: alert(),
        overrides: { systems: { db: { tables: tables([state('2026-11-13T08:30:00', 7)]) } } },
        expect: { emails: [{ count: 1, has: '7 more since' }], db: { alert_state: { has: [{ suppressed_count: 0 }], lacks: [{ last_sent_at: '2026-11-13T08:30:00' }] } } },
      },
      {
        name: 'A CRITICAL alert inside the hour',
        about: 'CRITICAL always goes through, even ten minutes after the last email.',
        trigger: alert('CRITICAL'),
        overrides: { systems: { db: { tables: tables([state('2026-11-13T09:50:00', 2)]) } } },
        expect: { emails: [{ count: 1 }] },
      },
      {
        name: 'The mail server is down',
        about: 'The email fails, but the alert state is saved and the message is acknowledged. The next alert after the hour will report the count.',
        trigger: alert(),
        overrides: { systems: { email: { fault: true } } },
        expect: { noError: true, ack: 'acked', db: { alert_state: { count: 1 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('alert-mailer', source('jms-listener', { destination: 'OPS.ALERTS', ackMode: 'AUTO' }), [
      step('set-variable', { variableName: 'a', value: '#[payload]' }),
      step('set-variable', { variableName: 'now', value: '#[now() as String {format: "yyyy-MM-dd\'T\'HH:mm:ss"}]' }),
      step('set-variable', { variableName: 'hourAgo', value: '#[(now() - |PT1H|) as String {format: "yyyy-MM-dd\'T\'HH:mm:ss"}]' }),
      step('set-variable', { variableName: 'send', value: '#[false]' }),
      scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
        step('db-select', { database: 'Oracle', sql: 'SELECT alert_key, last_sent_at, suppressed_count FROM alert_state WHERE alert_key = :k FOR UPDATE', inputParameters: '#[{ k: vars.a.alertKey }]', target: 'st' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(vars.st)]' }, [
              step('db-insert', { database: 'Oracle', sql: 'INSERT INTO alert_state (alert_key, last_sent_at, suppressed_count) VALUES (:k, :now, 0)', inputParameters: '#[{ k: vars.a.alertKey, now: vars.now }]' }),
              step('set-variable', { variableName: 'held', value: '#[0]' }),
              step('set-variable', { variableName: 'send', value: '#[true]' }),
            ]),
            route({ expression: '#[vars.a.severity == "CRITICAL" or vars.st[0].last_sent_at < vars.hourAgo]' }, [
              step('set-variable', { variableName: 'held', value: '#[vars.st[0].suppressed_count]' }),
              step('db-update', { database: 'Oracle', sql: 'UPDATE alert_state SET last_sent_at = :now, suppressed_count = 0 WHERE alert_key = :k', inputParameters: '#[{ now: vars.now, k: vars.a.alertKey }]' }),
              step('set-variable', { variableName: 'send', value: '#[true]' }),
            ]),
          ],
          {
            otherwise: [step('db-update', { database: 'Oracle', sql: 'UPDATE alert_state SET suppressed_count = suppressed_count + 1 WHERE alert_key = :k', inputParameters: '#[{ k: vars.a.alertKey }]' })],
          },
        ),
      ]),
      router('choice', {}, [
        route({ expression: '#[vars.send]' }, [
          scope('async', {}, [
            step('email-send', {
              toAddresses: 'oncall-integration@marrowpine.example',
              subject: '#["[" ++ vars.a.severity ++ "] " ++ vars.a.alertKey]',
              content: '#[vars.a.app ++ ": " ++ vars.a.text ++ (if (vars.held > 0) "\\n" ++ (vars.held as String) ++ " more since the last email." else "")]',
            }),
          ]),
        ]),
      ]),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, has every integration app publish its alerts to the JMS queue \`OPS.ALERTS\`:

\`\`\`json
{ "app": "inv-process", "alertKey": "inv-process:DB:CONNECTIVITY", "severity": "ERROR", "text": "Could not get a connection from the pool" }
\`\`\`

An alert mailer emails them to \`oncall-integration@marrowpine.example\`. During a 40 minute Oracle outage last month it sent 3,100 emails. The mail relay locked the sending account, and the one alert that mattered (a CRITICAL from another app) never arrived.

The team added \`alert_state\` (\`alert_key\` key, \`last_sent_at\` as \`yyyy-MM-ddTHH:mm:ss\`, \`suppressed_count\`).

**Requirements**
- The first alert for a key: create its row and email.
- The same key within an hour of the last email: no email, add 1 to \`suppressed_count\`.
- The same key after an hour: email, saying how many more were held back since the last email, then reset the count and the time.
- \`CRITICAL\` always emails (and resets the count and time).
- Two consumers may handle the same key at once: read the row and lock it in a transaction, so the count is right.
- Send the email after the transaction, and never let a mail problem fail the message.

**Design the flow.**
`,
  answerTemplate: `## Why throttle alerts

## The state per alert key

## Two consumers at once

## Sending outside the transaction
`,
  keyPoints: [
    'An alert that fires 3,000 times says one thing 3,000 times. One email per key per hour, with a count, says it once and keeps the relay and the people usable.',
    'The state lives in Oracle, so every consumer and every restart sees the same last sent time.',
    'SELECT ... FOR UPDATE in a transaction makes the second consumer wait for the first, so the count and the decision are never based on a stale row.',
    'Decide inside the transaction, send outside it. Holding a row lock while talking to SMTP blocks every other alert with that key.',
    'Severity breaks the throttle: CRITICAL goes through. Never let the cure for noise hide the signal.',
    'The email carries the key, the app and a count, not payloads. Alerts often travel to phones and shared inboxes.',
  ],
  solution: `
1. **JMS On New Message** on \`OPS.ALERTS\`. **Set Variable** \`a\`, \`now\`, \`hourAgo\`, \`send\` = false.
2. **Try** ALWAYS_BEGIN:
   - **Database Select** \`... WHERE alert_key = :k FOR UPDATE\`, Target \`st\`.
   - **Choice**:
     - no row: **Database Insert** with \`last_sent_at = now\`, count 0. \`held\` = 0, \`send\` = true.
     - CRITICAL, or last sent before \`hourAgo\`: \`held\` = the count, **Database Update** \`last_sent_at = :now, suppressed_count = 0\`, \`send\` = true.
     - otherwise: **Database Update** \`suppressed_count = suppressed_count + 1\`.
3. **Choice** \`vars.send\`: **Async** **Email Send** with the key, the app, the text and "N more since the last email".

**A new key at the same moment on two consumers.** Neither finds a row to lock, and the second insert fails with ORA-00001. Let that message be redelivered: the second try finds the row and counts it.

**The count that never gets reported.** If a key goes quiet after a burst, the held back count waits for the next alert. A small hourly job that emails keys with a count above 0 closes that gap.
`,
  followUps: [
    {
      q: 'Why not throttle with an Object Store and a time to live?',
      a: 'An Object Store entry per key with a one hour time to live works for one app. The Oracle row adds the count, survives restarts, and is shared with every consumer and the hourly job.',
    },
    {
      q: 'On call asks for SMS for CRITICAL. Where does it go?',
      a: 'In the same CRITICAL branch, as its own Async send to the SMS provider, so either channel can fail without the other.',
    },
  ],
}
