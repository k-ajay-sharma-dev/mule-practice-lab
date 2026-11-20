export default {
  id: 'dw-192',
  category: 'dataweave',
  title: 'Triage Mails From a Supplier Mailbox: Process, Move to Error or Skip',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'imap', 'attachments', 'idempotency', 'json'],
  estMinutes: 22,
  description: `
Quayle Freight receives delivery files from small carriers by email. A Mule flow reads new mails from a shared IMAP mailbox and gets, for each mail, its Message-ID, the sender and the attachment details. Before parsing any file, it decides what to do with each mail.

**Inputs**
- \`payload\`: mails with \`messageId\`, \`sender\` (either \`Name <address>\` or a bare address) and \`attachments\` with \`name\`, \`contentType\` and \`sizeBytes\`
- \`vars.allowedSenders\`, \`vars.processedIds\` (Message-IDs already handled) and \`vars.maxBytes\`

**Rules, in this order**
1. A Message-ID already processed goes to \`alreadyDone\`, a list of the Message-IDs only.
2. The sender address, trimmed and in lower case, must be in the allowed list, compared in lower case. If not: \`Sender not allowed\`.
3. CSV files are attachments whose name ends with \`.csv\` in any case. With none: \`No CSV attachment\`.
4. Any CSV larger than \`vars.maxBytes\`: \`Attachment too large: \` followed by the names, joined with \`, \`.

Mails that fail rule 2, 3 or 4 go to \`errorFolder\` with \`messageId\` and \`reason\`. The rest go to \`process\` with \`messageId\`, the clean \`sender\` address and \`files\`, the CSV names. Keep input order in each list.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  {
    "messageId": "<a1@mail.quayle.example>",
    "sender": "Dock Office <dock@harbourline.example>",
    "attachments": [
      { "name": "deliveries_20261118.CSV", "contentType": "text/csv", "sizeBytes": 20480 },
      { "name": "logo.png", "contentType": "image/png", "sizeBytes": 4096 }
    ]
  },
  {
    "messageId": "<a2@mail.quayle.example>",
    "sender": "billing@unknown.example",
    "attachments": [{ "name": "inv.csv", "contentType": "text/csv", "sizeBytes": 900 }]
  },
  {
    "messageId": "<a3@mail.quayle.example>",
    "sender": "DOCK@harbourline.example",
    "attachments": [{ "name": "deliveries_20261117.csv", "contentType": "text/csv", "sizeBytes": 18000 }]
  },
  {
    "messageId": "<a4@mail.quayle.example>",
    "sender": "Ops <ops@fernway.example>",
    "attachments": [{ "name": "notes.pdf", "contentType": "application/pdf", "sizeBytes": 52000 }]
  },
  {
    "messageId": "<a5@mail.quayle.example>",
    "sender": " Ops <OPS@Fernway.example> ",
    "attachments": [
      { "name": "big.csv", "contentType": "text/csv", "sizeBytes": 30000000 },
      { "name": "small.csv", "contentType": "text/csv", "sizeBytes": 100 }
    ]
  }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "allowedSenders": ["dock@harbourline.example", "Ops@fernway.example"],
  "processedIds": ["<a3@mail.quayle.example>"],
  "maxBytes": 10485760
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "process": [
    { "messageId": "<a1@mail.quayle.example>", "sender": "dock@harbourline.example", "files": ["deliveries_20261118.CSV"] }
  ],
  "errorFolder": [
    { "messageId": "<a2@mail.quayle.example>", "reason": "Sender not allowed" },
    { "messageId": "<a4@mail.quayle.example>", "reason": "No CSV attachment" },
    { "messageId": "<a5@mail.quayle.example>", "reason": "Attachment too large: big.csv" }
  ],
  "alreadyDone": ["<a3@mail.quayle.example>"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  process: payload filter (m) -> vars.allowedSenders contains m.sender,
  errorFolder: [],
  alreadyDone: []
}
`,
  hints: [
    'Get the address with `((s splitBy "<")[-1] splitBy ">")[0]`. Without a `<`, the first split gives the whole text back.',
    'Lower case the allowed list once, before comparing.',
    'Work out one entry per mail with a `do` block: `done`, `sender`, `files` and `reason` (null when the mail is fine).',
    'Put brackets around `map` before `joinBy`, or the lambda takes the `joinBy` into its body.',
    '`not` covers the whole expression after it, so write `t.done == false` rather than `not t.done and ...`.',
  ],
  solution: `%dw 2.0
output application/json

fun addressOf(s) = lower(trim((((s default "") splitBy "<")[-1] splitBy ">")[0] default ""))

var allowed = vars.allowedSenders map (a) -> lower(trim(a))

var triaged = payload map (m) -> do {
  var sender = addressOf(m.sender)
  var csvs = (m.attachments default []) filter (a) -> lower(a.name default "") endsWith ".csv"
  var tooBig = csvs filter (a) -> a.sizeBytes > vars.maxBytes
  ---
  {
    messageId: m.messageId,
    done: vars.processedIds contains m.messageId,
    sender: sender,
    files: csvs map (a) -> a.name,
    reason:
      if (not (allowed contains sender)) "Sender not allowed"
      else if (isEmpty(csvs)) "No CSV attachment"
      else if (not isEmpty(tooBig)) "Attachment too large: " ++ ((tooBig map (a) -> a.name) joinBy ", ")
      else null
  }
}
---
{
  process: (triaged filter (t) -> t.done == false and t.reason == null) map (t) -> {
    messageId: t.messageId,
    sender: t.sender,
    files: t.files
  },
  errorFolder: (triaged filter (t) -> t.done == false and t.reason != null) map (t) -> {
    messageId: t.messageId,
    reason: t.reason
  },
  alreadyDone: (triaged filter (t) -> t.done) map (t) -> t.messageId
}`,
  explanation: `
**Decide before parsing.** Each mail gets one outcome before any file is read. The flow then moves mails to Processed or Error folders, so a bad mail does not fail on every poll.

**Message-ID first.** A mail that was handled before, for example after a crash before the move, is skipped. This makes the flow safe to repeat.

**Clean the sender.** The display name is free text and can say anything. Only the address is compared, in lower case on both sides. The From header can still be forged, so this list is one check among several.

**Pick files by name.** Signature images and other parts are ignored. The name check is case blind, because senders write \`.CSV\` and \`.csv\`.

**Size before content.** Checking the size from the attributes avoids loading a huge file into memory to find out it is too large.

**One pass, three lists.** Building one entry per mail and filtering it three ways keeps the rules in one place and keeps input order.
`,
  tests: [
    {
      name: 'Empty mailbox',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "allowedSenders": ["dock@harbourline.example"], "processedIds": [], "maxBytes": 1000 }' },
      ],
      expected: '{ "process": [], "errorFolder": [], "alreadyDone": [] }',
    },
    {
      name: 'No attachments key',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[{ "messageId": "<b1@mail.quayle.example>", "sender": "dock@harbourline.example" }]' },
        { name: 'vars', mime: 'application/json', content: '{ "allowedSenders": ["dock@harbourline.example"], "processedIds": [], "maxBytes": 1000 }' },
      ],
      expected: '{ "process": [], "errorFolder": [{ "messageId": "<b1@mail.quayle.example>", "reason": "No CSV attachment" }], "alreadyDone": [] }',
    },
  ],
  followUps: [
    {
      q: 'Why not trust the content type alone?',
      a: 'Mail clients set it differently. A CSV can arrive as text/plain or application/octet-stream. The file name is a steadier signal, and the parser validates the content anyway.',
    },
    {
      q: 'Where do processed Message-IDs come from?',
      a: 'From a table the flow writes when it finishes a mail. Querying only recent IDs keeps the list short.',
    },
    {
      q: 'Should the flow reply to a sender who is not allowed?',
      a: 'Usually not. Replies to unknown senders can confirm the mailbox exists to spammers. Alert the owner of the feed instead.',
    },
  ],
}
