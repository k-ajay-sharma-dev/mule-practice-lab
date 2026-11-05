import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-053',
  category: 'flows',
  title: 'Process API Publishing a Domain Event after a Synchronous Create',
  level: 'ADVANCED',
  tags: ['api-led', 'event-driven', 'process-api', 'anypoint-mq', 'outbox'],
  estMinutes: 45,
  flowChecks: [
    {
      label: 'Onboarding is a Process API listener (/prc-...)',
      rule: { type: 'source', component: 'http-listener', where: { path: 'prc-' } },
    },
    {
      label: 'The event is published only after the synchronous System API call succeeded',
      rule: { type: 'before', first: 'http-request', then: 'mq-publish' },
    },
    {
      label: 'A business event envelope is built with DataWeave before publishing',
      rule: { type: 'before', first: 'transform', then: 'mq-publish' },
    },
    {
      label: 'The publish is isolated in a Try scope',
      rule: { type: 'inside', component: 'mq-publish', within: 'try' },
    },
    {
      label: 'A failed publish does not fail the already-created customer (On Error Continue)',
      rule: { type: 'handler', component: 'on-error-continue', within: 'try' },
    },
    {
      label: 'Unpublished events are parked in an outbox instead of being lost',
      rule: { type: 'inside', component: ['db-insert', 'os-store', 'vm-publish'], within: 'try' },
    },
    {
      label: 'A scheduled relay re-publishes parked events',
      rule: { type: 'source', component: 'scheduler' },
    },
    {
      label: 'Downstream processes consume the event asynchronously (Anypoint MQ Subscriber)',
      rule: { type: 'source', component: 'mq-subscriber' },
    },
  ],
  referenceFlow: design(
    flow(
      'exp-mobile-signup',
      source('http-listener', { path: '/exp-mobile/v1/signup', allowedMethods: 'POST' }),
      [
        step('http-request', { method: 'POST', path: '/prc-customers/v1/customers', responseTimeout: 4000 }),
        step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ customerId: payload.customerId, welcome: true }' }),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '502' })])],
    ),
    flow(
      'prc-customer-onboarding',
      source('http-listener', { path: '/prc-customers/v1/customers', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'json-schema', expression: '#[payload]', message: 'Invalid customer' }),
        step('http-request', { method: 'POST', path: '/sys-crm/v1/customers', responseTimeout: 3000 }),
        step('set-variable', { variableName: 'customer', value: '#[payload]' }),
        step('transform', {
          target: 'variable',
          variableName: 'event',
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  eventId: uuid(),\n  eventType: "CustomerCreated",\n  version: "1.0",\n  occurredAt: now(),\n  correlationId: correlationId,\n  data: {\n    customerId: payload.id,\n    email: payload.email,\n    country: payload.country,\n    marketingOptIn: payload.marketingOptIn default false\n  }\n}',
        }),
        // The Transform above targets a variable, so the payload is still the CRM response until this Set Payload.
        scope('try', {}, [step('set-payload', { value: '#[vars.event]' }), step('mq-publish', { destination: 'customer-events-exchange' })], {
          errorHandlers: [
            handler('on-error-continue', { type: 'ANYPOINT-MQ:CONNECTIVITY, ANYPOINT-MQ:PUBLISHING, ANYPOINT-MQ:RETRY_EXHAUSTED' }, [
              step('logger', { level: 'WARN', message: '#["Event parked in outbox: " ++ vars.event.eventId]' }),
              step('db-insert', {
                sql: 'INSERT INTO event_outbox (event_id, event_type, body, published) VALUES (:eventId, :eventType, :body, false)',
              }),
            ]),
          ],
        }),
        step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ customerId: vars.customer.id, status: "CREATED" }' }),
        step('set-variable', { variableName: 'httpStatus', value: '201' }),
      ],
      [
        handler('on-error-propagate', { type: 'JSON:SCHEMA_NOT_HONOURED' }, [step('set-variable', { variableName: 'httpStatus', value: '400' })]),
        // A 409 from sys-crm has no HTTP:* error type of its own (there is no HTTP:CONFLICT): match the response status code.
        handler('on-error-propagate', { type: 'ANY', when: '#[error.errorMessage.attributes.statusCode == 409]' }, [step('set-variable', { variableName: 'httpStatus', value: '409' })]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })]),
      ],
    ),
    flow(
      'prc-customer-events-outbox-relay',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 30, timeUnit: 'SECONDS' }),
      [
        step('db-select', { sql: 'SELECT event_id, body FROM event_outbox WHERE published = false ORDER BY created_at LIMIT 100' }),
        scope('foreach', { collection: '#[payload]' }, [
          step('set-variable', { variableName: 'eventId', value: '#[payload.event_id]' }),
          // Publish the stored event, not the database row around it.
          step('set-payload', { value: '#[read(payload.body, "application/json")]' }),
          step('mq-publish', { destination: 'customer-events-exchange' }),
          step('db-update', { sql: 'UPDATE event_outbox SET published = true WHERE event_id = :eventId' }),
        ]),
      ],
    ),
    flow(
      'prc-welcome-journey',
      source('mq-subscriber', { destination: 'welcome-journey-queue', acknowledgementMode: 'AUTO' }),
      [
        step('set-variable', { variableName: 'eventId', value: '#[payload.eventId]' }),
        step('idempotent', { idExpression: '#[vars.eventId]', objectStore: 'welcome-journey-processed' }),
        step('http-request', { method: 'POST', path: '/sys-marketing/v1/contacts', responseTimeout: 5000 }),
      ],
      [
        handler('on-error-continue', { type: 'MULE:DUPLICATE_MESSAGE' }, [step('logger', { level: 'DEBUG', message: '#["Duplicate event ignored"]' })]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#[error.description]' }),
          // The docs do not say the validator releases the ID on failure; without this a redelivery could be dropped as a duplicate.
          scope('try', {}, [step('os-remove', { key: '#[vars.eventId]', objectStore: 'welcome-journey-processed' })], {
            errorHandlers: [handler('on-error-continue', { type: 'OS:KEY_NOT_FOUND' }, [])],
          }),
        ]),
      ],
    ),
  ),
  description: `
A telecom onboards new customers from its mobile app. Today the **Customer Onboarding Process API** synchronously creates the customer in the **CRM** (via \`sys-crm\`) and then calls the marketing platform, the billing system and the loyalty programme one after the other — signup takes 6 s and fails whenever any of them is down.

New target design:
- The app must get its answer (customer id, **201**) as soon as the CRM has created the customer — p95 < 2 s, ~5 signups/s, 50/s during campaigns.
- Marketing, billing and loyalty react to a **CustomerCreated** domain event; more subscribers will follow (fraud scoring next quarter) without changing the Process API.
- An event must **never be lost**, even if Anypoint MQ is briefly unreachable after the CRM commit. Consumers must cope with duplicates.

**Convention for API-led problems:** one canvas holds the whole application network. Draw each API as a separate flow whose name starts with its layer prefix (\`exp-\`, \`prc-\`, \`sys-\`), give it an HTTP Listener whose path shows the API (e.g. \`/prc-customers/v1/customers\`), and let layers call each other with HTTP Request pointing at the lower API's path. Event consumers are flows too (use the \`prc-\` prefix for process-level subscribers).

**Design the flow(s):** the synchronous path, the event (shape and destination), what happens if publishing fails, and at least one subscriber.
`,
  answerTemplate: `## Synchronous path

## The domain event

## Publish failure (no lost events)

## Subscribers

## Duplicates and ordering
`,
  keyPoints: [
    'API-led and event-driven combine: the synchronous request goes exp → prc → sys only as far as needed for the answer; side effects become a domain event.',
    'Publish only after the System API call succeeded — the event states a fact ("CustomerCreated"), with eventId, type, version, timestamp and correlationId.',
    'Publish to an exchange so new subscribers (fraud scoring) bind their own queue without changing the publisher.',
    'The CRM commit and the MQ publish are not one transaction: a failed publish is caught (Try + On Error Continue) and parked in an outbox that a scheduled relay re-publishes — no lost events, no failed signup.',
    'Delivery is at-least-once (relay and redelivery can duplicate), so subscribers are idempotent on eventId.',
  ],
  solution: `
\`\`\`
  exp-mobile-signup --POST /prc-customers/v1/customers-->
 +---------------------------------------------------------------+
 | prc-customer-onboarding                              PROCESS  |
 |  validate -> POST /sys-crm/v1/customers (sync, 3 s)           |
 |  build CustomerCreated envelope (vars.event)                  |
 |  Try[ MQ publish customer-events-exchange ]                   |
 |     On Error Continue -> INSERT event_outbox                  |
 |  201 { customerId }                                           |
 +---------------------------------------------------------------+
        |                                   ^
        v                                   | every 30 s
   sys-crm (SYSTEM)          prc-customer-events-outbox-relay (Scheduler)

   customer-events-exchange ──> welcome-journey-queue ──> prc-welcome-journey ──> sys-marketing
                            ──> billing-queue        ──> ...
                            ──> loyalty-queue        ──> ...
\`\`\`

**Synchronous path:** \`exp-mobile-signup\` → \`prc-customer-onboarding\` validates, calls \`sys-crm\` and returns **201** as soon as the CRM has the customer. Nothing else is on the critical path.

**Event:** Transform to \`vars.event\` — \`{ eventId, eventType: "CustomerCreated", version, occurredAt, correlationId, data: {...} }\`. Publish to an **exchange**; each consumer binds its own queue (with its own DLQ).

**No lost events:** the CRM commit already happened, so a publish failure must not turn into a 5xx (the app would retry and create a duplicate customer). The **Try** catches \`ANYPOINT-MQ:*\` errors with **On Error Continue** and inserts the event into \`event_outbox\`. A **Scheduler** relay re-publishes unpublished rows and marks them published. (A stricter variant writes *every* event to the outbox and only the relay publishes.)

**Subscribers:** \`prc-welcome-journey\` (MQ Subscriber) calls \`sys-marketing\`; billing and loyalty are the same pattern. Each is **idempotent on eventId**, because the relay and MQ redelivery give at-least-once delivery. The docs do not say the Idempotent Message Validator releases an ID when the flow fails, so the error handler removes it from the store; otherwise a redelivered event could be dropped as a duplicate before it was ever processed.
`,
  followUps: [
    {
      q: 'Why not publish first and create the CRM customer from the event as well?',
      a: 'The caller needs the CRM-generated customer id synchronously. Commands that need an immediate answer stay request/response; facts that others react to become events.',
    },
    {
      q: 'Is the event part of the Process API contract?',
      a: 'Yes — publish its schema (e.g. AsyncAPI) in Exchange and version it like an API. Subscribers depend on it as much as HTTP consumers depend on the RAML/OAS.',
    },
    {
      q: 'Billing must process events for the same customer in order. What changes?',
      a: 'Use a FIFO queue for that consumer (or a message group per customerId) and process sequentially; carry a sequence/version so out-of-order or duplicate events can be detected.',
    },
    {
      q: 'Who owns the outbox table — the Process API or the CRM?',
      a: 'The Process API (its own small store). A true transactional outbox would write the event in the same transaction as the business data, which is only possible if the Process API owns that database; with a SaaS CRM, the catch-and-park approach plus idempotent consumers is the practical compromise.',
    },
  ],
}
