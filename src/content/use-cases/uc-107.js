import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-107',
  category: 'use-cases',
  title: 'Idempotent Receiver for Stadium Gate Ticket Scans',
  level: 'BEGINNER',
  tags: ['idempotency', 'idempotent-receiver', 'anypoint-mq', 'dlq', 'object-store', 'retries'],
  estMinutes: 20,
  diagram: {
    task: 'draw the gate scan flow: the scanners, the Experience API, the entry Process API with its processed-scan store and entry state, the queue that feeds the ticketing platform, the consumer that updates it through a System API, and the dead-letter queue.',
    checks: [
      { label: 'Gate scanners call the Experience API', rule: { type: 'edge', from: 'device', to: 'experience-api', kind: 'sync' } },
      { label: 'The entry API checks the scan ID in a processed-scan store', rule: { type: 'edge', from: 'process-api', to: { type: ['cache', 'database'], label: ['scan id', 'processed', 'dedup', 'idempot'] } } },
      { label: 'Every Process API checks for duplicates, including the queue consumer', rule: { type: 'each', of: 'process-api', edgeTo: { type: ['cache', 'database'], label: ['scan id', 'processed', 'dedup', 'idempot'] } } },
      { label: 'Entry state per ticket is stored', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['entry', 'ticket state', 'used'] } } },
      { label: 'The ticketing platform is updated through a queue', rule: { type: 'path', from: 'process-api', via: 'queue', to: 'saas' } },
      { label: 'The gate never waits on the ticketing platform', rule: { type: 'no-path', from: 'device', to: 'saas', kind: 'sync' } },
      { label: 'The ticketing platform is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq' } },
    ],
    reference: diagram(
      {
        gate: ['device', 'Gate scanners (60 lanes)'],
        exp: ['experience-api', 'exp-gate-scan-api'],
        prc: ['process-api', 'prc-entry-validation'],
        ids: ['cache', 'Processed scan IDs (Object Store, 48 h)'],
        entry: ['database', 'Entry state per ticket'],
        q: ['queue', 'entries-to-ticketing'],
        push: ['process-api', 'prc-ticketing-sync'],
        st: ['system-api', 'sys-ticketing-api'],
        tk: ['saas', 'Ticketing platform'],
        dlq: ['dlq', 'entries-to-ticketing-dlq'],
      },
      ['gate -> exp', 'exp -> prc', 'prc -> ids', 'prc -> entry', 'prc ~> q', 'q ~> push', 'push -> ids', 'push -> st', 'st -> tk', 'q ~> dlq'],
    ),
  },
  description: `
A football stadium has **60 gate lanes** with handheld scanners. Each scan of a ticket barcode goes to an API that answers **open** or **reject** and records the entry.

Facts:
- 52,000 fans enter in about **75 minutes**, peaks of 40 scans per second.
- Stadium wifi is unreliable. When a scanner gets no answer in 2 seconds it **sends the same scan again** with the same \`scanId\` (a UUID made on the scanner). Some scans arrive 2 or 3 times.
- The ticketing platform (SaaS) must be told about each entry so that the ticket shows as used in the fan app and resale is blocked. Its API allows 10 calls per second and is sometimes slow.
- Anypoint MQ is already used at the club. Messages are delivered **at least once**.
- A ticket must open the gate once. A second attempt with a **different** scan (a screenshot shared with a friend) must be rejected.

**Describe your solution:**
- How do you make a repeated scan safe without opening the gate twice or rejecting the fan who is already standing there?
- How is the ticketing platform updated without slowing the gate?
- What happens when the same queue message is delivered twice?
`,
  answerTemplate: `## Scan flow

## Idempotent receiver

## Updating the ticketing platform

## Failures
`,
  keyPoints: [
    'The scanId is the idempotency key: a repeated scan returns the stored first answer instead of being processed again.',
    'A different scan of an already used ticket is a business rejection based on entry state, not a duplicate.',
    'The processed-scan record and the entry state are written before answering, with a TTL that covers the event day.',
    'The ticketing platform is updated asynchronously through Anypoint MQ, so the gate answers in milliseconds.',
    'The queue consumer is an idempotent receiver too, because Anypoint MQ can redeliver; failures after retries go to a DLQ.',
  ],
  solution: `
\`\`\`
 Scanner -> exp-gate-scan-api -> prc-entry-validation -> processed scan IDs (Object Store)
                                                     -> entry state per ticket
                                                     ~> [entries-to-ticketing] ~> prc-ticketing-sync -> sys-ticketing-api -> ticketing
                                                                               ~> [DLQ]
\`\`\`

**Scan flow.** The scanner posts \`{ scanId, barcode, gate, time }\`. The Process API:
1. Looks up \`scanId\` in the processed-scan store. If found, it returns the **stored answer** (open or reject). Nothing else happens. This is the idempotent receiver.
2. Otherwise it checks the entry state of the ticket. Not used: mark it used (conditional write: only if still unused), answer **open**. Already used: answer **reject: already entered at gate 14, 18:42**.
3. Stores \`scanId → answer\` with a 48 hour TTL and publishes an entry message.

The conditional write matters: two lanes scanning the same screenshot at the same moment must not both open. With a database, \`UPDATE ... SET used = 1 WHERE ticket = ? AND used = 0\` and check the row count.

**Idempotent receiver.** Mule 4 has the **Idempotent Message Validator** that rejects a repeated ID with \`MULE:DUPLICATE_MESSAGE\`. Here a duplicate must get the first answer back, not an error, so the flow stores and returns the answer itself. Both work on the same idea: a key from the message, a shared store, and a TTL.

**Updating the ticketing platform.** The entry message goes to \`entries-to-ticketing\`. prc-ticketing-sync consumes at a rate the SaaS allows (prefetch and a small number of consumers), calls sys-ticketing-api, then ACKs. If the SaaS is slow the queue grows, but the gates do not notice.

**Duplicate deliveries.** Anypoint MQ redelivers when a consumer crashes after the call but before the ACK. The consumer stores the \`scanId\` it has sent (or uses the Idempotent Message Validator on it), so the ticketing platform sees each entry once. Many ticketing APIs also accept an idempotency key header; send \`scanId\` there too.

**Failures.** After 5 delivery attempts the message moves to the DLQ. Operations get an alert and replay after the cause is fixed. The gate is not affected.
`,
  followUps: [
    { q: 'What is the difference between a duplicate scan and a second entry attempt?', a: 'A duplicate has the same scanId and gets the stored first answer. A second attempt has a new scanId for a used ticket and is rejected by the entry rule.' },
    { q: 'Why not rely on the Idempotent Message Validator alone at the gate?', a: 'It raises an error for a repeat, so the fan would get a reject on a retry. The gate needs the original answer returned.' },
    { q: 'How long should the processed-scan IDs be kept?', a: 'Longer than any retry or redelivery window, so 48 hours covers the match day. Keeping them forever only grows the store.' },
    { q: 'Why does the queue consumer need its own duplicate check?', a: 'Anypoint MQ delivers at least once. A crash between the API call and the ACK redelivers the message.' },
  ],
}
