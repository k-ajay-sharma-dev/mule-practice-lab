export default {
  id: 'dw-198',
  category: 'dataweave',
  title: 'Plan Which Failed Messages the Restart App Replays',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'restart', 'replay', 'idempotency', 'groupBy', 'json'],
  estMinutes: 28,
  description: `
Marrow & Pine Home runs a restart app next to its inbound adapter. It reads messages from a failure queue and puts them back on the main queue. Before each run it checks the database and blob storage. Some messages failed twice, so they appear more than once.

\`payload\` holds the failure queue entries with \`messageId\`, \`messageType\`, \`failedAt\`, \`attempt\` and \`errorType\`. \`vars\` holds:

- \`health\`: an object of checks, each \`UP\` or \`DOWN\`
- \`loadedIds\`: message IDs the job log already shows as loaded
- \`notReplayable\`: error types that will fail again, such as schema errors
- \`maxAttempts\` and \`maxReplay\` (the most messages to replay in one run)

**Rules**
1. Keep only the latest entry per message ID, by \`failedAt\`. Report how many entries were removed as \`duplicatesRemoved\`.
2. If any health check is not \`UP\`, replay nothing. Status is \`SKIPPED_UNHEALTHY\`, every message ID goes to \`hold\`, and \`replay\`, \`park\` and \`drop\` are empty lists.
3. Otherwise sort by \`failedAt\`, oldest first, and sort each message into one list:
   - \`drop\`: already loaded
   - \`park\`: error type not replayable (\`NOT_REPLAYABLE\`) or \`attempt\` at or above \`maxAttempts\` (\`MAX_ATTEMPTS\`), with \`messageId\` and \`reason\`
   - \`replay\`: the first \`maxReplay\` of the rest, with \`messageId\`, \`messageType\` and \`attempt\` as the next try number
   - \`hold\`: the rest, for the next run
4. Status is \`REPLAYING\` when something is replayed, otherwise \`NOTHING_TO_REPLAY\`.

\`drop\` and \`hold\` hold message IDs only. All lists keep the oldest first order. Return \`status\`, \`duplicatesRemoved\`, \`replay\`, \`park\`, \`drop\` and \`hold\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "messageId": "M-501", "messageType": "Item", "failedAt": "2026-11-18T01:10:00Z", "attempt": 1, "errorType": "DB:CONNECTIVITY" },
  { "messageId": "M-502", "messageType": "Barcode", "failedAt": "2026-11-18T01:12:00Z", "attempt": 1, "errorType": "SCHEMA:INVALID" },
  { "messageId": "M-503", "messageType": "SupplierItem", "failedAt": "2026-11-18T01:15:00Z", "attempt": 1, "errorType": "BLOB:TIMEOUT" },
  { "messageId": "M-501", "messageType": "Item", "failedAt": "2026-11-18T02:10:00Z", "attempt": 2, "errorType": "DB:CONNECTIVITY" },
  { "messageId": "M-504", "messageType": "Item", "failedAt": "2026-11-18T01:20:00Z", "attempt": 3, "errorType": "DB:CONNECTIVITY" },
  { "messageId": "M-505", "messageType": "TransferOrder", "failedAt": "2026-11-18T01:25:00Z", "attempt": 1, "errorType": "DB:CONNECTIVITY" },
  { "messageId": "M-506", "messageType": "Item", "failedAt": "2026-11-18T01:30:00Z", "attempt": 1, "errorType": "BLOB:TIMEOUT" },
  { "messageId": "M-507", "messageType": "Barcode", "failedAt": "2026-11-18T01:35:00Z", "attempt": 2, "errorType": "DB:CONNECTIVITY" }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "health": { "database": "UP", "blob": "UP" },
  "loadedIds": ["M-505"],
  "notReplayable": ["SCHEMA:INVALID", "APP:DUPLICATE"],
  "maxAttempts": 3,
  "maxReplay": 2
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "status": "REPLAYING",
  "duplicatesRemoved": 1,
  "replay": [
    { "messageId": "M-503", "messageType": "SupplierItem", "attempt": 2 },
    { "messageId": "M-506", "messageType": "Item", "attempt": 2 }
  ],
  "park": [
    { "messageId": "M-502", "reason": "NOT_REPLAYABLE" },
    { "messageId": "M-504", "reason": "MAX_ATTEMPTS" }
  ],
  "drop": ["M-505"],
  "hold": ["M-507", "M-501"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  replay: payload filter (m) -> not (vars.loadedIds contains m.messageId)
}
`,
  hints: [
    'Group by `messageId`, then keep the last entry of each group after sorting it by `failedAt`.',
    'ISO date and time strings in the same format sort correctly as text.',
    'Healthy means `isEmpty(vars.health filterObject (v) -> v != "UP")`.',
    'Tag each message with a reason (`ALREADY_LOADED`, `NOT_REPLAYABLE`, `MAX_ATTEMPTS` or `OK`), then filter by the tag. Use the index in `filter ((m, i) -> ...)` to split replay and hold.',
  ],
  solution: `%dw 2.0
output application/json

var latest = (payload groupBy (m) -> m.messageId)
  pluck (entries, id) -> (entries orderBy (m) -> m.failedAt)[-1]
var ordered = latest orderBy (m) -> m.failedAt
var healthy = isEmpty(vars.health filterObject (v) -> v != "UP")

fun reasonOf(m) =
  if (vars.loadedIds contains m.messageId) "ALREADY_LOADED"
  else if (vars.notReplayable contains m.errorType) "NOT_REPLAYABLE"
  else if (m.attempt >= vars.maxAttempts) "MAX_ATTEMPTS"
  else "OK"

var tagged = ordered map (m) -> m ++ { reason: reasonOf(m) }
var candidates = tagged filter (m) -> m.reason == "OK"
var replay = candidates filter (m, i) -> i < vars.maxReplay
var dupes = sizeOf(payload) - sizeOf(latest)
---
if (not healthy) {
  status: "SKIPPED_UNHEALTHY",
  duplicatesRemoved: dupes,
  replay: [],
  park: [],
  drop: [],
  hold: ordered map (m) -> m.messageId
}
else {
  status: if (isEmpty(replay)) "NOTHING_TO_REPLAY" else "REPLAYING",
  duplicatesRemoved: dupes,
  replay: replay map (m) -> { messageId: m.messageId, messageType: m.messageType, attempt: m.attempt + 1 },
  park: (tagged filter (m) -> m.reason == "NOT_REPLAYABLE" or m.reason == "MAX_ATTEMPTS")
    map (m) -> { messageId: m.messageId, reason: m.reason },
  drop: (tagged filter (m) -> m.reason == "ALREADY_LOADED") map (m) -> m.messageId,
  hold: (candidates filter (m, i) -> i >= vars.maxReplay) map (m) -> m.messageId
}`,
  explanation: `
**Check health first.** Replaying into a database that is down makes every message fail again and raises its attempt count. The restart app checks its targets and waits when one is down.

**One entry per message.** A message that failed twice sits on the queue twice. Replaying both would load it twice or fail as a duplicate. Keep the latest entry, since it has the newest attempt count.

**Never replay what is done.** The job log knows which messages loaded. A message that loaded on a later try is dropped, not replayed.

**Park what will fail again.** A schema error will not fix itself. It goes to a parking place with its reason, so someone can repair the source.

**Small runs, oldest first.** A cap per run stops a replay storm from flooding the main adapter after an outage. The oldest messages go first, so nothing waits forever.
`,
  tests: [
    {
      name: 'Blob storage is down',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "messageId": "M-601", "messageType": "Item", "failedAt": "2026-11-19T01:00:00Z", "attempt": 1, "errorType": "BLOB:TIMEOUT" }, { "messageId": "M-600", "messageType": "Item", "failedAt": "2026-11-19T00:30:00Z", "attempt": 1, "errorType": "BLOB:TIMEOUT" }]',
        },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "health": { "database": "UP", "blob": "DOWN" }, "loadedIds": [], "notReplayable": ["SCHEMA:INVALID"], "maxAttempts": 3, "maxReplay": 10 }',
        },
      ],
      expected: '{ "status": "SKIPPED_UNHEALTHY", "duplicatesRemoved": 0, "replay": [], "park": [], "drop": [], "hold": ["M-600", "M-601"] }',
    },
    {
      name: 'Only loaded and parked messages',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "messageId": "M-701", "messageType": "Item", "failedAt": "2026-11-19T02:00:00Z", "attempt": 1, "errorType": "DB:CONNECTIVITY" }, { "messageId": "M-702", "messageType": "Barcode", "failedAt": "2026-11-19T02:05:00Z", "attempt": 1, "errorType": "APP:DUPLICATE" }]',
        },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "health": { "database": "UP", "blob": "UP" }, "loadedIds": ["M-701"], "notReplayable": ["SCHEMA:INVALID", "APP:DUPLICATE"], "maxAttempts": 3, "maxReplay": 5 }',
        },
      ],
      expected:
        '{ "status": "NOTHING_TO_REPLAY", "duplicatesRemoved": 0, "replay": [], "park": [{ "messageId": "M-702", "reason": "NOT_REPLAYABLE" }], "drop": ["M-701"], "hold": [] }',
    },
  ],
  followUps: [
    {
      q: 'What makes the replay itself safe to repeat?',
      a: 'The main adapter checks the message ID against the job log before loading. A message replayed twice is then refused as a duplicate.',
    },
    {
      q: 'Why not replay messages straight from the error handler of the main flow?',
      a: 'An instant retry often hits the same outage. A separate app run later, after a health check, has a better chance and keeps the main flow fast.',
    },
    {
      q: 'Where do parked messages go?',
      a: 'To a parking queue or a table with the reason, plus an alert. They leave the failure queue, so later runs skip them.',
    },
  ],
}
