import { design, flow, handler, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-004',
  category: 'flows',
  title: 'Dropping Duplicate Webhook Events Idempotently',
  level: 'INTERMEDIATE',
  tags: ['idempotency', 'object-store', 'webhooks', 'deduplication'],
  estMinutes: 20,
  flowChecks: [
    {
      label: 'Webhooks are received on POST /webhooks/payments',
      rule: { type: 'source', component: 'http-listener', where: { path: 'webhooks', allowedMethods: 'POST' } },
    },
    {
      label: 'Duplicates are detected on the event id with an Idempotent Message Validator',
      rule: { type: 'exists', component: 'idempotent', where: { idExpression: 'id' } },
    },
    {
      label: 'The validator uses a named (persistent, shared) object store',
      rule: { type: 'exists', component: 'idempotent', where: { objectStore: { set: true } } },
    },
    {
      label: 'Deduplication happens before any NetSuite update',
      rule: { type: 'before', first: 'idempotent', then: ['http-request', 'wsc-consume'], every: true },
    },
    {
      label: 'Duplicates are acknowledged with 2xx via On Error Continue for MULE:DUPLICATE_MESSAGE',
      rule: { type: 'exists', component: 'on-error-continue', where: { type: 'DUPLICATE_MESSAGE' } },
    },
    {
      label: 'Other failures propagate so the provider retries, and no catch-all swallows them',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-propagate' },
          { type: 'absent', component: 'on-error-continue', where: { type: 'ANY' } },
        ],
      },
    },
    {
      label: 'The event id is kept in a variable for cleanup on failure',
      rule: { type: 'before', first: 'set-variable', firstWhere: { value: 'id' }, then: ['http-request', 'wsc-consume'] },
    },
    {
      label: 'A failed event has its id removed from the store, so the retry is processed',
      rule: { type: 'inside', component: 'os-remove', within: 'on-error-propagate' },
    },
  ],
  simulation: {
    systems: {
      http: [{ method: 'PATCH', path: '/netsuite/invoices/{invoiceId}', latencyMs: 600, respond: { status: 200, body: { invoiceId: 'INV-2041', status: 'PAID' } } }],
    },
    tests: [
      {
        name: 'A new event is processed',
        about: 'The invoice is updated once, one notification is published, and the provider gets a 2xx.',
        trigger: {
          http: {
            method: 'POST',
            path: '/webhooks/payments',
            headers: { 'stripe-signature': 't=1731492000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd' },
            body: { id: 'evt_1Q2w3eAbCd', type: 'invoice.paid', invoiceId: 'INV-2041', amount: 1250 },
          },
        },
        expect: {
          status: 200,
          calls: [{ method: 'PATCH', path: '/netsuite/invoices/{invoiceId}', count: 1 }],
          sent: [{ destination: 'payment-notifications', count: 1 }],
        },
      },
      {
        name: 'The same event arrives twice',
        about: 'The provider sends the event again a few milliseconds later. The second copy gets a 2xx and changes nothing.',
        triggers: [
          {
            http: {
              method: 'POST',
              path: '/webhooks/payments',
              headers: { 'stripe-signature': 't=1731492000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd' },
              body: { id: 'evt_1Q2w3eAbCd', type: 'invoice.paid', invoiceId: 'INV-2041', amount: 1250 },
            },
          },
          {
            afterMs: 5,
            http: {
              method: 'POST',
              path: '/webhooks/payments',
              headers: { 'stripe-signature': 't=1731492000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd' },
              body: { id: 'evt_1Q2w3eAbCd', type: 'invoice.paid', invoiceId: 'INV-2041', amount: 1250 },
            },
          },
        ],
        expect: {
          status: 200,
          calls: [{ method: 'PATCH', path: '/netsuite/invoices/{invoiceId}', count: 1 }],
          sent: [{ destination: 'payment-notifications', count: 1 }],
        },
      },
      {
        name: 'NetSuite is down',
        about: 'The invoice update fails, so no notification goes out and the provider does not get a 2xx.',
        trigger: {
          http: {
            method: 'POST',
            path: '/webhooks/payments',
            headers: { 'stripe-signature': 't=1731492000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd' },
            body: { id: 'evt_1Q2w3eAbCd', type: 'invoice.paid', invoiceId: 'INV-2041', amount: 1250 },
          },
        },
        overrides: { systems: { http: [{ method: 'PATCH', path: '/netsuite/invoices/{invoiceId}', respond: { fault: 'CONNECTIVITY' } }] } },
        expect: { error: 'HTTP:CONNECTIVITY', bodyLacks: { received: true }, notSent: ['payment-notifications'] },
      },
      {
        name: 'The retry after a failure is processed',
        about: 'NetSuite fails the first time. When the provider sends the same event again, it must not be dropped as a duplicate.',
        triggers: [
          {
            http: {
              method: 'POST',
              path: '/webhooks/payments',
              headers: { 'stripe-signature': 't=1731492000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd' },
              body: { id: 'evt_1Q2w3eAbCd', type: 'invoice.paid', invoiceId: 'INV-2041', amount: 1250 },
            },
          },
          {
            afterMs: 60000,
            http: {
              method: 'POST',
              path: '/webhooks/payments',
              headers: { 'stripe-signature': 't=1731492060,v1=8f14e45fceea167a5a36dedd4bea2543c4ab0d1e2f7a8b9c0d1e2f3a4b5c6d7e' },
              body: { id: 'evt_1Q2w3eAbCd', type: 'invoice.paid', invoiceId: 'INV-2041', amount: 1250 },
            },
          },
        ],
        overrides: {
          systems: {
            http: [{ method: 'PATCH', path: '/netsuite/invoices/{invoiceId}', responses: [{ status: 503, body: { message: 'Service Unavailable' } }, { status: 200, body: { invoiceId: 'INV-2041', status: 'PAID' } }] }],
          },
        },
        expect: {
          status: 200,
          calls: [{ method: 'PATCH', path: '/netsuite/invoices/{invoiceId}', count: 2 }],
          sent: [{ destination: 'payment-notifications', count: 1 }],
        },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'payment-webhooks',
      why: 'A missing signature also reaches the catch-all handler, which already answers with an error. A separate 401 for it is a nicety the scenario does not ask for.',
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
        step('set-payload', { value: '#[output application/json --- { received: true }]' }),
      ],
      [
        handler('on-error-continue', { type: 'MULE:DUPLICATE_MESSAGE' }, [
          step('logger', { level: 'INFO', message: '#["Duplicate webhook " ++ vars.eventId ++ " ignored"]' }),
          step('set-payload', { value: '#[output application/json --- { received: true, duplicate: true }]' }),
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
