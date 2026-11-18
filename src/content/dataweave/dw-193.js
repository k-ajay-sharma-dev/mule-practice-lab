export default {
  id: 'dw-193',
  category: 'dataweave',
  title: 'Build an Alert Email With No Personal Data From a Failed Database Load',
  level: 'ADVANCED',
  tags: ['myproject', 'email', 'alerts', 'privacy', 'regex', 'oracle', 'json'],
  estMinutes: 25,
  description: `
Marrow & Pine Home sends an alert email when an order load into Oracle fails. The old alert copied the error text and the failed records into the mail, so names, email addresses and card numbers ended up in inboxes. The privacy team asks for alerts with keys and codes only.

The flow passes an error event with \`app\`, \`env\`, \`runId\`, \`errorType\`, \`description\` and the failed \`records\`.

Build:

- \`subject\`: \`[ENV] APP run RUN_ID failed: CODE\`, with the environment in upper case
- \`errorCode\`: the ORA code, such as \`ORA-00001\`, when the description starts with one, otherwise the \`errorType\`
- \`errorType\`: as given
- \`safeReason\`: the description with every email address replaced by \`[email]\` and every run of 12 to 19 digits replaced by \`[number]\`
- \`recordCount\`
- \`recordKeys\`: the \`orderId\` of the first \`vars.maxKeys\` records
- \`moreKeys\`: how many keys were left out
- \`details\`: \`vars.jobLogUrl\` followed by the run ID

Nothing else from the records may appear in the output.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "app": "order-sync",
  "env": "prod",
  "runId": 9004,
  "errorType": "DB:QUERY_EXECUTION",
  "description": "ORA-00001: unique constraint (STG.UK_CUSTOMER_EMAIL) violated, value jane.doe@marrow.example, card 4111111111111111",
  "records": [
    { "orderId": "MP-50012", "customerName": "Jane Doe", "email": "jane.doe@marrow.example", "phone": "+44 7700 900123" },
    { "orderId": "MP-50013", "customerName": "Sam Lee", "email": "sam.lee@marrow.example", "phone": "+44 7700 900456" },
    { "orderId": "MP-50014", "customerName": "Ana Ruiz", "email": "ana.ruiz@marrow.example", "phone": "+44 7700 900789" },
    { "orderId": "MP-50015", "customerName": "Tom Park", "email": "tom.park@marrow.example", "phone": "+44 7700 900111" },
    { "orderId": "MP-50016", "customerName": "Mia Chen", "email": "mia.chen@marrow.example", "phone": "+44 7700 900222" },
    { "orderId": "MP-50017", "customerName": "Leo Hart", "email": "leo.hart@marrow.example", "phone": "+44 7700 900333" },
    { "orderId": "MP-50018", "customerName": "Ivy Moss", "email": "ivy.moss@marrow.example", "phone": "+44 7700 900444" }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "maxKeys": 5, "jobLogUrl": "https://ops.marrow.example/jobs/" }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "subject": "[PROD] order-sync run 9004 failed: ORA-00001",
  "errorCode": "ORA-00001",
  "errorType": "DB:QUERY_EXECUTION",
  "safeReason": "ORA-00001: unique constraint (STG.UK_CUSTOMER_EMAIL) violated, value [email], card [number]",
  "recordCount": 7,
  "recordKeys": ["MP-50012", "MP-50013", "MP-50014", "MP-50015", "MP-50016"],
  "moreKeys": 2,
  "details": "https://ops.marrow.example/jobs/9004"
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  subject: "Load failed",
  reason: payload.description,
  records: payload.records
}
`,
  hints: [
    'Check for an ORA code with `matches /^ORA-\\d{5}.*/`, then take the first 9 characters with `[0 to 8]`.',
    'Replace emails with `replace /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/ with "[email]"`.',
    'Put brackets around the first `replace` before you apply the second one.',
    'Keep the first keys with `filter (k, i) -> i < vars.maxKeys`.',
    'Build the output from an allow list of fields. Never copy a record object into it.',
  ],
  solution: `%dw 2.0
output application/json

var d = payload.description default ""

var errorCode =
  if (d matches /^ORA-\\d{5}.*/) d[0 to 8]
  else payload.errorType

var safeReason =
  (d replace /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/ with "[email]")
    replace /\\d{12,19}/ with "[number]"

var keys = (payload.records default []) map (r) -> r.orderId

var count = sizeOf(keys)
---
{
  subject: "[$(upper(payload.env))] $(payload.app) run $(payload.runId) failed: $(errorCode)",
  errorCode: errorCode,
  errorType: payload.errorType,
  safeReason: safeReason,
  recordCount: count,
  recordKeys: keys filter (k, i) -> i < vars.maxKeys,
  moreKeys: if (count > vars.maxKeys) count - vars.maxKeys else 0,
  details: vars.jobLogUrl ++ (payload.runId as String)
}`,
  explanation: `
**Allow list, not deny list.** The output names each field it carries. A new field in the records, such as a date of birth, cannot leak, because nothing copies whole records.

**Error texts leak too.** Oracle and API errors often echo the failing value. ORA-00001 on a unique email index shows the email. Masking emails and long digit runs, which can be card or account numbers, removes the common cases. It is a safety net, not a guarantee, so keep the reason short and test it with real error shapes.

**A code people can search.** The ORA code alone tells support most of what they need. Other errors fall back to the Mule error type.

**Keys and a link.** Order IDs let authorised people look up the records in the system. The link goes to the job log, which has access control. A count of left out keys keeps the mail short when thousands fail.

**Example domains in tests.** Test data uses \`marrow.example\` addresses, so a test mail can never reach a real person.
`,
  tests: [
    {
      name: 'Not an Oracle error, no records',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "app": "order-sync", "env": "test", "runId": 9005, "errorType": "EMAIL:CONNECTIVITY", "description": "Connection refused by relay for ops@marrow.example", "records": [] }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "maxKeys": 5, "jobLogUrl": "https://ops.marrow.example/jobs/" }' },
      ],
      expected:
        '{ "subject": "[TEST] order-sync run 9005 failed: EMAIL:CONNECTIVITY", "errorCode": "EMAIL:CONNECTIVITY", "errorType": "EMAIL:CONNECTIVITY", "safeReason": "Connection refused by relay for [email]", "recordCount": 0, "recordKeys": [], "moreKeys": 0, "details": "https://ops.marrow.example/jobs/9005" }',
    },
    {
      name: 'Short numbers stay',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "app": "order-sync", "env": "prod", "runId": 9006, "errorType": "DB:QUERY_EXECUTION", "description": "ORA-12899: value too large for column STG.ORDER_STAGE.NOTE (actual: 412, maximum: 400)", "records": [{ "orderId": "MP-60001", "customerName": "Kai Wood" }] }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "maxKeys": 5, "jobLogUrl": "https://ops.marrow.example/jobs/" }' },
      ],
      expected:
        '{ "subject": "[PROD] order-sync run 9006 failed: ORA-12899", "errorCode": "ORA-12899", "errorType": "DB:QUERY_EXECUTION", "safeReason": "ORA-12899: value too large for column STG.ORDER_STAGE.NOTE (actual: 412, maximum: 400)", "recordCount": 1, "recordKeys": ["MP-60001"], "moreKeys": 0, "details": "https://ops.marrow.example/jobs/9006" }',
    },
  ],
  followUps: [
    {
      q: 'Is masking the error text enough?',
      a: 'No. Names and addresses in free text are hard to catch with patterns. Prefer mapping known error codes to fixed safe texts, and log the raw text only where access is controlled.',
    },
    {
      q: 'Where should the full error go?',
      a: 'Into the job log or reject table, which authorised support staff can read, and into logs that follow the same masking rules.',
    },
    {
      q: 'What about phone numbers like +44 7700 900123?',
      a: 'The digit pattern misses them because of the spaces. Add a pattern for them if they can appear, and test with the formats you receive.',
    },
  ],
}
