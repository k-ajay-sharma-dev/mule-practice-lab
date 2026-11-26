export default {
  id: 'ms-217',
  category: 'mulesoft',
  title: 'Idempotent Message Validator: Stopping Duplicate Webhooks',
  level: 'INTERMEDIATE',
  tags: ['idempotency', 'idempotent-message-validator', 'object-store', 'webhooks', 'error-handling', 'payments'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A payment provider sends a webhook for each settled payment and retries when it gets no 2xx in time. Each webhook has an `eventId`. What should the `idExpression` of the Idempotent Message Validator be?',
      options: [
        '`#[correlationId]`, the default, which Mule keeps on a retry',
        '`#[now()]`, so retries in the same second share one key',
        '`#[payload.eventId]`, the id the provider keeps on retries',
        '`#[uuid()]`, so the key is unique to each payment event',
      ],
      answer: 2,
      explain: 'The key must be the same on a retry. The provider keeps `eventId` the same. A new correlation id, time or uuid is created for each call, so every retry would look new.',
    },
    {
      type: 'single',
      prompt: 'The validator sees an `eventId` it has stored already. What happens?',
      options: [
        'It raises a `MULE:DUPLICATE_MESSAGE` error',
        'It sets the payload to null and the flow goes on',
        'It logs a warning and the flow goes on as normal',
        'It waits until the first message has finished',
      ],
      answer: 0,
      explain: 'A duplicate raises `MULE:DUPLICATE_MESSAGE`. Without a handler for it, the caller gets an error response.',
    },
    {
      type: 'single',
      prompt: 'How should the webhook flow answer a duplicate?',
      options: [
        'With a 500, so the provider records the duplicate as failed',
        'With a 409 from an On Error Propagate, marking a conflict',
        'With a 503, so the provider sends the event again later',
        'With a 200 from an On Error Continue for the duplicate',
      ],
      answer: 3,
      explain: 'The event was handled the first time. Catch `MULE:DUPLICATE_MESSAGE` in an On Error Continue and return a 200, which tells the provider to stop. An error code such as 409, 500 or 503 makes it retry again and again.',
    },
    {
      type: 'single',
      prompt: 'The app runs on two CloudHub 2.0 replicas, and the validator uses an in-memory object store. A retry lands on the other replica. What happens?',
      options: [
        'The retry is refused, because the in-memory store is shared by replicas',
        'The retry is processed again, because each replica has its own memory',
        'The retry is forwarded to the replica that stored the key, which refuses it',
        'The retry waits until the replicas have synced their in-memory keys',
      ],
      answer: 1,
      explain: 'Memory is not shared between replicas. Use a persistent object store, which on CloudHub is Object Store v2 and is shared by the replicas of the app.',
    },
    {
      type: 'single',
      prompt: 'The database insert after the validator can fail, and the provider then retries the webhook. How do you make sure the retry can still insert the payment?',
      options: [
        'Set a short entry TTL on the store, so the key is gone before the retry arrives',
        'Remove the key with `os:remove` in the error handler of the flow',
        'Catch the insert error with On Error Continue, so the provider gets a 2xx',
        'Move the validator after the insert, so the key is stored only for saved payments',
      ],
      answer: 1,
      explain: 'The validator stores the key in its object store, and the docs do not promise that a later failure in the flow takes it out. Clear the key yourself on failure, or keep your own record of processed ids and write it only after the work succeeds. A short TTL lets real duplicates through once it runs out, and the retry may still come sooner. A 2xx after a failed insert tells the provider the payment was saved, so it stops retrying and the payment is lost. A validator after the insert lets a duplicate insert run before it is checked.',
    },
    {
      type: 'match',
      prompt: 'Match each setting to what it controls.',
      pairs: [
        ['idExpression', 'What counts as the same message'],
        ['objectStore', 'Where seen keys are kept and whether replicas share them'],
        ['entryTtl on the object store', 'How long a key is remembered'],
      ],
      explain: 'The key defines a duplicate, the store decides who sees the keys, and the time to live decides how long a late retry is still caught.',
    },
  ],
  description: `
Bramblegate Payments receives webhooks from a card provider: one for each settled payment. The provider retries a webhook when it does not get a 2xx answer within 10 seconds. Last month, 140 payments were posted twice to the ledger, because a slow database made the provider retry while the first call was still running.

The team plans to add the **Idempotent Message Validator** in front of the ledger insert. The app runs on two CloudHub 2.0 replicas.

**Questions**
1. What does the Idempotent Message Validator do, and what key should it use here?
2. Where should the seen keys be stored, and for how long?
3. What should the flow answer when a duplicate arrives?
4. What happens when the flow fails after the validator, and how do you deal with it?
`,
  answerTemplate: `## What the validator does and the key

## Where keys live and for how long

## Answering a duplicate

## Failures after the validator
`,
  keyPoints: [
    'The validator checks a key against an object store and raises MULE:DUPLICATE_MESSAGE when the key was seen before.',
    'The key must stay the same on a retry, such as the provider event id. The default correlation id changes per call.',
    'With several replicas, the store must be shared. On CloudHub that means a persistent object store, which is Object Store v2.',
    'Set a time to live a little longer than the provider retries, so the store does not grow for ever.',
    'Answer a duplicate with a success code from On Error Continue, so the sender stops retrying.',
    'The key is stored when the event passes the validator, so a later failure blocks the retry unless the key is removed.',
  ],
  solution: `
**1. What it does.** The validator works out a key with \`idExpression\` and looks for it in an object store. A new key is stored and the event goes on. A known key raises \`MULE:DUPLICATE_MESSAGE\`. The key here is \`#[payload.eventId]\`, because the provider sends the same id on every retry. The default is the correlation id, which is new for each HTTP call.

**2. Where and how long.**
| Choice | Why |
|---|---|
| A persistent object store | Both replicas see the same keys. An in-memory store is per replica. |
| entryTtl of a few days | Longer than the provider's retry window. Old keys expire. |

**3. Answering a duplicate.**
\`\`\`
 Listener ─► Idempotent Message Validator (idExpression = eventId)
              └ new ─► insert into ledger ─► 200
 On Error Continue  type = MULE:DUPLICATE_MESSAGE ─► log ─► 200
\`\`\`
A 200 tells the provider the event is handled.

**4. Failures after the validator.** The key is already stored, so a retry after a failed insert is refused as a duplicate and the payment is never posted. Two fixes:
- In the error handler for other errors, remove the key with \`os:remove\`, then return an error so the provider retries.
- Or skip the validator and make the insert itself idempotent, for example with a unique constraint on \`eventId\` in the ledger table, and treat the duplicate key error as success.

The database constraint is the stronger guard, because it holds even if the object store is cleared.
`,
  followUps: [
    {
      q: 'Two copies of the same webhook arrive at the same moment. Does the validator stop one?',
      a: 'Do not take it on trust. How two calls at the same moment behave depends on the object store behind it. Test it under load on your target, and keep a unique constraint in the database as the last line of defence.',
    },
    {
      q: 'There is no event id in the message. What key could you use?',
      a: 'A hash of the fields that make the event unique, such as the payment id and the status, for example with dw::Crypto. Do not hash the whole body if it holds a time stamp that changes on retries.',
    },
    {
      q: 'Is this the same as the idempotency key in an API contract?',
      a: 'The idea is the same. With an Idempotency-Key header, the API also stores the first response and returns it again on a retry. The validator only refuses the retry, so the flow must decide what to answer.',
    },
  ],
}
