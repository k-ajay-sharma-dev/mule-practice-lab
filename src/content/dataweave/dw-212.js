export default {
  id: 'dw-212',
  category: 'dataweave',
  title: 'Route Integration Alerts to the Right Mailbox and Fold Repeats Into One Line',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'alerts', 'routing', 'groupBy', 'json'],
  estMinutes: 20,
  description: `
Thornbury Freight runs a report app that mails integration alerts every 30 minutes. During a database outage last week, one mailbox got 140 separate mails about the same error, and the on call engineer missed a critical alert from another app in the noise.

\`payload.alerts\` holds the alerts of the last window: \`app\`, \`errorType\`, \`severity\` (\`CRITICAL\`, \`ERROR\` or \`WARN\`) and \`at\` (UTC). \`vars.routes\` maps an app to its support mailbox. \`vars.defaultTo\` takes apps with no route. \`vars.onCallTo\` is the on call mailbox.

**Rules**
- \`WARN\` alerts are not mailed. Count them in \`notMailed\`.
- Every other alert goes to its app's mailbox. A \`CRITICAL\` alert also goes to the on call mailbox.
- One mail per mailbox, sorted by address.
- In a mail, one line per app and error type, sorted by app then error type. Times are \`HH:mm\` UTC.
  - one alert: \`<app> <errorType> at HH:mm\`
  - several: \`<app> <errorType> xN, first HH:mm, last HH:mm\`
- The subject is \`[Integration] N alerts, C critical\`, counting the alerts in that mail.

Output \`mails\` (\`to\`, \`subject\`, \`lines\`) and \`notMailed\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "alerts": [
    { "app": "item-inbound", "errorType": "DB:CONNECTIVITY", "severity": "ERROR", "at": "2026-11-18T02:10:00Z" },
    { "app": "item-inbound", "errorType": "DB:CONNECTIVITY", "severity": "ERROR", "at": "2026-11-18T02:25:00Z" },
    { "app": "item-inbound", "errorType": "DB:CONNECTIVITY", "severity": "ERROR", "at": "2026-11-18T02:40:00Z" },
    { "app": "plan-outbound", "errorType": "SFTP:CONNECTIVITY", "severity": "CRITICAL", "at": "2026-11-18T02:15:00Z" },
    { "app": "item-inbound", "errorType": "APP:DUPLICATE_MESSAGE", "severity": "WARN", "at": "2026-11-18T02:20:00Z" },
    { "app": "report-app", "errorType": "EMAIL:SEND", "severity": "ERROR", "at": "2026-11-18T02:30:00Z" },
    { "app": "item-inbound", "errorType": "APP:SCHEMA_INVALID", "severity": "CRITICAL", "at": "2026-11-18T02:35:00Z" }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "routes": { "item-inbound": "item-support@thornbury.example", "plan-outbound": "planning-support@thornbury.example" },
  "defaultTo": "integration-team@thornbury.example",
  "onCallTo": "on-call@thornbury.example"
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "mails": [
    {
      "to": "integration-team@thornbury.example",
      "subject": "[Integration] 1 alerts, 0 critical",
      "lines": ["report-app EMAIL:SEND at 02:30"]
    },
    {
      "to": "item-support@thornbury.example",
      "subject": "[Integration] 4 alerts, 1 critical",
      "lines": [
        "item-inbound APP:SCHEMA_INVALID at 02:35",
        "item-inbound DB:CONNECTIVITY x3, first 02:10, last 02:40"
      ]
    },
    {
      "to": "on-call@thornbury.example",
      "subject": "[Integration] 2 alerts, 2 critical",
      "lines": [
        "item-inbound APP:SCHEMA_INVALID at 02:35",
        "plan-outbound SFTP:CONNECTIVITY at 02:15"
      ]
    },
    {
      "to": "planning-support@thornbury.example",
      "subject": "[Integration] 1 alerts, 1 critical",
      "lines": ["plan-outbound SFTP:CONNECTIVITY at 02:15"]
    }
  ],
  "notMailed": 1
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  mails: payload.alerts map (a) -> {
    to: vars.routes[a.app],
    subject: a.errorType
  }
}
`,
  hints: [
    'First turn each alert into one or two deliveries with `flatMap`: `{ to: ..., alert: a }`.',
    'Group deliveries by `to`, and get the addresses with `keysOf(byTo) map (k) -> k as String`.',
    'Inside a mail, group again by `"$(a.app) $(a.errorType)"` and sort the times of each group.',
  ],
  solution: `%dw 2.0
output application/json

fun hhmm(t) = (t as DateTime) as String { format: "HH:mm" }

var mailed = payload.alerts filter (a) -> a.severity != "WARN"
var deliveries = mailed flatMap (a) ->
  [{ to: vars.routes[a.app] default vars.defaultTo, alert: a }]
    ++ (if (a.severity == "CRITICAL") [{ to: vars.onCallTo, alert: a }] else [])
var byTo = deliveries groupBy (d) -> d.to
---
{
  mails: ((keysOf(byTo) map (k) -> k as String) orderBy $) map (addr) -> do {
    var alerts = byTo[addr] map (d) -> d.alert
    var groups = alerts groupBy (a) -> "$(a.app) $(a.errorType)"
    var critical = sizeOf(alerts filter (a) -> a.severity == "CRITICAL")
    ---
    {
      to: addr,
      subject: "[Integration] $(sizeOf(alerts)) alerts, $(critical) critical",
      lines: ((keysOf(groups) map (g) -> g as String) orderBy $) map (k) -> do {
        var times = (groups[k] map (a) -> hhmm(a.at)) orderBy $
        ---
        if (sizeOf(times) == 1) "$(k) at $(times[0])"
        else "$(k) x$(sizeOf(times)), first $(times[0]), last $(times[-1])"
      }
    }
  },
  notMailed: sizeOf(payload.alerts filter (a) -> a.severity == "WARN")
}`,
  explanation: `
**Fold repeats.** Forty mails about one database outage carry one fact. One line with a count and the first and last time says the same and leaves room for the next problem.

**Route by owner.** The team that owns an app gets its alerts. Unknown apps go to a default mailbox, so nothing is dropped when a new app appears before its route exists.

**Critical goes twice.** The owner needs it for the fix, and the on call person needs it now. Sending a copy keeps both in the loop.

**Warnings belong in a report, not an inbox.** Counting them keeps them visible without paging anyone.
`,
  tests: [
    {
      name: 'Only warnings',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "alerts": [{ "app": "a", "errorType": "X", "severity": "WARN", "at": "2026-11-18T01:00:00Z" }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "routes": {}, "defaultTo": "team@thornbury.example", "onCallTo": "oncall@thornbury.example" }' },
      ],
      expected: '{ "mails": [], "notMailed": 1 }',
    },
    {
      name: 'Unrouted app with repeats',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "alerts": [{ "app": "new-app", "errorType": "HTTP:TIMEOUT", "severity": "ERROR", "at": "2026-11-18T03:50:00Z" }, { "app": "new-app", "errorType": "HTTP:TIMEOUT", "severity": "ERROR", "at": "2026-11-18T03:05:00Z" }] }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "routes": {}, "defaultTo": "team@thornbury.example", "onCallTo": "oncall@thornbury.example" }' },
      ],
      expected:
        '{ "mails": [{ "to": "team@thornbury.example", "subject": "[Integration] 2 alerts, 0 critical", "lines": ["new-app HTTP:TIMEOUT x2, first 03:05, last 03:50"] }], "notMailed": 0 }',
    },
  ],
  followUps: [
    {
      q: 'How do you stop the same outage mailing every 30 minutes for hours?',
      a: 'Keep the last sent time per app and error type, and resend only when the count grows a lot or a set quiet period has passed.',
    },
    {
      q: 'Should the mail hold error details?',
      a: 'Only codes, counts, times and a link to the logs or job log. Payload data can hold personal or commercial data that should not sit in inboxes.',
    },
    {
      q: 'Why send this mail in an Async scope?',
      a: 'A slow or failing mail server then does not hold up or fail the report run. Log the send result so a lost mail is still visible.',
    },
  ],
}
