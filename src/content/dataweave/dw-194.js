export default {
  id: 'dw-194',
  category: 'dataweave',
  title: 'Update an Email Outbox From SMTP Replies: Sent, Retry With Backoff or Failed',
  level: 'EXPERT',
  tags: ['myproject', 'email', 'outbox', 'smtp', 'retries', 'backoff', 'json'],
  estMinutes: 35,
  description: `
Fenwick Supply sends job reports and alerts through an outbox table. A sender flow claims rows, tries to send each one, and collects the SMTP reply code and text. This script turns those results into updates for the outbox table and a list of alerts.

**Inputs**
- \`payload.results\`: \`id\`, \`code\` and \`text\` per send attempt
- \`vars.outbox\`: the claimed rows with \`ID\` and \`ATTEMPTS\` before this try
- \`vars.now\`: the current time in UTC
- \`vars.maxAttempts\` and \`vars.retryDelaysMinutes\`, such as \`[5, 15, 60]\`

**Rules for each result**, giving one entry in \`updates\` with \`ID\`, \`STATUS\`, \`ATTEMPTS\`, \`NEXT_TRY_UTC\` and \`LAST_ERROR\`, in input order:
- \`ATTEMPTS\` becomes the old value plus 1. The rules below use this new value.
- A 2xx code: \`SENT\`.
- A 4xx code with \`ATTEMPTS\` below \`maxAttempts\`: \`RETRY\`. \`NEXT_TRY_UTC\` is now plus the delay at position \`ATTEMPTS - 1\` in the delay list, or the last delay when the list is shorter, as \`yyyy-MM-dd HH:mm:ss\`.
- Anything else: \`FAILED\`.
- \`NEXT_TRY_UTC\` is null unless the status is \`RETRY\`. \`LAST_ERROR\` is null for \`SENT\`, otherwise the code, a space and the text.

**Alerts**: a list \`alerts\`, one per \`FAILED\` row in input order, with \`ID\` and \`kind\`: \`CHECK_CREDENTIALS\` for 535, \`PERMANENT_ERROR\` for other 5xx codes, otherwise \`RETRIES_EXHAUSTED\`.

Also return \`pauseSending\`, true when any result is 535, since every later send would fail the same way, and a \`summary\` with \`sent\`, \`retry\` and \`failed\` counts.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "results": [
    { "id": 101, "code": 250, "text": "2.0.0 OK queued" },
    { "id": 102, "code": 421, "text": "4.7.0 Try again later" },
    { "id": 103, "code": 451, "text": "4.3.0 Temporary failure" },
    { "id": 104, "code": 550, "text": "5.1.1 Mailbox unavailable" },
    { "id": 105, "code": 535, "text": "5.7.3 Authentication unsuccessful" }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "now": "2026-11-18T10:00:00Z",
  "maxAttempts": 4,
  "retryDelaysMinutes": [5, 15, 60],
  "outbox": [
    { "ID": 101, "ATTEMPTS": 0 },
    { "ID": 102, "ATTEMPTS": 0 },
    { "ID": 103, "ATTEMPTS": 3 },
    { "ID": 104, "ATTEMPTS": 1 },
    { "ID": 105, "ATTEMPTS": 0 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "updates": [
    { "ID": 101, "STATUS": "SENT", "ATTEMPTS": 1, "NEXT_TRY_UTC": null, "LAST_ERROR": null },
    { "ID": 102, "STATUS": "RETRY", "ATTEMPTS": 1, "NEXT_TRY_UTC": "2026-11-18 10:05:00", "LAST_ERROR": "421 4.7.0 Try again later" },
    { "ID": 103, "STATUS": "FAILED", "ATTEMPTS": 4, "NEXT_TRY_UTC": null, "LAST_ERROR": "451 4.3.0 Temporary failure" },
    { "ID": 104, "STATUS": "FAILED", "ATTEMPTS": 2, "NEXT_TRY_UTC": null, "LAST_ERROR": "550 5.1.1 Mailbox unavailable" },
    { "ID": 105, "STATUS": "FAILED", "ATTEMPTS": 1, "NEXT_TRY_UTC": null, "LAST_ERROR": "535 5.7.3 Authentication unsuccessful" }
  ],
  "alerts": [
    { "ID": 103, "kind": "RETRIES_EXHAUSTED" },
    { "ID": 104, "kind": "PERMANENT_ERROR" },
    { "ID": 105, "kind": "CHECK_CREDENTIALS" }
  ],
  "pauseSending": true,
  "summary": { "sent": 1, "retry": 1, "failed": 3 }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  updates: payload.results map (r) -> {
    ID: r.id,
    STATUS: if (r.code == 250) "SENT" else "RETRY"
  }
}
`,
  hints: [
    'Find the old attempts with `(vars.outbox filter (o) -> o.ID == id)[0].ATTEMPTS default 0`.',
    'Pick the delay with `delays[min([attempts - 1, sizeOf(delays) - 1])]`.',
    'A DateTime `as Number` gives seconds since 1970. Add minutes times 60, then `as DateTime as String {format: "yyyy-MM-dd HH:mm:ss"}`.',
    'Keep the reply code in an inner list of decisions, then build the outbox updates and the alerts from it.',
  ],
  solution: `%dw 2.0
output application/json

var nowSeconds = (vars.now as DateTime) as Number
var delays = vars.retryDelaysMinutes

fun oldAttempts(id) = (vars.outbox filter (o) -> o.ID == id)[0].ATTEMPTS default 0

fun nextTry(attempts) = do {
  var mins = delays[min([attempts - 1, sizeOf(delays) - 1])]
  ---
  (nowSeconds + mins * 60) as DateTime as String {format: "yyyy-MM-dd HH:mm:ss"}
}

var decisions = payload.results map (r) -> do {
  var attempts = oldAttempts(r.id) + 1
  var status =
    if (r.code >= 200 and r.code < 300) "SENT"
    else if (r.code >= 400 and r.code < 500 and attempts < vars.maxAttempts) "RETRY"
    else "FAILED"
  ---
  { id: r.id, code: r.code, text: r.text, attempts: attempts, status: status }
}

fun countOf(s) = sizeOf(decisions filter (d) -> d.status == s)
---
{
  updates: decisions map (d) -> {
    ID: d.id,
    STATUS: d.status,
    ATTEMPTS: d.attempts,
    NEXT_TRY_UTC: if (d.status == "RETRY") nextTry(d.attempts) else null,
    LAST_ERROR: if (d.status == "SENT") null else "$(d.code) $(d.text)"
  },
  alerts: (decisions filter (d) -> d.status == "FAILED") map (d) -> {
    ID: d.id,
    kind:
      if (d.code == 535) "CHECK_CREDENTIALS"
      else if (d.code >= 500) "PERMANENT_ERROR"
      else "RETRIES_EXHAUSTED"
  },
  pauseSending: not isEmpty(decisions filter (d) -> d.code == 535),
  summary: {
    sent: countOf("SENT"),
    retry: countOf("RETRY"),
    failed: countOf("FAILED")
  }
}`,
  explanation: `
**Reply classes drive the decision.** 2xx means the relay took the mail. 4xx is temporary, so a later try may work. 5xx is permanent, and sending the same mail again only repeats the error.

**Growing delays.** The delay list gives 5, 15, then 60 minutes. A busy or rate limited service gets time to recover, and the last delay repeats if more attempts are allowed.

**A limit on attempts.** Row 103 had three tries before this one. The fourth temporary failure reaches the limit, so it stops and raises an alert instead of retrying forever.

**Credentials stop everything.** A 535 means the login failed. Every other mail would fail too, and repeated failed logins can lock the account. \`pauseSending\` tells the sender flow to stop and wait for someone to fix the secret.

**Time as numbers.** Turning the DateTime into seconds makes adding minutes plain arithmetic. Turning it back gives a UTC DateTime, formatted for a \`TO_TIMESTAMP\` with a matching mask.

**Decide once.** The decisions list holds the code and status for each row. Updates, alerts and counts all read from it, so they cannot disagree.
`,
  tests: [
    {
      name: 'Third retry uses the last delay and crosses midnight',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "results": [{ "id": 201, "code": 452, "text": "4.5.3 Too many recipients" }] }' },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "now": "2026-11-18T23:30:00Z", "maxAttempts": 6, "retryDelaysMinutes": [5, 15, 60], "outbox": [{ "ID": 201, "ATTEMPTS": 3 }] }',
        },
      ],
      expected:
        '{ "updates": [{ "ID": 201, "STATUS": "RETRY", "ATTEMPTS": 4, "NEXT_TRY_UTC": "2026-11-19 00:30:00", "LAST_ERROR": "452 4.5.3 Too many recipients" }], "alerts": [], "pauseSending": false, "summary": { "sent": 0, "retry": 1, "failed": 0 } }',
    },
    {
      name: 'All sent',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "results": [{ "id": 301, "code": 250, "text": "OK" }, { "id": 302, "code": 251, "text": "User not local; will forward" }] }' },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "now": "2026-11-18T10:00:00Z", "maxAttempts": 4, "retryDelaysMinutes": [5], "outbox": [{ "ID": 301, "ATTEMPTS": 0 }, { "ID": 302, "ATTEMPTS": 1 }] }',
        },
      ],
      expected:
        '{ "updates": [{ "ID": 301, "STATUS": "SENT", "ATTEMPTS": 1, "NEXT_TRY_UTC": null, "LAST_ERROR": null }, { "ID": 302, "STATUS": "SENT", "ATTEMPTS": 2, "NEXT_TRY_UTC": null, "LAST_ERROR": null }], "alerts": [], "pauseSending": false, "summary": { "sent": 2, "retry": 0, "failed": 0 } }',
    },
  ],
  followUps: [
    {
      q: 'How does the sender flow apply these updates?',
      a: 'With a Bulk update on the outbox table by ID, in one transaction, after the sends. Rows stay claimed until then, so no other worker picks them up.',
    },
    {
      q: 'A 250 reply came back but the user never got the mail. Is the row wrong?',
      a: 'No. 250 means the relay accepted it. A later bounce arrives as a mail to the envelope sender, which another flow can watch.',
    },
    {
      q: 'Why add some random jitter to the delays?',
      a: 'When many mails fail at once, the same delay sends them all back at once. A small random spread smooths the load.',
    },
  ],
}
