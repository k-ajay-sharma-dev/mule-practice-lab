import { design, flow, handler, route, router, scope, source, step, subFlow } from '../../flow/dsl.js'

// Thin CDC listener per channel: skip own changes, hand off to MQ, then persist the replay ID.
const cdcListener = (object) =>
  flow(
    `${object.toLowerCase()}-cdc-listener`,
    source('sf-listener', { event: 'modified', objectType: `${object}ChangeEvent` }),
    [
      step('set-variable', { variableName: 'replayId', value: '#[attributes.replayId]' }),
      router(
        'choice',
        {},
        [
          route({ expression: "#[payload.ChangeEventHeader.commitUser == p('sfdc.integrationUserId')]" }, [
            step('logger', { level: 'DEBUG', message: '#["Change made by the integration user, skipped"]' }),
          ]),
        ],
        { otherwise: [step('mq-publish', { destination: `sfdc.${object.toLowerCase()}.changes` })] },
      ),
      step('os-store', { key: `replayId-${object}`, value: '#[vars.replayId]', objectStore: 'cdc-replay-store' }),
    ],
    [
      handler('on-error-propagate', { type: 'ANY' }, [
        step('email-send', { toAddresses: 'integration-ops@example.com', subject: `${object} CDC subscription failed` }),
        step('flow-ref', { name: 'delta-resync' }),
      ]),
    ],
  )

// What the skip or the hand-off route of the loop-prevention Choice may hold.
const LISTENER_STEPS = ['logger', 'mq-publish', 'vm-publish', 'jms-publish', 'flow-ref', 'set-variable']

