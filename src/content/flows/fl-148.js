import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const event = { orderId: 'SH-60231', customerId: 'L-88412', total: 64.8, completedAt: '2026-11-18T12:05:00Z' }
const completed = { message: { kind: 'kafka', destination: 'orders.completed', payload: event } }
const points = (responses) => ({ systems: { http: [{ method: 'POST', path: '/loyalty/v1/points', responses }] } })
const created = { status: 201, body: { awarded: 64 } }
const down = { status: 503, body: { message: 'Busy' } }
const callLoyalty = () => step('http-request', { method: 'POST', path: '/loyalty/v1/points', responseTimeout: 5000 })
const pointsBody = (from) => step('set-payload', { value: `#[output application/json --- { customerId: ${from}.customerId, orderId: ${from}.orderId, points: floor(${from}.total) }]` })
const transient = 'HTTP:SERVICE_UNAVAILABLE, HTTP:TIMEOUT, HTTP:CONNECTIVITY'
const toDlt = (reason) => [
  step('set-payload', { value: `#[output application/json --- { event: vars.event, attempts: vars.attempts, reason: ${reason} }]` }),
  step('kafka-publish', { topic: 'orders.completed.dlt', key: '#[vars.event.customerId]' }),
  step('logger', { level: 'WARN', message: '#["Order " ++ vars.event.orderId ++ " sent to the dead letter topic"]' }),
]
const toRetry = (attempts) => [
  step('set-payload', { value: `#[output application/json --- { event: vars.event, attempts: ${attempts} }]` }),
  step('kafka-publish', { topic: 'orders.completed.retry', key: '#[vars.event.customerId]' }),
]

