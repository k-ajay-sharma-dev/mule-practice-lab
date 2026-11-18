export default {
  id: 'dw-159',
  category: 'dataweave',
  title: 'Release Account Messages in Sequence and Hold Back After a Gap',
  level: 'EXPERT',
  tags: ['myproject', 'queues', 'ordering', 'sequence-gaps', 'reduce', 'groupBy', 'distinctBy', 'banking', 'json'],
  estMinutes: 35,
  description: `
Fairhollow Building Society posts account movements that arrive on a queue. Each message has an \`accountId\` and a \`seq\` number that the core system gives per account: 1, 2, 3 and so on. Several consumers read the queue in parallel, so messages can arrive out of order, and a redelivery can bring the same message twice.

Movements for one account must be posted strictly in \`seq\` order. A flow collects what arrived in the last few seconds and asks DataWeave what it may post.

The input has \`lastProcessed\`, the last \`seq\` posted per account (an account that is not listed starts at 0), and \`messages\`. Work out:

1. **Duplicates:** a message whose \`seq\` is at or below the account's last processed value, or whose account and \`seq\` already appeared earlier in this input. List their \`messageId\`s in \`duplicates\`, in input order.
2. **Per account**, for the other messages in \`seq\` order: release messages while each one is exactly the next \`seq\` expected. From the first gap on, hold everything.
3. \`accounts\`: sorted by account id, each with \`accountId\`, \`release\` (message ids in \`seq\` order), \`hold\` (message ids in \`seq\` order) and \`nextExpected\`.
4. \`lastProcessed\`: the input map with new values for the accounts in this run. Accounts not in the input map are added at the end, sorted by id.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "lastProcessed": { "ACC-0": 12, "ACC-1": 4, "ACC-2": 0 },
  "messages": [
    { "messageId": "x1", "accountId": "ACC-1", "seq": 6 },
    { "messageId": "x2", "accountId": "ACC-2", "seq": 1 },
    { "messageId": "x3", "accountId": "ACC-1", "seq": 5 },
    { "messageId": "x4", "accountId": "ACC-1", "seq": 4 },
    { "messageId": "x5", "accountId": "ACC-2", "seq": 3 },
    { "messageId": "x6", "accountId": "ACC-3", "seq": 1 },
    { "messageId": "x7", "accountId": "ACC-1", "seq": 8 },
    { "messageId": "x8", "accountId": "ACC-2", "seq": 1 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "accounts": [
    { "accountId": "ACC-1", "release": ["x3", "x1"], "hold": ["x7"], "nextExpected": 7 },
    { "accountId": "ACC-2", "release": ["x2"], "hold": ["x5"], "nextExpected": 2 },
    { "accountId": "ACC-3", "release": ["x6"], "hold": [], "nextExpected": 2 }
  ],
  "duplicates": ["x4", "x8"],
  "lastProcessed": { "ACC-0": 12, "ACC-1": 6, "ACC-2": 1, "ACC-3": 1 }
}`,
  },
  starterCode: `%dw 2.0
output application/json
var last = payload.lastProcessed
---
{
  accounts: payload.messages groupBy $.accountId pluck (msgs, id) -> {
    accountId: id as String,
    release: (msgs orderBy $.seq) map $.messageId
  },
  duplicates: [],
  lastProcessed: last
}
`,
  hints: [
    'Write `fun lastOf(id) = last[id] default 0` so unknown accounts start at 0.',
    'Drop old messages with a filter on `seq > lastOf(accountId)`. Then `distinctBy` on account and seq together keeps the first copy of each.',
    'A duplicate is any input message whose id is not in the kept list.',
    'For one account, sort by seq and `reduce` with an accumulator such as `{ next: lastOf(id) + 1, release: [], hold: [] }`. A message equal to `next` is released and moves `next` on. Any other message is held.',
    'For `lastProcessed`, rebuild the old map with `mapObject`, then add the new accounts with `++`.',
  ],
  solution: `%dw 2.0
output application/json
var last = payload.lastProcessed default {}
fun lastOf(id) = last[id] default 0

var fresh = payload.messages filter (m) -> m.seq > lastOf(m.accountId)
var unique = fresh distinctBy (m) -> m.accountId ++ "#" ++ (m.seq as String)
var keptIds = unique map $.messageId

fun plan(id, msgs) = do {
  var run = (msgs orderBy $.seq) reduce ((m, acc = { next: lastOf(id) + 1, release: [], hold: [] }) ->
    if (m.seq == acc.next) { next: acc.next + 1, release: acc.release ++ [m.messageId], hold: acc.hold }
    else { next: acc.next, release: acc.release, hold: acc.hold ++ [m.messageId] })
  ---
  { accountId: id, release: run.release, hold: run.hold, nextExpected: run.next }
}

var accounts = (unique groupBy $.accountId pluck (msgs, id) -> plan(id as String, msgs)) orderBy $.accountId
var done = { (accounts map (a) -> { (a.accountId): a.nextExpected - 1 }) }
---
{
  accounts: accounts,
  duplicates: (payload.messages filter (m) -> not (keptIds contains m.messageId)) map $.messageId,
  lastProcessed: (last mapObject (v, k) -> { (k): done[k as String] default v })
    ++ (done filterObject (v, k) -> not (namesOf(last) contains (k as String)))
}`,
  explanation: `
**Why order breaks.** A queue keeps order only when one consumer reads it one message at a time. Parallel consumers, retries and redelivery all mix the order. When the business needs order per account, the consumer has to restore it from a sequence number.

**Two kinds of duplicate.** A \`seq\` at or below \`lastProcessed\` was already posted in an earlier run. A repeated account and \`seq\` inside this input is a redelivery. \`distinctBy\` keeps the first copy, and the duplicates are every message that was not kept.

**The reduce.** The accumulator holds the next \`seq\` expected and two lists. Since the list is sorted and has no repeats, once one \`seq\` is missing, no later message can match \`next\`, so everything after a gap is held.

**Accounts in parallel.** Each account is planned on its own. ACC-1 waiting for seq 7 does not stop ACC-3, which is the reason to order per key and not per queue.

**Updating the state.** \`nextExpected - 1\` is the last posted \`seq\`. The flow stores the new \`lastProcessed\` only after the released movements are posted. Held messages wait in a store or go back to the queue until the gap fills.
`,
  tests: [
    {
      name: 'Nothing new arrived',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "lastProcessed": { "ACC-5": 9 }, "messages": [] }' }],
      expected: '{ "accounts": [], "duplicates": [], "lastProcessed": { "ACC-5": 9 } }',
    },
    {
      name: 'Only messages after a gap',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "lastProcessed": { "ACC-7": 2 }, "messages": [{ "messageId": "k2", "accountId": "ACC-7", "seq": 5 }, { "messageId": "k1", "accountId": "ACC-7", "seq": 4 }] }',
        },
      ],
      expected: '{ "accounts": [{ "accountId": "ACC-7", "release": [], "hold": ["k1", "k2"], "nextExpected": 3 }], "duplicates": [], "lastProcessed": { "ACC-7": 2 } }',
    },
  ],
  followUps: [
    {
      q: 'Seq 7 for ACC-1 never arrives. What should happen?',
      a: 'Raise an alert after a set wait, since the held movements block that account. Someone must find the missing movement in the core system or approve skipping it.',
    },
    {
      q: 'Could a FIFO queue remove the need for this logic?',
      a: 'It helps if the producer sends in order and one consumer reads at a time. It does not fix a producer that sends out of order, and it limits throughput to that one consumer.',
    },
    {
      q: 'Where do you keep lastProcessed and the held messages?',
      a: 'In a persistent store such as Object Store or a database table keyed by account. Memory is lost on a restart, and a lost value would post movements twice or never.',
    },
  ],
}
