export default {
  id: 'dw-206',
  category: 'dataweave',
  title: 'Read the Account, Container and Blob Name From a Claim Check URL',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-blob', 'claim-check', 'url', 'validation', 'json'],
  estMinutes: 15,
  description: `
Brindle Outdoor sends item files to its product data hub with a claim check. A small queue message carries a blob URL, and the hub downloads the file. The download operation wants the container and the blob name, not the URL. The hub must also refuse URLs that point anywhere else.

\`payload\` has \`messageId\` and \`blobUrl\`. \`vars\` has \`expectedAccount\` and \`expectedContainer\`. A blob URL looks like \`https://<account>.blob.core.windows.net/<container>/<blob name>\`.

**Rules**
- Drop everything from \`?\` onwards. That part can hold a SAS token, which must never reach a log.
- \`account\` is the host up to the first dot. \`container\` is the first path segment. \`blobName\` is the rest of the path.
- \`fileName\` is the last segment of the blob name. \`folder\` is the blob name without it and its slash, or \`""\`. With no blob name, \`blobName\`, \`folder\` and \`fileName\` are all \`""\`.
- \`hadQuery\` is \`true\` when the URL had a \`?\` part.
- \`reason\` is the first that applies: \`NOT_HTTPS\`, \`WRONG_ACCOUNT\`, \`WRONG_CONTAINER\`, \`NO_BLOB_NAME\`, otherwise \`null\`.
- \`valid\` is \`true\` when \`reason\` is \`null\`.

Output \`messageId\`, \`account\`, \`container\`, \`blobName\`, \`folder\`, \`fileName\`, \`hadQuery\`, \`valid\` and \`reason\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "messageId": "ID:hub-9012",
  "blobUrl": "https://brindlehubdata.blob.core.windows.net/inbound/item/2026/11/18/item_9012.json?sv=2024-01-01&sig=REDACTED"
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "expectedAccount": "brindlehubdata", "expectedContainer": "inbound" }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "messageId": "ID:hub-9012",
  "account": "brindlehubdata",
  "container": "inbound",
  "blobName": "item/2026/11/18/item_9012.json",
  "folder": "item/2026/11/18",
  "fileName": "item_9012.json",
  "hadQuery": true,
  "valid": true,
  "reason": null
}`,
  },
  starterCode: `%dw 2.0
output application/json
var parts = payload.blobUrl splitBy "/"
---
{
  messageId: payload.messageId,
  container: parts[3]
}
`,
  hints: [
    'Cut the query first: `(payload.blobUrl splitBy "?")[0]`.',
    'Remove the scheme with `replace /^[a-z]+:\\/\\// with ""`, then split the rest on `/`.',
    'Index `-1` gives the last item of an array, and `[0 to -2]` all but the last.',
  ],
  solution: `%dw 2.0
output application/json

var url = (payload.blobUrl splitBy "?")[0]
var https = url startsWith "https://"
var parts = (url replace /^[a-z]+:\\/\\// with "") splitBy "/"
var account = (parts[0] splitBy ".")[0]
var container = parts[1] default ""
var blobParts = if (sizeOf(parts) > 2) parts[2 to -1] else []
var reason =
  if (not https) "NOT_HTTPS"
  else if (account != vars.expectedAccount) "WRONG_ACCOUNT"
  else if (container != vars.expectedContainer) "WRONG_CONTAINER"
  else if (isEmpty(blobParts)) "NO_BLOB_NAME"
  else null
---
{
  messageId: payload.messageId,
  account: account,
  container: container,
  blobName: blobParts joinBy "/",
  folder: if (sizeOf(blobParts) > 1) blobParts[0 to -2] joinBy "/" else "",
  fileName: blobParts[-1] default "",
  hadQuery: payload.blobUrl contains "?",
  valid: reason == null,
  reason: reason
}`,
  explanation: `
**Never trust the pointer blindly.** A claim check message tells the hub where to read. Checking the account and container stops a wrong or crafted message from making the hub read another store.

**Strip the query before anything else.** A SAS token in a URL is a key. Cutting it off first means no later log line or error message can print it.

**Blob names hold slashes.** Blob storage has a flat name space. The slashes are part of the name, and tools show them as folders. The download needs the whole name after the container.
`,
  tests: [
    {
      name: 'Wrong container',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "messageId": "ID:hub-9013", "blobUrl": "https://brindlehubdata.blob.core.windows.net/archive/item_9013.json" }' },
        { name: 'vars', mime: 'application/json', content: '{ "expectedAccount": "brindlehubdata", "expectedContainer": "inbound" }' },
      ],
      expected:
        '{ "messageId": "ID:hub-9013", "account": "brindlehubdata", "container": "archive", "blobName": "item_9013.json", "folder": "", "fileName": "item_9013.json", "hadQuery": false, "valid": false, "reason": "WRONG_CONTAINER" }',
    },
    {
      name: 'Plain http and no blob name',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "messageId": "ID:hub-9014", "blobUrl": "http://brindlehubdata.blob.core.windows.net/inbound" }' },
        { name: 'vars', mime: 'application/json', content: '{ "expectedAccount": "brindlehubdata", "expectedContainer": "inbound" }' },
      ],
      expected:
        '{ "messageId": "ID:hub-9014", "account": "brindlehubdata", "container": "inbound", "blobName": "", "folder": "", "fileName": "", "hadQuery": false, "valid": false, "reason": "NOT_HTTPS" }',
    },
    {
      name: 'Another storage account',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "messageId": "ID:hub-9015", "blobUrl": "https://otherstore.blob.core.windows.net/inbound/a/b.json" }' },
        { name: 'vars', mime: 'application/json', content: '{ "expectedAccount": "brindlehubdata", "expectedContainer": "inbound" }' },
      ],
      expected:
        '{ "messageId": "ID:hub-9015", "account": "otherstore", "container": "inbound", "blobName": "a/b.json", "folder": "a", "fileName": "b.json", "hadQuery": false, "valid": false, "reason": "WRONG_ACCOUNT" }',
    },
  ],
  followUps: [
    {
      q: 'Why not send the SAS token inside the queue message?',
      a: 'Anyone who reads the queue or its logs could then read the blob. The consumer should hold its own credential and get only the location.',
    },
    {
      q: 'What else would you check before downloading?',
      a: 'That the blob exists and its size and checksum match the values in the notification, so a truncated upload is caught early.',
    },
    {
      q: 'Can blob names contain spaces or other special characters?',
      a: 'Yes. In the URL they appear percent encoded, so decode the name before comparing it with what the sender listed.',
    },
  ],
}