export default {
  id: 'fl-022',
  category: 'flows',
  title: 'Salesforce Change Data Capture Subscriber with Replay',
  level: 'ADVANCED',
  tags: ['salesforce', 'cdc', 'platform-events', 'replay-id', 'streaming-api'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Changes are received from a Salesforce event listener, not by polling', rule: { type: 'source', component: 'sf-listener' } },
    {
      label: 'Changes made by the integration user are filtered out (loop prevention)',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: LISTENER_STEPS, within: 'choice', routeWhere: { expression: 'commitUser' } },
          { type: 'inside', component: LISTENER_STEPS, within: 'choice', routeWhere: { expression: 'LastModifiedById' } },
          { type: 'inside', component: LISTENER_STEPS, within: 'choice', routeWhere: { expression: 'integrationUser' } },
          { type: 'exists', component: 'validation', where: { expression: 'commitUser' } },
        ],
      },
    },
    {
      label: 'The listener hands events off to a queue for downstream workers',
      rule: { type: 'exists', component: ['mq-publish', 'vm-publish', 'jms-publish'] },
    },
    {
      label: 'The replay ID is stored in an Object Store only after the hand-off',
      rule: {
        type: 'before',
        first: ['mq-publish', 'vm-publish', 'jms-publish', 'http-request'],
        then: 'os-store',
        thenWhere: { value: 'replay' },
        every: true,
        outside: true,
      },
    },
    {
      label: 'A separate worker flow consumes the queue and updates ERP and Postgres',
      rule: { type: 'source', component: ['mq-subscriber', 'vm-listener', 'jms-listener'] },
    },
    { label: 'The worker routes on changeType (create / update / delete / gap)', rule: { type: 'routes', component: 'choice', min: 3 } },
    {
      label: 'Update events send only the changed fields, so missing fields do not wipe ERP data',
      rule: { type: 'inside', component: 'transform', where: { script: 'changedFields' }, within: 'choice', routeWhere: { expression: 'UPDATE' } },
    },
    {
      label: 'GAP / overflow events re-query the full record from Salesforce',
      rule: { type: 'inside', component: 'sf-query', within: 'choice', routeWhere: { expression: 'GAP' } },
    },
    {
      label: 'The worker acknowledges a change only after ERP and Postgres are updated',
      rule: { type: 'before', first: ['http-request', 'db-insert', 'db-update'], then: ['mq-ack', 'jms-ack'], outside: true },
    },
    {
      label: 'Failures in the listener flow alert and trigger a delta resync',
      rule: { type: 'inside', component: ['flow-ref', 'email-send'], within: ['on-error-propagate', 'on-error-continue'] },
    },
  ],
  referenceFlow: design(
    cdcListener('Account'),
    cdcListener('Opportunity'),
    flow(
      'account-change-worker',
      source('mq-subscriber', { destination: 'sfdc.account.changes', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'header', value: '#[payload.ChangeEventHeader]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.header.changeType == "CREATE"]' }, [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\n---\n{\n  sfId: vars.header.recordIds[0],\n  name: payload.Name,\n  country: payload.BillingCountry,\n  phone: payload.Phone\n}',
              }),
              step('http-request', { method: 'POST', path: '/erp/customers' }),
            ]),
            route({ expression: '#[vars.header.changeType == "UPDATE"]' }, [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\nvar changed = vars.header.changedFields default []\n---\npayload filterObject ((value, key) -> changed contains (key as String))',
              }),
              step('http-request', { method: 'PATCH', path: '/erp/customers/{sfId}' }),
            ]),
            route({ expression: '#[vars.header.changeType == "DELETE"]' }, [
              step('http-request', { method: 'POST', path: '/erp/customers/{sfId}/deactivate' }),
            ]),
            route({ expression: '#[vars.header.changeType startsWith "GAP"]' }, [
              step('sf-query', { soql: 'SELECT Id, Name, BillingCountry, Phone FROM Account WHERE Id IN :recordIds' }),
              step('http-request', { method: 'PUT', path: '/erp/customers/{sfId}' }),
            ]),
          ],
          { otherwise: [step('logger', { level: 'WARN', message: '#["Unhandled changeType " ++ vars.header.changeType]' })] },
        ),
        step('db-insert', {
          sql: 'INSERT INTO account_report (sf_id, name, country, updated_at) VALUES (:sfId, :name, :country, now()) ON CONFLICT (sf_id) DO UPDATE SET name = EXCLUDED.name, country = EXCLUDED.country, updated_at = now()',
        }),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#[error.description]' }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
      ],
    ),
    subFlow('delta-resync', [
      step('sf-query', { soql: 'SELECT Id, Name, BillingCountry, Phone FROM Account WHERE LastModifiedDate > :lastProcessedAt' }),
      scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\npayload ++ {\n  ChangeEventHeader: {\n    changeType: "GAP_UPDATE",\n    recordIds: [payload.Id]\n  }\n}',
        }),
        step('mq-publish', { destination: 'sfdc.account.changes' }),
      ]),
    ]),
  ),
  description: `
Sales reps change **Account** and **Opportunity** records in Salesforce all day (~40k changes/day, bursts during quarter-end data loads of 500k). Every change must be reflected in the **ERP** customer master and a **Postgres** reporting store within **2 minutes**.

**Constraints**
- No polling of Salesforce (API call limits are already tight).
- The integration must survive app restarts and a **6-hour** outage without losing changes.
- Changes made *by the integration user itself* (ERP → Salesforce sync) must not bounce back to the ERP (loop).
- CDC events for updates contain **only changed fields**.

**Facts**
- The event header lists the changed field names in \`ChangeEventHeader.changedFields\`.
- When Salesforce cannot send the full change, it sends a gap event. Its \`changeType\` starts with \`GAP_\` (for example \`GAP_UPDATE\`).

**Design the flow(s):** subscription, replay/resume, handling partial-field events, loop prevention, and what to do when you fall outside the retention window.
`,
  answerTemplate: `## Subscription

## Replay and resume

## Processing change events

## Partial-field updates

## Loop prevention

## Gaps beyond retention
`,
  keyPoints: [
    'Salesforce connector replay/subscribe channel listener on the CDC channels (e.g. /data/AccountChangeEvent) instead of polling.',
    'The last successfully processed replay ID is stored in a persistent Object Store and used to resume after a restart.',
    'ChangeEventHeader (changeType, recordIds, changedFields, commitUser) drives the logic; one event can reference multiple record IDs.',
    'Updates apply only changed fields (or re-fetch the full record when needed) instead of overwriting with nulls.',
    'Events whose commitUser is the integration user are skipped to prevent loops.',
    'If the outage exceeds event retention (about 72 h for CDC), a full or delta resync from Salesforce is triggered.',
  ],
  solution: `
1. **Enable CDC** in Salesforce Setup for Account and Opportunity (or a custom channel combining them).
2. **Subscriber flow:** Salesforce connector **Replay channel listener** on \`/data/AccountChangeEvent\`. The name may differ by connector version; it is a streaming/subscribe channel source. Use replay option "from replay ID" with the stored value, or "only new" for first start. A second flow (or a custom channel) for Opportunity.
3. **Resume:** after an event is processed successfully, **Object Store Store** \`replayId\` per channel (persistent OS). On restart the listener resumes from that ID, so a 6-hour outage replays everything missed (within retention).
4. **Hand-off:** to keep up with 500k bursts, the listener does minimal work: dedupe + publish to **Anypoint MQ** (\`sfdc.account.changes\`), then store the replay ID. Downstream workers update ERP and Postgres independently with their own retries/DLQ.
5. **Process change events (DataWeave):** read \`ChangeEventHeader.changeType\` (CREATE/UPDATE/DELETE/UNDELETE/GAP_*), \`recordIds\` (may be multiple — fan out per ID), \`changedFields\`. For UPDATE, map only changed fields into a PATCH for the ERP; for CREATE send the full record; DELETE → deactivate in ERP.
6. **GAP / overflow events:** for \`GAP_*\` or overflow change types, re-query the record from Salesforce (Query by ID) and sync the full state.
7. **Loop prevention:** skip events where \`commitUser\` equals the integration user's ID, or set a "last updated by integration" marker.
8. **Beyond retention:** the connector docs do not state what happens when the stored replay ID is too old. Errors at the source sit outside \`ANY\`, so a flow error handler alone may never see it. Monitor the subscription (for example alert when no events arrive), then start from "only new" and trigger a delta resync job (SOQL on \`LastModifiedDate\` since the last processed time, via Bulk API).
`,
  followUps: [
    { q: 'Platform Events vs CDC — when would you use which?', a: 'CDC publishes record changes automatically for enabled objects; Platform Events are custom business events you publish explicitly (e.g. OrderSubmitted) with your own schema. Use CDC for data sync, Platform Events for business events.' },
    { q: 'Why store the replay ID after processing and not on receipt?', a: 'Storing after processing gives at-least-once delivery: a crash mid-processing replays the event. Downstream must therefore be idempotent.' },
    { q: 'How do you scale the subscriber across replicas?', a: 'A streaming subscription should have one active consumer per channel to avoid duplicates; scale by handing work to a queue consumed by many workers, not by running the listener on every replica.' },
  ],
}