export default {
  id: 'fl-148',
  category: 'flows',
  title: 'A Loyalty API That Fails Now and Then: Move the Event to a Retry Topic, Give Up to a Dead Letter Topic After Three Tries, and Never Hold Up the Partition',
  level: 'ADVANCED',
  tags: ['kafka', 'retry-topic', 'dead-letter-topic', 'error-handling', 'http-request', 'loyalty'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Completed orders are read from the orders.completed topic', rule: { type: 'source', component: 'kafka-listener', where: { topic: { is: 'orders.completed' } } } },
    { label: 'A second flow reads the orders.completed.retry topic', rule: { type: 'source', component: 'kafka-listener', where: { topic: 'orders.completed.retry' } } },
    {
      label: 'A failure the loyalty API may get over sends the event to the retry topic from an error handler',
      rule: { type: 'inside', component: 'kafka-publish', within: 'on-error-continue', withinWhere: { type: 'SERVICE_UNAVAILABLE' }, where: { topic: 'orders.completed.retry' } },
    },
    {
      label: 'A request the loyalty API refuses goes straight to the dead letter topic',
      rule: { type: 'inside', component: 'kafka-publish', within: 'on-error-continue', withinWhere: { type: 'BAD_REQUEST' }, where: { topic: 'orders.completed.dlt' } },
    },
    { label: 'The retry flow counts the attempts and gives up to the dead letter topic', rule: { type: 'inside', component: 'kafka-publish', within: 'choice', where: { topic: 'orders.completed.dlt' } } },
  ],
  simulation: {
    systems: points([created]),
    tests: [
      {
        name: 'Points on the first try',
        about: 'The loyalty API accepts the points at once. Nothing goes to the retry or dead letter topics.',
        trigger: completed,
        expect: { calls: [{ method: 'POST', path: '/loyalty/v1/points', count: 1, has: { customerId: 'L-88412', orderId: 'SH-60231', points: 64 } }], notSent: ['orders.completed.retry', 'orders.completed.dlt'] },
      },
      {
        name: 'The loyalty API is busy once',
        about: 'The first call gets 503. The event goes to the retry topic, the retry flow calls again and the points are awarded.',
        trigger: completed,
        overrides: points([down, created]),
        expect: { calls: [{ method: 'POST', path: '/loyalty/v1/points', count: 2 }], sent: [{ destination: 'orders.completed.retry', count: 1, has: { attempts: 1 } }], notSent: ['orders.completed.dlt'] },
      },
      {
        name: 'The loyalty API stays down',
        about: 'Every call gets 503. The event is tried once on the main topic and three times from the retry topic, then it goes to the dead letter topic.',
        trigger: completed,
        overrides: points([down]),
        expect: {
          calls: [{ method: 'POST', path: '/loyalty/v1/points', count: 4 }],
          sent: [{ destination: 'orders.completed.retry', count: 3 }, { destination: 'orders.completed.dlt', count: 1, has: { attempts: 3, event: { orderId: 'SH-60231' } } }],
          logs: [{ level: 'WARN' }],
        },
      },
      {
        name: 'An event the API refuses',
        about: 'The loyalty API answers 400 because the customer is unknown. Trying again cannot help, so the event goes to the dead letter topic at once.',
        trigger: completed,
        overrides: points([{ status: 400, body: { message: 'Unknown customer' } }]),
        expect: { calls: [{ method: 'POST', path: '/loyalty/v1/points', count: 1 }], sent: [{ destination: 'orders.completed.dlt', count: 1 }], notSent: ['orders.completed.retry'] },
      },
      {
        name: 'Busy first, then refused',
        about: 'The first call gets 503 and the retry gets 400. The retry flow sends the event to the dead letter topic at once, after one retry.',
        trigger: completed,
        overrides: points([down, { status: 400, body: { message: 'Unknown customer' } }]),
        expect: { calls: [{ method: 'POST', path: '/loyalty/v1/points', count: 2 }], sent: [{ destination: 'orders.completed.retry', count: 1 }, { destination: 'orders.completed.dlt', count: 1, has: { attempts: 1 } }] },
      },
    ],
  },
  referenceFlow: design(
    flow('award-points', source('kafka-listener', { topic: 'orders.completed', groupId: 'loyalty-points' }), [
      step('set-variable', { variableName: 'event', value: '#[payload]' }),
      step('set-variable', { variableName: 'attempts', value: '#[0]' }),
      scope('try', {}, [pointsBody('payload'), callLoyalty()], {
        errorHandlers: [
          handler('on-error-continue', { type: 'HTTP:BAD_REQUEST' }, toDlt('"refused by the loyalty API"')),
          handler('on-error-continue', { type: transient }, toRetry(1)),
        ],
      }),
    ]),
    flow('retry-points', source('kafka-listener', { topic: 'orders.completed.retry', groupId: 'loyalty-points-retry' }), [
      step('set-variable', { variableName: 'event', value: '#[payload.event]' }),
      step('set-variable', { variableName: 'attempts', value: '#[payload.attempts]' }),
      scope('try', {}, [pointsBody('vars.event'), callLoyalty()], {
        errorHandlers: [
          handler('on-error-continue', { type: 'HTTP:BAD_REQUEST' }, toDlt('"refused by the loyalty API"')),
          handler('on-error-continue', { type: transient }, [
            router('choice', {}, [route({ expression: '#[vars.attempts >= 3]' }, toDlt('"still failing after " ++ vars.attempts ++ " retries"'))], { otherwise: toRetry('vars.attempts + 1') }),
          ]),
        ],
      }),
    ]),
  ),
  description: `
A shoe retailer awards loyalty points when an order is completed. Completed orders are published on the Kafka topic **\`orders.completed\`**, keyed by customer:

\`{ "orderId": "SH-60231", "customerId": "L-88412", "total": 64.80, "completedAt": "2026-11-18T12:05:00Z" }\`

A Mule flow reads the topic and calls the loyalty platform:

\`POST /loyalty/v1/points\` with \`{ "customerId", "orderId", "points" }\`, one point per whole pound.

The loyalty API answers **503** for a few minutes most evenings, and sometimes **400** for a customer it does not know. Today the flow retries in place with Until Successful. While it waits, every later event on that partition waits too, and the shops' evening orders pile up behind one busy minute.

**Requirements**
- A 503, a timeout or a connection failure sends the event to the topic **\`orders.completed.retry\`** with an attempt count, and the main flow moves on.
- A flow reads the retry topic and calls the loyalty API again. After **3 retries** the event goes to **\`orders.completed.dlt\`**.
- A **400** goes to \`orders.completed.dlt\` at once. Trying again cannot fix it.
- Each event on the dead letter topic says why it is there and how many times it was tried. Log a WARN for it.
- Keep the customer ID as the key on every topic.

**Facts**
- \`points\` is the order total rounded down, so 64.80 gives 64.
- A message on the retry topic is \`{ "event": <the original event>, "attempts": n }\`. The first move to the retry topic has \`attempts\` 1, and each retry that fails again adds one.
- A message on the dead letter topic is \`{ "event", "attempts", "reason" }\`. From the main flow \`attempts\` is 0.
- So an event that keeps failing is called 4 times: once from the main topic and 3 times from the retry topic.

**Design the flows.**
`,
  answerTemplate: `## Why retrying in place hurts

## The retry topic

## Giving up

## Errors worth retrying
`,
  keyPoints: [
    'A Kafka consumer reads a partition in order. A flow that waits on one event holds up every event behind it on that partition.',
    'Move a failed event to a retry topic and carry on. A separate consumer group reads that topic, so the main topic keeps flowing.',
    'Carry the attempt count in the message. The retry flow sends it on with one more, or to the dead letter topic once the limit is reached.',
    'Sort errors by whether time can fix them. A 503, a timeout or a lost connection may pass; a 400 will not, so it goes to the dead letter topic at once.',
    'Keep the same key on the retry and dead letter topics, so tools that replay by customer find everything.',
    'The order of one customer\'s events is no longer kept once one of them is on the retry topic. Points do not depend on order here; say so when you choose this pattern.',
  ],
  solution: `
**Flow \`award-points\`**
1. **Kafka Message Listener** on \`orders.completed\`, group \`loyalty-points\`.
2. **Set Variable** \`event\` = \`#[payload]\`, \`attempts\` = \`0\`.
3. **Try**: build \`{ customerId, orderId, points: floor(total) }\`, **HTTP Request** \`POST /loyalty/v1/points\`.
   - **On Error Continue** \`HTTP:BAD_REQUEST\`: publish \`{ event, attempts, reason }\` to \`orders.completed.dlt\`, log WARN.
   - **On Error Continue** \`HTTP:SERVICE_UNAVAILABLE, HTTP:TIMEOUT, HTTP:CONNECTIVITY\`: publish \`{ event, attempts: 1 }\` to \`orders.completed.retry\`.

**Flow \`retry-points\`**
1. **Kafka Message Listener** on \`orders.completed.retry\`, group \`loyalty-points-retry\`.
2. **Set Variable** \`event\` = \`#[payload.event]\`, \`attempts\` = \`#[payload.attempts]\`.
3. **Try** with the same call.
   - **On Error Continue** \`HTTP:BAD_REQUEST\`: to the dead letter topic.
   - **On Error Continue** for the passing errors: **Choice** \`#[vars.attempts >= 3]\` to the dead letter topic, otherwise publish again with \`attempts + 1\`.

**A pause before a retry.** A retry read at once can fail for the same reason. Real designs wait: the retry flow compares the message timestamp with now and pauses until, say, 30 seconds have passed, or there are several retry topics with growing waits. The pause only holds up other retries, never the main topic.

**Errors not listed.** Anything else, such as a 500, fails the flow. Decide whether it belongs with the passing errors; leaving it to fail means Kafka offers the event again, which brings back the waiting this design removes.
`,
  followUps: [
    {
      q: 'Who looks at the dead letter topic, and how does an event get back?',
      a: 'An alert on new events there goes to the support team. After a fix, a small admin flow reads chosen events from the dead letter topic and publishes them to orders.completed again.',
    },
    {
      q: 'The loyalty API might have awarded the points before it timed out. Is a retry safe?',
      a: 'Only if the loyalty API ignores a repeat for the same orderId. Ask for that, or send an idempotency key, before adding timeouts to the retry list.',
    },
  ],
}
