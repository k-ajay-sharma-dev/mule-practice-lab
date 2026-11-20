export default {
  id: 'dw-197',
  category: 'dataweave',
  title: 'Decide Retry or Reject for Each Failed Batch Record',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'retry', 'rejects', 'error-handling', 'json'],
  estMinutes: 18,
  description: `
Quayle Freight loads shipment orders with a batch job. A last batch step with the accept policy \`ONLY_FAILURES\` collects records that failed. Some failures are temporary, such as a deadlock or an HTTP 503, and are worth another try later. Others are data errors that will fail again.

\`payload\` holds the failed records with \`key\`, \`errorCode\` and \`attempts\` (tries so far). \`vars\` holds \`maxAttempts\`, the list of \`retryable\` codes and \`delaysSec\`, the wait before try 2, 3 and so on.

Rules per record:

- No \`errorCode\`: reject with reason \`NO_ERROR_CODE\`
- Code not in \`retryable\`: reject with reason \`DATA_ERROR\`
- Retryable, but \`attempts\` has reached \`maxAttempts\`: reject with reason \`RETRIES_EXHAUSTED\`
- Otherwise retry, with \`attempt\` as the next try number and \`delaySec\` from \`delaysSec\` at position \`attempts - 1\`. Use the last delay when the list is too short.

Output \`retry\` (\`key\`, \`attempt\`, \`delaySec\`), \`reject\` (\`key\`, \`errorCode\`, \`reason\`; \`errorCode\` is null when the record has none) and \`counts\` with \`retry\` and \`reject\`, the size of each list. Keep the input order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "key": "SO-1001", "errorCode": "ORA-12899", "attempts": 1 },
  { "key": "SO-1002", "errorCode": "HTTP:503", "attempts": 1 },
  { "key": "SO-1003", "errorCode": "ORA-00060", "attempts": 2 },
  { "key": "SO-1004", "errorCode": "HTTP:429", "attempts": 3 },
  { "key": "SO-1005", "attempts": 1 },
  { "key": "SO-1006", "errorCode": "ORA-01400", "attempts": 1 }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "maxAttempts": 3,
  "retryable": ["ORA-00060", "ORA-12170", "HTTP:429", "HTTP:503", "HTTP:TIMEOUT"],
  "delaysSec": [30, 120, 600]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "retry": [
    { "key": "SO-1002", "attempt": 2, "delaySec": 30 },
    { "key": "SO-1003", "attempt": 3, "delaySec": 120 }
  ],
  "reject": [
    { "key": "SO-1001", "errorCode": "ORA-12899", "reason": "DATA_ERROR" },
    { "key": "SO-1004", "errorCode": "HTTP:429", "reason": "RETRIES_EXHAUSTED" },
    { "key": "SO-1005", "errorCode": null, "reason": "NO_ERROR_CODE" },
    { "key": "SO-1006", "errorCode": "ORA-01400", "reason": "DATA_ERROR" }
  ],
  "counts": { "retry": 2, "reject": 4 }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  retry: payload filter (r) -> vars.retryable contains r.errorCode,
  reject: []
}
`,
  hints: [
    'Write a function that returns the reject reason for a record, or `null` when the record should be retried.',
    'Then split the list with two `filter` calls on that function.',
    'For the delay: `vars.delaysSec[r.attempts - 1] default vars.delaysSec[-1]`.',
  ],
  solution: `%dw 2.0
output application/json

fun rejectReason(r) =
  if (r.errorCode == null) "NO_ERROR_CODE"
  else if (not (vars.retryable contains r.errorCode)) "DATA_ERROR"
  else if (r.attempts >= vars.maxAttempts) "RETRIES_EXHAUSTED"
  else null

var retry = payload filter (r) -> rejectReason(r) == null
var reject = payload filter (r) -> rejectReason(r) != null
---
{
  retry: retry map (r) -> {
    key: r.key,
    attempt: r.attempts + 1,
    delaySec: vars.delaysSec[r.attempts - 1] default vars.delaysSec[-1]
  },
  reject: reject map (r) -> {
    key: r.key,
    errorCode: r.errorCode,
    reason: rejectReason(r)
  },
  counts: { retry: sizeOf(retry), reject: sizeOf(reject) }
}`,
  explanation: `
**Two kinds of failure.** A deadlock or a 503 says nothing about the record. A value too long for its column will fail on every try. Retrying data errors only wastes time and fills logs.

**A cap on tries.** Even a temporary error can last. After the limit, the record goes to the reject table with a clear reason, and someone looks at it.

**Growing delays.** Waiting longer after each try gives a busy system time to recover. The list of delays lives in a property, so operations can change it.

**One function, one rule.** \`rejectReason\` holds the rules in one place, so both lists and the reason always agree.
`,
  tests: [
    {
      name: 'More tries than delays',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[{ "key": "SO-2001", "errorCode": "HTTP:TIMEOUT", "attempts": 4 }]' },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "maxAttempts": 6, "retryable": ["HTTP:TIMEOUT"], "delaysSec": [30, 120] }',
        },
      ],
      expected: '{ "retry": [{ "key": "SO-2001", "attempt": 5, "delaySec": 120 }], "reject": [], "counts": { "retry": 1, "reject": 0 } }',
    },
    {
      name: 'Nothing failed',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "maxAttempts": 3, "retryable": ["HTTP:503"], "delaysSec": [30] }' },
      ],
      expected: '{ "retry": [], "reject": [], "counts": { "retry": 0, "reject": 0 } }',
    },
  ],
  followUps: [
    {
      q: 'Where would the retry records go?',
      a: 'To a retry queue or a table with a next try time, read by a scheduled flow. The batch job itself does not wait.',
    },
    {
      q: 'Why keep the error code list in a property?',
      a: 'New temporary errors show up in production. Operations can add a code without a release.',
    },
    {
      q: 'Is ORA-00001 a retry or a reject?',
      a: 'A reject for a plain insert, since the key already exists. With a MERGE or an idempotent upsert it would not occur at all.',
    },
  ],
}
