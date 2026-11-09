import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-015',
  category: 'flows',
  title: 'Templated Notification Fan-out (Email and SMS)',
  level: 'INTERMEDIATE',
  tags: ['notifications', 'email', 'sms', 'templates', 'parse-template'],
  estMinutes: 55,
  flowChecks: [
    { label: 'POST /notifications is exposed through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'The request is queued and acknowledged instead of sent synchronously',
      rule: { type: 'before', first: 'http-listener', then: ['mq-publish', 'vm-publish', 'jms-publish'] },
    },
    {
      label: 'The API flow does not send email or SMS itself',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'http-listener' },
          { type: 'absent', component: 'email-send', inFlowWith: { component: 'http-listener' } },
          { type: 'absent', component: 'http-request', inFlowWith: { component: 'http-listener' } },
        ],
      },
    },
    {
      label: 'Each channel has its own queue consumer so one failing channel does not block the other',
      rule: { type: 'exists', component: ['mq-subscriber', 'vm-listener', 'jms-listener'], min: 2 },
    },
    {
      label: 'A consumer listens on the same queue a flow publishes to',
      rule: {
        type: 'any',
        rules: [
          { type: 'linked', from: { component: 'mq-publish', key: 'destination' }, to: { component: 'mq-subscriber', key: 'destination' } },
          { type: 'linked', from: { component: 'vm-publish', key: 'queueName' }, to: { component: 'vm-listener', key: 'queueName' } },
          { type: 'linked', from: { component: 'jms-publish', key: 'destination' }, to: { component: 'jms-listener', key: 'destination' } },
        ],
      },
    },
    { label: 'Contact preferences are read from the Preferences DB', rule: { type: 'exists', component: 'db-select' } },
    {
      label: 'The template is read at run time, so wording changes need no release',
      rule: { type: 'before', first: ['db-select', 'os-retrieve', 's3-get', 'http-request'], then: 'email-send' },
    },
    { label: 'The message is rendered with DataWeave before the email is sent', rule: { type: 'before', first: 'transform', then: 'email-send' } },
    { label: 'SMS goes out through an HTTP Request to the SMS provider', rule: { type: 'exists', component: 'http-request' } },
    {
      label: 'No consumer acknowledges a message as soon as it arrives (IMMEDIATE)',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: ['mq-subscriber', 'vm-listener', 'jms-listener'] },
          { type: 'absent', component: 'mq-subscriber', where: { acknowledgementMode: 'IMMEDIATE' } },
        ],
      },
    },
    {
      label: 'A manual acknowledgement comes only after the email or SMS was sent',
      rule: {
        type: 'any',
        rules: [
          {
            type: 'all',
            rules: [
              { type: 'before', first: 'email-send', then: ['mq-ack', 'jms-ack'], outside: true },
              { type: 'before', first: 'http-request', then: ['mq-ack', 'jms-ack'], outside: true },
            ],
          },
          {
            type: 'all',
            rules: [
              { type: 'exists', component: 'email-send' },
              { type: 'exists', component: 'http-request' },
              { type: 'absent', component: 'mq-ack' },
              { type: 'absent', component: 'jms-ack' },
            ],
          },
        ],
      },
    },
    {
      label: 'Worker failures return the message for redelivery (nack, or the error propagates)',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: ['mq-nack', 'jms-recover-session'], within: ['on-error-continue', 'on-error-propagate'] },
          {
            type: 'all',
            rules: [
              { type: 'source', component: ['mq-subscriber', 'vm-listener', 'jms-listener'] },
              {
                type: 'absent',
                component: 'on-error-continue',
                // ANY also matches a handler with no type, since both catch everything.
                where: { type: 'ANY' },
                inFlowWith: { component: ['mq-subscriber', 'vm-listener', 'jms-listener'] },
              },
            ],
          },
        ],
      },
    },
    {
      label: 'Worker failures record a status',
      rule: { type: 'inside', component: ['db-update', 'db-insert'], within: ['on-error-continue', 'on-error-propagate'] },
    },
  ],
  referenceFlow: design(
    flow(
      'notifications-api',
      source('http-listener', { path: '/notifications', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-blank-string', expression: '#[payload.customerId]', message: 'customerId is required' }),
        step('set-variable', { variableName: 'notificationId', value: '#[uuid()]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\npayload ++ { notificationId: vars.notificationId, requestedAt: now() }',
        }),
        step('mq-publish', { destination: 'notifications.requested' }),
        step('set-variable', { variableName: 'httpStatus', value: '#[202]' }),
        step('set-payload', { value: '#[output application/json --- { notificationId: vars.notificationId, status: "ACCEPTED" }]' }),
      ],
    ),
    flow(
      'notification-dispatcher',
      source('mq-subscriber', { destination: 'notifications.requested', acknowledgementMode: 'MANUAL' }),
      [
        // The Database Select replaces the attributes, so keep the ack token in a variable.
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'request', value: '#[payload]' }),
        scope('cache', { cachingStrategy: 'preferences-cache-10min' }, [
          step('db-select', { sql: 'SELECT channel, language FROM contact_preferences WHERE customer_id = :customerId' }),
        ]),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\npayload map (pref) -> vars.request ++ { channel: pref.channel, language: pref.language }',
        }),
        scope('foreach', { collection: '#[payload]' }, [
          router(
            'choice',
            {},
            [
              route({ expression: '#[payload.channel == "EMAIL"]' }, [step('mq-publish', { destination: 'notifications.email' })]),
              route({ expression: '#[payload.channel == "SMS"]' }, [step('mq-publish', { destination: 'notifications.sms' })]),
            ],
            { otherwise: [step('logger', { level: 'DEBUG', message: '#["No channel for customer " ++ payload.customerId]' })] },
          ),
        ]),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('mq-nack', { ackToken: '#[vars.ackToken]' })])],
    ),
    flow(
      'email-worker',
      source('mq-subscriber', { destination: 'notifications.email', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'message', value: '#[payload]' }),
        step('idempotent', { idExpression: '#[vars.message.notificationId ++ "-EMAIL"]', objectStore: 'sent-notifications' }),
        step('db-select', {
          sql: 'SELECT subject, body FROM notification_templates WHERE event_type = :eventType AND channel = \'EMAIL\' AND language = :language',
        }),
        step('set-variable', { variableName: 'subject', value: '#[payload[0].subject]' }),
        step('transform', {
          script:
            '%dw 2.0\noutput text/plain\nvar tpl = payload[0]\nvar data = vars.message.data\n---\n(data pluck ((v, k) -> { k: k as String, v: v as String }))\n  reduce ((e, acc = tpl.body) -> acc replace ("{{" ++ e.k ++ "}}") with e.v)',
        }),
        step('email-send', { toAddresses: '#[vars.message.email]', subject: '#[vars.subject]', contentType: 'text/html' }),
        step('db-update', { sql: "UPDATE notification_status SET status = 'SENT' WHERE id = :notificationId AND channel = 'EMAIL'" }),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [
        handler('on-error-continue', { type: 'MULE:DUPLICATE_MESSAGE' }, [step('mq-ack', { ackToken: '#[vars.ackToken]' })]),
        handler('on-error-continue', { type: 'ANY' }, [
          step('db-update', {
            sql: "UPDATE notification_status SET status = 'FAILED', reason = :reason WHERE id = :notificationId AND channel = 'EMAIL'",
          }),
          // Without this the redelivery would be dropped as a duplicate and the email never sent.
          step('os-remove', { key: '#[vars.message.notificationId ++ "-EMAIL"]', objectStore: 'sent-notifications' }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
      ],
    ),
    flow(
      'sms-worker',
      source('mq-subscriber', { destination: 'notifications.sms', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'message', value: '#[payload]' }),
        step('idempotent', { idExpression: '#[vars.message.notificationId ++ "-SMS"]', objectStore: 'sent-notifications' }),
        step('db-select', {
          sql: 'SELECT body FROM notification_templates WHERE event_type = :eventType AND channel = \'SMS\' AND language = :language',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/x-www-form-urlencoded\nvar text = payload[0].body as String\n---\n{ To: vars.message.phone, Body: if (sizeOf(text) > 160) text[0 to 159] else text }',
        }),
        step('http-request', { method: 'POST', path: '/v1/messages', responseTimeout: 5000 }),
        step('db-update', { sql: "UPDATE notification_status SET status = 'SENT' WHERE id = :notificationId AND channel = 'SMS'" }),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [
        handler('on-error-continue', { type: 'MULE:DUPLICATE_MESSAGE' }, [step('mq-ack', { ackToken: '#[vars.ackToken]' })]),
        handler('on-error-continue', { type: 'HTTP:TOO_MANY_REQUESTS, HTTP:SERVICE_UNAVAILABLE' }, [
          step('os-remove', { key: '#[vars.message.notificationId ++ "-SMS"]', objectStore: 'sent-notifications' }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
        handler('on-error-continue', { type: 'ANY' }, [
          step('db-update', {
            sql: "UPDATE notification_status SET status = 'FAILED', reason = :reason WHERE id = :notificationId AND channel = 'SMS'",
          }),
          step('os-remove', { key: '#[vars.message.notificationId ++ "-SMS"]', objectStore: 'sent-notifications' }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
      ],
    ),
  ),
  description: `
A telecom wants a reusable **Notification API**: \`POST /notifications\` with \`{ customerId, eventType, data }\` (event types like \`BILL_READY\`, \`PAYMENT_FAILED\`, \`PLAN_CHANGED\`).

**Requirements**
- Look up the customer's **contact preferences** (email, SMS, both, none) and language (en/fr) from a Preferences DB.
- Render the message from a **template per event type and language**; marketing must be able to edit wording without a code release.
- Send email via **SMTP** and SMS via an **SMS provider REST API** (e.g. Twilio).
- Volume: 200k notifications on bill day within 4 hours. One channel failing must not stop the other.
- Respond to the caller quickly with an acceptance id.
- An accepted notification must not be lost, even if the app restarts while sending it.

**Design the flow(s):** API front door, channel fan-out, templating, sending, failure handling.
`,
  answerTemplate: `## Front door

## Preference lookup

## Templating

## Channel fan-out

## Sending and retries

## Throughput on bill day
`,
  keyPoints: [
    'API validates and queues the request (VM/Anypoint MQ) and returns 202 with a notification id instead of sending synchronously.',
    'Preferences and language read from the DB (optionally cached) decide which channels to use.',
    'Templates stored outside the code (DB/object storage/config) and rendered with DataWeave or the Parse Template component.',
    'Each channel is processed independently (separate queues or a Try per channel) so an SMS failure does not block email.',
    'Retries/backoff per channel and a status record per notification (sent, failed, reason) for support teams.',
  ],
  solution: `
1. **Front door:** HTTP Listener → APIkit validation → generate \`notificationId\` → **Anypoint MQ Publish** to \`notifications.requested\` → **202** \`{ notificationId }\`.
2. **Dispatcher flow:** Anypoint MQ Subscriber → **Database Select** preferences (inside a **Cache scope**, TTL 10 min) → DataWeave builds one message per enabled channel → Publish to \`notifications.email\` and/or \`notifications.sms\`. Separate queues give each channel its own retry/DLQ and concurrency.
3. **Templating:** templates (subject/body per \`eventType\` + language) stored in a DB table or object storage, loaded via a cached lookup. Render with DataWeave (string interpolation of \`data\` fields) or the **Parse Template** component (\`#[...]\` expressions inside an HTML template). Escape user data in HTML emails.
4. **Email worker:** subscriber on \`notifications.email\` → render → **Email connector Send** (SMTP config) with HTML body. Ack on success.
5. **SMS worker:** subscriber on \`notifications.sms\` → render (short text, max length check in DataWeave) → HTTP Request to the SMS provider (or its Exchange connector). Handle **429** with backoff.
6. **Failures:** transient errors → Nack/redeliver; after max deliveries the message lands in the channel's DLQ. Each worker writes a status row (\`SENT\`, \`FAILED\`, reason) so \`GET /notifications/{id}\` can report it.
7. **Throughput:** 200k in 4 h ≈ 14/s — scale worker concurrency per channel to what SMTP relay and SMS provider allow, not to the inbound rate.
`,
  followUps: [
    { q: 'Why not use Scatter-Gather to send email and SMS in parallel?', a: 'It is synchronous and fails the whole event if one route fails; retries would resend the channel that already succeeded. Separate queues isolate channels and make retries per-channel.' },
    { q: 'How do you avoid sending the same SMS twice after a redelivery?', a: 'Use notificationId + channel as an idempotency key (Idempotent Message Validator with a persistent Object Store, or a status check) before sending.' },
    { q: 'How would you support quiet hours (no SMS at night)?', a: 'Check the customer timezone in the dispatcher and publish with a delivery delay or park the message in a scheduled queue/table until the window opens.' },
  ],
}
