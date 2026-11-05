import { design, flow, handler, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-004',
  category: 'flows',
  title: 'Dropping Duplicate Webhook Events Idempotently',
  level: 'INTERMEDIATE',
  tags: ['idempotency', 'object-store', 'webhooks', 'deduplication'],
  estMinutes: 20,
  flowChecks: [
    { label: 'Webhooks are received by an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'Duplicates are detected on the event id with an Idempotent Message Validator',
      rule: { type: 'exists', component: 'idempotent', where: { idExpression: 'id' } },
    },
    {
      label: 'The validator uses a named (persistent, shared) object store',
      rule: { type: 'exists', component: 'idempotent', where: { objectStore: { set: true } } },
    },
    {
      label: 'Deduplication happens before NetSuite is updated',
      rule: { type: 'before', first: 'idempotent', then: ['http-request', 'wsc-consume'] },
    },
    {
      label: 'Duplicates are acknowledged with 2xx via On Error Continue for MULE:DUPLICATE_MESSAGE',
      rule: { type: 'exists', component: 'on-error-continue', where: { type: 'DUPLICATE_MESSAGE' } },
    },
    {
      label: 'Other failures propagate (5xx) so the provider retries',
      rule: { type: 'handler', component: 'on-error-propagate' },
    },
    {
      label: 'The event id is kept in a variable for cleanup on failure',
      rule: { type: 'before', first: 'set-variable', then: ['http-request', 'wsc-consume'] },
    },
  ],
  referenceFlow: design(
    flow(
      'payment-webhooks',
      source('http-listener', { path: '/webhooks/payments', allowedMethods: 'POST' }),
      [
        step('validation', {
          check: 'is-not-blank-string',
          expression: '#[attributes.headers."stripe-signature"]',
          message: 'Missing webhook signature',
        }),
        step('set-variable', { variableName: 'eventId', value: '#[payload.id]' }),
        step('idempotent', { idExpression: '#[payload.id]', objectStore: 'processedEvents' }),
        step('http-request', { method: 'PATCH', path: '/netsuite/invoices/{invoiceId}', responseTimeout: 5000 }),
        step('mq-publish', { destination: 'payment-notifications' }),
        step('set-payload', { value: '#[{ received: true }]' }),
      ],
      [
        handler('on-error-continue', { type: 'MULE:DUPLICATE_MESSAGE' }, [
          step('logger', { level: 'INFO', message: '#["Duplicate webhook " ++ vars.eventId ++ " ignored"]' }),
          step('set-payload', { value: '#[{ received: true, duplicate: true }]' }),
        ]),
        // Raised before the ID was stored, so there is nothing to remove from the store.
        handler('on-error-propagate', { type: 'VALIDATION:BLANK_STRING' }, [
          step('set-variable', { variableName: 'httpStatus', value: '401' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Webhook " ++ vars.eventId ++ " failed: " ++ error.description]' }),
          step('os-remove', { key: '#[vars.eventId]', objectStore: 'processedEvents' }),
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
        ]),
      ],
    ),
  ),
  description: `
**Stripe-style payment webhooks** arrive at \`POST /webhooks/payments\` (~50k/day). For each event, the flow updates the invoice in **NetSuite** and publishes a notification.

**Facts**
- The provider guarantees *at-least-once* delivery.
- If it doesn't get a 2xx within 10 seconds, it retries for up to **3 days**.
- It occasionally sends the same event twice within milliseconds.
- Each event has a unique \`id\` (e.g. \`evt_1Q2w...\`).
- The app runs on CloudHub 2.0 with **2 replicas**.

**What is wrong now**

Duplicates have caused **double invoice updates** and duplicate customer emails.

**Design the flow:**
- How do you detect and drop duplicates? Which component, which ID, which store?
- What response should a duplicate get, and why?
- What happens if NetSuite fails *after* the event ID has been recorded? How do you make sure the provider's retry is processed?
- How do you size the store retention?
`,
  answerTemplate: `## Dedup component and store

## Response for duplicates

## Failure after the ID is stored

## Retention
`,
  keyPoints: [
    'Idempotent Message Validator with idExpression on the business event ID (payload.id), not the default correlationId.',
    'Backed by a persistent Object Store shared across replicas; an in-memory store would let duplicates through on the other replica.',
    'Duplicates raise MULE:DUPLICATE_MESSAGE; handle it with On Error Continue and return 200 so the provider stops retrying.',
    'If downstream processing fails, remove the ID from the store (os:remove) in the error handler and return a non-2xx so the retry is processed.',
    'Entry TTL slightly longer than the provider retry window (3 days → e.g. 4 days).',
    'Optionally acknowledge fast (validate, dedupe, enqueue, 200) to stay within the 10 s timeout.',
  ],
  solution: `
**Flow**
1. HTTP Listener \`POST /webhooks/payments\` → verify the signature header.
2. **Idempotent Message Validator**: \`idExpression="#[payload.id]"\`, \`objectStore="processedEvents"\`.
   - \`processedEvents\`: \`<os:object-store persistent="true" entryTtl="4" entryTtlUnit="DAYS"/>\` — backed by Object Store v2 so it is shared by both replicas and survives redeploys. Without clustering, CloudHub 2.0 replicas only share a store through Object Store v2, and \`persistent="true"\` on local disk does not survive a restart there.
3. Update the invoice in NetSuite, publish the notification.
4. Return 200.

**Duplicates:** the validator raises \`MULE:DUPLICATE_MESSAGE\`. Catch it with **On Error Continue** (type \`MULE:DUPLICATE_MESSAGE\`), log at INFO, and return **200** — the event was already handled, and a non-2xx would make the provider retry for 3 days.

**Failure after the ID is stored:** the validator records the ID *before* the rest of the flow runs. If NetSuite then fails, the provider's retry would be dropped as a duplicate → the event is lost. Fix: in the On Error Propagate for other errors, call \`os:remove\` with key \`payload.id\`. Save the ID in a variable first, since the payload may have changed. Then return 5xx so the provider retries. Alternative pattern: check with \`os:contains\` first and \`os:store\` only after success — but that leaves a window where two near-simultaneous duplicates both pass, so the validator plus remove-on-failure is usually preferred.

**Retention:** the provider retries for 3 days, so TTL must cover that: **4 days** gives margin. 50k/day × 4 ≈ 200k keys — fine for OSv2.

**Latency:** to stay under the provider's 10 s timeout under load, consider: validate → dedupe → publish to Anypoint MQ/VM → 200, and do NetSuite asynchronously (then apply the same idempotency on the consumer side, e.g. NetSuite upsert by external ID).
`,
}
