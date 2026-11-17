export default {
  id: 'inc-186',
  category: 'incidents',
  title: 'Refunds Paid Twice a Day Later: Idempotency Keys Expire After One Hour While the Partner Retries for a Day',
  level: 'ADVANCED',
  tags: ['idempotency', 'object-store', 'ttl', 'retries', 'payments'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-18 09:00:12 INFO  [refund-api] POST /refunds key=rf-55120 stored, refund paid amount=89.00', relevant: true, why: 'The first request was processed and its key stored.' },
      { text: '2026-11-18 09:00:42 WARN  [partner-gw] No response from refund-api within 30 s, will retry', relevant: true, why: 'The answer was lost, so the partner will retry.' },
      { text: '2026-11-18 09:30:05 INFO  [refund-api] POST /refunds key=rf-55120 duplicate, returning stored response', relevant: true, why: 'A retry inside the hour was caught.' },
      { text: '2026-11-18 14:12:30 INFO  [refund-api] GET /health 200', relevant: false },
      { text: '2026-11-18 21:00:09 INFO  [refund-api] POST /refunds key=rf-55120 stored, refund paid amount=89.00', relevant: true, why: 'Twelve hours later the key had expired, so the same refund was paid again.' },
      { text: '2026-11-18 21:00:10 INFO  [refund-api] Object store idempotency-keys entryTtl=1h', relevant: true, why: 'Keys live for one hour, much shorter than the partner retry window.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why was the refund paid a second time?',
        options: [
          'The key expired after one hour, and the partner retried twelve hours later, so the key looked new',
          'The partner sent a different key',
          'The Object Store lost all its data',
          'The refund API ignores keys after 9 PM',
        ],
        answer: 0,
        explain: 'The idempotency check works only while the key is stored. The partner retries for up to 24 hours, so a one hour time to live leaves 23 hours unprotected.',
      },
      {
        type: 'single',
        prompt: 'How long should the keys be kept?',
        options: [
          'At least as long as the longest retry window of any caller, with a margin',
          'One minute, to save space',
          'Exactly one hour, as now',
          'Forever, in memory',
        ],
        answer: 0,
        explain: 'The key must outlive every retry. Keeping keys in a persistent store with a time to live longer than the retry window closes the gap.',
      },
      {
        type: 'multi',
        prompt: 'What should happen right away?',
        options: [
          'Find refunds paid twice by searching for the same key paid more than once',
          'Recover the double payments with finance',
          'Raise the key time to live above the partner retry window',
          'Ask the partner to stop retrying altogether',
        ],
        answer: [0, 1, 2],
        explain: 'Find and recover the damage and close the gap. Retries are what make the partner reliable, so stopping them would cause lost refunds instead.',
      },
      {
        type: 'single',
        prompt: 'What extra protection would stop a double refund even if a key expired?',
        options: [
          'A business check that the total refunded for an order cannot exceed what was paid',
          'A shorter timeout on the partner side',
          'Logging at DEBUG',
          'A second Object Store with the same time to live',
        ],
        answer: 0,
        explain: 'An idempotency key stops repeats of one request. A rule on the order total stops any refund that would pay out more than was taken.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Raise the key time to live above the partner retry window',
          'Find refunds paid twice since the setting was added',
          'Recover the double payments with finance',
          'Add a check that refunds never exceed the amount paid',
          'Record each caller\'s retry window in the API contract',
        ],
        explain: 'Close the gap, find and recover the damage, add a business guard, then make retry windows part of the contract.',
      },
    ],
  },
  description: `
## Symptoms
- A retailer's \`refund-api\` receives refund requests from a marketplace partner with an \`Idempotency-Key\` header.
- Finance found refunds paid twice, usually hours apart.

## Change / Context
- The API stores each key in an Object Store with the response. A repeat key returns the stored response.
- A developer set \`entryTtl\` to one hour to keep the store small.
- The partner's documentation says it retries a request without an answer for up to 24 hours, with growing gaps between tries.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:00:12 INFO  [refund-api] POST /refunds key=rf-55120 stored, refund paid amount=89.00
2026-11-18 09:30:05 INFO  [refund-api] POST /refunds key=rf-55120 duplicate, returning stored response
2026-11-18 21:00:09 INFO  [refund-api] POST /refunds key=rf-55120 stored, refund paid amount=89.00
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'An idempotency check works only while the key is stored.',
    'The key time to live must be longer than the longest caller retry window.',
    'Keep keys in a persistent store shared by every replica.',
    'A business rule on the order total is a second line of defence.',
    'Find double refunds by searching for keys paid more than once.',
    'Write retry windows into the API contract.',
  ],
  solution: `
**Diagnosis.** Keys live for one hour, but the partner retries for up to 24 hours. A retry after the hour finds no key, so the API treats it as new and pays again.

**Immediate mitigation.**
- Raise the key time to live to more than 24 hours, such as 48 hours.
- Search the logs or the refund table for keys paid more than once, and recover the payments with finance.

**Root cause.** The time to live was chosen to save space, without checking how long callers retry. The two settings were owned by different teams and never compared.

**Permanent fix.**
- Keep keys with their stored response in a persistent store shared by all replicas, for longer than any caller's retry window.
- Add a business check that the total refunded for an order never exceeds the amount paid.

**Prevention.** Record each caller's retry window in the API contract and review the key time to live against it. Alert when the same key is processed twice.
`,
  followUps: [
    { q: 'Is a very long time to live a problem?', a: 'It uses more storage. Size it from the longest retry window with a margin, and check the store can hold that many keys.' },
    { q: 'Why keep the stored response and not only the key?', a: 'A retry should get the same answer as the first request, so the caller knows the outcome without a second refund.' },
    { q: 'What if two copies of a request arrive at the same moment?', a: 'Store the key before doing the work, as a lock, so the second copy sees it and waits or gets a conflict.' },
    { q: 'Why add a business check if the key works?', a: 'Keys protect against repeats of one request. The order total rule also catches bugs, wrong keys and manual mistakes.' },
  ],
}
