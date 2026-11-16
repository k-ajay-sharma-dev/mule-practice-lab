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
      label: 'The event is published only after the CRM System API call succeeded',
      rule: { type: 'before', first: 'http-request', firstWhere: { path: 'sys-crm' }, then: 'mq-publish', outside: true },
    },
    {
      label: 'Marketing, billing and loyalty are not called on the signup path',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-request', where: { path: 'sys-crm' } },
          {
            type: 'absent',
            component: 'http-request',
            where: { path: { oneOf: ['marketing', 'billing', 'loyalty'] } },
            inFlowWith: { component: 'http-listener', where: { path: { oneOf: ['prc-', 'exp-'] } } },
          },
        ],
      },
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
      label: 'A scheduled relay re-publishes parked events and marks them sent only after the publish',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'scheduler', then: 'mq-publish' },
          { type: 'before', first: 'mq-publish', then: ['db-update', 'db-delete', 'os-remove'] },
        ],
      },
    },
    {
      label: 'Downstream processes consume the event asynchronously (Anypoint MQ Subscriber)',
      rule: { type: 'source', component: 'mq-subscriber' },
    },
    {
      label: 'The subscriber copes with duplicate events before it acts on them',
      rule: { type: 'before', first: 'mq-subscriber', then: ['idempotent', 'os-retrieve', 'db-select'] },
    },
    {
      label: 'A duplicate event is dropped with On Error Continue (MULE:DUPLICATE_MESSAGE), not failed and redelivered',
      rule: {
        type: 'any',
        rules: [
          { type: 'handler', component: 'on-error-continue', errorType: 'MULE:DUPLICATE_MESSAGE' },
          // A design that checks the store itself raises no duplicate error.
          { type: 'all', rules: [{ type: 'source', component: 'mq-subscriber' }, { type: 'absent', component: 'idempotent' }] },
        ],
      },
    },
    {
      label: 'A failed event has its id removed from the dedupe store, so the redelivery is processed',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'os-remove', within: ['on-error-continue', 'on-error-propagate'] },
          // An id stored only after success (Retrieve first, Store at the end) needs no cleanup.
          { type: 'all', rules: [{ type: 'exists', component: 'os-store' }, { type: 'absent', component: 'idempotent' }] },
        ],
      },
    },
  ],
  simulation: {
    systems: {
      schemas: {
        'customer.json': {
          type: 'object',
          required: ['email', 'firstName', 'country'],
          properties: { email: { type: 'string' }, firstName: { type: 'string' }, country: { type: 'string' }, marketingOptIn: { type: 'boolean' } },
        },
      },
      http: [
        {
          method: 'POST',
          path: '/sys-crm/v1/customers',
          latencyMs: 450,
          respond: (req) => ({ status: 201, body: { id: 'CUS-880412', email: req.body?.email, country: req.body?.country, marketingOptIn: req.body?.marketingOptIn ?? false } }),
        },
        { method: 'POST', path: '/sys-marketing/v1/contacts', latencyMs: 300, respond: { status: 201, body: { contactId: 'MC-5521' } } },
      ],
      db: {
        tables: {
          event_outbox: {
            columns: ['event_id', 'event_type', 'body', 'published', 'created_at'],
            key: 'event_id',
            rows: [],
          },
          processed_events: { columns: ['event_id'], key: 'event_id', rows: [] },
        },
        latencyMs: 10,
      },
    },
    tests: [
      {
        name: 'A customer signs up',
        about: 'The CRM creates the customer, the app gets 201 with the id, and one CustomerCreated event goes to the exchange.',
        trigger: { http: { method: 'POST', path: '/prc-customers/v1/customers', body: { email: 'aroha@example.com', firstName: 'Aroha', country: 'NZ', marketingOptIn: true } } },
        expect: {
          status: 201,
          bodyHas: { customerId: 'CUS-880412' },
          calls: [{ method: 'POST', path: '/sys-crm/v1/customers', count: 1 }],
          sent: [{ destination: 'customer-events-exchange', count: 1, has: { eventType: 'CustomerCreated', data: { customerId: 'CUS-880412' } } }],
          maxMs: 2000,
        },
      },
      {
        name: 'Anypoint MQ is down',
        about: 'The customer is already in the CRM, so the app still gets 201 and the event is parked in the outbox.',
        trigger: { http: { method: 'POST', path: '/prc-customers/v1/customers', body: { email: 'liam@example.com', firstName: 'Liam', country: 'IE', marketingOptIn: false } } },
        overrides: { systems: { queues: { 'customer-events-exchange': { fault: true } } } },
        expect: {
          status: 201,
          bodyHas: { customerId: 'CUS-880412' },
          db: { event_outbox: { count: 1, has: [{ event_type: 'CustomerCreated', published: false }] } },
        },
      },
      {
        name: 'The relay sends parked events',
        about: 'MQ is back. The relay publishes each parked event and no event is left unpublished.',
        trigger: { schedule: {} },
        overrides: {
          systems: {
            db: {
              tables: {
                event_outbox: {
                  columns: ['event_id', 'event_type', 'body', 'published', 'created_at'],
                  key: 'event_id',
                  rows: [
                    { event_id: 'EV-1001', event_type: 'CustomerCreated', body: '{"eventId":"EV-1001","eventType":"CustomerCreated","data":{"customerId":"CUS-880101"}}', published: false, created_at: '2026-11-13T09:40:00Z' },
                    { event_id: 'EV-1002', event_type: 'CustomerCreated', body: '{"eventId":"EV-1002","eventType":"CustomerCreated","data":{"customerId":"CUS-880102"}}', published: false, created_at: '2026-11-13T09:41:00Z' },
                  ],
                },
              },
            },
          },
        },
        expect: {
          sent: [
            { destination: 'customer-events-exchange', count: 2 },
            { destination: 'customer-events-exchange', count: 1, has: { eventId: 'EV-1001', data: { customerId: 'CUS-880101' } } },
          ],
          db: { event_outbox: { lacks: [{ published: false }] } },
        },
      },
      {
        name: 'The same event arrives twice',
        about: 'The relay and MQ redelivery can both send an event again. Marketing hears about the customer once.',
        triggers: [
          { message: { kind: 'mq', destination: 'welcome-journey-queue', payload: { eventId: 'EV-2001', eventType: 'CustomerCreated', data: { customerId: 'CUS-880412', email: 'aroha@example.com' } } } },
          { message: { kind: 'mq', destination: 'welcome-journey-queue', payload: { eventId: 'EV-2001', eventType: 'CustomerCreated', data: { customerId: 'CUS-880412', email: 'aroha@example.com' } } } },
        ],
        expect: { calls: [{ method: 'POST', path: '/sys-marketing/v1/contacts', count: 1 }], noError: true },
      },
      {
        name: 'Marketing fails the first time',
        about: 'The first delivery fails and goes back to the queue. The redelivery is processed, not dropped as a duplicate.',
        triggers: [
          { message: { kind: 'mq', destination: 'welcome-journey-queue', payload: { eventId: 'EV-3001', eventType: 'CustomerCreated', data: { customerId: 'CUS-880413', email: 'mere@example.com' } } } },
          { message: { kind: 'mq', destination: 'welcome-journey-queue', deliveryCount: 2, payload: { eventId: 'EV-3001', eventType: 'CustomerCreated', data: { customerId: 'CUS-880413', email: 'mere@example.com' } } } },
        ],
        overrides: { systems: { http: [{ method: 'POST', path: '/sys-marketing/v1/contacts', responses: [{ status: 503, body: { message: 'Service unavailable' } }, { status: 201, body: { contactId: 'MC-5522' } }] }] } },
        expect: { calls: [{ method: 'POST', path: '/sys-marketing/v1/contacts', count: 2 }], ack: 'returned', noError: true },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'exp-mobile-signup',
      why: 'Choosing the status the app gets for a failed signup is good practice, but this scenario is about the event, not the status codes.',
    },
    {
      type: 'on-error-propagate',
      flow: 'prc-customer-onboarding',
      why: 'Mapping a bad request to 400, a CRM conflict to 409 and other failures to 503 is good practice, but this scenario is about the event, not the status codes.',
    },
    {
      type: 'on-error-continue',
      flow: 'prc-welcome-journey',
      why: 'Catching OS:KEY_NOT_FOUND only covers an id that is already gone from the store. Without it no event is lost or processed twice.',
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
        step('validation', { check: 'json-schema', expression: 'schemas/customer.json', message: 'Invalid customer' }),
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
              // The outbox keeps the whole event as JSON text, so the relay can publish it again unchanged.
              step('set-variable', { variableName: 'body', value: '#[write(vars.event, "application/json")]' }),
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

**No lost events:** the CRM commit already happened, so a publish failure must not turn into a 5xx (the app would retry and create a duplicate customer). The **Try** catches \`ANYPOINT-MQ:*\` errors with **On Error Continue** and inserts the event, written as JSON text, into \`event_outbox\`. A **Scheduler** relay re-publishes unpublished rows and marks them published. (A stricter variant writes *every* event to the outbox and only the relay publishes.)

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
