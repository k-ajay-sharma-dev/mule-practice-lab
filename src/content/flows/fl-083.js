import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-083',
  category: 'flows',
  title: 'Controlled Kafka Replay from an Admin Endpoint with Seek and Consume',
  level: 'EXPERT',
  tags: ['kafka', 'offsets', 'partitions', 'consumer-groups', 'replay', 'postgresql', 'http', 'idempotency'],
  estMinutes: 50,
  flowChecks: [
    { label: 'The replay is started on demand through an HTTP admin endpoint', rule: { type: 'source', component: 'http-listener', where: { path: 'replay' } } },
    { label: 'The request is validated before the consumer position is changed', rule: { type: 'before', first: 'validation', then: 'kafka-seek' } },
    {
      label: 'The validation caps a call at 2,000 records',
      rule: { type: 'exists', component: 'validation', where: { expression: '2000' } },
    },
    {
      label: 'Seek moves to the requested start offset on ledger.postings.v1',
      rule: { type: 'exists', component: 'kafka-seek', where: { topic: 'ledger.postings.v1', offset: 'fromOffset' } },
    },
    { label: 'Seek sets the start offset before anything is consumed', rule: { type: 'before', first: 'kafka-seek', then: 'kafka-consume' } },
    { label: 'Consume is called in a bounded loop', rule: { type: 'inside', component: 'kafka-consume', within: 'foreach' } },
    {
      label: 'Consume uses IMMEDIATE acknowledgement, because it returns no commit key for a later Commit',
      rule: { type: 'exists', component: 'kafka-consume', where: { ackMode: 'IMMEDIATE' } },
    },
    {
      label: 'No offsets are committed, so the live consumer group is not moved',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'kafka-consume' },
          { type: 'absent', component: 'kafka-commit' },
        ],
      },
    },
    { label: 'Each record is checked against the requested partition and offset range', rule: { type: 'inside', component: 'choice', within: 'foreach' } },
    {
      label: 'A record is written only when the range check passes',
      rule: { type: 'inside', component: 'db-insert', within: 'choice', routeWhere: { expression: 'toOffset' } },
    },
    {
      label: 'Replayed rows are written with an upsert that changes nothing for a row already there (ON CONFLICT DO NOTHING)',
      rule: { type: 'exists', component: 'db-insert', where: { sql: 'DO NOTHING' } },
    },
    {
      label: 'The response after the loop reports the replayed count and the last offset',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'foreach', then: ['transform', 'set-payload'], outside: true },
          {
            type: 'any',
            rules: [
              { type: 'exists', component: 'transform', where: { script: 'lastOffset' } },
              { type: 'exists', component: 'set-payload', where: { value: 'lastOffset' } },
            ],
          },
        ],
      },
    },
    {
      label: 'A consume that times out ends the replay instead of failing it (KAFKA:TIMEOUT in a Try)',
      rule: { type: 'handler', component: 'on-error-continue', errorType: 'KAFKA:TIMEOUT', within: 'try' },
    },
  ],
  referenceFlow: design(
    flow(
      'ledger-replay-admin',
      source('http-listener', { path: '/admin/replay', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'req', value: '#[payload]' }),
        step('validation', {
          check: 'is-true',
          expression: '#[vars.req.toOffset >= vars.req.fromOffset and (vars.req.toOffset - vars.req.fromOffset) < 2000]',
          message: 'Offset range is invalid or above the limit of 2000 records',
        }),
        step('set-variable', { variableName: 'replayed', value: '#[0]' }),
        step('set-variable', { variableName: 'lastOffset', value: '#[null]' }),
        step('set-variable', { variableName: 'finished', value: '#[false]' }),
        // Uses a replay-only consumer config: its own Group ID, Consumer Amount 1. The live listener's group is not involved.
        step('kafka-seek', { topic: 'ledger.postings.v1', partition: '#[vars.req.partition]', offset: '#[vars.req.fromOffset]' }),
        scope('foreach', { collection: '#[vars.req.fromOffset to vars.req.toOffset]' }, [
          router(
            'choice',
            {},
            [
              route({ expression: '#[not vars.finished]' }, [
                scope(
                  'try',
                  {},
                  [
                    // Default ack IMMEDIATE. No commit key comes back, so no Kafka Commit can follow.
                    step('kafka-consume', { ackMode: 'IMMEDIATE', timeout: 10, timeoutTimeUnit: 'SECONDS' }),
                    step('set-variable', { variableName: 'recordPartition', value: '#[attributes.partition]' }),
                    step('set-variable', { variableName: 'recordOffset', value: '#[attributes.offset]' }),
                    router(
                      'choice',
                      {},
                      [
                        route({ expression: '#[vars.recordPartition == vars.req.partition and vars.recordOffset <= vars.req.toOffset]' }, [
                          step('transform', {
                            script:
                              '%dw 2.0\noutput application/java\nvar p = read(payload, "application/json")\n---\n{ postingId: p.postingId, account: p.account, amount: p.amount as Number, postedAt: p.postedAt as DateTime }',
                          }),
                          step('db-insert', {
                            database: 'PostgreSQL',
                            sql: 'INSERT INTO ledger_posting (posting_id, account, amount, posted_at)\nVALUES (:postingId, :account, :amount, :postedAt)\nON CONFLICT (posting_id) DO NOTHING',
                          }),
                          step('set-variable', { variableName: 'replayed', value: '#[vars.replayed + 1]' }),
                          step('set-variable', { variableName: 'lastOffset', value: '#[vars.recordOffset]' }),
                        ]),
                      ],
                      { otherwise: [] },
                    ),
                    step('set-variable', {
                      variableName: 'finished',
                      value: '#[vars.recordPartition == vars.req.partition and vars.recordOffset >= vars.req.toOffset]',
                    }),
                  ],
                  {
                    errorHandlers: [
                      handler('on-error-continue', { type: 'KAFKA:TIMEOUT' }, [
                        step('logger', { level: 'WARN', message: '#["Replay stopped early after offset " ++ (vars.lastOffset default "none")]' }),
                        step('set-variable', { variableName: 'finished', value: '#[true]' }),
                      ]),
                    ],
                  },
                ),
              ]),
            ],
            { otherwise: [] },
          ),
        ]),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  partition: vars.req.partition,\n  requestedFrom: vars.req.fromOffset,\n  requestedTo: vars.req.toOffset,\n  replayed: vars.replayed,\n  lastOffset: vars.lastOffset,\n  complete: vars.lastOffset == vars.req.toOffset\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN, KAFKA:INVALID_OFFSET, KAFKA:INVALID_INPUT' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[400]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "INVALID_REPLAY_REQUEST", message: error.description }' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[500]' }),
          step('logger', { level: 'ERROR', message: '#["Replay failed after offset " ++ (vars.lastOffset default "none") ++ ": " ++ error.description]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "REPLAY_FAILED", replayed: vars.replayed, lastOffset: vars.lastOffset }' }),
        ]),
      ],
    ),
  ),
  description: `
A payments company streams ledger postings through the Kafka topic \`ledger.postings.v1\` (12 partitions, 7-day retention, about 40 million records a day). A Mule app with a Message Listener in group \`ledger-loader\` writes them to the PostgreSQL table \`ledger_posting\`, which has a unique \`posting_id\`.

Last Tuesday a faulty filter release dropped postings for 40 minutes on some partitions. The records are still in Kafka. Support can work out the affected **partition and offset range** from the logs, for example partition 4, offsets 918200 to 919650.

Today the team fixes this by resetting the group's offsets with command line tools. That means stopping the live consumer and reprocessing everything after the reset point.

**Requirements**
- Provide an internal endpoint, \`POST /admin/replay\`, with the body \`{ "partition": 4, "fromOffset": 918200, "toOffset": 919650 }\`.
- Replay **only** the requested range, up to **2,000 records per call**.
- The **live consumer keeps running** and its committed offsets must not change.
- Replaying a record that already reached the table must change nothing.
- The response reports how many records were replayed and the last offset reached, so an operator can continue from there.

**Design the flow.** Say which consumer configuration the operations use and how acknowledgement works here.
`,
  answerTemplate: `## Keeping the live consumer out of it

## Validating the request

## Seek and Consume

## Acknowledgement and the commit key

## Staying inside the range

## Idempotency

## End of the replay and the response
`,
  keyPoints: [
    'Seek applies to a consumer configuration and needs topic, partition and offset. A separate configuration with its own Group ID keeps the live group\'s committed offsets out of the replay, since Kafka tracks offsets per group.',
    'Consume does not return the commit key, so there is nothing to pass to a Commit operation. The reference keeps the default IMMEDIATE acknowledgement.',
    'Consume is called in a loop that is bounded by the size of the requested range, and a flag skips the remaining iterations once the end offset is reached.',
    'Kafka Record Attributes give the topic, partition and offset of each record, so the flow can check that a record belongs to the requested partition and range.',
    'Offsets are not guaranteed to be contiguous on every topic, so the loop bound is a maximum and the offset check is what ends the replay.',
    'Replay is at-least-once by nature. The unique posting_id with ON CONFLICT DO NOTHING makes it safe to repeat a range.',
    'The response returns lastOffset, so a partial replay can be continued instead of guessed at.',
  ],
  solution: `
**Separate the replay from the live consumer.** Create a second Kafka consumer configuration just for this endpoint, with its own Group ID (\`ledger-replay\`), Consumer Amount 1 and the topic's partitions in **Assignments**, which are not rebalanced automatically. Kafka stores committed offsets per group, so whatever this group does has no effect on \`ledger-loader\`. The live Message Listener never stops.

**Flow:**
1. **HTTP Listener** \`POST /admin/replay\`, protected like any other admin API (client credentials and an allow list, since it writes to a ledger).
2. **Validate** the range and the 2,000 record limit before anything touches Kafka.
3. **Seek** on the replay configuration: topic, partition and \`fromOffset\`. All three are required. \`KAFKA:INVALID_OFFSET\` is in Seek's error list and maps to 400.
4. **For Each** over the range. The range gives the loop an upper limit, and For Each has no break, so a \`finished\` flag in a Choice skips the rest.
5. **Consume** inside a **Try**, with the IMMEDIATE ack. Capture \`attributes.partition\` and \`attributes.offset\` straight away.
6. **Choice**: only a record on the requested partition and at or below \`toOffset\` goes on to parse and **Insert** with \`ON CONFLICT (posting_id) DO NOTHING\`. A consumer with several partitions assigned may return records from any of them, which is why the partition is checked too.
7. **Set Variable** \`finished\` when the end offset is reached.
8. **Respond** with \`replayed\`, \`lastOffset\` and \`complete\`.

**Acknowledgement.** Consume does not return the commit key, so a Commit cannot follow it, and a design based on MANUAL ack and Commit does not work here. IMMEDIATE commits on receipt, which moves only the replay group's position. That is harmless, because each replay starts with a Seek. Delivery safety comes from idempotency: if a call fails midway, the operator repeats it from \`lastOffset\`.

**End of the range.** Consume has a consumption timeout, and \`KAFKA:TIMEOUT\` is in its error list. The handler treats that as "stop here" and reports what was done. The documentation does not spell out what an empty wait returns in every version, so rehearse this on a test topic, including a Seek followed by a Consume across separate calls.

**Operational limits.** Allow only one replay at a time, because Seek moves the position of a shared consumer. Run the first replay in a test environment. Offsets older than the 7-day retention no longer exist, so check the range before starting.
`,
  followUps: [
    {
      q: 'Why not stop the live listener and Seek its consumer back to the start of the range?',
      a: 'The listener would then reprocess everything after that offset, not only the broken range, and the live load would stop. It also mixes an operational fix with the production offsets.',
    },
    {
      q: 'Could you use MANUAL acknowledgement on Consume and commit after the insert?',
      a: 'The Commit operation requires a Consumer Commit Key, and Consume does not return one. That design has no key to commit with, which is why safety comes from idempotent writes.',
    },
    {
      q: 'The operator needs to replay 500,000 records. What changes?',
      a: 'A synchronous HTTP call is the wrong shape. Accept the request with 202, store a job row, process it in a background flow in slices, and record lastOffset after each slice so a restart can resume. An admin GET returns progress.',
    },
    {
      q: 'Would you republish to the original topic instead of writing to the table?',
      a: 'Not usually. Other consumers of that topic would receive the records again and new offsets would be created. A dedicated replay topic for the loader is an option when business logic in the loader must run, and the records still need an idempotent target.',
    },
  ],
}
