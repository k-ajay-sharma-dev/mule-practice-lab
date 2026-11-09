import { design, flow, handler, route, router, scope, source, step, subFlow } from '../../flow/dsl.js'

export default {
  id: 'fl-117',
  category: 'flows',
  title: 'Shipping Labels with Two Speeds of Retry: Until Successful for Seconds, a Delayed Queue for Minutes',
  level: 'INTERMEDIATE',
  tags: ['until-successful', 'retry', 'anypoint-mq', 'dlq', 'error-handling', 'shipping', 'sub-flow'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'An Anypoint MQ Subscriber reads the label-requests queue',
      rule: { type: 'source', component: 'mq-subscriber', where: { destination: { is: 'label-requests' } } },
    },
    {
      label: 'The carrier call POST /labels is inside Until Successful',
      rule: { type: 'inside', component: 'http-request', within: 'until-successful', where: { method: 'POST', path: '/labels' } },
    },
    {
      label: 'Quick retries stay short: at most 3 retries, 1 to 5 seconds apart',
      rule: { type: 'exists', component: 'until-successful', where: { maxRetries: { gte: 1, lte: 3 }, millisBetweenRetries: { gte: 1000, lte: 5000 } } },
    },
    {
      label: 'Exhausted quick retries are caught by On Error Continue for MULE:RETRY_EXHAUSTED',
      rule: { type: 'exists', component: 'on-error-continue', where: { type: 'RETRY_EXHAUSTED' } },
    },
    {
      label: 'That handler sends the request to the delayed queue for a slow retry',
      rule: {
        type: 'inside',
        component: 'mq-publish',
        where: { destination: 'delayed' },
        within: 'on-error-continue',
        withinWhere: { type: 'RETRY_EXHAUSTED' },
      },
    },
    {
      label: 'A second subscriber reads the delayed queue that the handler publishes to',
      rule: {
        type: 'linked',
        from: { component: 'mq-publish', where: { destination: 'delayed' }, key: 'destination' },
        to: { component: 'mq-subscriber', key: 'destination' },
      },
    },
    {
      label: 'A Choice on the attempt count sends the request to the DLQ when slow retries are used up',
      rule: {
        type: 'all',
        rules: [
          { type: 'routes', component: 'choice', routeWhere: { expression: 'attempt' } },
          { type: 'inside', component: 'mq-publish', where: { destination: 'dlq' }, within: 'choice' },
        ],
      },
    },
    {
      label: 'Both subscribers run the same steps through one sub-flow',
      rule: {
        type: 'all',
        rules: [
          { type: 'flows', kind: 'sub-flow', min: 1 },
          { type: 'exists', component: 'flow-ref', min: 2 },
          { type: 'refs' },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow('label-requests-listener', source('mq-subscriber', { destination: 'label-requests', acknowledgementMode: 'AUTO' }), [
      step('flow-ref', { name: 'request-label' }),
    ]),
    flow('label-requests-delayed-listener', source('mq-subscriber', { destination: 'label-requests-delayed', acknowledgementMode: 'AUTO' }), [
      step('flow-ref', { name: 'request-label' }),
    ]),
    subFlow('request-label', [
      step('set-variable', { variableName: 'request', value: '#[payload]' }),
      step('set-variable', { variableName: 'attempt', value: '#[payload.retryAttempt default 0]' }),
      scope(
        'try',
        {},
        [
          scope('until-successful', { maxRetries: 2, millisBetweenRetries: 3000 }, [
            step('http-request', { method: 'POST', path: '/carrier/v2/labels', responseTimeout: 5000 }),
          ]),
          step('db-update', { database: 'PostgreSQL', sql: 'UPDATE shipments SET label_url = :labelUrl, tracking_no = :trackingNo WHERE shipment_id = :shipmentId' }),
        ],
        {
          errorHandlers: [
            handler('on-error-continue', { type: 'MULE:RETRY_EXHAUSTED' }, [
              router(
                'choice',
                {},
                [
                  route({ expression: '#[vars.attempt < 4]' }, [
                    step('transform', { script: '%dw 2.0\noutput application/json\n---\nvars.request ++ { retryAttempt: vars.attempt + 1 }' }),
                    step('mq-publish', { destination: 'label-requests-delayed' }),
                    step('logger', { level: 'WARN', message: '#["Carrier still failing for shipment " ++ vars.request.shipmentId ++ ", slow retry " ++ (vars.attempt + 1)]' }),
                  ]),
                ],
                {
                  otherwise: [
                    step('set-payload', { value: '#[vars.request]' }),
                    step('mq-publish', { destination: 'label-requests-dlq' }),
                    step('logger', { level: 'ERROR', message: '#["No label after all retries for shipment " ++ vars.request.shipmentId]' }),
                  ],
                },
              ),
            ]),
          ],
        },
      ),
    ]),
  ),
  description: `
A warehouse asks a parcel carrier for a shipping label for every packed order. The requests arrive on the Anypoint MQ queue \`label-requests\`, about **6,000 a day**. Mule calls \`POST /carrier/v2/labels\` and saves the label URL in PostgreSQL.

The carrier fails in two ways:
- **Short blips:** a 503 or a timeout that clears within a few seconds. This happens many times a day.
- **Longer outages:** the carrier API is down for 5 to 30 minutes, about twice a month.

The current flow wraps the call in Until Successful with 20 retries, 60 seconds apart. During an outage every subscriber thread is stuck waiting, the queue backs up, and requests that arrive after the carrier comes back wait behind the stuck ones.

The queue \`label-requests-delayed\` already exists. It has a **default delivery delay of 10 minutes**, so a message sent to it becomes visible to subscribers 10 minutes later. The DLQ is \`label-requests-dlq\`.

**Requirements**
- Retry short blips quickly, inside the flow.
- When quick retries run out, move the request to the delayed queue and free the thread.
- Count the slow retries in the message. After **4** slow retries, send the request to the DLQ.
- Use the same steps for the first attempt and for the slow retries.

**Design the flows.** How long can a request wait in the worst case before it reaches the DLQ?
`,
  answerTemplate: `## Quick retries

## Slow retries

## Counting attempts

## Giving up

## Sharing the steps
`,
  keyPoints: [
    'Until Successful waits between retries on the same thread, so long waits block the subscriber and stall the whole queue.',
    'Keep Until Successful short, for blips of a few seconds. Here 2 retries 3 seconds apart add at most about 6 seconds.',
    'When the retries run out, Until Successful raises MULE:RETRY_EXHAUSTED. Catch it with On Error Continue so the message is acknowledged.',
    'A queue with a delivery delay gives a pause of minutes without holding a thread.',
    'Carry the attempt count in the message body, because a new message has no memory of the old one.',
    'After the limit, park the request on a DLQ so a person can look at it and replay it.',
    'Two subscribers that call one sub-flow keep the logic in one place.',
  ],
  solution: `
**Flows**
1. \`label-requests-listener\`: **Anypoint MQ Subscriber** on \`label-requests\`, then **Flow Reference** to \`request-label\`.
2. \`label-requests-delayed-listener\`: **Anypoint MQ Subscriber** on \`label-requests-delayed\`, then the same **Flow Reference**.

**Sub-flow request-label**
1. **Set Variable** \`request\` with the payload, and **Set Variable** \`attempt\` with \`payload.retryAttempt default 0\`.
2. **Try** containing:
   - **Until Successful**, max retries 2, 3000 ms apart, around **HTTP Request** \`POST /carrier/v2/labels\` with a 5 second timeout.
   - **Database Update** that saves the label URL and tracking number.
3. **On Error Continue** for \`MULE:RETRY_EXHAUSTED\` on the Try, with a **Choice**:
   - \`vars.attempt < 4\`: **Transform** \`vars.request ++ { retryAttempt: vars.attempt + 1 }\`, **Publish** to \`label-requests-delayed\`, and log a warning.
   - Otherwise: **Publish** the original request to \`label-requests-dlq\` and log an error.

**Worst case.** Each attempt costs at most about 21 seconds: three calls of up to 5 seconds and two waits of 3 seconds. The first attempt plus 4 slow retries, 10 minutes apart, means a request reaches the DLQ after about 41 minutes. That covers the 30 minute outages.

**Acknowledgement.** With AUTO mode, the message is acknowledged when the flow ends without an error. On Error Continue ends it cleanly after the new message is published. If the publish itself fails, the error reaches the subscriber, the message is not acknowledged, and Anypoint MQ delivers it again.
`,
  followUps: [
    {
      q: 'How would you make the slow retries grow, for example 2, then 5, then 15 minutes?',
      a: 'Create one delayed queue per step, each with its own delivery delay. The Choice picks the queue from the attempt count.',
    },
    {
      q: 'The carrier answers 400 because the address is invalid. Should that be retried?',
      a: 'No. Catch HTTP:BAD_REQUEST inside the Until Successful with a Try and On Error Continue, and set a flag. After the scope, send the request to a rejected queue or the DLQ without any retry.',
    },
    {
      q: 'Why not set Until Successful to 40 retries, 60 seconds apart?',
      a: 'Each waiting message holds a subscriber thread for up to 40 minutes. A few stuck messages stop the flow from taking new work.',
    },
    {
      q: 'Could the label be created twice?',
      a: 'Yes, if the carrier made the label but the answer was lost. Send an idempotency key such as the shipment ID if the carrier supports one, or check for an existing label before a retry.',
    },
  ],
}
