export default {
  id: 'dw-162',
  category: 'dataweave',
  title: 'Find Claim Check Blobs That Were Never Marked Processed',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-blob', 'claim-check', 'last-modified', 'dates', 'filter', 'orderBy', 'product-data-hub', 'json'],
  estMinutes: 25,
  description: `
Kestrel Home Supply runs a product data hub. Each GS1 style message arrives as a JSON file in Azure Blob Storage under \`inbound/<message type>/\`, with a small JMS notification that points to it. When the hub has loaded a file, it sets the blob metadata \`status\` to \`PROCESSED\`. When a load fails for good, it sets \`FAILED\`.

Sometimes a notification is lost, so a file is never loaded. A check runs every hour on a list of blobs and their metadata. Sort them out:

1. Ignore blobs whose name does not start with \`inbound/\`, and blobs with status \`PROCESSED\`.
2. \`failed\`: names of blobs with status \`FAILED\`, in input order.
3. A blob with no status is \`stuck\` when its \`lastModified\` is at least \`graceMinutes\` before \`runAt\`. A newer one may still be loading, so it goes to \`inProgress\` (names, in input order).
4. Each \`stuck\` entry has \`name\`, \`messageType\` (the part of the name between the first and second \`/\`) and \`ageMinutes\` (whole minutes from \`lastModified\` to \`runAt\`, rounded down, so 29 minutes 50 seconds is 29). Use this whole minute age for the grace check too. Sort them oldest first.
5. \`checkedAt\` is \`runAt\`, as text.

Output the keys in the order \`checkedAt\`, \`stuck\`, \`inProgress\`, \`failed\`. Each list is empty when nothing matches.

A blob may have no \`metadata\` at all.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "runAt": "2026-11-18T10:00:00Z",
  "graceMinutes": 30,
  "blobs": [
    { "name": "inbound/item/IT-901.json", "lastModified": "2026-11-18T09:10:00Z", "metadata": { "status": "PROCESSED", "jobid": "90398" } },
    { "name": "inbound/receivingadvice/RA-55121.json", "lastModified": "2026-11-18T08:20:00Z", "metadata": {} },
    { "name": "inbound/transferorder/TO-34.json", "lastModified": "2026-11-18T09:45:00Z", "metadata": {} },
    { "name": "inbound/barcode/BC-7710.json", "lastModified": "2026-11-18T07:05:00Z", "metadata": { "status": "FAILED" } },
    { "name": "archive/item/IT-500.json", "lastModified": "2026-11-18T01:00:00Z", "metadata": {} },
    { "name": "inbound/item/IT-902.json", "lastModified": "2026-11-18T09:30:00Z" }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "checkedAt": "2026-11-18T10:00:00Z",
  "stuck": [
    { "name": "inbound/receivingadvice/RA-55121.json", "messageType": "receivingadvice", "ageMinutes": 100 },
    { "name": "inbound/item/IT-902.json", "messageType": "item", "ageMinutes": 30 }
  ],
  "inProgress": ["inbound/transferorder/TO-34.json"],
  "failed": ["inbound/barcode/BC-7710.json"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var runAt = payload.runAt as DateTime
---
{
  checkedAt: payload.runAt,
  stuck: payload.blobs filter (b) -> b.metadata.status == null,
  inProgress: [],
  failed: []
}
`,
  hints: [
    '`b.metadata.status` is null both when the status is missing and when there is no metadata at all, so one check covers both.',
    'A DateTime turned into a Number gives seconds since 1970. Subtract two of them and divide by 60 for minutes.',
    'Work out the age once per blob in a first `map`, then filter that list three ways.',
    '`(name splitBy "/")[1]` gives the message type.',
  ],
  solution: `%dw 2.0
output application/json
var runAt = payload.runAt as DateTime

fun minutesBetween(from, to) = ((to as Number) - (from as Number)) / 60

var open = (payload.blobs filter (b) -> (b.name startsWith "inbound/") and b.metadata.status != "PROCESSED")
  map (b) -> {
    name: b.name,
    status: b.metadata.status,
    ageMinutes: floor(minutesBetween(b.lastModified as DateTime, runAt))
  }

var unmarked = open filter (b) -> b.status == null
---
{
  checkedAt: payload.runAt,
  stuck: (unmarked filter (b) -> b.ageMinutes >= payload.graceMinutes)
    orderBy -$.ageMinutes
    map (b) -> {
      name: b.name,
      messageType: (b.name splitBy "/")[1],
      ageMinutes: b.ageMinutes
    },
  inProgress: (unmarked filter (b) -> b.ageMinutes < payload.graceMinutes) map $.name,
  failed: (open filter (b) -> b.status == "FAILED") map $.name
}`,
  explanation: `
**Why a sweep.** In a claim check design the queue message and the blob travel apart. If the notification is lost, or its flow fails before the load, the blob sits in the container and nobody knows. A sweep over the blobs finds that gap from the storage side.

**Metadata as the marker.** The hub sets \`status\` on the blob when it finishes. A missing status means "never finished", which is what the sweep looks for. Since metadata comes back with the list call when asked for, one list is enough.

**The grace period.** A blob written a few minutes ago may still be in the middle of a normal load. Calling it stuck would cause a second load. Only blobs older than the grace period count, and the period should be longer than the slowest normal load.

**Ages in minutes.** A DateTime as a Number is seconds since 1970, so the difference divided by 60 is minutes. \`floor\` keeps whole minutes, so 29 minutes and 50 seconds is still under a 30 minute grace.

**Oldest first.** Sorting by \`-ageMinutes\` puts the longest waiting file at the top, which is the one support should look at first.
`,
  tests: [
    {
      name: 'Everything processed',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "runAt": "2026-11-18T12:00:00Z", "graceMinutes": 30, "blobs": [{ "name": "inbound/item/IT-910.json", "lastModified": "2026-11-18T11:00:00Z", "metadata": { "status": "PROCESSED" } }] }',
        },
      ],
      expected: '{ "checkedAt": "2026-11-18T12:00:00Z", "stuck": [], "inProgress": [], "failed": [] }',
    },
    {
      name: 'Seconds short of the grace period',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "runAt": "2026-11-18T12:00:00Z", "graceMinutes": 30, "blobs": [{ "name": "inbound/barcode/BC-1.json", "lastModified": "2026-11-18T11:30:10Z" }, { "name": "inbound/barcode/BC-2.json", "lastModified": "2026-11-18T09:00:00Z", "metadata": {} }] }',
        },
      ],
      expected:
        '{ "checkedAt": "2026-11-18T12:00:00Z", "stuck": [{ "name": "inbound/barcode/BC-2.json", "messageType": "barcode", "ageMinutes": 180 }], "inProgress": ["inbound/barcode/BC-1.json"], "failed": [] }',
    },
  ],
  followUps: [
    {
      q: 'How should the hub load a stuck blob?',
      a: 'Publish a new notification for it, the same way the restart app republishes. The normal flow then runs every check, including the duplicate check on the sender document id.',
    },
    {
      q: 'The container holds a million processed blobs. Is listing them every hour a problem?',
      a: 'Yes, the list grows with every file. Move processed blobs to another prefix or container, or let a lifecycle rule remove them, so the inbound prefix only holds open work.',
    },
    {
      q: 'Why not use Last-Modified alone without the status metadata?',
      a: 'Age alone cannot tell a loaded file from a lost one. Setting metadata also changes Last-Modified, so the status value is the reliable marker.',
    },
  ],
}
