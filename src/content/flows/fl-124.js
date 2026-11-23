import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const scans = {
  carrier: 'SwiftParcel',
  events: [
    { trackingNumber: 'SP7731005GB', orderNumber: 'ORD-55120', scanType: 'DELIVERED', scannedAt: '2026-11-13T09:41:07Z', signedBy: 'R. Patel' },
    { trackingNumber: 'SP7731019GB', orderNumber: 'ORD-55131', scanType: 'OUT_FOR_DELIVERY', scannedAt: '2026-11-13T09:41:30Z' },
    { trackingNumber: 'SP7731022GB', orderNumber: 'ORD-55133', scanType: 'DELIVERED', scannedAt: '2026-11-13T09:42:12Z', signedBy: 'Safe place: porch' },
  ],
}
const webhook = (body = scans) => ({ http: { method: 'POST', path: '/carrier/scan-events', body } })

export default {
  id: 'fl-124',
  category: 'flows',
  title: 'Parcel Delivered Scans to Salesforce as Platform Events, Not Case Updates From Mule',
  level: 'INTERMEDIATE',
  tags: ['salesforce', 'platform-events', 'webhook', 'foreach', 'decoupling', 'logistics'],
  estMinutes: 25,
  flowChecks: [
    { label: 'The carrier webhook is a POST on /carrier/scan-events', rule: { type: 'source', component: 'http-listener', where: { path: '/carrier/scan-events', allowedMethods: 'POST' } } },
    {
      label: 'Only DELIVERED scans become events',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'foreach', where: { collection: 'DELIVERED' } },
          { type: 'routes', component: 'choice', routeWhere: { expression: 'DELIVERED' } },
          { type: 'exists', component: 'transform', where: { script: { all: ['filter', 'DELIVERED'] } } },
        ],
      },
    },
    {
      label: 'Each delivery is published as a Parcel_Delivered__e platform event inside a For Each',
      rule: { type: 'inside', component: 'sf-publish-platform-event', within: 'foreach', where: { platformEventName: 'Parcel_Delivered__e' } },
    },
    {
      label: 'The event message uses the custom field names, which end in __c',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'transform', where: { script: { all: ['Tracking_Number__c', 'Delivered_At__c'] } } },
          { type: 'exists', component: 'set-payload', where: { value: { all: ['Tracking_Number__c', 'Delivered_At__c'] } } },
        ],
      },
    },
    {
      label: 'Mule no longer queries or updates Cases itself',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'sf-publish-platform-event' },
          { type: 'absent', component: ['sf-update', 'sf-upsert', 'sf-query'] },
        ],
      },
    },
    {
      label: 'When Salesforce cannot take the events, the carrier gets 503 so it sends the batch again',
      rule: {
        type: 'inside',
        component: 'set-variable',
        within: 'on-error-propagate',
        withinWhere: { type: { oneOf: ['SALESFORCE', 'ANY'] } },
        where: { variableName: 'httpStatus', value: '503' },
      },
    },
  ],
  simulation: {
    systems: {
      calls: { 'sf-publish-platform-event': { payload: { id: 'e00xx0000000001AAA', success: true }, latencyMs: 140 } },
    },
    tests: [
      {
        name: 'A batch with two deliveries',
        about: 'The carrier sends three scans. The two DELIVERED scans become platform events with their tracking numbers, and the out for delivery scan is skipped.',
        trigger: webhook(),
        expect: {
          status: 200,
          maxMs: 1500,
          connector: [
            { type: 'sf-publish-platform-event', count: 2 },
            { type: 'sf-publish-platform-event', settings: { platformEventName: 'Parcel_Delivered__e' }, has: { Tracking_Number__c: 'SP7731005GB', Order_Number__c: 'ORD-55120' }, count: 1 },
            { type: 'sf-publish-platform-event', has: { Tracking_Number__c: 'SP7731022GB' }, count: 1 },
          ],
        },
      },
      {
        name: 'A batch with no deliveries',
        about: 'Every scan in the batch is an earlier stage. Nothing is published and the carrier still gets 200.',
        trigger: webhook({ carrier: 'SwiftParcel', events: [scans.events[1]] }),
        expect: { status: 200, connector: [{ type: 'sf-publish-platform-event', count: 0 }] },
      },
      {
        name: 'Salesforce is unreachable',
        about: 'The publish fails with a connection error. The carrier gets 503, so it keeps the batch and sends it again later.',
        trigger: webhook(),
        overrides: {
          systems: { calls: { 'sf-publish-platform-event': { fault: { type: 'SALESFORCE:CONNECTIVITY', description: 'Unable to reach the Salesforce instance.' } } } },
        },
        expect: { status: 503, logs: [{ level: ['ERROR', 'WARN'] }] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'carrier-scan-webhook',
      source('http-listener', { path: '/carrier/scan-events', allowedMethods: 'POST' }),
      [
        scope('foreach', { collection: '#[payload.events filter ($.scanType == "DELIVERED")]' }, [
          step('transform', {
            script:
              '%dw 2.0\noutput application/java\n---\n{\n  Tracking_Number__c: payload.trackingNumber,\n  Order_Number__c: payload.orderNumber,\n  Delivered_At__c: payload.scannedAt,\n  Signed_By__c: payload.signedBy default ""\n}',
          }),
          step('sf-publish-platform-event', { platformEventName: 'Parcel_Delivered__e' }),
        ]),
        step('set-payload', { value: '#[output application/json --- { received: sizeOf(payload.events) }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'SALESFORCE:CONNECTIVITY, SALESFORCE:TIMEOUT, SALESFORCE:LIMIT_EXCEEDED' }, [
          step('logger', { level: 'ERROR', message: '#["Could not publish delivery events: " ++ error.description]' }),
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { code: "TRY_LATER" }]' }),
        ]),
      ],
    ),
  ),
  description: `
An online homeware shop ships with a parcel carrier that sends **scan events** by webhook to \`POST /carrier/scan-events\`. Each call holds a batch: \`{ "carrier": "SwiftParcel", "events": [ { "trackingNumber", "orderNumber", "scanType", "scannedAt", "signedBy" } ] }\`. \`scanType\` is one of \`COLLECTED\`, \`IN_TRANSIT\`, \`OUT_FOR_DELIVERY\` or \`DELIVERED\`. A batch holds up to 20 scans.

Today the Mule flow does this for every scan: a SOQL query to find the open **Case** for the order, then an update that writes the delivery date and closes the Case. Problems:
- Agents often have the Case open. The updates fail with \`UNABLE_TO_LOCK_ROW\`, and those deliveries are lost.
- The Salesforce team keeps changing which objects should change on a delivery (Case, Order, a loyalty record). Every change means a Mule release.
- Two API calls per scan use up the daily Salesforce API allowance on busy days.

The Salesforce team has created a **platform event** \`Parcel_Delivered__e\` with the fields \`Tracking_Number__c\`, \`Order_Number__c\`, \`Delivered_At__c\` and \`Signed_By__c\`. A platform event triggered Flow in Salesforce will do the record updates and retry them there.

The carrier waits up to **5 seconds** for an answer. On any answer other than 2xx, it sends the same batch again later.

**Requirements**
- Publish one \`Parcel_Delivered__e\` event for each \`DELIVERED\` scan. Ignore the other scan types.
- Mule no longer reads or updates Cases.
- Answer 200 once the events are published.
- If Salesforce cannot take the events, answer **503** so the carrier sends the batch again.

**Facts**
- Map \`trackingNumber\` to \`Tracking_Number__c\`, \`orderNumber\` to \`Order_Number__c\`, \`scannedAt\` to \`Delivered_At__c\` and \`signedBy\` to \`Signed_By__c\`.
- Assume the listener's response status is \`#[vars.httpStatus default 200]\`.

**Design the flow.**

**What each system sends back**
- The Salesforce **Publish platform event message** operation takes one event as a Java map with the field names above, and answers \`{ "id": "e00xx0000000001AAA", "success": true }\`. Mule does not need anything from that answer.

**What failures look like**
- Salesforce cannot be reached: the publish raises \`SALESFORCE:CONNECTIVITY\`. Log it and answer **503**.
`,
  answerTemplate: `## What is wrong with updating Cases from Mule

## Picking the deliveries

## Building and publishing each event

## When Salesforce is down

## Duplicates
`,
  keyPoints: [
    'A platform event moves the "what changes in Salesforce" logic into Salesforce, where the team that owns it can change it.',
    'Publishing an event does not lock any record, so an agent with the Case open no longer causes a lost update.',
    'One publish per delivery replaces a query and an update per scan, and the other scan types cost nothing.',
    'Event fields are custom fields, so their API names end in __c, and the event name ends in __e.',
    'Answer 503 on a Salesforce failure so the carrier keeps the batch. A 200 after a failure would lose the delivery.',
    'A batch sent again may publish some events twice, so the Salesforce Flow must treat a repeat tracking number as done.',
  ],
  solution: `
**What is wrong today.** Mule does the business logic of another system. It locks Cases that agents are editing, it needs a release for every Salesforce change, and it makes two API calls for every scan, even scans that change nothing.

**Flow: carrier-scan-webhook**
1. **HTTP Listener** \`POST /carrier/scan-events\`.
2. **For Each** over \`payload.events filter ($.scanType == "DELIVERED")\`:
   - **Transform** to the event message: \`Tracking_Number__c\`, \`Order_Number__c\`, \`Delivered_At__c\`, \`Signed_By__c\`.
   - **Salesforce Publish platform event message** to \`Parcel_Delivered__e\`.
3. **Set Payload** \`{ received: n }\`. For Each gives back the original payload when it ends, so \`payload.events\` is still the batch.
4. **On Error Propagate** for \`SALESFORCE:CONNECTIVITY, SALESFORCE:TIMEOUT, SALESFORCE:LIMIT_EXCEEDED\`: log at ERROR, set \`httpStatus\` 503 and a short body.

**Time.** A batch holds up to 20 scans and each publish takes about 150 ms, so the answer comes back well inside the carrier's 5 seconds.

**Duplicates.** If the third publish of a batch fails, the first two are already in Salesforce, and the carrier sends the whole batch again. The platform event triggered Flow must check whether the delivery for that tracking number is already recorded and skip it. That is cheap, and it is the only safe answer, because the carrier can also resend a batch for its own reasons.
`,
  followUps: [
    {
      q: 'Could Mule publish all the events of a batch in one call?',
      a: 'Platform events can also be published with the Create operation on the event object, which takes a list. That saves calls on large batches. One publish per delivery is clearer and the volumes here are small.',
    },
    {
      q: 'Why not put the scans on an Anypoint MQ queue and answer the carrier at once?',
      a: 'That is a good next step if Salesforce is often slow or down. Here a publish is fast, and a 503 lets the carrier hold the batch for you, so a queue adds cost without much gain.',
    },
    {
      q: 'What happens to an event if the Salesforce Flow fails?',
      a: 'The publish already succeeded, so Mule does not see it. The Salesforce team handles it with the Flow\'s own fault path and monitoring, which is the point of moving the logic there.',
    },
  ],
}
