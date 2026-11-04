import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-082',
  category: 'flows',
  title: 'Smart Meter Readings: Kafka Batch Listener, Bulk Insert and a Manual Commit on Every Path',
  level: 'ADVANCED',
  tags: ['kafka', 'consumer-groups', 'offsets', 'postgresql', 'bulk-insert', 'dead-letter', 'json'],
  estMinutes: 40,
  flowChecks: [
    {
      label: 'Readings arrive through the Kafka Batch Message Listener with MANUAL acknowledgement',
      rule: { type: 'source', component: 'kafka-batch-listener', where: { ackMode: 'MANUAL' } },
    },
    { label: 'The batch is written with one Bulk Insert', rule: { type: 'exists', component: 'db-bulk-insert', where: { sql: 'ON CONFLICT' } } },
    { label: 'The commit key is saved in a variable at the start of the flow', rule: { type: 'before', first: 'set-variable', then: 'kafka-commit' } },
    { label: 'The offsets are committed after the insert', rule: { type: 'before', first: 'db-bulk-insert', then: 'kafka-commit' } },
    {
      label: 'When a bad batch is handled with On Error Continue, that path commits as well',
      rule: { type: 'inside', component: 'kafka-commit', within: 'on-error-continue' },
    },
    {
      label: 'The handler retries row by row, so one bad reading does not lose the batch',
      rule: { type: 'inside', component: 'db-insert', within: 'on-error-continue' },
    },
    {
      label: 'Rows that still fail go to a dead-letter topic',
      rule: { type: 'inside', component: 'kafka-publish', within: 'on-error-continue', where: { topic: 'dlt' } },
    },
    {
      label: 'A database outage is propagated, so that path does not commit',
      rule: { type: 'handler', component: 'on-error-propagate', errorType: 'DB:CONNECTIVITY' },
    },
  ],
  referenceFlow: design(
    flow(
      'meter-readings-loader',
      // Consumer config: topic meter.readings.v1, group meter-loader. Offsets move only through Kafka Commit.
      source('kafka-batch-listener', { topic: 'meter.readings.v1', groupId: 'meter-loader', ackMode: 'MANUAL', parallelConsumersAmount: 4 }),
      [
        // The Batch Listener exposes the key in its Consumer Context attribute. Check the exact expression in your connector version.
        step('set-variable', { variableName: 'commitKey', value: '#[attributes.consumerCommitKey]' }),
        step('set-variable', { variableName: 'records', value: '#[payload]' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/java\n---\npayload map (r) -> do {\n  var m = read(r.payload, "application/json")\n  ---\n  { meterId: m.meterId, readAt: m.readAt as DateTime, kwh: m.kwh as Number }\n}',
        }),
        step('db-bulk-insert', {
          database: 'PostgreSQL',
          sql: 'INSERT INTO meter_reading (meter_id, read_at, kwh)\nVALUES (:meterId, :readAt, :kwh)\nON CONFLICT (meter_id, read_at) DO NOTHING',
        }),
        step('kafka-commit', { consumerCommitKey: '#[vars.commitKey]' }),
      ],
      [
        // A bad value in the batch: find it row by row, park it, then commit so the partition moves on.
        handler('on-error-continue', { type: 'DB:QUERY_EXECUTION, MULE:EXPRESSION' }, [
          scope('foreach', { collection: '#[vars.records]' }, [
            step('set-variable', { variableName: 'rawRecord', value: '#[payload.payload]' }),
            scope(
              'try',
              {},
              [
                step('transform', {
                  script:
                    '%dw 2.0\noutput application/java\nvar m = read(vars.rawRecord, "application/json")\n---\n{ meterId: m.meterId, readAt: m.readAt as DateTime, kwh: m.kwh as Number }',
                }),
                step('db-insert', {
                  database: 'PostgreSQL',
                  sql: 'INSERT INTO meter_reading (meter_id, read_at, kwh)\nVALUES (:meterId, :readAt, :kwh)\nON CONFLICT (meter_id, read_at) DO NOTHING',
                }),
              ],
              {
                errorHandlers: [
                  handler('on-error-continue', { type: 'DB:QUERY_EXECUTION, MULE:EXPRESSION' }, [
                    step('set-payload', { value: '#[vars.rawRecord]' }),
                    step('kafka-publish', { topic: 'meter.readings.dlt', key: '' }),
                  ]),
                ],
              },
            ),
          ]),
          step('kafka-commit', { consumerCommitKey: '#[vars.commitKey]' }),
        ]),
        // Nothing wrong with the data: no commit, and the failure stays visible.
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY, DB:RETRY_EXHAUSTED' }, [
          step('logger', { level: 'ERROR', message: '#["Batch not committed, database unavailable: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
An electricity network operator collects readings from **2.1 million smart meters**. Head-end systems publish them to the Kafka topic \`meter.readings.v1\` (24 partitions, about **6,000 messages per second** at the top of each hour). Each message is JSON: \`{ "meterId": "...", "readAt": "...", "kwh": 1.42 }\`.

The readings must be loaded into the **PostgreSQL** table \`meter_reading\`, which has a primary key on \`(meter_id, read_at)\`. A single-row insert per message cannot keep up, so the team wants to insert in batches.

**Requirements**
- Use the batch listener and write each batch with **one bulk statement**.
- Offsets must not move until the rows are stored, so the consumer uses **MANUAL** acknowledgement.
- One malformed reading must not block its partition or cost the other readings in that batch. Bad readings go to the topic \`meter.readings.dlt\` for the data quality team.
- During a database outage the batch must **not** be committed.
- Readings can arrive twice, because head-end systems re-send after timeouts. A repeat must not fail the batch or change the stored reading.

**Design the flow.** Trace the commit on every path through it.
`,
  answerTemplate: `## Batch listener and acknowledgement mode

## Bulk insert

## The success path

## A bad reading in the batch

## Database outage

## Duplicates
`,
  keyPoints: [
    'With MANUAL mode the Commit operation is required at the end of the flow, on success and also when On Error Continue is used.',
    'On Error Continue finishes the flow as a success, so a handler that omits the commit leaves that batch uncommitted while the flow appears fine.',
    'The Batch Listener exposes the commit key in its Consumer Context attribute. Saving it in a variable at the start makes it safe to use after other operations and in the handler.',
    'The payload is an array of records, so DataWeave maps it to a list of maps for Bulk Insert, which binds each map to the named parameters.',
    'The docs do not say what happens to the other rows when one row of a Bulk Insert fails. The row-by-row retry with ON CONFLICT DO NOTHING gives the right result either way.',
    'Data errors are handled and committed; infrastructure errors are propagated without a commit. The two must not share a handler.',
    'ON CONFLICT DO NOTHING makes repeats harmless, because Kafka consumers should assume at-least-once delivery.',
  ],
  solution: `
**Listener.** **Batch Message Listener** with \`ackMode="MANUAL"\`. The payload is an array of records, and the commit key for the whole batch is in the listener's Consumer Context attribute. Each record also has its own Kafka Record Attributes.

**Success path.**
1. **Set Variable** \`commitKey\` and \`records\`. Keeping both means the handler does not depend on what the failed step did to the message. The reference says this source uses a non-repeatable stream and does not say whether records can be read twice, so test the handler's second read in your connector version. If it fails, keep the raw records as text in the variable.
2. **Transform** the records into a list of maps.
3. **Bulk Insert** with \`ON CONFLICT (meter_id, read_at) DO NOTHING\`.
4. **Commit** with the saved key.

**Bad data path: \`DB:QUERY_EXECUTION\` or \`MULE:EXPRESSION\`.** Parsing or the insert failed because of the content. The **On Error Continue** walks through \`vars.records\`:
- **Try**: parse and **Insert** one row.
- Inner **On Error Continue**: **Publish** the raw record to \`meter.readings.dlt\`.

After the loop the handler calls **Commit**. This is the step people forget. On Error Continue makes the flow complete successfully, but in MANUAL mode nothing commits unless you do it. Rows already written by the failed bulk statement cause no trouble, since the conflict clause skips them.

**Outage path: \`DB:CONNECTIVITY\` or \`DB:RETRY_EXHAUSTED\`.** **On Error Propagate** logs and does not commit, so the committed position stays where it was. Plan to test how quickly your connector version consumes that batch again, because the documentation does not describe the timing. A reconnection strategy on the database config covers short restarts. If an outage happens during the row-by-row loop, the error leaves the handler before its Commit runs, which is the right result.

**Commit paths in summary**

| Path | Commit? |
|---|---|
| Bulk insert succeeds | Yes, at the end of the flow |
| Bad reading, handled | Yes, at the end of the handler |
| Database outage | No |

**Throughput.** Partitions set the upper limit on parallel work in a group. Ordering is per partition, so parallel consumers do not reorder one meter's readings as long as producers key by \`meterId\`. Commit has its own errors, including \`ALREADY_COMMITTED\` and \`SESSION_NOT_FOUND\`, so log them and review them rather than ignoring them.
`,
  followUps: [
    {
      q: 'Would AUTO mode be simpler here?',
      a: 'Yes, AUTO commits if the flow finishes successfully, so the handler would need no Commit step. MANUAL makes the decision explicit on each path, and the team can see it in the flow. Choose it when the commit point needs to differ from flow completion, and test the failure behaviour for either mode.',
    },
    {
      q: 'What would DUPS_OK change?',
      a: 'It behaves like MANUAL, but commits are asynchronous, which can produce duplicates. With ON CONFLICT DO NOTHING that can be acceptable for throughput, but this team would need to accept the extra reprocessing.',
    },
    {
      q: 'Why publish the raw record to the dead-letter topic instead of the parsed one?',
      a: 'The record may not parse at all, and the data quality team needs exactly what arrived. Adding the original topic, partition and offset as headers lets them trace it back.',
    },
    {
      q: 'The row-by-row path runs on every batch for an hour. What does that tell you?',
      a: 'A producer is probably sending a bad format, so every batch falls back to slow inserts and the consumer lag grows. Alert on the dead-letter rate and fix the producer. Parsing failures can also be separated before the insert so the good rows still use the bulk statement.',
    },
  ],
}
