import { design, flow, handler, source, step } from '../../flow/dsl.js'

const reading = (readingId, kwh = 3.42) => ({ readingId, meterId: 'MTR-00418', readAt: '2026-11-13T09:30:00Z', kwh })
const msg = (payload) => ({ message: { kind: 'mq', destination: 'meter-readings', payload } })

export default {
  id: 'fl-151',
  category: 'flows',
  title: 'Smart Meter Readings: Acknowledge the Anypoint MQ Message Only After the Row Is Saved',
  level: 'BEGINNER',
  tags: ['myproject', 'queues', 'anypoint-mq', 'manual-ack', 'database', 'energy'],
  estMinutes: 15,
  flowChecks: [
    {
      label: 'Readings are read from meter-readings with MANUAL acknowledgement',
      rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'meter-readings', acknowledgementMode: 'MANUAL' } },
    },
    {
      label: 'The ack token is kept in a variable before the insert replaces the attributes',
      rule: { type: 'before', first: 'set-variable', firstWhere: { value: 'ackToken' }, then: 'db-insert' },
    },
    {
      label: 'The message is acknowledged after the insert, with the saved token',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'db-insert', then: 'mq-ack', outside: true },
          { type: 'exists', component: 'mq-ack', where: { ackToken: 'vars' } },
        ],
      },
    },
    {
      label: 'When the insert fails, Nack sends the reading back to the queue',
      rule: { type: 'inside', component: 'mq-nack', within: ['on-error-continue', 'on-error-propagate'], where: { ackToken: 'vars' } },
    },
  ],
  simulation: {
    systems: { db: { tables: { meter_readings: { key: 'reading_id', rows: [] } } } },
    tests: [
      {
        name: 'A reading is saved',
        about: 'The reading is written to meter_readings, and only then removed from the queue.',
        trigger: msg(reading('RD-77120')),
        expect: { ack: 'acked', db: { meter_readings: { count: 1, has: [{ reading_id: 'RD-77120', meter_id: 'MTR-00418' }] } } },
      },
      {
        name: 'The database is down',
        about: 'The insert cannot get a connection. The reading must go back to the queue, so it is tried again later and not lost.',
        trigger: msg(reading('RD-77121')),
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { ack: 'returned', db: { meter_readings: { count: 0 } }, logs: [{ level: ['WARN', 'ERROR'] }] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'save-meter-readings',
      source('mq-subscriber', { destination: 'meter-readings', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('db-insert', {
          database: 'PostgreSQL',
          sql: 'INSERT INTO meter_readings (reading_id, meter_id, read_at, kwh) VALUES (:readingId, :meterId, :readAt, :kwh)',
          inputParameters: '#[{ readingId: payload.readingId, meterId: payload.meterId, readAt: payload.readAt, kwh: payload.kwh }]',
        }),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'WARN', message: '#["Reading not saved, sent back to the queue: " ++ error.description]' }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
      ],
    ),
  ),
  description: `
Harrowgate Energy, a fictional supplier, collects half hourly readings from smart meters. A head end system publishes each reading to the Anypoint MQ queue \`meter-readings\`:

\`{ "readingId": "RD-77120", "meterId": "MTR-00418", "readAt": "2026-11-13T09:30:00Z", "kwh": 3.42 }\`

Your flow saves each reading in the PostgreSQL table \`meter_readings\` (\`reading_id\`, \`meter_id\`, \`read_at\`, \`kwh\`). Billing runs from that table, so a lost reading means an estimated bill and a complaint.

Last month the database was restarted during a busy hour. The old flow used AUTO acknowledgement and an error handler that only logged, so the readings that failed were removed from the queue and never saved.

**Requirements**
- Read from \`meter-readings\` and acknowledge each message yourself.
- Remove a reading from the queue only once it is in the table.
- When the insert fails, return the reading to the queue so Anypoint MQ delivers it again, and log a WARN.

**Design the flow.**
`,
  answerTemplate: `## Reading the queue

## Saving the reading

## Acknowledging

## When the insert fails
`,
  keyPoints: [
    'With MANUAL acknowledgement the flow decides when a message leaves the queue. Ack removes it, Nack hands it back for another delivery.',
    'Ack after the write, never before. A crash between the two then means a repeat, not a loss.',
    'The Database Insert replaces the payload and the attributes, so the ack token is kept in a variable at the start.',
    'An error handler that only logs and continues tells the broker all is well. Here it calls Nack, so the message comes back.',
    'If nothing acks or nacks the message, Anypoint MQ makes it visible again when its acknowledgement timeout ends. Nack makes that happen at once.',
  ],
  solution: `
1. **Anypoint MQ Subscriber** on \`meter-readings\`, Acknowledgement mode **MANUAL**.
2. **Set Variable** \`ackToken\` = \`#[attributes.ackToken]\`.
3. **Database Insert** into \`meter_readings\` with input parameters from the payload.
4. **Anypoint MQ Ack** with \`#[vars.ackToken]\`.
5. Error handler **On Error Continue** (ANY): a WARN log, then **Anypoint MQ Nack** with \`#[vars.ackToken]\`.

**Why On Error Continue here.** The handler has dealt with the message by giving it back, so the flow can end normally.

**A repeat after a crash.** If Mule stops after the insert and before the ack, the reading comes back. Give \`reading_id\` a primary key, and treat a duplicate key as "already saved": ack it instead of nacking it for ever.

**A dead letter queue.** Set a maximum delivery count and a DLQ on \`meter-readings\` in Anypoint MQ, so a reading that can never be saved stops coming back and waits where support can see it.
`,
  followUps: [
    {
      q: 'What would IMMEDIATE acknowledgement do here?',
      a: 'The message is removed as soon as Mule receives it, before the insert. A failed insert then loses the reading.',
    },
    {
      q: 'The database is down for an hour. What happens to the queue?',
      a: 'Readings keep coming back and failing. With a delivery limit and a DLQ they end up in the DLQ, and support moves them back once the database is up. Without a limit they keep cycling and use up the workers.',
    },
  ],
}
