export default {
  id: 'dw-190',
  category: 'dataweave',
  title: 'Build the Job Report Email From a Job Log Row',
  level: 'BEGINNER',
  tags: ['myproject', 'email', 'job-report', 'job-log', 'notifications', 'json'],
  estMinutes: 15,
  description: `
Brindle Outdoor sends a short job report email after each inbound run, from an Async scope at the end of the flow. The flow reads the job log row and passes the result of this script to the Email Send operation.

Build:

- \`to\`: the addresses in \`vars.recipients\`, a comma separated text. Trim each one and drop empty entries.
- \`subject\`: \`[ENV] JOB_NAME run RUN_ID: STATUS (LOADED loaded, REJECTED rejected)\`, with the environment in upper case
- \`priority\`: \`"normal"\` when the status is \`SUCCESS\`, otherwise \`"high"\`
- \`bodyLines\`, in this order:
  - \`Job: JOB_NAME\`
  - \`Run: RUN_ID\`
  - \`Status: STATUS\`
  - \`Started: yyyy-MM-dd HH:mm UTC\`
  - \`Duration: N min\`, whole minutes, rounded down
  - \`Received R, loaded L, rejected J, duplicates D\`
  - \`Details: \` followed by \`vars.reportBaseUrl\` and the run ID

The times in the job log are UTC.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "RUN_ID": 9001,
  "JOB_NAME": "Item inbound",
  "ENV": "prod",
  "STATUS": "PARTIAL",
  "STARTED_AT": "2026-11-18T02:00:00Z",
  "ENDED_AT": "2026-11-18T02:14:30Z",
  "RECEIVED": 1000,
  "LOADED": 980,
  "REJECTED": 20,
  "DUPLICATES": 0
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "recipients": " support@brindle.example, buying-ops@brindle.example ,",
  "reportBaseUrl": "https://reports.brindle.example/jobs/"
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "to": ["support@brindle.example", "buying-ops@brindle.example"],
  "subject": "[PROD] Item inbound run 9001: PARTIAL (980 loaded, 20 rejected)",
  "priority": "high",
  "bodyLines": [
    "Job: Item inbound",
    "Run: 9001",
    "Status: PARTIAL",
    "Started: 2026-11-18 02:00 UTC",
    "Duration: 14 min",
    "Received 1000, loaded 980, rejected 20, duplicates 0",
    "Details: https://reports.brindle.example/jobs/9001"
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  to: vars.recipients,
  subject: payload.JOB_NAME
}
`,
  hints: [
    'Split the recipients with `splitBy ","`, then `map` with `trim` and `filter` out empty strings. Put brackets around each step.',
    'Build text with interpolation: `"Run: $(payload.RUN_ID)"`.',
    'A DateTime `as Number` gives seconds since 1970. Take the difference, divide by 60 and use `floor`.',
    'Format the start with `as DateTime as String {format: "yyyy-MM-dd HH:mm"}`.',
  ],
  solution: `%dw 2.0
output application/json

var p = payload
var started = p.STARTED_AT as DateTime
var ended = p.ENDED_AT as DateTime
var minutes = floor(((ended as Number) - (started as Number)) / 60)
---
{
  to: ((vars.recipients splitBy ",") map (a) -> trim(a)) filter (a) -> a != "",
  subject: "[$(upper(p.ENV))] $(p.JOB_NAME) run $(p.RUN_ID): $(p.STATUS) ($(p.LOADED) loaded, $(p.REJECTED) rejected)",
  priority: if (p.STATUS == "SUCCESS") "normal" else "high",
  bodyLines: [
    "Job: $(p.JOB_NAME)",
    "Run: $(p.RUN_ID)",
    "Status: $(p.STATUS)",
    "Started: " ++ (started as String {format: "yyyy-MM-dd HH:mm"}) ++ " UTC",
    "Duration: $(minutes) min",
    "Received $(p.RECEIVED), loaded $(p.LOADED), rejected $(p.REJECTED), duplicates $(p.DUPLICATES)",
    "Details: " ++ vars.reportBaseUrl ++ (p.RUN_ID as String)
  ]
}`,
  explanation: `
**Recipients from configuration.** The list comes from a property, so support can change it without a code change. Trimming and dropping empty entries copes with spaces and a trailing comma.

**A subject that tells the story.** Status and counts in the subject let people triage from the inbox. The environment tag in front keeps test mails apart from production ones.

**Counts, not data.** The body lists counts and a link to the details. No record data goes in the mail, so it stays small and holds no personal data.

**Duration from the log.** Both times come from the job log, so the mail shows what the database holds. Turning each DateTime into seconds gives a plain number to subtract.

**Lines, not one string.** Returning a list keeps this script about content. The next step joins the lines with a line break for a text body, or wraps them in HTML.
`,
  tests: [
    {
      name: 'Successful run with one recipient',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "RUN_ID": 9010, "JOB_NAME": "Barcode inbound", "ENV": "test", "STATUS": "SUCCESS", "STARTED_AT": "2026-11-18T23:58:10Z", "ENDED_AT": "2026-11-19T00:01:05Z", "RECEIVED": 40, "LOADED": 40, "REJECTED": 0, "DUPLICATES": 2 }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "recipients": "qa@brindle.example", "reportBaseUrl": "https://reports.brindle.example/jobs/" }' },
      ],
      expected:
        '{ "to": ["qa@brindle.example"], "subject": "[TEST] Barcode inbound run 9010: SUCCESS (40 loaded, 0 rejected)", "priority": "normal", "bodyLines": ["Job: Barcode inbound", "Run: 9010", "Status: SUCCESS", "Started: 2026-11-18 23:58 UTC", "Duration: 2 min", "Received 40, loaded 40, rejected 0, duplicates 2", "Details: https://reports.brindle.example/jobs/9010"] }',
    },
  ],
  followUps: [
    {
      q: 'Why send this from an Async scope?',
      a: 'So a slow or failed mail relay does not delay or fail a job that already loaded its data. The Async scope needs its own error handling.',
    },
    {
      q: 'How do you avoid mails from test reaching business users?',
      a: 'Keep recipients per environment in properties, and in lower environments send to a team mailbox only. The tag in the subject helps too.',
    },
    {
      q: 'What if the job never wrote an end time?',
      a: 'The job did not finish. The report should say RUNNING or FAILED and skip the duration, so add a check for a null ENDED_AT.',
    },
  ],
}
