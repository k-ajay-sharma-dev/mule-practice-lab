export default {
  id: 'dw-209',
  category: 'dataweave',
  title: 'Turn FTP Reply Lines Into Codes, Classes and Retry Advice',
  level: 'BEGINNER',
  tags: ['myproject', 'ftp', 'reply-codes', 'retry', 'support', 'json'],
  estMinutes: 15,
  description: `
Quayle Freight pulls receipts files from a distribution center FTP server. When a pull fails, support gets a wall of raw server replies from the debug log. The team wants each reply turned into something a person can act on.

\`payload.lines\` holds reply lines in order. A reply line starts with a three digit code. A code followed by \`-\` starts a multi line reply, and those opening lines are left out. A code followed by a space is a final reply.

**Rules** for each kept line:
- \`code\` is the three digit number. \`text\` is what follows the space.
- \`kind\` comes from the first digit: \`1\` \`PRELIMINARY\`, \`2\` \`SUCCESS\`, \`3\` \`NEEDS_MORE\`, \`4\` \`TRANSIENT\`, \`5\` \`PERMANENT\`.
- \`retry\` is \`true\` only for \`TRANSIENT\`.
- A line that does not start with three digits and a space gets \`code\` \`null\`, \`kind\` \`UNKNOWN\`, \`retry\` \`false\` and the whole line as \`text\`.

Output \`replies\` and \`failed\`, which is \`true\` when any reply is \`TRANSIENT\` or \`PERMANENT\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "lines": [
    "220-Welcome to the DC 04 file server",
    "220 Service ready",
    "331 Password required",
    "230 Logged in",
    "227 Entering Passive Mode (10,0,4,21,195,80)",
    "425 Can't open data connection",
    "550 receipts_20261118.csv: No such file",
    "Connection closed by remote host"
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "replies": [
    { "code": 220, "kind": "SUCCESS", "retry": false, "text": "Service ready" },
    { "code": 331, "kind": "NEEDS_MORE", "retry": false, "text": "Password required" },
    { "code": 230, "kind": "SUCCESS", "retry": false, "text": "Logged in" },
    { "code": 227, "kind": "SUCCESS", "retry": false, "text": "Entering Passive Mode (10,0,4,21,195,80)" },
    { "code": 425, "kind": "TRANSIENT", "retry": true, "text": "Can't open data connection" },
    { "code": 550, "kind": "PERMANENT", "retry": false, "text": "receipts_20261118.csv: No such file" },
    { "code": null, "kind": "UNKNOWN", "retry": false, "text": "Connection closed by remote host" }
  ],
  "failed": true
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  replies: payload.lines map (l) -> {
    code: l[0 to 2] as Number,
    text: l[4 to -1]
  }
}
`,
  hints: [
    'Drop multi line openers with `filter (l) -> not (l matches /^\\d{3}-.*/)`.',
    'Use `l match /^(\\d{3}) (.*)$/`. It returns an empty array when the line does not fit.',
    'Keep the kinds in an object keyed by the first digit and look them up with `kinds[m[1][0]]`.',
  ],
  solution: `%dw 2.0
output application/json
import some from dw::core::Arrays

var kinds = { "1": "PRELIMINARY", "2": "SUCCESS", "3": "NEEDS_MORE", "4": "TRANSIENT", "5": "PERMANENT" }
var kept = payload.lines filter (l) -> not (l matches /^\\d{3}-.*/)
var replies = kept map (l) -> do {
  var m = l match /^(\\d{3}) (.*)$/
  var kind = if (isEmpty(m)) "UNKNOWN" else (kinds[m[1][0]] default "UNKNOWN")
  ---
  {
    code: if (isEmpty(m)) null else m[1] as Number,
    kind: kind,
    retry: kind == "TRANSIENT",
    text: if (isEmpty(m)) l else m[2]
  }
}
---
{
  replies: replies,
  failed: replies some (r) -> r.kind == "TRANSIENT" or r.kind == "PERMANENT"
}`,
  explanation: `
**The first digit says what to do.** In FTP a 4xx reply means try again later, such as 421 (service closing) or 425 (no data connection). A 5xx reply means the request will fail again as it is, such as 530 (not logged in) or 550 (file not found or no access).

**Retrying a 5xx wastes time.** A missing file or a bad password does not fix itself in ten seconds. Alert on it instead.

**A 227 reply carries the data port.** The last two numbers give the port as high byte and low byte: 195 times 256 plus 80 is 50000. A 425 right after it often points to a firewall that blocks that port range.

**Lines without a code are still evidence.** A dropped connection shows up as client text, not a reply. Keep it in the report.
`,
  tests: [
    {
      name: 'Clean session',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "lines": ["220 Ready", "230 Logged in", "226 Transfer complete"] }' }],
      expected:
        '{ "replies": [{ "code": 220, "kind": "SUCCESS", "retry": false, "text": "Ready" }, { "code": 230, "kind": "SUCCESS", "retry": false, "text": "Logged in" }, { "code": 226, "kind": "SUCCESS", "retry": false, "text": "Transfer complete" }], "failed": false }',
    },
    {
      name: 'Server going down',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "lines": ["421-Maintenance at 02:00", "421 Service not available"] }' }],
      expected: '{ "replies": [{ "code": 421, "kind": "TRANSIENT", "retry": true, "text": "Service not available" }], "failed": true }',
    },
  ],
  followUps: [
    {
      q: 'What does a 530 after a password change usually mean?',
      a: 'The stored credential in the secure properties is out of date, or the account got locked by repeated retries. Stop the retries first.',
    },
    {
      q: 'Why can a 550 mean two different things?',
      a: 'Servers use it for a missing file and for denied access. The text after the code, or a listing of the folder, tells you which.',
    },
    {
      q: 'Where does Mule show these replies?',
      a: 'The FTP connector raises errors such as FTP:CONNECTIVITY or FTP:FILE_DOESNT_EXIST. The raw replies usually appear only with debug logging for the connector, so turn it on briefly.',
    },
  ],
}
